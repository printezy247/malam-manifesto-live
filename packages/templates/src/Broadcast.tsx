import React,{useEffect,useState,type CSSProperties} from 'react';
import type {DisplaySnapshot} from '../../contracts/src/display.ts';
import {getCanvas} from '../../contracts/src/layout.js';
import {remainingSeconds} from '../../broadcast-ui/src/countdown.js';
import {motionDuration} from '../../broadcast-ui/src/motion.ts';
import {profileForMotion} from '../../contracts/src/performance.ts';
import {FitText} from '../../broadcast-ui/src/FitText.tsx';
import {compositions} from './layouts.ts';

export function Countdown({deadline,locale='en'}:{deadline:string|null;locale?:string}) {
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{if(!deadline)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[deadline]);
  if(!deadline) return <p className="mm-standby">{deadline===null?'Menunggu / Stand by':'—'}</p>;
  const seconds=remainingSeconds(Date.parse(deadline),now);
  return <div className="mm-timer-wrap"><span className="mm-count-label">{locale==='ms'?'Baki masa':'TIME LEFT'}</span><p className="mm-countdown">{String(Math.floor(seconds/3600)).padStart(2,'0')}:{String(Math.floor(seconds/60)%60).padStart(2,'0')}:{String(seconds%60).padStart(2,'0')}</p></div>;
}

const ATMOSPHERE=['vigil','title-card','hype-intro','end-screen','starting-soon','short-break','technical-difficulty','vs-battle','live-shop','winner','manifesto-about'];
const GRID=['board','principles-board','qa','recap-closing','resource-card','manifesto-about'];
const CHAT=['chat-highlight'];
const CHART=['chart'];
const GAMING=['duo-cam','vs-battle','gameplay','player-intro','fight-mode','commentary','trader-focus'];
const FIGHT_VS=['vs-battle','fight-mode','commentary'];
// Deterministic decorative data — no Math.random, safe for replayed renders.
const CANDLE_HEIGHTS=[46,68,34,74,52,82,40,64,38,72,55,80,44,62];
const EQ_BARS=[92,55,100,62,38];
// Deterministic sparkline for the chart capture — fixed fintech-style trace.
const SPARK_POINTS='0,44 14,38 28,42 42,30 56,36 70,24 84,30 98,20 112,26 126,14 140,22 154,12 168,18 182,10 196,16';
// Deterministic per-name stats for the VS card — same name always yields the same bars.
const hashOf=(s:string)=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))>>>0;return h;};
const hpFor=(s:string)=>55+(hashOf(s)%41);
const winsFor=(s:string)=>hashOf(s)%3;
// Deterministic golden fintech floaters — fixed positions, CSS-driven drift.
const FLOATERS=[
  {x:6,y:12,s:56,t:'coin'},{x:20,y:64,s:30,t:'tick'},{x:36,y:28,s:18,t:'dash'},
  {x:52,y:80,s:62,t:'ring'},{x:68,y:14,s:26,t:'coin'},{x:82,y:52,s:20,t:'tick'},
  {x:92,y:78,s:46,t:'dash'},{x:10,y:48,s:22,t:'ring'},{x:44,y:90,s:34,t:'coin'},
  {x:60,y:6,s:16,t:'tick'},{x:76,y:38,s:40,t:'ring'},{x:28,y:92,s:26,t:'dash'},
  {x:88,y:18,s:58,t:'coin'},{x:4,y:84,s:36,t:'ring'},{x:48,y:44,s:14,t:'tick'},
  {x:72,y:88,s:24,t:'dash'}
] as const;

export function Broadcast({snapshot,connected=true,transparent=false}:{snapshot:DisplaySnapshot;connected?:boolean;transparent?:boolean}) {
  const {content,templateId,orientation}=snapshot;
  const canvas=getCanvas(orientation);
  const layout=compositions[`${templateId}:${orientation}`];
  const emergency=templateId==='technical-difficulty';
  const timer=['starting-soon','short-break'].includes(templateId);
  const media=['presenter','chart','chat-highlight','duo-cam','vs-battle','gameplay','player-intro','starting-soon','short-break','qa','poll','resource-card','recap-closing','end-screen','live-shop','fight-mode','trader-focus','commentary','winner','manifesto-about'].includes(templateId);
  const SLOT_LABELS:Record<string,Record<number,string>>={
    'live-shop':{1:'AISH CAM',2:'TV SCREEN'},
    'fight-mode':{1:'MT5 — TRADER A',2:'MT5 — TRADER B'},
    'trader-focus':{1:'MT5 — TRADER A',2:'NARRATOR CAM'},
    'commentary':{1:'MT5 — TRADER A',2:'MT5 — TRADER B',3:'AISH CAM'},
    'winner':{1:'HIGHLIGHT A',2:'HIGHLIGHT B'},
    'manifesto-about':{1:'BRAND VIDEO'}
  };
  const camLabel=(slot:1|2|3)=>SLOT_LABELS[templateId]?.[slot]??(slot===3?'CAM 3':slot===2?(GAMING.includes(templateId)?'CAM 2':'HOST CAM'):templateId==='chart'?'CHART CAPTURE':templateId==='gameplay'?'PLAYER CAM':templateId==='player-intro'?'PHONE CAM':'CAM 1');
  const titleClass=templateId==='title-card'?'mm-title-hero':timer||emergency?'':'mm-title-std';

  const regionContent=(role:string)=>{
    switch(role) {
      case 'header':return <>
        <img className="mm-logo" src="/logo.png" alt="" width="800" height="309" onError={e=>{e.currentTarget.hidden=true;}}/>
        <span className="mm-chip"><i aria-hidden="true"/>{connected?'MALAM MANIFESTO':'MALAM MANIFESTO — OFFLINE'}</span>
        <span className="mm-edition">{content.locale==='ms'?'SESI LIVE':'LIVE SESSION'}</span>
        <i className="mm-sweep" aria-hidden="true"/>
      </>;
      case 'title':return <div className={titleClass}>
        <span className="mm-eyebrow">{templateId.replaceAll('-',' ').toUpperCase()} / {content.locale.toUpperCase()}</span>
        {templateId==='title-card'
          ?<FitText as="h1" className="mm-hero" fitKey={snapshot.layout.textScale}><span className="face gold">{content.title}</span></FitText>
          :<><FitText as="h1" fitKey={snapshot.layout.textScale}>{content.title}</FitText><i className="mm-title-rule" aria-hidden="true"/></>}
      </div>;
      case 'caption':return <FitText className="mm-caption" fitKey={snapshot.layout.textScale}>{content.caption}</FitText>;
      case 'disclosure':return <FitText className="mm-disclosure" fitKey={snapshot.layout.textScale}>{content.disclosure}</FitText>;
      case 'media':case 'media2':case 'media3':{
        const slot=role==='media2'?2:role==='media3'?3:1;
        const isChart=CHART.includes(templateId);
        const plate=content.presenter||camLabel(slot);
        return <div className={`mm-capture mm-cam-${slot} ${transparent?'mm-capture-transparent':''} ${isChart?'mm-capture-chart':''}`}>
          <i className="mm-corners" aria-hidden="true"/>
          {(transparent||content.presenter)&&<span className="mm-nameplate"><i className="mm-rec" aria-hidden="true"/>{plate}</span>}
          {!transparent&&<>
            {isChart&&<>
              <div className="mm-candles" aria-hidden="true">{CANDLE_HEIGHTS.map((h,i)=><i key={i} style={{'--ch':`${h}%`} as CSSProperties}/>)}</div>
              <svg className="mm-spark" viewBox="0 0 200 56" preserveAspectRatio="none" aria-hidden="true"><polyline points={SPARK_POINTS} fill="none"/></svg>
            </>}
            <span className="mm-capture-tag"><i className="mm-rec" aria-hidden="true"/>{camLabel(slot)}</span>
            <p>{content.chartDescription||(isChart?'Ruang rakaman carta':'Ruang kamera telefon')}</p>
          </>}
        </div>;
      }
      case 'main':return <div className={`mm-main ${timer?'mm-timer':''} ${GRID.includes(templateId)?'mm-grid-host':''} ${CHAT.includes(templateId)?'mm-chat':''} ${templateId==='principles-board'?'mm-principles':''} ${templateId==='poll'?'mm-poll':''} ${templateId==='end-screen'||templateId==='vigil'?'mm-centered':''} ${FIGHT_VS.includes(templateId)?'mm-vs-host':''} ${templateId==='duo-cam'||templateId==='player-intro'||templateId==='gameplay'||FIGHT_VS.includes(templateId)||templateId==='trader-focus'||templateId==='live-shop'||templateId==='winner'||templateId==='commentary'?'mm-cam-host':''} ${FIGHT_VS.includes(templateId)||templateId==='trader-focus'?'mm-fight':''}`}>
        {GAMING.includes(templateId)&&<span className="mm-livebug" aria-hidden="true"><i/>LIVE</span>}
        {emergency?<>
          <i className="mm-beacon" aria-hidden="true"/>
          <span className="mm-standby">GANGGUAN TEKNIKAL / TECHNICAL DIFFICULTY</span>
          <FitText as="h2" fitKey={snapshot.layout.textScale}>{content.locale==='ms'?'Kami akan kembali sebentar lagi.':'We will be right back.'}</FitText>
          <p>{content.locale==='ms'?'Terima kasih kerana menunggu.':'Thank you for your patience.'}</p>
        </>:<>
          {templateId==='hype-intro'&&<div className="mm-eq" aria-hidden="true">{EQ_BARS.map((h,i)=><i key={i} style={{'--eq-h':`${h}%`,'--eq-d':`${i*0.16}s`} as CSSProperties}/>)}</div>}
          {timer&&<Countdown deadline={content.countdownEndsAt} locale={content.locale}/>}
          {templateId==='title-card'&&content.points.length>0&&<div className="mm-points mm-points-hero">{content.points.map((p,i)=><p key={i}><FitText fitKey={snapshot.layout.textScale}>{p}</FitText></p>)}</div>}
          {templateId==='live-shop'&&<div className="mm-shop-badge"><i className="mm-rec" aria-hidden="true"/>{content.locale==='ms'?'SHOP LIVE':'LIVE SHOP'}</div>}
          {FIGHT_VS.includes(templateId)&&content.points.length>=2&&<div className="mm-vs">
            <i className="mm-clash" aria-hidden="true"/>
            {([[0,templateId==='fight-mode'?'MT5 — TRADER A':templateId==='commentary'?'TRADER A':'Pemain A / PLAYER A','mm-fighter-a'],[1,templateId==='fight-mode'?'MT5 — TRADER B':templateId==='commentary'?'TRADER B':'Pemain B / PLAYER B','mm-fighter-b']] as const).map(([i,tag,cls],n)=><React.Fragment key={i}>
              {n===1&&<div className="mm-vs-badge">VS</div>}
              <div className={`mm-fighter ${cls}`}>
                <div className="mm-fighter-head"><span className="mm-fighter-tag">{tag}</span><span className="mm-rounds" aria-hidden="true">{[0,1,2].map(r=><i key={r} className={r<winsFor(content.points[i]!)?'on':''}/>)}</span></div>
                <span className="mm-hp" aria-hidden="true"><i style={{'--hp':`${hpFor(content.points[i]!)}%`} as CSSProperties}/></span>
                <FitText as="p" fitKey={snapshot.layout.textScale}>{content.points[i]}</FitText>
              </div>
            </React.Fragment>)}
          </div>}
          {templateId==='chat-highlight'&&content.points.length>0&&<div className="mm-ticker" aria-hidden="true"><div className="mm-ticker-track"><span>{content.points.join('  •  ')}</span><span>{content.points.join('  •  ')}</span></div></div>}
          {templateId==='winner'&&<div className="mm-winner">
            <i className="mm-winner-crown" aria-hidden="true"><b>1ST</b></i>
            <FitText as="p" className="mm-winner-name" fitKey={snapshot.layout.textScale}>{content.points[0]||content.title}</FitText>
            {content.points[1]&&<p className="mm-winner-sub">{content.locale==='ms'?'Naib juara':'RUNNER-UP'} — {content.points[1]}</p>}
          </div>}
          {templateId==='trader-focus'&&<div className="mm-focus">
            <span className="mm-focus-tag"><i className="mm-rec" aria-hidden="true"/>{content.locale==='ms'?'FOKUS — TRADER A':'FOCUS — TRADER A'}</span>
            <FitText as="p" className="mm-focus-name" fitKey={snapshot.layout.textScale}>{content.points[0]||'Trader A'}</FitText>
            {content.points[1]&&<p className="mm-focus-note">{content.points[1]}</p>}
          </div>}
          {!['title-card','starting-soon','short-break','technical-difficulty','vs-battle','fight-mode','commentary','trader-focus','winner'].includes(templateId)&&content.points.length>0&&
            <div className={`mm-points ${templateId==='poll'?'mm-options':templateId==='principles-board'?'mm-cards':templateId==='chat-highlight'?'mm-chat-lines':GRID.includes(templateId)?'mm-list':''}`}>
              {content.points.map((point,i)=><div className="mm-point" key={i}>
                <span className="mm-num">{templateId==='poll'?['A','B','C','D'][i]??String(i+1):templateId==='qa'?`Q${i+1}`:String(i+1).padStart(2,'0')}</span>
                <FitText as="p" fitKey={snapshot.layout.textScale}>{point}</FitText>
              </div>)}
            </div>}
          {content.link&&<div className="mm-link"><span className="mm-link-tag">{content.locale==='ms'?'PAUTAN':'LINK'}</span><span className="mm-link-url">{content.link}</span></div>}
          {content.presenter&&!['live-shop','fight-mode','trader-focus','commentary','winner'].includes(templateId)&&<div className="mm-presenter">{content.presenter}</div>}
          {['title-card','end-screen','vigil','manifesto-about'].includes(templateId)&&<i className="mm-coin" aria-hidden="true"><b>M</b></i>}
        </>}
      </div>;
      default:return null;
    }
  };
  return <article aria-label={`${templateId} ${orientation}`} className={`broadcast mm ${orientation} template-${templateId} ${transparent?'transparent':''} text-${snapshot.layout.textScale} ${profileForMotion(snapshot.motionMode).className} ${ATMOSPHERE.includes(templateId)?'mm-atmo':''} ${media?'mm-has-media':''}`} style={{width:canvas.width,height:canvas.height,'--scene-duration':`${motionDuration('scene',snapshot.motionMode)}ms`} as CSSProperties}>
    {!transparent&&<>
      <div className="mm-layer mm-vignette"/>
      <div className="mm-layer mm-key"/>
      <div className="mm-layer mm-grain"/>
      <div className={`mm-floaters ${GAMING.includes(templateId)?'mm-floaters-gaming':''}`} aria-hidden="true">{FLOATERS.map((f,i)=><i key={i} className={`mm-floater mm-fl-${f.t} ${i%5===2?'mm-steel':''}`} style={{'--fx':`${f.x}%`,'--fy':`${f.y}%`,'--fs':`${f.s}px`,'--fd':`${7+(i%4)*2.3}s`,'--fdel':`${-(i*1.31)}s`} as CSSProperties}/>)}</div>
      <i className="mm-frame" aria-hidden="true"/>
      <i className="mm-frame-inset" aria-hidden="true"/>
      {ATMOSPHERE.includes(templateId)&&<><i className="mm-orb mm-orb-a" aria-hidden="true"/><i className="mm-orb mm-orb-b" aria-hidden="true"/></>}
      <div className="mm-layer mm-scan"/>
    </>}
    {layout.regions.filter(r=>r.role!=='platform-exclusion').map(r=>{
      const slot=(r.role==='media'||r.role==='media2'||r.role==='media3')?snapshot.layout.slots[r.role as 'media'|'media2'|'media3']:undefined;
      const box=slot?{x:slot.x,y:slot.y,width:slot.width,height:slot.height}:{x:r.x+(r.role==='main'?snapshot.layout.mainOffsetX:0),y:r.y+(r.role==='main'?snapshot.layout.mainOffsetY:0),width:r.width,height:r.height};
      return <section key={r.role} data-region={r.role} data-slot={slot?'custom':''} style={{left:box.x,top:box.y,width:box.width,height:box.height}}>{regionContent(r.role)}</section>;
    })}
  </article>;
}
