import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,sep,extname,dirname,join} from 'node:path';
import {WebSocketServer,WebSocket} from 'ws';
import {z} from 'zod';
import {makeSnapshot,publishSchema,displaySchema,type DisplaySnapshot} from '../../../packages/contracts/src/display.ts';
import {loadSnapshot,saveSnapshot} from './persistence.ts';
import {listPresets,savePreset,deletePreset,presetNameSchema} from './presets.ts';
import {compositions} from '../../../packages/templates/src/layouts.ts';
import type {ObsAdapter} from './obs/client.ts';

type Role='control'|'overlay';
type Options={port:number;stateFile:string;credentials:Record<Role,string>;now?:()=>number;sessionMs?:number;webRoot?:string;presetsFile?:string;sceneMapFile?:string;obs?:()=>ObsAdapter|Promise<ObsAdapter>};
const json=(res:ServerResponse,status:number,value:unknown)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
const equal=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
async function body(req:IncomingMessage):Promise<unknown> {
  let size=0; const chunks:Buffer[]=[];
  for await(const chunk of req) {
    size+=chunk.length;
    if(size>32768) throw new Error('TOO_LARGE');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const hasControlChars=(s:string)=>{for(const c of s){const n=c.codePointAt(0)??0;if(n<32||n===127)return true;}return false;};
export async function createBridge(options:Options) {
  const now=options.now??Date.now;
  const restored=loadSnapshot(options.stateFile);
  let snapshot=restored.snapshot??makeSnapshot();
  const sessions=new Map<string,{role:Role;expires:number}>();
  const commands=new Map<string,{fingerprint:string;result:{ok:true;snapshot:DisplaySnapshot};expires:number}>();
  let pairing={count:0,reset:0};
  let writes={count:0,reset:0};
  const sockets=new WebSocketServer({noServer:true,maxPayload:1024});
  const socketSessions=new Map<WebSocket,string>();
  const presetsFile=options.presetsFile??join(dirname(options.stateFile),'presets.json');
  let liveCue:{id:string;text:string;expiresAt:number}|null=null;
  let obsAdapter:ObsAdapter|null=null;
  let obsTried=false;
  const getObs=async():Promise<ObsAdapter|null>=>{
    if(!options.obs) return null;
    if(obsAdapter) return obsAdapter;
    if(!obsTried) {obsTried=true;try{obsAdapter=await options.obs();await obsAdapter.connect();}catch{obsAdapter=null;obsTried=false;throw new Error('OBS_UNAVAILABLE');}}
    if(!obsAdapter) throw new Error('OBS_UNAVAILABLE');
    return obsAdapter;
  };
  const cuePayload=()=>liveCue&&liveCue.expiresAt>now()?{cue:{id:liveCue.id,text:liveCue.text,expiresAt:liveCue.expiresAt}}:{cue:null};
  let url=''; let host='';
  const authenticate=(req:IncomingMessage,role:Role):string|null=>{
    const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith(`malam_${role}=`))?.slice(`malam_${role}=`.length);
    const session=token?sessions.get(token):null;
    return token&&session?.role===role&&session.expires>now()?token:null;
  };
  const trusted=(req:IncomingMessage,requireOrigin=false)=>req.headers.host===host&&
    (!requireOrigin&&!req.headers.origin || req.headers.origin===url)&&
    (!req.headers['sec-fetch-site']||['same-origin','none'].includes(String(req.headers['sec-fetch-site'])));
  const publish=(next:DisplaySnapshot)=>{
    // Synchronous durable replacement serializes this small, bounded local state before ACK/broadcast.
    saveSnapshot(options.stateFile,next); snapshot=next;
    for(const ws of sockets.clients) {
      const session=sessions.get(socketSessions.get(ws)??'');
      if(!session||session.expires<=now()) {ws.close(1008);continue;}
      if(ws.bufferedAmount>65536) {ws.close(1013);continue;}
      if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(snapshot));
    }
    return {ok:true as const,snapshot};
  };
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; style-src-attr 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws://127.0.0.1:* ws://localhost:* wss://127.0.0.1:* wss://localhost:*; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if(!trusted(req,req.method!=='GET')) return json(res,403,{error:'Forbidden'});
    // No query strings, tokens in URLs, filesystem paths, arbitrary upstream URLs or CORS.
    const path=req.url??'/';
    if(path.includes('?')||path.includes('%')||path.includes('..')) return json(res,400,{error:'Invalid path'});
    try {
      if(req.method==='POST'&&/^\/api\/pair\/(control|overlay)$/.test(path)) {
        if(pairing.reset<=now()) pairing={count:0,reset:now()+60000};
        if(pairing.count>=10) return json(res,429,{error:'Pairing temporarily limited'});
        pairing.count++;
        const role=path.endsWith('control')?'control':'overlay';
        const parsed=z.strictObject({password:z.string().min(1).max(512)}).safeParse(await body(req));
        if(!parsed.success||!equal(parsed.data.password,options.credentials[role])) return json(res,401,{error:'Pairing failed'});
        for(const [key,s] of sessions) if(s.expires<=now()) sessions.delete(key);
        if(sessions.size>=32) sessions.delete(sessions.keys().next().value!);
        const token=randomBytes(32).toString('hex');
        sessions.set(token,{role,expires:now()+(options.sessionMs??12*3600000)});
        res.setHeader('Set-Cookie',`malam_${role}=${token}; HttpOnly; SameSite=Strict; Path=/api/${role}; Max-Age=${Math.floor((options.sessionMs??12*3600000)/1000)}`);
        return json(res,200,{ok:true});
      }
      if(path.startsWith('/api/')) {
        const role=path.startsWith('/api/control/')?'control':'overlay';
        if(!authenticate(req,role)) return json(res,401,{error:'Pair this browser'});
        if(req.method==='GET'&&path===`/api/${role}/snapshot`) return json(res,200,snapshot);
        if(req.method==='GET'&&role==='control'&&path==='/api/control/presets') return json(res,200,{presets:listPresets(presetsFile)});
        if(req.method==='GET'&&role==='overlay'&&path==='/api/overlay/cue') return json(res,200,cuePayload());
        if(req.method==='GET'&&role==='control'&&path==='/api/control/cue') return json(res,200,cuePayload());
        if(req.method==='GET'&&role==='control'&&path==='/api/control/obs') {
          try {
            const obs=await getObs();
            if(!obs) return json(res,200,{available:false});
            const [scenes,status]=await Promise.all([obs.listScenes(),obs.getStatus()]);
            return json(res,200,{available:true,...status,scenes});
          } catch {return json(res,200,{available:false});}
        }
        if(req.method==='POST'&&role==='control') {
          if(writes.reset<=now()) writes={count:0,reset:now()+1000};
          if(path!=='/api/control/emergency'&&++writes.count>20) return json(res,429,{error:'Command rate limited'});
          if(path==='/api/control/emergency') return json(res,200,publish({...snapshot,revision:snapshot.revision+1,templateId:'technical-difficulty',motionMode:'static',layout:{mainOffsetX:0,mainOffsetY:0,textScale:'normal',slots:{}},content:{...makeSnapshot().content,title:'Gangguan teknikal',points:['Kami akan kembali sebentar lagi.']}}));
          if(path==='/api/control/presets/save'||path==='/api/control/presets/delete') {
            if(req.headers['content-type']!=='application/json') return json(res,415,{error:'JSON required'});
            const saving=path.endsWith('/save');
            const saveSchema=z.strictObject({name:z.string(),snapshot:displaySchema});
            const parsed=(saving?saveSchema:z.strictObject({name:z.string()})).safeParse(await body(req));
            const name=presetNameSchema(parsed.success?parsed.data.name:null);
            if(!parsed.success||!name) return json(res,400,{ok:false,code:'INVALID'});
            try {
              const presets=saving
                ?savePreset(presetsFile,name,saveSchema.parse(parsed.data).snapshot)
                :deletePreset(presetsFile,name);
              return json(res,200,{ok:true,presets});
            } catch {return json(res,400,{ok:false,code:'INVALID'});}
          }
          if(path==='/api/control/cue'||path==='/api/control/cue/clear') {
            if(req.headers['content-type']!=='application/json') return json(res,415,{error:'JSON required'});
            if(path.endsWith('/clear')) {liveCue=null;return json(res,200,{ok:true});}
            const parsed=z.strictObject({text:z.string().min(1).max(140).refine(s=>!hasControlChars(s)),seconds:z.number().int().min(3).max(300).optional()}).safeParse(await body(req));
            if(!parsed.success) return json(res,400,{ok:false,code:'INVALID'});
            liveCue={id:randomBytes(8).toString('hex'),text:parsed.data.text.trim(),expiresAt:now()+((parsed.data.seconds??20)*1000)};
            return json(res,200,{ok:true,cue:{id:liveCue.id,text:liveCue.text,expiresAt:liveCue.expiresAt}});
          }
          if(path==='/api/control/obs/scene') {
            if(req.headers['content-type']!=='application/json') return json(res,415,{error:'JSON required'});
            const parsed=z.strictObject({name:z.string().min(1).max(120)}).safeParse(await body(req));
            if(!parsed.success) return json(res,400,{ok:false,code:'INVALID'});
            try {
              const obs=await getObs();
              if(!obs) return json(res,503,{ok:false,code:'OBS_UNAVAILABLE'});
              await obs.setProgramScene(parsed.data.name);
              return json(res,200,{ok:true});
            } catch {return json(res,503,{ok:false,code:'OBS_UNAVAILABLE'});}
          }
          if(path==='/api/control/obs/align') {
            if(req.headers['content-type']!=='application/json') return json(res,415,{error:'JSON required'});
            const parsed=z.strictObject({sceneName:z.string().min(1).max(160)}).safeParse(await body(req));
            if(!parsed.success) return json(res,400,{ok:false,code:'INVALID'});
            try {
              const obs=await getObs();
              if(!obs) return json(res,503,{ok:false,code:'OBS_UNAVAILABLE'});
              const map=JSON.parse(readFileSync(options.sceneMapFile??'assets/obs-scenes/scene-map.json','utf8')) as {scenes:{name:string;sources:(string|{kind:string;label?:string;rect?:string})[]}[]};
              const prefix=`MM ${snapshot.orientation==='portrait'?'PORTRAIT':'LANDSCAPE'} | `;
              const short=parsed.data.sceneName.startsWith(prefix)?parsed.data.sceneName.slice(prefix.length):parsed.data.sceneName;
              const def=map.scenes.find(s=>s.name===short);
              if(!def) return json(res,404,{ok:false,code:'UNKNOWN_SCENE'});
              const settings=await obs.call('GetVideoSettings') as {baseWidth:number;baseHeight:number};
              const overlayW=snapshot.orientation==='portrait'?1080:1920,overlayH=snapshot.orientation==='portrait'?1920:1080;
              const sx=settings.baseWidth/overlayW,sy=settings.baseHeight/overlayH;
              const comp=compositions[`${snapshot.templateId}:${snapshot.orientation}`];
              const aligned:string[]=[],missed:string[]=[];
              for(const src of def.sources) {
                let label:string,rectName:string;
                if(typeof src==='string'){if(src==='overlay')continue;const[k,l]=src.split(':');label=l??k;rectName='media';}
                else{label=src.label??src.kind;rectName=src.rect??'media';}
                const role=/^(media[23]?)(?:-(?:fill|stretch))?$/.exec(rectName)?.[1];
                if(!role) continue;
                const base=comp.regions.find(r=>r.role===role);
                const over=snapshot.layout.slots[role as 'media'|'media2'|'media3'];
                const box=over??(base?{x:base.x,y:base.y,width:base.width,height:base.height}:null);
                if(!box) continue;
                const inputName=`${parsed.data.sceneName} :: ${label}`;
                try {
                  const idRes=await obs.call('GetSceneItemId',{sceneName:parsed.data.sceneName,sourceName:inputName});
                  const sceneItemId=idRes.sceneItemId as number;
                  const tRes=await obs.call('GetSceneItemTransform',{sceneName:parsed.data.sceneName,sceneItemId});
                  const t=(tRes.sceneItemTransform??{}) as Record<string,unknown>;
                  await obs.call('SetSceneItemTransform',{sceneName:parsed.data.sceneName,sceneItemId,sceneItemTransform:{
                    ...t,positionX:Math.round(box.x*sx),positionY:Math.round(box.y*sy),
                    boundsWidth:Math.round(box.width*sx),boundsHeight:Math.round(box.height*sy)}});
                  aligned.push(label);
                } catch {missed.push(label);}
              }
              return json(res,200,{ok:true,aligned,missed});
            } catch {return json(res,503,{ok:false,code:'OBS_UNAVAILABLE'});}
          }
          if(path==='/api/control/publish') {
            if(req.headers['content-type']!=='application/json') return json(res,415,{error:'JSON required'});
            const parsed=publishSchema.safeParse(await body(req));
            if(!parsed.success) return json(res,400,{ok:false,code:'INVALID'});
            const request=parsed.data;
            for(const [id,item] of commands) if(item.expires<=now()) commands.delete(id);
            const fingerprint=JSON.stringify(request);
            const cached=commands.get(request.commandId);
            if(cached) return cached.fingerprint===fingerprint ? json(res,200,cached.result):json(res,409,{ok:false,code:'CONFLICT'});
            if(request.expectedRevision!==snapshot.revision||request.snapshot.sessionId!==snapshot.sessionId) return json(res,409,{ok:false,code:'CONFLICT'});
            const result=publish({...request.snapshot,revision:snapshot.revision+1});
            if(commands.size>=1000) commands.delete(commands.keys().next().value!);
            commands.set(request.commandId,{fingerprint,result,expires:now()+600000});
            return json(res,200,result);
          }
        }
        return json(res,404,{error:'Not found'});
      }
      if(req.method!=='GET') return json(res,405,{error:'Method not allowed'});
      const root=resolve(options.webRoot??'dist/web');
      const mapped=path==='/placeholder'?'/placeholder.html':['/','/control','/overlay','/overlay-transparent','/gallery'].includes(path)?'/index.html':path;
      const file=resolve(root,'.'+mapped);
      if(!file.startsWith(root+sep)||!existsSync(file)||!statSync(file).isFile()) return json(res,404,{error:'Build the application first'});
      const mime:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.json':'application/json','.woff2':'font/woff2','.mp3':'audio/mpeg'};
      res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(readFileSync(file));
    } catch(error) {
      if(error instanceof SyntaxError) return json(res,400,{error:'Invalid JSON'});
      if(error instanceof Error&&error.message==='TOO_LARGE') return json(res,413,{error:'Request too large'});
      return json(res,503,{error:'State not saved. Use the independent emergency asset.'});
    }
  });
  server.requestTimeout=10000;server.headersTimeout=10000;
  server.on('upgrade',(req,socket,head)=>{
    const token=authenticate(req,'overlay');
    if(!trusted(req,true)||req.url!=='/api/overlay/events'||!token||sockets.clients.size>=32) {socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
    sockets.handleUpgrade(req,socket,head,ws=>{
      socketSessions.set(ws,token);ws.send(JSON.stringify(snapshot));
      ws.on('message',()=>ws.close(1008)); // Read-only even after successful pairing.
      ws.on('close',()=>socketSessions.delete(ws));
    });
  });
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(options.port,'127.0.0.1',resolve);});
  const address=server.address();
  if(!address||typeof address==='string') throw new Error('Listener unavailable');
  host=`127.0.0.1:${address.port}`;url=`http://${host}`;
  const reaper=setInterval(()=>{
    for(const [ws,token] of socketSessions) if((sessions.get(token)?.expires??0)<=now()) ws.close(1008);
  },30000);reaper.unref();
  return {url,recovered:restored.recovered,close:async()=>{
    clearInterval(reaper);for(const ws of sockets.clients) ws.terminate();sockets.close();
    await obsAdapter?.disconnect().catch(()=>{});
    server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  }};
}
