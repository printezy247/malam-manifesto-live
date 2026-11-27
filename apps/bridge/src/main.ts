import {homedir} from 'node:os';
import {join} from 'node:path';
import {createBridge} from './server.ts';
import {readCredential} from './keyring.ts';
import {createLocalObsAdapter} from './obs/client.ts';

try {
  const credentials={control:readCredential('control'),overlay:readCredential('overlay')};
  const bridge=await createBridge({port:4320,stateFile:join(process.env.XDG_STATE_HOME??join(homedir(),'.local/state'),'malam-manifesto-live/snapshot.json'),credentials,sceneMapFile:join(process.cwd(),'assets/obs-scenes/scene-map.json'),obs:()=>createLocalObsAdapter(m=>console.log(`[obs] ${m}`))});
  console.log(`Malam Manifesto Live: ${bridge.url}/control · Overlay: ${bridge.url}/overlay`);
  if(bridge.recovered) console.warn('Saved state needed recovery. Inspect program before publishing.');
  for(const signal of ['SIGINT','SIGTERM'] as const) process.once(signal,()=>void bridge.close().then(()=>process.exit(0)));
} catch {console.error('Unable to start. Check port 4320, writable state directory and unlocked keyring; run npm run pair:setup.');process.exitCode=1;}
