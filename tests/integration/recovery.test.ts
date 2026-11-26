import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {createBridge} from '../../apps/bridge/src/server.ts';
import {inspectRecovery} from '../../apps/bridge/src/recovery.ts';
import {saveSnapshot,loadSnapshot} from '../../apps/bridge/src/persistence.ts';
import {makeSnapshot} from '../../packages/contracts/src/display.ts';

const credentials={control:randomBytes(32).toString('hex'),overlay:randomBytes(32).toString('hex')};

async function pairedBridge(stateFile:string,now:()=>number,sessionMs=1000) {
  const bridge=await createBridge({port:0,stateFile,credentials,now,sessionMs});
  const call=(path:string,init:RequestInit={})=>fetch(bridge.url+path,{...init,headers:{Origin:bridge.url,...init.headers}});
  const pair=await call('/api/pair/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:credentials.control})});
  assert.equal(pair.status,200);
  const cookie=pair.headers.get('set-cookie')!.split(';')[0];
  return {bridge,call,cookie};
}

test('restart preserves revision and rejects stale expected revisions',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'malam-recovery-'));
  const file=join(dir,'state.json');
  let now=Date.now();
  try {
    const first=await pairedBridge(file,()=>now);
    try {
      const snapshot=await (await first.call('/api/control/snapshot',{headers:{Cookie:first.cookie}})).json();
      const publish=(id:string,revision:number)=>first.call('/api/control/publish',{method:'POST',headers:{Cookie:first.cookie,'Content-Type':'application/json'},body:JSON.stringify({commandId:id,expectedRevision:revision,snapshot:{...snapshot,content:{...snapshot.content,title:'Durable'}}})});
      assert.equal((await publish(randomUUID(),0)).status,200);
    } finally {await first.bridge.close();}

    const restored=inspectRecovery(file);
    assert.equal(restored.recovered,false);
    assert.equal(restored.reason,'clean');
    assert.equal(restored.revision,1);

    const second=await pairedBridge(file,()=>now);
    try {
      const snapshot=await (await second.call('/api/control/snapshot',{headers:{Cookie:second.cookie}})).json();
      assert.equal(snapshot.revision,1);
      const stale=await second.call('/api/control/publish',{method:'POST',headers:{Cookie:second.cookie,'Content-Type':'application/json'},body:JSON.stringify({commandId:randomUUID(),expectedRevision:0,snapshot})});
      assert.equal(stale.status,409);
      const fresh=await second.call('/api/control/publish',{method:'POST',headers:{Cookie:second.cookie,'Content-Type':'application/json'},body:JSON.stringify({commandId:randomUUID(),expectedRevision:1,snapshot})});
      assert.equal(fresh.status,200);
      assert.equal((await fresh.json()).snapshot.revision,2);
    } finally {await second.bridge.close();}
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('duplicate retained command IDs do not apply twice and expired entries are evicted',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'malam-command-cache-'));
  let now=Date.now();
  try {
    const {bridge,call,cookie}=await pairedBridge(join(dir,'state.json'),()=>now,3600000);
    try {
      const snapshot=await (await call('/api/control/snapshot',{headers:{Cookie:cookie}})).json();
      const id=randomUUID();
      const publish=(revision:number)=>call('/api/control/publish',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({commandId:id,expectedRevision:revision,snapshot:{...snapshot,content:{...snapshot.content,title:'Once'}}})});
      const first=await publish(0);
      const second=await publish(0);
      assert.equal(first.status,200);
      assert.deepEqual(await second.json(),await first.json());
      assert.equal((await (await call('/api/control/snapshot',{headers:{Cookie:cookie}})).json()).revision,1);

      now+=600001; // Command results expire after 10 minutes.
      const replay=await publish(1);
      assert.equal(replay.status,200);
      assert.equal((await replay.json()).snapshot.revision,2);
    } finally {await bridge.close();}
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('a fresh install is reported as empty, not recovered',()=>{
  const dir=mkdtempSync(join(tmpdir(),'malam-empty-'));
  try {
    assert.deepEqual(inspectRecovery(join(dir,'state.json')),{recovered:false,reason:'empty',revision:null});
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('corrupt or incompatible state falls back safely and reports recovery',()=>{
  const dir=mkdtempSync(join(tmpdir(),'malam-corrupt-'));
  try {
    const file=join(dir,'state.json');
    const original=makeSnapshot();
    saveSnapshot(file,original);
    saveSnapshot(file,{...original,revision:7});
    writeFileSync(file,'{"revision":999}');
    const report=inspectRecovery(file);
    assert.equal(report.reason,'backup');
    assert.equal(report.recovered,true);
    assert.equal(report.revision,0);
    writeFileSync(file,'not json');
    writeFileSync(file+'.bak','{"schemaVersion":99}');
    assert.deepEqual(inspectRecovery(file),{recovered:true,reason:'unreadable',revision:null});
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('a delayed message from an old session cannot replace the active snapshot',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'malam-session-'));
  let now=Date.now();
  try {
    const {bridge,call,cookie}=await pairedBridge(join(dir,'state.json'),()=>now);
    try {
      const snapshot=await (await call('/api/control/snapshot',{headers:{Cookie:cookie}})).json();
      const stale=await call('/api/control/publish',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({commandId:randomUUID(),expectedRevision:0,snapshot:{...snapshot,sessionId:'old-show'}})});
      assert.equal(stale.status,409);
      assert.equal((await (await call('/api/control/snapshot',{headers:{Cookie:cookie}})).json()).revision,0);
      assert.equal(loadSnapshot(join(dir,'state.json')).snapshot,null);
    } finally {await bridge.close();}
  } finally {rmSync(dir,{recursive:true,force:true});}
});
