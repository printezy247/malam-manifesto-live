import React,{useState} from 'react';
export function Pairing({role,onPaired}:{role:'control'|'overlay';onPaired:()=>void}) {
  const [password,setPassword]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  return <main className="pairing"><p className="kicker">MALAM MANIFESTO / AISH CAPITAL</p><h1>Pair {role==='control'?'operator control':'read-only overlay'}</h1><p>Use the {role} passphrase stored with <code>npm run pair:setup</code>. Each browser pairs separately.</p>
    <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const r=await fetch('/api/pair/'+role,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});setPassword('');if(!r.ok)throw new Error();onPaired();}catch{setError('Pairing failed or temporarily limited. Check the keyring passphrase.');}finally{setBusy(false);}}}>
      <label>Pairing passphrase<input type="password" value={password} autoComplete="off" onChange={e=>setPassword(e.target.value)} required/></label><button disabled={busy}>{busy?'Pairing…':'Pair browser'}</button><p role="alert">{error}</p>
    </form><p>Overlay access cannot publish. Passphrases are never saved in browser storage or URLs.</p>
  </main>;
}
