// Provisions the Malam Manifesto scene set into the running OBS instance over
// OBS WebSocket v5. Idempotent: existing scenes and inputs are reused,
// URLs you already retargeted are never overwritten — only size/position
// and layer order are (re)applied from assets/obs-scenes/scene-map.json.
// Usage: npx tsx scripts/provision-obs-scenes.ts
// Requires: OBS open, Tools → WebSocket Server Settings enabled, obs-role
// password stored in the keyring (npm run pair:setup), bridge NOT required.
import {readFileSync} from 'node:fs';
import {createLocalObsAdapter} from '../apps/bridge/src/obs/client.ts';
import {compositions} from '../packages/templates/src/layouts.ts';

type Rect=[number,number,number,number];
type SrcDef={kind:string;label?:string;rect?:string|Rect;url?:string;name?:string};
type SceneDef={id:string;name:string;templateId:string;sources:(string|SrcDef)[];overlay?:'auto'|'opaque'|'transparent';use:string};
type SceneMap={overlayBase:string;scenes:SceneDef[]};

const map=JSON.parse(readFileSync('assets/obs-scenes/scene-map.json','utf8')) as SceneMap;
const KNOWN_KINDS=['chart','camera','slides','website','video','game','ndi','vdo'];
// Semantic kind -> OBS input kind. Apps the operator already runs (MT5/
// TradingView charts, games, PDF windows) become window capture so any
// window can be picked in Properties; video files become ffmpeg_source;
// only genuinely web sources (website, VDO.Ninja) stay browser_source.
// NOTE: OBS 33 on X11 names the window/screen capture source
// 'xshm_input_v2' (older builds used 'window_capture'/'screen_capture').
const INPUT_KIND:Record<string,string>={chart:'xshm_input_v2',game:'xshm_input_v2',slides:'xshm_input_v2',video:'ffmpeg_source',website:'browser_source',vdo:'browser_source'};
// Kinds that may fall back to a window-capture placeholder when their real
// device/plugin is missing — never a browser page.
const WINDOW_FALLBACK=['camera','ndi'];
const INPUT_SETTINGS:Record<string,Record<string,unknown>>={
  xshm_input_v2:{capture_window:'',show_cursor:true},
  ffmpeg_source:{local_file:'',is_local_file:true,looping:true,restart_on_activate:false},
  browser_source:{is_local_file:false},
};

const adapter=createLocalObsAdapter(m=>console.log(`[obs] ${m}`));
await adapter.connect();

const settings=await adapter.call('GetVideoSettings') as {baseWidth:number;baseHeight:number};
const width=settings.baseWidth,height=settings.baseHeight;
const orientation=height>width?'portrait':'landscape';
const prefix=`MM ${orientation==='portrait'?'PORTRAIT':'LANDSCAPE'} | `;
const placeholderUrl=(kind:string)=>`${map.overlayBase}/placeholder#${kind}`;

// A4 fit inside the canvas, preserving the 1:1.4142 page ratio.
const a4Rect=():Rect=>{
  if(height>=width){const w=width,h=Math.round(width*1.41421356);return [0,Math.round((height-h)/2),w,h];}
  const h=height,w=Math.round(height*1.41421356);return [Math.round((width-w)/2),0,w,h];
};

type Normalized={kind:string;label:string;rect:string|Rect;url?:string;name?:string};
type Fit='inner'|'outer'|'stretch';
const normalize=(s:string|SrcDef):Normalized|null=>{
  if(typeof s==='string'){
    if(s==='overlay')return null;
    const [rawKind,label]=s.split(':');
    const kind=rawKind==='capture'||rawKind==='browser'?label:rawKind==='media'?'slides':rawKind;
    if(!kind||!KNOWN_KINDS.includes(kind))return null;
    return {kind,label:label??kind,rect:'media'};
  }
  const kind=s.kind,label=s.label??s.kind;
  if(!KNOWN_KINDS.includes(kind))return null;
  return {kind,label,rect:s.rect??'media',url:s.url,name:s.name};
};

const mediaRect=(templateId:string,ori:string,slot:'media'|'media2'|'media3'='media'):Rect|null=>{
  const comp=compositions[`${templateId}:${ori}`];
  const r=comp?.regions.find(x=>x.role===slot);
  return r?[r.x,r.y,r.width,r.height]:null;
};

// Rect names: media/media2 = template slot, media-fill/media2-fill = cover-crop,
// media-stretch/media2-stretch = distort-to-fill, background = fullscreen,
// a4 = A4-proportioned page, or an explicit [x,y,w,h] canvas box.
// Default fit is 'inner' (letterbox/pillarbox) so landscape sources sit
// correctly inside portrait slots and vice versa.
const resolveRect=(n:Normalized,templateId:string):{rect:Rect;fit:Fit}=>{
  if(Array.isArray(n.rect))return {rect:n.rect,fit:'inner'};
  if(n.rect==='background')return {rect:[0,0,width,height],fit:'stretch'};
  if(n.rect==='a4')return {rect:a4Rect(),fit:'inner'};
  const m=/^(media[23]?)(?:-(fill|stretch))?$/.exec(n.rect);
  if(m){
    const slot=m[1]==='media2'?'media2':m[1]==='media3'?'media3':'media';
    const fit:Fit=m[2]==='fill'?'outer':m[2]==='stretch'?'stretch':'inner';
    const media=mediaRect(templateId,orientation,slot)??mediaRect(templateId,orientation,'media');
    if(media)return {rect:media,fit};
    console.warn(`  ! ${n.label}: no media region for ${templateId}:${orientation} — falling back to background`);
    return {rect:[0,0,width,height],fit:'stretch'};
  }
  console.warn(`  ! ${n.label}: unknown rect "${String(n.rect)}" — falling back to media slot`);
  const media=mediaRect(templateId,orientation,'media');
  return media?{rect:media,fit:'inner'}:{rect:[0,0,width,height],fit:'stretch'};
};

const existing=new Set(await adapter.listScenes());
const inputs=new Set(await adapter.call('GetInputList').then(r=>new Set(((r.inputs??[]) as {inputName:string}[]).map(i=>i.inputName))).catch(()=>new Set<string>()));

const call=async(type:string,data:Record<string,unknown>)=>adapter.call(type,data);
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

let created=0,reused=0,placed=0;
for(const def of map.scenes) {
  const sceneName=`${prefix}${def.name}`;
  if(!existing.has(sceneName)) {
    await call('CreateScene',{sceneName});
    existing.add(sceneName);created++;
    console.log(`+ scene ${sceneName}`);
  } else {reused++;console.log(`= scene ${sceneName} (exists)`);}

  const sources=(def.sources.map(normalize).filter((s):s is Normalized=>!!s));
  const media=mediaRect(def.templateId,orientation,'media');
  const media2=mediaRect(def.templateId,orientation,'media2');
  const media3=mediaRect(def.templateId,orientation,'media3');
  const resolved=(sources.map(s=>({...s,...resolveRect(s,def.templateId)})) as (Normalized&{rect:Rect;fit:Fit})[]);
  const sameRect=(a:Rect,b:Rect|null)=>!!b&&a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2]&&a[3]===b[3];
  const isMediaRect=(r:Rect)=>sameRect(r,media)||sameRect(r,media2)||sameRect(r,media3);
  const rank=(s:Normalized&{rect:Rect})=>isMediaRect(s.rect)?2:0;
  // Transparent overlay whenever anything sits behind it (background/a4/fallback).
  const overlayMode=def.overlay??(resolved.some(s=>rank(s)!==2)?'transparent':'opaque');
  const overlayUrl=`${map.overlayBase}/${overlayMode==='transparent'?'overlay-transparent':'overlay'}`;

  // Layer order bottom -> top: background/a4 sources, overlay, media-slot sources.
  const overlayItem='__overlay__' as const;
  const ordered=[...resolved.filter(s=>rank(s)===0),overlayItem,...resolved.filter(s=>rank(s)===2)];

  for(const item of ordered) {
    const isOverlay=item===overlayItem;
    const inputName=`${sceneName} :: ${isOverlay?'Malam Manifesto Overlay':(item as Normalized).label}`;
    const rect=isOverlay?[0,0,width,height]:(item as Normalized&{rect:Rect}).rect;
    const url=isOverlay?overlayUrl:((item as Normalized).url??placeholderUrl((item as Normalized).kind));
    let isNew=!inputs.has(inputName);
    const itemKind=(item as Normalized).kind;
    const desiredKind=itemKind==='overlay'?'':INPUT_KIND[itemKind]??'browser_source';
    const migratable=!isOverlay&&desiredKind!=='browser_source'||WINDOW_FALLBACK.includes(itemKind);
    if(!isOverlay&&isNew===false&&migratable) {
      // Migration: inputs created by older runs were browser_source
      // placeholders. If this input still looks like one (has a 'url'
      // setting), drop its scene item — OBS deletes the unreferenced
      // source — and recreate it with the correct capture kind. Inputs the
      // operator already retargeted to a real window/file are left alone.
      // (RemoveInput is unreliable on this OBS build; scene-item removal
      // frees the name because each input is used by exactly one scene.)
      try {
        const st=await call('GetInputSettings',{inputName}) as {inputKind?:string;inputSettings?:Record<string,unknown>};
        const s=st.inputSettings??{};
        const isBrowser=st.inputKind==='browser_source'||typeof s.url==='string';
        if(isBrowser) {
          const idRes=await call('GetSceneItemId',{sceneName,sourceName:inputName}) as {sceneItemId?:number};
          if(typeof idRes.sceneItemId==='number') {
            await call('RemoveSceneItem',{sceneName,sceneItemId:idRes.sceneItemId});
            await sleep(400);
            const stillThere=await call('GetInputList',{}).then(r=>((r.inputs??[]) as {inputName:string}[]).some(i=>i.inputName===inputName)).catch(()=>true);
            if(!stillThere) {inputs.delete(inputName);isNew=true;console.log(`  ~ replaced browser placeholder "${inputName}" -> ${itemKind}`);}
            else console.warn(`  ! "${inputName}" still referenced elsewhere — left as browser_source`);
          }
        }
      } catch { /* kind probe failed — leave the existing input alone */ }
    }
    if(isNew) {
      try {
        if((item as Normalized).kind==='camera') {
          // Phone cams: OBS Camera / DroidCam expose the phone as a UVC webcam.
          // Pick the first available v4l2 device; the operator retargets in OBS
          // Properties if more than one camera is attached.
          try {
            const devs=await call('GetInputPropertiesListPropertyItems',
              {inputKind:'v4l2_input',propertyName:'video_device_id'}) as {propertyItems?:{itemName:string;itemValue:number;itemEnabled?:boolean}[]};
            const usable=(devs.propertyItems??[]).filter(d=>d.itemEnabled!==false);
            if(usable.length) {
              await call('CreateInput',{sceneName,inputName,inputKind:'v4l2_input',
                inputSettings:{video_device_id:usable[0].itemValue},sceneItemEnabled:true});
              inputs.add(inputName);
              console.log(`  + camera "${inputName}" -> v4l2 ${usable[0].itemName}`);
            } else throw new Error('no v4l2 video devices');
          } catch {
            console.warn(`  ! no webcam found for "${inputName}" — created window-capture placeholder; pick phone mirror/MT5 window in OBS Properties`);
            await call('CreateInput',{sceneName,inputName,inputKind:'xshm_input_v2',
              inputSettings:{...INPUT_SETTINGS.xshm_input_v2,width:rect[2],height:rect[3]},sceneItemEnabled:true});
            inputs.add(inputName);
          }
        } else if((item as Normalized).kind==='ndi') {
          // NDI|HX Camera phones: the obs-ndi plugin registers 'ndi_source'.
          // 'name' is the phone's NDI source name; when omitted and exactly one
          // NDI source is broadcasting, it is picked automatically.
          try {
            await call('GetInputDefaultSettings',{inputKind:'ndi_source'});
            let ndiName=(item as Normalized).name;
            if(!ndiName) {
              try {
                const found=await call('GetInputPropertiesListPropertyItems',
                  {inputKind:'ndi_source',propertyName:'ndi_source_name'}) as {propertyItems?:{itemName:string}[]};
                const names=(found.propertyItems??[]).map(d=>d.itemName);
                if(names.length===1)ndiName=names[0];
                else if(names.length>1)console.log(`  ? NDI sources found: ${names.join(' | ')} — set "name" per source in scene-map.json`);
                else console.warn(`  ! no NDI sources broadcasting — "${inputName}" created empty; start NDI|HX Camera on the phone`);
              } catch { console.warn(`  ! could not list NDI sources for "${inputName}"`); }
            }
            await call('CreateInput',{sceneName,inputName,inputKind:'ndi_source',
              inputSettings:ndiName?{ndi_source_name:ndiName}:{},sceneItemEnabled:true});
            inputs.add(inputName);
            console.log(`  + ndi "${inputName}" -> ${ndiName??'(no source name — set in OBS Properties)'}`);
          } catch {
            console.warn(`  ! NDI plugin missing or failed for "${inputName}" — created window-capture placeholder; install obs-ndi or pick a window in OBS Properties`);
            await call('CreateInput',{sceneName,inputName,inputKind:'xshm_input_v2',
              inputSettings:{...INPUT_SETTINGS.xshm_input_v2,width:rect[2],height:rect[3]},sceneItemEnabled:true});
            inputs.add(inputName);
          }
        } else {
          const inputKind=INPUT_KIND[(item as Normalized).kind]??'browser_source';
          const settings:Record<string,unknown>={...(INPUT_SETTINGS[inputKind]??{}),width:rect[2],height:rect[3]};
          if(inputKind==='browser_source')settings.url=url;
          await call('CreateInput',{sceneName,inputName,inputKind,
            inputSettings:settings,sceneItemEnabled:true});
          inputs.add(inputName);
          if(inputKind!=='browser_source')console.log(`  + ${inputKind} "${inputName}" — pick window/file in OBS Properties`);
        }
      } catch(error){console.warn(`  ! could not create "${inputName}": ${error instanceof Error?error.message:error}`);continue;}
    } else if(isOverlay) {
      // The overlay input is toolkit-owned: keep its URL in sync with the
      // scene's required mode (opaque vs transparent) on every re-run.
      try{await call('SetInputSettings',{inputName,inputSettings:{url,width:rect[2],height:rect[3]},overlay:true});}
      catch{ /* non-browser sources ignore width/height */ }
    } else {
      // Existing capture input: refresh viewport size only — never touch the
      // URL, so operator-retargeted sources survive re-provisioning.
      try{await call('SetInputSettings',{inputName,inputSettings:{width:rect[2],height:rect[3]},overlay:true});}
      catch{ /* non-browser sources ignore width/height */ }
    }
    // Position the scene item at its rect.
    try {
      const idRes=await call('GetSceneItemId',{sceneName,sourceName:inputName});
      const sceneItemId=idRes.sceneItemId as number;
      const tRes=await call('GetSceneItemTransform',{sceneName,sceneItemId});
      const t=(tRes.sceneItemTransform??{}) as Record<string,unknown>;
      const boundsType={inner:'OBS_BOUNDS_SCALE_INNER',outer:'OBS_BOUNDS_SCALE_OUTER',stretch:'OBS_BOUNDS_STRETCH'}[(item as Normalized&{fit?:Fit}).fit??'inner'] as string;
      await call('SetSceneItemTransform',{sceneName,sceneItemId,sceneItemTransform:{
        ...t,positionX:rect[0],positionY:rect[1],scaleX:1,scaleY:1,boundsType,
        boundsAlignment:0,boundsWidth:rect[2],boundsHeight:rect[3],
        crop:{top:0,bottom:0,left:0,right:0}}});
      placed++;
    } catch(error){console.warn(`  ! could not place "${inputName}": ${error instanceof Error?error.message:error}`);}
  }

  // Enforce layer order bottom -> top.
  try {
    const listRes=await call('GetSceneItemList',{sceneName});
    const items2=(listRes.sceneItems??[]) as {sceneItemId:number;sourceName:string}[];
    const byName=new Map(items2.map(i=>[i.sourceName,i.sceneItemId]));
    let index=0;
    for(const item of ordered) {
      const inputName=`${sceneName} :: ${item===overlayItem?'Malam Manifesto Overlay':(item as Normalized).label}`;
      const id=byName.get(inputName);
      if(id!==undefined){await call('SetSceneItemIndex',{sceneName,sceneItemId:id,sceneItemIndex:index});index++;}
    }
  } catch(error){console.warn(`  ! could not order "${sceneName}": ${error instanceof Error?error.message:error}`);}
}

console.log(`Done: ${created} scenes created, ${reused} already present, ${placed} sources placed. Canvas ${width}x${height} (${orientation}).`);
console.log('Next: retarget sources in OBS Properties — capture inputs (chart/game/slides) pick any window (MT5, TradingView, game, PDF viewer); ffmpeg inputs (video) pick a file; website/VDO.Ninja stay browser sources. Camera/NDI devices are preserved on re-runs. Set the draft Orientation in the control desk to match.');
await adapter.disconnect();
