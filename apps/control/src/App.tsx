import React,{useEffect,useRef,useState} from 'react';
import {displaySchema,parseDisplaySnapshot,templateIds,pointLimits,type DisplaySnapshot} from '../../../packages/contracts/src/display.ts';
import {Broadcast} from '../../../packages/templates/src/Broadcast.tsx';
import {compositions} from '../../../packages/templates/src/layouts.ts';
import {Pairing} from '../../shared/Pairing.tsx';
import {createDraft,editDraft,undoDraft,redoDraft,type DraftHistory} from './draft-store.ts';

type PreviewMode='width'|'height';
export function Preview({snapshot,mode='width',height=560}:{snapshot:DisplaySnapshot;mode?:PreviewMode;height?:number}) {
  const ref=useRef<HTMLDivElement>(null);const [width,setWidth]=useState(640);
  useEffect(()=>{const observer=new ResizeObserver(entries=>setWidth(entries[0].contentRect.width));if(ref.current)observer.observe(ref.current);return()=>observer.disconnect();},[]);
  const w=snapshot.orientation==='portrait'?1080:1920;const h=snapshot.orientation==='portrait'?1920:1080;
  if(mode==='height') {
    const scale=height/h;const pw=Math.max(140,Math.round(w*scale));
    return <div ref={ref} className="preview-frame preview-frame-fit" style={{height,width:pw}}><div className="preview-scaler" style={{width:w,height:h,transform:`scale(${scale})`}}><Broadcast snapshot={snapshot}/></div></div>;
  }
  return <div ref={ref} className="preview-viewport" style={{height:width*h/w}}><div className="preview-scaler" style={{width:w,height:h,transform:`scale(${width/w})`}}><Broadcast snapshot={snapshot}/></div></div>;
}
type Preset={name:string;snapshot:DisplaySnapshot;updatedAt:string};
type ObsInfo={available:boolean;connected?:boolean;currentScene?:string|null;recording?:boolean;scenes?:string[]};
type CuePayload={cue:{id:string;text:string;expiresAt:number}|null};
type Tab='edit'|'live'|'obs'|'presets';
const TABS:[Tab,string][]=[['edit','Edit draft'],['live','Live'],['obs','OBS scenes'],['presets','Presets']];
const stripPrefix=(name:string)=>name.replace(/^MM (LANDSCAPE|PORTRAIT) \| /,'');
const QUICK_CUES=['Link in bio / Pautan di bio','Q&A now / Soal jawapan','Back in 5 / Kembali sebentar'];

function Segmented<T extends string>({label,value,options,onChange}:{label:string;value:T;options:{value:T;label:string}[];onChange:(value:T)=>void}) {
  return <div className="segmented" role="group" aria-label={label}>{options.map(o=><button key={o.value} type="button" className={value===o.value?'seg active':'seg'} aria-pressed={value===o.value} onClick={()=>onChange(o.value)}>{o.label}</button>)}</div>;
}
function TemplatePicker({value,onChange}:{value:DisplaySnapshot['templateId'];onChange:(id:DisplaySnapshot['templateId'])=>void}) {
  return <div className="template-grid" role="group" aria-label="Composition">{templateIds.map(id=><button key={id} type="button" className={value===id?'template-card active':'template-card'} aria-pressed={value===id} onClick={()=>onChange(id)}><strong>{id.replaceAll('-',' ')}</strong><small>{pointLimits[id].count} pts · {pointLimits[id].chars} chars</small></button>)}</div>;
}
function PointsEditor({points,limit,onChange}:{points:string[];limit:{count:number;chars:number};onChange:(points:string[])=>void}) {
  const update=(i:number,v:string)=>onChange(points.map((p,j)=>j===i?v:p));
  const remove=(i:number)=>onChange(points.filter((_,j)=>j!==i));
  const add=()=>onChange([...points,'']);
  return <div className="points-editor"><div className="points-head"><span>Points / Perkara</span><span className="points-count">{points.length}/{limit.count}</span></div>{points.map((point,i)=><div className="point-row" key={i}><span className="point-index">{String(i+1).padStart(2,'0')}</span><input aria-label={`Point ${i+1}`} value={point} placeholder="One point per field" onChange={e=>update(i,e.target.value)}/><span className="point-chars">{Array.from(point).length}/{limit.chars}</span><button type="button" aria-label={`Remove point ${i+1}`} onClick={()=>remove(i)}>×</button></div>)}<button type="button" className="point-add" disabled={points.length>=limit.count} onClick={add}>Add point</button></div>;
}
type SlotRole='media'|'media2'|'media3';
type SlotRect={x:number;y:number;width:number;height:number};
function LayoutEditor({layout,onChange,slots}:{layout:DisplaySnapshot['layout'];onChange:(layout:DisplaySnapshot['layout'])=>void;slots:{role:SlotRole;box:SlotRect}[]}) {
  const range=(key:'mainOffsetX'|'mainOffsetY',label:string)=><label className="range-field" key={key}>{label}<input type="range" min={-48} max={48} step={1} value={layout[key]} onChange={e=>onChange({...layout,[key]:Number(e.target.value)})}/><output>{layout[key]}</output></label>;
  const setSlot=(role:SlotRole,box:SlotRect|null)=>{const next={...layout.slots};if(box)next[role]=box;else delete next[role];onChange({...layout,slots:next});};
  const num=(label:string,value:number,min:number,max:number,onSet:(v:number)=>void)=><label className="slot-num" key={label}>{label}<input type="number" min={min} max={max} value={value} onChange={e=>{const v=Number(e.target.value);if(Number.isSafeInteger(v))onSet(v);}}/></label>;
  return <div className="layout-editor">{range('mainOffsetX','Main offset X')}{range('mainOffsetY','Main offset Y')}<div className="layout-row"><span>Type size</span><Segmented label="Type size" value={layout.textScale} options={[{value:'normal',label:'Normal'},{value:'large',label:'Large'}]} onChange={v=>onChange({...layout,textScale:v})}/></div>
    {slots.length>0&&<div className="slot-editors"><p className="hint">Source slots — drag-free numeric placement. Publish moves the overlay frames; use OBS tab → Align sources to move the real inputs to match.</p>{slots.map(({role,box})=>{const cur=layout.slots[role]??box;const dirty=!!layout.slots[role];
      return <fieldset className="slot-editor" key={role}><legend>{role==='media'?'Source 1':role==='media2'?'Source 2':'Source 3'} {dirty&&<span className="status-pill dirty">custom</span>}</legend>
        <div className="slot-grid">{num('X',cur.x,0,3840,v=>setSlot(role,{...cur,x:v}))}{num('Y',cur.y,0,3840,v=>setSlot(role,{...cur,y:v}))}{num('W',cur.width,24,3840,v=>setSlot(role,{...cur,width:v}))}{num('H',cur.height,24,3840,v=>setSlot(role,{...cur,height:v}))}</div>
        {dirty&&<button type="button" onClick={()=>setSlot(role,null)}>Reset to scene default</button>}
      </fieldset>;})}</div>}
  </div>;
}
function SceneList({scenes,current,presets,onSwitch,busy}:{scenes:string[];current?:string|null;presets:Preset[];onSwitch:(name:string)=>void;busy:boolean}) {
  const [q,setQ]=useState('');
  const names=scenes.filter(s=>s.toLowerCase().includes(q.trim().toLowerCase()));
  return <div className="scene-list"><label className="scene-search">Find scene / Cari babak<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Filter scenes"/></label><div className="scene-grid">{names.map(name=>{const match=presets.some(p=>p.name===name||p.name===stripPrefix(name));return <button key={name} type="button" className={name===current?'scene-card current':'scene-card'} onClick={()=>onSwitch(name)} disabled={busy||name===current} aria-current={name===current?'true':undefined}><span className="scene-name">{name}</span><small>{name===current?'PROGRAM':match?'preset ready':'no preset'}</small></button>;})}</div>{!names.length&&<p className="hint">No scenes match.</p>}</div>;
}

export function Control() {
  const [paired,setPaired]=useState(false);const [program,setProgram]=useState<DisplaySnapshot|null>(null);
  const [history,setHistory]=useState<DraftHistory|null>(null);const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
  const [locale,setLocale]=useState<'en'|'ms'>('en');const [connected,setConnected]=useState(false);
  const [presets,setPresets]=useState<Preset[]>([]);const [obs,setObs]=useState<ObsInfo|null>(null);
  const [cueText,setCueText]=useState('');const [cueSeconds,setCueSeconds]=useState(20);const [presetName,setPresetName]=useState('');const [presetQuery,setPresetQuery]=useState('');
  const [activeCue,setActiveCue]=useState<CuePayload['cue']>(null);
  const [tab,setTab]=useState<Tab>('edit');const [followObs,setFollowObs]=useState(true);const [alignScene,setAlignScene]=useState('');
  const errorRef=useRef<HTMLDivElement>(null);const prevScene=useRef<string|null>(null);
  const load=async(reset=false)=>{
    try {const r=await fetch('/api/control/snapshot');if(r.status===401){setPaired(false);setConnected(false);return;}if(!r.ok)throw new Error();const s=parseDisplaySnapshot(await r.json());setProgram(s);setPaired(true);setConnected(true);setHistory(h=>reset||!h?createDraft(s):h);}catch{setConnected(false);setNotice('Bridge unavailable. Use the independent emergency image in OBS.');}
  };
  useEffect(()=>{void load();const timer=setInterval(()=>void load(),2000);return()=>clearInterval(timer);},[paired]);
  const refreshExtras=async()=>{
    try{const r=await fetch('/api/control/presets');if(r.ok){const d=await r.json() as {presets:Preset[]};setPresets(d.presets);}}catch{/* presets optional */}
    try{const r=await fetch('/api/control/obs');if(r.ok)setObs(await r.json() as ObsInfo);else setObs({available:false});}catch{setObs({available:false});}
  };
  useEffect(()=>{if(!paired)return;void refreshExtras();const t=setInterval(()=>void refreshExtras(),10000);return()=>clearInterval(t);},[paired]);
  const refreshCue=async()=>{try{const r=await fetch('/api/control/cue');if(r.ok){const d=await r.json() as CuePayload;setActiveCue(d.cue&&d.cue.expiresAt>Date.now()?d.cue:null);}}catch{/* cue status optional */}};
  useEffect(()=>{if(!paired)return;void refreshCue();const t=setInterval(()=>void refreshCue(),2000);return()=>clearInterval(t);},[paired]);
  // OBS scene -> preset sync: when the program scene changes in OBS Studio and a
  // preset is named after that scene, publish it automatically (one-click live).
  useEffect(()=>{
    const scene=obs?.currentScene??null;
    if(scene===prevScene.current)return;
    prevScene.current=scene;
    if(!scene||!followObs||!paired||!program)return;
    const p=presets.find(x=>x.name===scene||x.name===stripPrefix(scene));
    if(!p)return;
    void (async()=>{
      try {
        const r=await fetch('/api/control/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({commandId:crypto.randomUUID(),expectedRevision:program.revision,snapshot:{...p.snapshot,sessionId:program.sessionId,revision:program.revision}})});
        if(r.ok){const accepted=parseDisplaySnapshot((await r.json()).snapshot);setProgram(accepted);setHistory(h=>h?createDraft(accepted):h);setNotice(`Scene "${scene}" is live.`);}
        else setNotice(r.status===409?'Scene sync conflict — program changed elsewhere.':'Scene sync publish failed.');
      }catch{setNotice('Scene sync publish failed.');}
    })();
  },[obs?.currentScene,followObs,presets,program,paired]);
  if(!paired) return <Pairing role="control" onPaired={()=>{setPaired(true);void load(true);}}/>;
  if(!history||!program) return <p role="status">Loading…</p>;
  const draft=history.present;const result=displaySchema.safeParse(draft);
  const errors=result.success?[]:result.error.issues;
  const dirty=JSON.stringify(draft)!==JSON.stringify(program);
  const pointLimit=pointLimits[draft.templateId];
  const visiblePresets=presets.filter(p=>p.name.toLowerCase().includes(presetQuery.trim().toLowerCase())||p.snapshot.templateId.includes(presetQuery.trim().toLowerCase()));
  const change=(next:DisplaySnapshot)=>setHistory(h=>h?editDraft(h,next):h);
  const content=(patch:Partial<DisplaySnapshot['content']>)=>change({...draft,content:{...draft.content,...patch}});
  const publishBody=(snapshot:DisplaySnapshot)=>JSON.stringify({commandId:crypto.randomUUID(),expectedRevision:program.revision,snapshot:{...snapshot,sessionId:program.sessionId,revision:program.revision}});
  const applyResponse=async(r:Response,okMessage:string)=>{
    if(r.status===409){setNotice('Conflict: program changed elsewhere. Refresh and retry.');return false;}
    if(!r.ok){setNotice('Publish not acknowledged. Refresh program before retrying.');return false;}
    const accepted=parseDisplaySnapshot((await r.json()).snapshot);setProgram(accepted);setHistory(createDraft(accepted));setNotice(okMessage);return true;
  };
  const publish=async()=>{
    if(!result.success){errorRef.current?.focus();return;}
    setBusy(true);setNotice('');
    try {
      const r=await fetch('/api/control/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({commandId:crypto.randomUUID(),expectedRevision:draft.revision,snapshot:result.data})});
      if(r.status===409){setNotice('Conflict: program changed. Reset from program before publishing again.');return;}
      if(!r.ok)throw new Error();const accepted=parseDisplaySnapshot((await r.json()).snapshot);setProgram(accepted);setHistory(createDraft(accepted));setNotice('Published complete snapshot.');
    }catch{setNotice('Publish not acknowledged. Refresh program before retrying.');}finally{setBusy(false);}
  };
  const goLiveSnapshot=async(snapshot:DisplaySnapshot,label:string)=>{
    setBusy(true);setNotice('');
    try {
      const r=await fetch('/api/control/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:publishBody(snapshot)});
      await applyResponse(r,`${label} is live.`);
    }catch{setNotice('Publish not acknowledged.');}finally{setBusy(false);}
  };
  const field=(key:'title'|'presenter'|'caption'|'disclosure'|'chartDescription'|'link',label:string)=>{
    const issue=errors.find(e=>e.path.join('.')===`content.${key}`);
    return <label key={key} htmlFor={key}>{label}<textarea id={key} aria-label={label} rows={key==='caption'||key==='disclosure'?3:2} value={draft.content[key]??''} onChange={e=>{const patch:Partial<DisplaySnapshot['content']>=key==='link'?{link:e.target.value||null}:{[key]:e.target.value};content(patch);}} aria-invalid={!!issue} aria-describedby={issue?`${key}-error`:undefined}/>{issue&&<span className="field-error" id={`${key}-error`}>{issue.message}</span>}</label>;
  };
  const exportTranscript=()=>{
    const text=[draft.content.title,draft.content.presenter,...draft.content.points,draft.content.caption,draft.content.chartDescription,draft.content.disclosure].filter(Boolean).join('\n\n');
    const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='malam-manifesto-transcript.txt';a.click();URL.revokeObjectURL(url);
  };
  const post=async(path:string,payload:unknown)=>{try{return await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});}catch{return null;}};
  const saveCurrentPreset=async()=>{
    const name=presetName.trim();if(!name){setNotice('Enter a preset name first.');return;}
    const r=await post('/api/control/presets/save',{name,snapshot:result.success?result.data:draft});
    if(r?.ok){setPresets(((await r.json()) as {presets:Preset[]}).presets);setNotice(`Preset "${name}" saved.`);}else setNotice('Preset rejected by bridge.');
  };
  const applyPreset=(name:string)=>{
    const p=presets.find(x=>x.name===name);if(!p)return;
    change({...p.snapshot,sessionId:draft.sessionId,revision:draft.revision});
    setNotice(`Preset "${name}" loaded into draft — publish to take it live.`);
    setTab('edit');
  };
  const removePreset=async(name:string)=>{const r=await post('/api/control/presets/delete',{name});if(r?.ok)setPresets(((await r.json()) as {presets:Preset[]}).presets);};
  const pushCue=async(text=cueText)=>{const value=text.trim();if(!value)return;const r=await post('/api/control/cue',{text:value,seconds:cueSeconds});setNotice(r?.ok?'Cue pushed to the live overlay.':'Cue rejected by bridge.');if(r?.ok){setCueText('');void refreshCue();}};
  const clearCue=async()=>{await post('/api/control/cue/clear',{});setNotice('Cue cleared.');void refreshCue();};
  const switchObsScene=async(name:string)=>{if(!name)return;const r=await post('/api/control/obs/scene',{name});setNotice(r?.ok?`OBS program scene set to "${name}".`:'OBS scene switch failed — is OBS WebSocket enabled?');void refreshExtras();};
  const alignSources=async()=>{const name=alignScene||obs?.currentScene||'';if(!name)return;setBusy(true);setNotice('');try{const r=await post('/api/control/obs/align',{sceneName:name});const d=r?await r.json() as {ok?:boolean;aligned?:string[];missed?:string[];code?:string}:null;if(d?.ok)setNotice(`Aligned ${d.aligned?.length??0} source(s) in "${name}"${d.missed?.length?` — missed: ${d.missed.join(', ')}`:''}.`);else setNotice(d?.code==='UNKNOWN_SCENE'?'That scene is not in the toolkit scene map.':d?.code==='OBS_UNAVAILABLE'?'OBS WebSocket unavailable.':'Align failed.');}catch{setNotice('Align failed.');}finally{setBusy(false);}};
  const emergency=async()=>{try{const r=await fetch('/api/control/emergency',{method:'POST'});if(!r.ok)throw new Error();await load(true);setNotice('Emergency snapshot published.');}catch{setNotice('Bridge unavailable. Select the independent emergency image in OBS.');}};
  const onTabKey=(e:React.KeyboardEvent)=>{
    const ids=TABS.map(t=>t[0]);const i=ids.indexOf(tab);let n=-1;
    if(e.key==='ArrowRight')n=(i+1)%ids.length;else if(e.key==='ArrowLeft')n=(i-1+ids.length)%ids.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=ids.length-1;
    if(n<0)return;e.preventDefault();setTab(ids[n]);document.getElementById(`tab-${ids[n]}`)?.focus();
  };
  const cueLeft=activeCue?Math.max(0,Math.ceil((activeCue.expiresAt-Date.now())/1000)):0;
  return <><a className="skip-link" href="#desk-main">Skip to content</a><main className="desk" id="desk-main"><header className="desk-header"><div><p className="kicker">MALAM MANIFESTO / AISH CAPITAL</p><h1>{locale==='ms'?'Meja kawalan':'Control desk'}</h1></div><div className="toolbar"><label>Bahasa / Language<select value={locale} onChange={e=>setLocale(e.target.value as 'en'|'ms')}><option value="en">English</option><option value="ms">Bahasa Melayu</option></select></label><span className={connected?'status-pill live':'status-pill'}>{connected?'CONNECTED':'OFFLINE'}</span></div></header>
    <div className="emergency-bar"><span>Program revision {program.revision} · {obs?.available?'OBS connected':'OBS control not connected'} · Recording-only toolkit</span><div className="emergency-actions"><span className={dirty?'status-pill dirty':'status-pill'}>{dirty?'DRAFT CHANGES':'PROGRAM CLEAN'}</span><button className="emergency" onClick={()=>void emergency()}>Emergency / Kecemasan</button></div></div>
    <p role="status" className="notice">{notice}</p>
    <nav className="tabs" role="tablist" aria-label="Control sections" onKeyDown={onTabKey}>
      {TABS.map(([id,label])=><button key={id} id={`tab-${id}`} role="tab" aria-selected={tab===id} aria-controls={`panel-${id}`} className={tab===id?'tab active':'tab'} onClick={()=>setTab(id)}>{label}</button>)}
    </nav>
    {tab==='edit'&&<div className="desk-grid" role="tabpanel" id="panel-edit" aria-labelledby="tab-edit"><section className="editor"><div className="section-head"><h2>{locale==='ms'?'Draf':'Draft'} <small>not on air</small></h2><span className={dirty?'status-pill dirty':'status-pill'}>{dirty?'unsaved':'clean'}</span></div>
      <div ref={errorRef} tabIndex={-1} role={errors.length?'alert':undefined}>{errors.length>0&&<><h3>Resolve before publishing</h3><ul>{errors.map((e,i)=><li key={i}><a href={`#${String(e.path.at(-1))}`}>{e.path.join('.')}: {e.message}</a></li>)}</ul></>}</div>
      <label>Composition<select value={draft.templateId} onChange={e=>{const id=e.target.value as DisplaySnapshot['templateId'];change({...draft,templateId:id,layout:{mainOffsetX:0,mainOffsetY:0,textScale:'normal',slots:{}}});}}>{templateIds.map(id=><option key={id}>{id}</option>)}</select></label>
      <TemplatePicker value={draft.templateId} onChange={id=>change({...draft,templateId:id,layout:{mainOffsetX:0,mainOffsetY:0,textScale:'normal',slots:{}}})}/>
      <div className="form-row"><div className="field"><span className="field-label">Orientation</span><Segmented label="Orientation" value={draft.orientation} options={[{value:'landscape',label:'Landscape'},{value:'portrait',label:'Portrait'}]} onChange={v=>change({...draft,orientation:v,layout:{mainOffsetX:0,mainOffsetY:0,textScale:'normal',slots:{}}})}/></div><div className="field"><span className="field-label">Motion</span><Segmented label="Motion" value={draft.motionMode} options={[{value:'static',label:'Static'},{value:'low',label:'Low'},{value:'standard',label:'Standard'}]} onChange={v=>change({...draft,motionMode:v})}/></div></div>
      <label>Output language<select value={draft.content.locale} onChange={e=>content({locale:e.target.value as 'en'|'ms'})}><option value="en">English</option><option value="ms">Bahasa Melayu</option></select></label>
      {field('title','Title / Tajuk')}{field('presenter','Presenter / Pembentang')}
      <PointsEditor points={draft.content.points} limit={pointLimit} onChange={points=>content({points})}/>
      {field('caption','Caption / Kapsyen')}{field('disclosure','Disclosure / Penafian')}{field('chartDescription','Chart description / Penerangan carta')}{field('link','Link / Pautan (optional)')}
      <label>Countdown deadline (ISO date with timezone)<input id="countdownEndsAt" placeholder="2026-11-20T20:00:00+08:00" value={draft.content.countdownEndsAt??''} onChange={e=>content({countdownEndsAt:e.target.value||null})}/></label>
      <details className="layout-details"><summary>Constrained layout editor</summary><p className="hint">Move the main region ±48px. Protected-region collision checks are mandatory.</p><LayoutEditor layout={draft.layout} onChange={layout=>change({...draft,layout})} slots={(()=>{const comp=compositions[`${draft.templateId}:${draft.orientation}`];return comp.regions.filter(r=>r.role==='media'||r.role==='media2'||r.role==='media3').map(r=>({role:r.role as SlotRole,box:{x:r.x,y:r.y,width:r.width,height:r.height}}));})()}/></details>
      <div className="toolbar"><button disabled={!history.past.length} onClick={()=>setHistory(undoDraft(history))}>Undo</button><button disabled={!history.future.length} onClick={()=>setHistory(redoDraft(history))}>Redo</button><button onClick={()=>void load(true)}>Reset from program</button><button onClick={exportTranscript}>Export transcript</button></div>
      <button className="primary publish" disabled={busy||!connected||!result.success} onClick={()=>void publish()}>{busy?'Publishing…':locale==='ms'?'Terbitkan draf':'Publish draft'}</button>
    </section><aside className="monitors"><div className="section-head"><h2>PREVIEW <small>draft only</small></h2><span className="preview-badge">{result.success?'validated':'invalid'}</span></div>{result.success?<Preview snapshot={result.data} mode="height" height={620}/>:<div className="preview-invalid">Preview paused: correct the validation errors.</div>}
      <h2>LINKS</h2><p><a href="/overlay" target="_blank" rel="noreferrer">Open read-only overlay</a> · <a href="/gallery">40-composition gallery</a></p><p>OBS source: <code>http://127.0.0.1:4320/overlay</code>. Pair using OBS Interact. Use <code>/overlay-transparent</code> for capture slots.</p><p>Independent emergency assets: <a href="/emergency/landscape.svg">landscape</a> / <a href="/emergency/portrait.svg">portrait</a>.</p>
    </aside></div>}
    {tab==='live'&&<div className="desk-grid live-grid" role="tabpanel" id="panel-live" aria-labelledby="tab-live"><section className="editor live-controls"><div className="section-head"><h2>LIVE CONTROL <small>program revision {program.revision}</small></h2><span className={connected?'status-pill live':'status-pill'}>{connected?'ON AIR':'OFFLINE'}</span></div>
      <div className="meta-grid"><div className="meta-card"><span>Template</span><strong>{program.templateId}</strong></div><div className="meta-card"><span>Canvas</span><strong>{program.orientation}</strong></div><div className="meta-card"><span>Motion</span><strong>{program.motionMode}</strong></div><div className="meta-card"><span>Locale</span><strong>{program.content.locale.toUpperCase()}</strong></div></div>
      <h2>LIVE CUE <small>push text to the overlay</small></h2>
      {activeCue&&<div className="cue-active"><strong>{activeCue.text}</strong><span>visible ~{cueLeft}s</span></div>}
      <label>Cue message<input value={cueText} maxLength={140} placeholder="e.g. Pautan penuh di bio" onChange={e=>setCueText(e.target.value)}/></label>
      <div className="form-row"><label>Show for (seconds)<input type="number" min={3} max={300} value={cueSeconds} onChange={e=>setCueSeconds(Number(e.target.value))}/></label></div>
      <div className="quick-cues">{QUICK_CUES.map(q=><button key={q} type="button" onClick={()=>void pushCue(q)}>{q}</button>)}</div>
      <div className="toolbar"><button onClick={()=>void pushCue()} disabled={!cueText.trim()}>Push cue</button><button onClick={()=>void clearCue()}>Clear cue</button></div>
      <h2>SCENE SYNC <small>OBS-driven switching</small></h2>
      <label className="check-row"><input type="checkbox" checked={followObs} onChange={e=>setFollowObs(e.target.checked)}/> Follow OBS program scene — a preset named after the scene goes live automatically</label>
      <p>Current OBS scene: <strong>{obs?.currentScene??'unknown'}</strong>{obs?.recording?' · recording':''}</p>
      <p className="hint">Switch scenes in OBS Studio as usual. Name a preset exactly like the OBS scene (the <code>MM LANDSCAPE | </code> prefix is ignored) and it publishes the moment you cut. Use the Presets tab to save and name them.</p>
      <p className="hint">Last-minute text changes: Edit draft tab → Publish draft. Everything else (scenes, sources, layouts in OBS) stays in OBS.</p>
    </section><aside className="monitors"><h2>PROGRAM PREVIEW <small>what viewers see</small></h2><Preview snapshot={program} mode="height" height={620}/>
      <h2>PROGRAM DETAILS</h2><p className="hint">Title: <strong>{program.content.title}</strong></p><p className="hint">Presenter: {program.content.presenter||'—'}</p><p className="hint">Points: {program.content.points.length} · Caption: {program.content.caption?'set':'empty'}</p>
      <h2>QUICK ACTIONS</h2><div className="toolbar"><button onClick={()=>setTab('edit')}>Edit draft</button><button onClick={()=>void load(true)}>Reset draft from program</button><button onClick={()=>void emergency()}>Emergency</button></div>
    </aside></div>}
    {tab==='obs'&&<div className="desk-grid" role="tabpanel" id="panel-obs" aria-labelledby="tab-obs"><section className="editor"><div className="section-head"><h2>OBS STATUS <small>{obs?.available?'websocket reachable':'unavailable'}</small></h2><button onClick={()=>void refreshExtras()}>Refresh</button></div>
      {obs?.available?<><p>Program scene: <strong>{obs.currentScene??'—'}</strong>{obs.recording?' · recording':''}</p><p>{obs.scenes?.length??0} scenes in the current collection.</p>
        <div className="align-bar"><label>Scene<select value={alignScene} onChange={e=>setAlignScene(e.target.value)}><option value="">{obs.currentScene??'Select scene'}</option>{(obs.scenes??[]).filter(s=>s!==obs.currentScene).map(s=><option key={s} value={s}>{s}</option>)}</select></label><button onClick={()=>void alignSources()} disabled={busy||!(alignScene||obs?.currentScene)}>Align sources to program slots</button></div>
        <p className="hint">Moves each scene's camera/screen inputs to the slot rectangles of the <em>published</em> draft ({program.templateId} · {program.orientation}), including any custom slot positions you set in Edit → Constrained layout editor. Publish first, then align.</p>
        <SceneList scenes={obs.scenes??[]} current={obs.currentScene} presets={presets} onSwitch={name=>void switchObsScene(name)} busy={busy}/></>:<p>OBS WebSocket is not reachable. In OBS: Tools → WebSocket Server Settings → Enable + set a password, then store it with the obs role (<code>npm run pair:setup</code>).</p>}
      <p className="hint">You can also switch scenes with OBS hotkeys or the Scenes panel — the dashboard is only needed for Malam Manifesto content, cues and presets.</p>
    </section><aside className="monitors"><h2>EMERGENCY</h2><p>If the bridge dies mid-stream, cut to the independent SVG in OBS or use the Emergency button above.</p>
    </aside></div>}
    {tab==='presets'&&<div className="desk-grid" role="tabpanel" id="panel-presets" aria-labelledby="tab-presets"><section className="editor"><div className="section-head"><h2>SCENE PRESETS <small>{presets.length} saved</small></h2></div>
      <p>Presets are finished Malam Manifesto layouts you can go live with in one click. <strong>Name a preset exactly like an OBS scene</strong> (e.g. <code>MM LANDSCAPE | Chart Focus</code>) and the Live tab's scene sync will publish it automatically when you switch scenes in OBS.</p>
      <label className="preset-filter">Find preset<input value={presetQuery} onChange={e=>setPresetQuery(e.target.value)} placeholder="Filter by name or template"/></label>
      <div className="preset-save"><input value={presetName} maxLength={60} placeholder="Preset name" onChange={e=>setPresetName(e.target.value)}/><button onClick={()=>void saveCurrentPreset()} disabled={!presetName.trim()}>Save draft</button></div>
      {visiblePresets.length?<ul className="preset-list">{visiblePresets.map(p=>{const match=obs?.scenes?.some(s=>s===p.name||s===stripPrefix(p.name));return <li key={p.name} className="preset-card"><span className="preset-name">{p.name}<small>{p.snapshot.templateId} · {p.snapshot.orientation} · {p.updatedAt.slice(0,10)}{match?' · matches OBS scene':''}</small></span><span className="preset-actions"><button onClick={()=>applyPreset(p.name)}>Load</button><button onClick={()=>void goLiveSnapshot(p.snapshot,`Preset "${p.name}"`)} disabled={busy}>Go live</button><button onClick={()=>void removePreset(p.name)}>Delete</button></span></li>;})}</ul>:<p>{presets.length?'No presets match the filter.':'No presets yet. Finish a layout in the Edit tab, name it above, and save it for one-click reuse.'}</p>}
    </section><aside className="monitors"><h2>HOW IT FITS</h2>
      <p><strong>Edit draft</strong> — build and validate a layout, publish manually.</p>
      <p><strong>Live</strong> — what viewers see, cues, OBS scene sync.</p>
      <p><strong>OBS scenes</strong> — status and program-scene switching.</p>
      <p><strong>Presets</strong> — saved scenes ready to switch.</p>
      <p className="hint">Preset names are matched to OBS scene names after stripping the <code>MM LANDSCAPE |</code> / <code>MM PORTRAIT |</code> prefix, so <code>Chart Focus</code> matches <code>MM LANDSCAPE | Chart Focus</code>.</p>
    </aside></div>}
  </main></>;
}
