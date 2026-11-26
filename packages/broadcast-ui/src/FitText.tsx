import React,{useEffect,useLayoutEffect,useRef,type ElementType,type ReactNode} from 'react';

// Client-only layout measurement. On the server this is a plain render so SSR stays deterministic.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const MIN_FIT = 0.3;

/**
 * Shrinks text to fit its bounded box by lowering a `--fit` factor that
 * typography rules multiply into their base font-size. Content stays readable
 * and is never clipped at its designed size. Measurement reruns when the text,
 * the element box, or the parent box changes (font load, orientation switch,
 * responsive preview resize).
 */
export function FitText({as:Tag='div',className,fitKey,children}:{as?:ElementType;className?:string;fitKey?:string|number;children:ReactNode}) {
  const ref=useRef<HTMLElement>(null);
  useIsoLayoutEffect(()=>{
    const el=ref.current;
    if(!el) return;
    let frame=0;
    const fits=()=>el.scrollHeight<=el.clientHeight+2&&el.scrollWidth<=el.clientWidth+2;
    const fit=()=>{
      el.style.setProperty('--fit','1');
      if(fits()) {el.style.removeProperty('--fit');return;}
      let size=1;
      while(size>MIN_FIT) {
        size=Math.max(MIN_FIT,Math.round((size-0.02)*1000)/1000);
        el.style.setProperty('--fit',String(size));
        if(fits()) return;
      }
    };
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(fit);};
    // Fit synchronously before first paint so a variant/content switch never flashes clipped text.
    fit();
    const observer=new ResizeObserver(schedule);
    observer.observe(el);
    if(el.parentElement) observer.observe(el.parentElement);
    const onLoad=()=>schedule();
    document.fonts?.addEventListener?.('loadingdone',onLoad);
    return ()=>{cancelAnimationFrame(frame);observer.disconnect();document.fonts?.removeEventListener?.('loadingdone',onLoad);};
  // fitKey covers style-only changes (e.g. type scale) that alter measured
  // typography without changing children or box dimensions.
  },[children,fitKey]);
  return React.createElement(Tag,{ref,className},children);
}
