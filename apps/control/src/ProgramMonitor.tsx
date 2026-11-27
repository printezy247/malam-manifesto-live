import React,{useEffect,useState,type ReactNode} from 'react';

export function ProgramMonitor({connected,scene,children}: {
  connected:boolean;
  scene?:string|null;
  children:ReactNode;
}) {
  const [showObs,setShowObs]=useState(true);
  const [frame,setFrame]=useState<string|null>(null);
  const [unavailable,setUnavailable]=useState(false);
  const active=connected&&showObs;

  useEffect(()=>{
    setFrame(null);
    setUnavailable(false);
    if(!active)return;
    const controller=new AbortController();
    let currentUrl:string|null=null;
    let timer:ReturnType<typeof setTimeout>;
    const refresh=async()=>{
      if(!document.hidden){
        try{
          const response=await fetch('/api/control/program-frame',{signal:controller.signal,cache:'no-store'});
          if(!response.ok||response.headers.get('content-type')!=='image/jpeg')throw new Error('Frame unavailable');
          const blob=await response.blob();
          if(controller.signal.aborted)return;
          const nextUrl=URL.createObjectURL(blob);
          if(currentUrl)URL.revokeObjectURL(currentUrl);
          currentUrl=nextUrl;
          setFrame(nextUrl);
          setUnavailable(false);
        }catch{
          if(!controller.signal.aborted){
            if(currentUrl)URL.revokeObjectURL(currentUrl);
            currentUrl=null;
            setFrame(null);
            setUnavailable(true);
          }
        }
      }
      if(!controller.signal.aborted)timer=setTimeout(()=>void refresh(),2000);
    };
    void refresh();
    return ()=>{
      controller.abort();
      clearTimeout(timer);
      if(currentUrl)URL.revokeObjectURL(currentUrl);
    };
  },[active,scene]);

  return <>
    <div className="program-view-toolbar">
      <span>{active&&frame?'OBS Program scene':active&&!unavailable?'Loading OBS Program…':active?'OBS frame unavailable · Overlay preview':'Overlay preview'}</span>
      {connected&&<button type="button" className="chip" onClick={()=>setShowObs(value=>!value)}>{showObs?'Show overlay preview':'Show OBS Program'}</button>}
    </div>
    {active&&frame
      ? <div className="program-frame"><img src={frame} alt={scene?`OBS Program scene: ${scene}`:'OBS Program scene'}/></div>
      : children}
  </>;
}
