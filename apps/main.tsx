import React,{Component,type ReactNode,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Control,Preview} from './control/src/App.tsx';
import {Overlay} from './overlay/src/App.tsx';
import type {DisplaySnapshot} from '../packages/contracts/src/display.ts';
import {fixtures} from '../fixtures/snapshots.ts';
import './style.css';

class Boundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<main className="pairing"><h1>Malam Manifesto Live</h1><h2>Technical difficulty</h2><p>Use the independent emergency image in OBS.</p></main>:this.props.children;}
}
function Gallery(){
  const [kind,setKind]=useState(0);
  const framing:DisplaySnapshot['layout']['sourceLayout']=kind===3?'square':kind===4?'phone':undefined;
  const previews=fixtures.filter((_,i)=>i%3===(framing?0:kind));
  return <main className="desk"><a href="/control">Back to control desk</a><h1>{previews.length} explicit compositions</h1><p>Portrait only · 1080×1920</p>
    <label>Preview content and framing<select value={kind} onChange={e=>setKind(Number(e.target.value))}>
      <option value={0}>Normal</option><option value={1}>Maximum length</option><option value={2}>Missing optional content</option>
      <option value={3}>Square 1:1 sources</option><option value={4}>Phone 9:16 sources</option>
    </select></label>
    <p>Unapproved local previews. Safe margins are operator guides.</p>
    <div className="gallery">{previews.map(snapshot=><section key={snapshot.templateId}><h2>{snapshot.templateId} · {snapshot.orientation}</h2>
      <Preview snapshot={framing?{...snapshot,layout:{...snapshot.layout,sourceLayout:framing}}:snapshot}/>
    </section>)}</div>
  </main>;
}
const route=location.pathname;
document.title=route.startsWith('/overlay')?'Malam Manifesto Overlay':route==='/gallery'?'Composition gallery — Malam Manifesto Live':'Malam Manifesto Live — Control desk';
if(route.startsWith('/overlay'))document.body.classList.add('overlay-page');
createRoot(document.getElementById('root')!).render(<Boundary>{route.startsWith('/overlay')?<Overlay/>:route==='/gallery'?<Gallery/>:<Control/>}</Boundary>);
