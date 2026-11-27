import React,{useState} from 'react';
export function Pairing({role,onPaired}:{role:'control'|'overlay';onPaired:()=>void}) {
  const [password,setPassword]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const pair=async(e:React.FormEvent<HTMLFormElement>)=>{
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response=await fetch('/api/pair/'+role,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})
      });
      if(response.status===401) {
        setError(`The ${role} passphrase was rejected. Use the ${role} passphrase set with npm run pair:setup.`);
      } else if(response.status===429) {
        setError('Too many pairing attempts. Wait up to 60 seconds before trying again.');
      } else if(response.status===403) {
        setError('Pairing must use http://127.0.0.1:4320. Check the browser or OBS source URL.');
      } else if(!response.ok||!response.headers.get('content-type')?.includes('application/json')) {
        setError('The pairing service is unavailable. Check that Malam Manifesto Live is running on port 4320.');
      } else {
        onPaired();
      }
    } catch {
      setError('Could not reach Malam Manifesto Live. Check that the bridge is running on port 4320.');
    } finally {
      setPassword('');
      setBusy(false);
    }
  };
  return <main className="pairing"><p className="kicker">MALAM MANIFESTO / AISH CAPITAL</p><h1>Pair {role==='control'?'operator control':'read-only overlay'}</h1><p>Use the {role} passphrase stored with <code>npm run pair:setup</code>. Each browser pairs separately.</p>
    <form onSubmit={pair}>
      <label>Pairing passphrase<input type="password" value={password} autoComplete="off" onChange={e=>setPassword(e.target.value)} required/></label><button disabled={busy}>{busy?'Pairing…':'Pair browser'}</button><p role="alert">{error}</p>
    </form><p>Overlay access cannot publish. Passphrases are never saved in browser storage or URLs.</p>
  </main>;
}
