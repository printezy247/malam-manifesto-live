import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID, randomBytes} from 'node:crypto';
import {WebSocket} from 'ws';
import {request as httpRequest} from 'node:http';
import {createBridge} from '../apps/bridge/src/server.ts';
import {loadSnapshot,saveSnapshot} from '../apps/bridge/src/persistence.ts';
import {makeSnapshot} from '../packages/contracts/src/display.ts';

test('atomic persistence survives corrupt state and interrupted replacement',()=>{
  const dir=mkdtempSync(join(tmpdir(),'malam-state-'));
  try {
    const file=join(dir,'state.json');
    const initial=makeSnapshot(); saveSnapshot(file,initial);
    saveSnapshot(file,{...initial,revision:1});
    writeFileSync(file+'.tmp','interrupted');
    assert.equal(loadSnapshot(file).snapshot?.revision,1);
    writeFileSync(file,'broken');
    assert.equal(loadSnapshot(file).snapshot?.revision,0);
    assert.equal(loadSnapshot(file).recovered,true);
    assert.doesNotMatch(readFileSync(file+'.bak','utf8'),/password|credential/);
    writeFileSync(file+'.bak','{}');
    assert.equal(loadSnapshot(file).snapshot,null);
    assert.equal(loadSnapshot(file).recovered,true);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('localhost bridge separates roles, checks origin/host, commits atomically and replays complete snapshots',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'malam-bridge-'));
  const credentials={control:randomBytes(32).toString('hex'),overlay:randomBytes(32).toString('hex')};
  let now=Date.now();
  const bridge=await createBridge({port:0,stateFile:join(dir,'state.json'),credentials,now:()=>now,sessionMs:1000});
  const base=bridge.url;
  const call=(path:string,init:RequestInit={})=>fetch(base+path,{...init,headers:{Origin:base,...init.headers}});
  try {
    assert.equal((await call('/api/control/snapshot')).status,401);
    const badHost=await new Promise<number>(resolve=>{
      const req=httpRequest(base+'/api/control/snapshot',{headers:{Host:'attacker.test',Origin:base}},res=>{res.resume();resolve(res.statusCode!);});req.end();
    });
    assert.equal(badHost,403);
    assert.equal((await call('/api/control/snapshot',{headers:{Origin:'https://evil.test'}})).status,403);
    assert.equal((await fetch(base+'/api/control/publish',{method:'POST'})).status,403);
    const pair=async(role:'control'|'overlay')=>{
      const result=await call('/api/pair/'+role,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:credentials[role]})});
      assert.equal(result.status,200);
      assert.match(result.headers.get('set-cookie')!,/HttpOnly; SameSite=Strict/);
      assert.match(result.headers.get('set-cookie')!,new RegExp(`malam_${role}=`));
      return result.headers.get('set-cookie')!.split(';')[0];
    };
    const overlay=await pair('overlay'); const control=await pair('control');
    assert.equal((await call('/api/control/snapshot',{headers:{Cookie:overlay}})).status,401);
    let current=await (await call('/api/control/snapshot',{headers:{Cookie:control}})).json();
    const publish=async(body:unknown,cookie=control)=>call('/api/control/publish',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const request={commandId:randomUUID(),expectedRevision:0,snapshot:{...current,content:{...current.content,title:'Diterbitkan'}}};
    assert.equal((await publish(request,overlay)).status,401);
    assert.equal((await publish({...request,snapshot:{...request.snapshot,secret:'no'}})).status,400);
    assert.equal((await publish({...request,snapshot:{...request.snapshot,sessionId:'old'}})).status,409);
    const first=await (await publish(request)).json();
    assert.equal(first.snapshot.revision,1);
    assert.deepEqual(await (await publish(request)).json(),first);
    assert.equal((await publish({...request,snapshot:{...request.snapshot,content:{...request.snapshot.content,title:'Lain'}}})).status,409);
    assert.equal((await publish({...request,commandId:randomUUID()})).status,409);
    current=first.snapshot;
    const ws=new WebSocket(base.replace('http','ws')+'/api/overlay/events',{headers:{Origin:base,Cookie:overlay}});
    const message=await new Promise<string>((resolve,reject)=>{ws.once('message',d=>resolve(d.toString()));ws.once('error',reject);});
    assert.deepEqual(JSON.parse(message),current); ws.close();
    assert.equal(loadSnapshot(join(dir,'state.json')).snapshot?.revision,1);
    const parallel=await Promise.all([0,1].map(()=>publish({commandId:randomUUID(),expectedRevision:1,snapshot:current})));
    assert.deepEqual(parallel.map(r=>r.status).sort(),[200,409]);
    const emergency=await call('/api/control/emergency',{method:'POST',headers:{Cookie:control}});
    assert.equal(emergency.status,200);
    assert.equal((await emergency.json()).snapshot.templateId,'technical-difficulty');
    assert.equal((await call('/api/control/publish',{method:'POST',headers:{Cookie:control,'Content-Type':'application/json'},body:'x'.repeat(40000)})).status,413);
    now+=1001;
    assert.equal((await call('/api/control/snapshot',{headers:{Cookie:control}})).status,401);
  } finally {await bridge.close();rmSync(dir,{recursive:true,force:true});}
});

test('scene presets, live cues and OBS scene switching are role-scoped and validated',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'malam-features-'));
  const credentials={control:randomBytes(32).toString('hex'),overlay:randomBytes(32).toString('hex')};
  const sceneWrites:string[]=[];
  const fakeObs={
    connect:async()=>{},disconnect:async()=>{},
    listScenes:async()=>['Scene A','Scene B'],
    setProgramScene:async(name:string)=>{sceneWrites.push(name);},
    getStatus:async()=>({connected:true,currentScene:'Scene A',recording:false}),
    call:async()=>({})
  };
  const bridge=await createBridge({port:0,stateFile:join(dir,'state.json'),credentials,obs:()=>fakeObs});
  const base=bridge.url;
  const call=(path:string,init:RequestInit={})=>fetch(base+path,{...init,headers:{Origin:base,...init.headers}});
  const post=(path:string,cookie:string,payload:unknown)=>call(path,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  try {
    const pair=async(role:'control'|'overlay')=>{
      const r=await call('/api/pair/'+role,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:credentials[role]})});
      return r.headers.get('set-cookie')!.split(';')[0];
    };
    const control=await pair('control');const overlay=await pair('overlay');
    let current=await (await call('/api/control/snapshot',{headers:{Cookie:control}})).json();

    assert.deepEqual(await (await call('/api/control/presets',{headers:{Cookie:control}})).json(),{presets:[]});
    assert.equal((await post('/api/control/presets/save',overlay,{name:'x',snapshot:current})).status,401);
    assert.equal((await post('/api/control/presets/save',control,{name:'bad/name',snapshot:current})).status,400);
    assert.equal((await post('/api/control/presets/save',control,{name:'No snapshot'})).status,400);
    const saved=await (await post('/api/control/presets/save',control,{name:'Board',snapshot:{...current,templateId:'board'}})).json();
    assert.equal(saved.presets.length,1);assert.equal(saved.presets[0].name,'Board');
    assert.equal(saved.presets[0].snapshot.templateId,'board');

    assert.deepEqual(await (await call('/api/overlay/cue',{headers:{Cookie:overlay}})).json(),{cue:null});
    assert.deepEqual(await (await call('/api/control/cue',{headers:{Cookie:control}})).json(),{cue:null});
    assert.equal((await call('/api/control/cue',{headers:{Cookie:overlay}})).status,401);
    assert.equal((await post('/api/control/cue',overlay,{text:'hi'})).status,401);
    assert.equal((await post('/api/control/cue',control,{text:'x'.repeat(141)})).status,400);
    const cue=await (await post('/api/control/cue',control,{text:'Pautan di bio',seconds:30})).json();
    assert.equal(cue.ok,true);
    const live=await (await call('/api/overlay/cue',{headers:{Cookie:overlay}})).json();
    assert.equal(live.cue.text,'Pautan di bio');
    const controlCue=await (await call('/api/control/cue',{headers:{Cookie:control}})).json();
    assert.equal(controlCue.cue.text,'Pautan di bio');
    assert.equal((await post('/api/control/cue/clear',control,{})).status,200);
    assert.deepEqual(await (await call('/api/overlay/cue',{headers:{Cookie:overlay}})).json(),{cue:null});
    assert.deepEqual(await (await call('/api/control/cue',{headers:{Cookie:control}})).json(),{cue:null});

    const obsInfo=await (await call('/api/control/obs',{headers:{Cookie:control}})).json();
    assert.equal(obsInfo.available,true);assert.deepEqual(obsInfo.scenes,['Scene A','Scene B']);
    assert.equal((await post('/api/control/obs/scene',control,{name:'Scene B'})).status,200);
    assert.deepEqual(sceneWrites,['Scene B']);
    assert.equal((await post('/api/control/obs/scene',control,{name:''})).status,400);

    assert.equal((await post('/api/control/presets/delete',control,{name:'Board'})).status,200);
    assert.deepEqual(await (await call('/api/control/presets',{headers:{Cookie:control}})).json(),{presets:[]});
    current=await (await call('/api/control/snapshot',{headers:{Cookie:control}})).json();
    assert.ok(current.revision>=0);
  } finally {await bridge.close();rmSync(dir,{recursive:true,force:true});}
});

test('pairing throttles failures without echoing credentials',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'malam-auth-'));
  const bridge=await createBridge({port:0,stateFile:join(dir,'state.json'),credentials:{control:randomBytes(32).toString('hex'),overlay:randomBytes(32).toString('hex')}});
  try {
    for(let i=0;i<10;i++) {
      const r=await fetch(bridge.url+'/api/pair/control',{method:'POST',headers:{Origin:bridge.url,'Content-Type':'application/json'},body:JSON.stringify({password:'invalid'})});
      assert.equal(r.status,401); assert.doesNotMatch(await r.text(),/invalid/);
    }
    assert.equal((await fetch(bridge.url+'/api/pair/control',{method:'POST',headers:{Origin:bridge.url,'Content-Type':'application/json'},body:JSON.stringify({password:'still-invalid'})})).status,429);
  } finally {await bridge.close();rmSync(dir,{recursive:true,force:true});}
});
