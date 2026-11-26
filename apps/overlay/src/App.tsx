import React,{useEffect,useRef,useState} from 'react';
import {Broadcast} from '../../../packages/templates/src/Broadcast.tsx';
import {makeSnapshot,type DisplaySnapshot} from '../../../packages/contracts/src/display.ts';
import {acceptSnapshot} from './snapshot-client.ts';
import {Pairing} from '../../shared/Pairing.tsx';

type LiveCue={id:string;text:string;expiresAt:number};

export function Overlay() {
  const [paired,setPaired]=useState(false);
  const [snapshot,setSnapshot]=useState<DisplaySnapshot|null>(null);
  const [connected,setConnected]=useState(false);
  const [cue,setCue]=useState<LiveCue|null>(null);
  const last=useRef<DisplaySnapshot|null>(null);
  const transparent=location.pathname==='/overlay-transparent';
  useEffect(()=>{
    if(transparent) return;
    let stopped=false;let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      try {
        const r=await fetch('/api/overlay/cue');
        if(r.ok&&r.status!==401){const data=await r.json() as {cue:LiveCue|null};if(!stopped&&data.cue&&data.cue.expiresAt>Date.now())setCue(data.cue);else if(!stopped)setCue(null);}
      } catch { /* Cue polling is best-effort; the snapshot channel remains authoritative. */ }
      if(!stopped)timer=setTimeout(poll,2000);
    };
    void poll();
    return()=>{stopped=true;clearTimeout(timer);};
  },[transparent]);
  useEffect(()=>{
    let stopped=false;let socket:WebSocket|undefined;let retry:ReturnType<typeof setTimeout>;let delay=1000;
    const connect=async()=>{
      try {
        const response=await fetch('/api/overlay/snapshot');
        if(stopped)return;
        if(response.status===401){setPaired(false);setConnected(false);return;}
        if(!response.ok)throw new Error();
        const incoming=await response.json();
        if(stopped)return;
        last.current=acceptSnapshot(last.current,incoming);setSnapshot(last.current);setPaired(true);
        socket=new WebSocket(`ws://${location.host}/api/overlay/events`);
        // The snapshot was just fetched; once the socket is open it is current,
        // so show it immediately rather than waiting for the next publish event.
        socket.onopen=()=>setConnected(true);
        socket.onmessage=e=>{try {last.current=acceptSnapshot(last.current,JSON.parse(e.data));setSnapshot(last.current);setConnected(true);delay=1000;}catch {setConnected(false);socket?.close();}};
        socket.onclose=()=>{setConnected(false);if(!stopped){retry=setTimeout(connect,delay);delay=Math.min(10000,delay*2);}};
      } catch {setConnected(false);if(!stopped){retry=setTimeout(connect,delay);delay=Math.min(10000,delay*2);}}
    };
    void connect();return()=>{stopped=true;clearTimeout(retry);socket?.close();};
  },[paired]);
  if(!paired&&!snapshot) return <Pairing role="overlay" onPaired={()=>setPaired(true)}/>;
  const fallback={...makeSnapshot(),orientation:snapshot?.orientation??'landscape',templateId:'technical-difficulty' as const,content:{...makeSnapshot().content,title:'Sambungan terputus / Connection interrupted'}};
  const shown=connected&&snapshot?snapshot:fallback;
  return <div className={`overlay-stage ${shown.orientation} ${transparent?'overlay-transparent':''}`}>
    <Broadcast snapshot={shown} connected={connected} transparent={transparent}/>
    {cue&&!transparent&&<div className="cue-bar" role="status"><span className="cue-dot"/><span className="cue-text">{cue.text}</span></div>}
  </div>;
}
