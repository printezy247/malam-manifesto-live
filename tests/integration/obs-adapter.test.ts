import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createObsAdapter,obsAuthentication,type ObsTransport} from '../../apps/bridge/src/obs/client.ts';
import {createWebSocketTransport} from '../../apps/bridge/src/obs/websocket.ts';

type Message={op:number;d?:Record<string,unknown>};

// Fake OBS WebSocket v5 transport. It performs the Hello/Identified handshake
// and lets each test acknowledge, reject or delay individual requests.
class FakeObs implements ObsTransport {
  sent:Message[]=[];
  logs:string[]=[];
  private listeners:((m:Message)=>void)[]=[];
  private closers:(()=>void)[]=[];
  private requests=new Map<string,{type:string;data:Record<string,unknown>}>();
  identifyAuthentication:string|null=null;
  async connect() {
    queueMicrotask(()=>{
      this.emit({op:0,d:{rpcVersion:1,authentication:{salt:'salt-1234',challenge:'challenge-5678'}}});
      queueMicrotask(()=>this.emit({op:2,d:{negotiatedRpcVersion:1}}));
    });
  }
  send(message:Message) {
    this.sent.push(message);
    if(message.op===1) this.identifyAuthentication=String((message.d as Record<string,unknown>).authentication ?? '');
    if(message.op===6) {
      const d=message.d??{};
      this.requests.set(String(d.requestId),{type:String(d.requestType),data:(d.requestData??{}) as Record<string,unknown>});
    }
  }
  onMessage(handler:(m:Message)=>void) {this.listeners.push(handler);}
  onClose(handler:()=>void) {this.closers.push(handler);}
  close() {for(const handler of this.closers) handler();}
  emit(message:Message) {for(const handler of this.listeners) handler(message);}
  identified() {this.emit({op:2,d:{negotiatedRpcVersion:1}});}
  requestIds() {return [...this.requests.entries()];}
  acknowledge(id:string,data:Record<string,unknown>={}) {this.emit({op:7,d:{requestId:id,requestStatus:{result:true},responseData:data}});}
  reject(id:string,comment='Unknown scene') {this.emit({op:7,d:{requestId:id,requestStatus:{result:false,comment}}});}
  currentScene(name:string) {this.emit({op:5,d:{eventType:'CurrentProgramSceneChanged',eventData:{sceneName:name}}});}
}

const connect = async (transport:FakeObs,password:string='correct-horse') => {
  const adapter=createObsAdapter({transport,password:()=>password,timeoutMs:40,log:m=>transport.logs.push(m)});
  await adapter.connect();
  return adapter;
};

test('OBS v5 authentication uses the documented base64 inner hash',()=>{
  assert.equal(obsAuthentication('password','salt','challenge'),'zTM5ki6L2vVvBQiTG9ckH1Lh64AbnCf6XZ226UmnkIA=');
});

test('identify carries the computed authentication token, never the password',async()=>{
  const transport=new FakeObs();
  const adapter=await connect(transport,'correct-horse');
  assert.equal(transport.identifyAuthentication,obsAuthentication('correct-horse','salt-1234','challenge-5678'));
  assert.doesNotMatch(JSON.stringify(transport.sent),/correct-horse/);
  await adapter.disconnect();
});

test('OBS transport refuses non-loopback endpoints',()=>{
  assert.throws(()=>createWebSocketTransport('ws://192.168.1.10:4455'),/loopback/);
  assert.doesNotThrow(()=>createWebSocketTransport('ws://127.0.0.1:4455'));
});

test('keyring failure blocks connection and returns a sanitized operator message',async()=>{
  const transport=new FakeObs();
  const adapter=createObsAdapter({transport,password:()=>{throw new Error('secret-tool exit 1 password=correct-horse');},timeoutMs:40,log:m=>transport.logs.push(m)});
  await assert.rejects(()=>adapter.connect(),error=>{
    const message=(error as Error).message;
    assert.match(message,/keyring/i);
    assert.doesNotMatch(message,/correct-horse|exit 1|ENOENT/);
    return true;
  });
  assert.deepEqual(transport.sent,[]);
  assert.deepEqual(transport.logs,[]);
});

test('scene selection resolves only after OBS acknowledgement',async()=>{
  const transport=new FakeObs();
  const adapter=await connect(transport);
  let settled=false;
  const pending=adapter.setProgramScene('Education').then(()=>{settled=true;});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(settled,false);
  const [id]=[...transport.sent].filter(m=>m.op===6).map(m=>String((m.d as Record<string,unknown>).requestId));
  assert.ok(id);
  transport.acknowledge(id);
  await pending;
  assert.equal(settled,true);
  await adapter.disconnect();
});

test('unknown scenes, timeouts and disconnects are reported as failures',async()=>{
  const transport=new FakeObs();
  const adapter=await connect(transport);
  const list=adapter.listScenes();
  const [listId]=[...transport.sent].filter(m=>m.op===6).map(m=>String((m.d as Record<string,unknown>).requestId));
  transport.acknowledge(listId,{scenes:[{sceneName:'Education'},{sceneName:'Chart'}]});
  assert.deepEqual(await list,['Education','Chart']);

  const unknown=adapter.setProgramScene('Missing');
  const [unknownId]=[...transport.sent].filter(m=>m.op===6).map(m=>String((m.d as Record<string,unknown>).requestId)).slice(1);
  transport.reject(unknownId,'Scene not found');
  await assert.rejects(()=>unknown,/Scene not found/);

  const stalled=adapter.setProgramScene('Chart');
  await assert.rejects(()=>stalled,/timed out|disconnected/i);
  await adapter.disconnect();

  const dead=new FakeObs();
  const adapter2=await connect(dead);
  const afterClose=adapter2.getStatus();
  dead.close();
  await assert.rejects(()=>afterClose,/disconnected/i);
});

test('a timed-out command is not replayed or resolved by a late acknowledgement',async()=>{
  const transport=new FakeObs();
  const adapter=await connect(transport,correctPassword());
  const timedOut=adapter.setProgramScene('Education');
  await assert.rejects(()=>timedOut,/timed out|disconnected/i);
  const lateId=[...transport.sent].filter(m=>m.op===6).map(m=>String((m.d as Record<string,unknown>).requestId))[0];
  transport.acknowledge(lateId);

  // Reconnect and issue a fresh command: the stale acknowledgement must not satisfy it.
  await adapter.disconnect();
  const freshTransport=new FakeObs();
  const fresh=createObsAdapter({transport:freshTransport,password:()=>correctPassword(),timeoutMs:40,log:m=>freshTransport.logs.push(m)});
  await fresh.connect();
  let settled=false;
  const pending=fresh.setProgramScene('Chart').then(()=>{settled=true;});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(settled,false);
  const freshId=[...freshTransport.sent].filter(m=>m.op===6).map(m=>String((m.d as Record<string,unknown>).requestId))[0];
  assert.notEqual(freshId,lateId);
  freshTransport.acknowledge(freshId);
  await pending;
  assert.equal(settled,true);
  await fresh.disconnect();
});

test('status reflects acknowledged scene and recording state without logging passwords',async()=>{
  const transport=new FakeObs();
  const secret=correctPassword();
  const adapter=await connect(transport,secret);
  const status=adapter.getStatus();
  const [sceneId]=[...transport.sent].filter(m=>m.op===6).map(m=>String((m.d as Record<string,unknown>).requestId));
  transport.currentScene('Education');
  transport.acknowledge(sceneId,{outputActive:false});
  const result=await status;
  assert.equal(result.connected,true);
  assert.equal(result.currentScene,'Education');
  assert.equal(result.recording,false);
  assert.equal(transport.logs.some(line=>line.includes(secret)),false);
  assert.doesNotMatch(transport.sent.map(m=>JSON.stringify(m)).join(' '),/correct-horse/);
  await adapter.disconnect();
});

function correctPassword() {return 'correct-horse';}
