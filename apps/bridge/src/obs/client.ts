import {createHash,randomUUID} from 'node:crypto';
import {readObsPassword} from '../keyring.ts';
import {createWebSocketTransport} from './websocket.ts';
import type {ObsStatus} from './status.ts';
import type {ObsMessage,ObsTransport} from './transport.ts';

export type {ObsTransport,ObsMessage} from './transport.ts';
export type {ObsStatus} from './status.ts';

export type ObsAdapter = {
  connect(): Promise<void>;
  listScenes(): Promise<string[]>;
  setProgramScene(name: string): Promise<void>;
  getStatus(): Promise<ObsStatus>;
  call(requestType: string, requestData?: Record<string, unknown>): Promise<Record<string, unknown>>;
  disconnect(): Promise<void>;
};

type Options = {
  transport: ObsTransport;
  password: () => string;
  timeoutMs?: number;
  log?: (message: string) => void;
};


type Pending = {
  resolve: (data: Record<string, unknown>) => void;
  reject: (error: Error) => void;
};

// OBS WebSocket v5: Base64(SHA256(Base64(SHA256(password + salt)) + challenge)).
// The inner hash must be base64-encoded; a hex inner hash is rejected by OBS.
export const obsAuthentication = (password: string, salt: string, challenge: string) => {
  const inner = createHash('sha256').update(password + salt).digest('base64');
  return createHash('sha256').update(inner + challenge).digest('base64');
};

/**
 * Scene control only. Deliberately has no start-stream method: distribution
 * stays under operator control and the toolkit remains recording-only.
 * All transport errors are reported with sanitized text; passwords never appear
 * in messages, logs or overlay payloads.
 */
export function createObsAdapter(options: Options): ObsAdapter {
  const timeoutMs = options.timeoutMs ?? 3000;
  const log = options.log ?? (() => {});
  const queue: ObsMessage[] = [];
  const pending = new Map<string,Pending>();
  let notify: (() => void) | null = null;
  let connected = false;
  let currentScene: string | null = null;
  let password = '';

  const sanitize = (message: string) => {
    let result = message;
    if (password) result = result.split(password).join('[redacted]');
    return result.replace(/password\s*[:=]\s*\S+/gi,'password=[redacted]');
  };

  options.transport.onMessage(message => {
    if (message.op === 5) {
      const event = message.d?.eventType;
      const data = message.d?.eventData as Record<string,unknown> | undefined;
      if (event === 'CurrentProgramSceneChanged' && typeof data?.sceneName === 'string') currentScene = data.sceneName;
      return;
    }
    if (message.op === 7) {
      const data = message.d ?? {};
      const id = String(data.requestId ?? '');
      const entry = pending.get(id);
      if (!entry) return; // Timed-out/stale replies are ignored, never replayed.
      pending.delete(id);
      const status = data.requestStatus as {result?: boolean;comment?: string} | undefined;
      if (status?.result === false) entry.reject(new Error(sanitize(String(status.comment ?? 'OBS request failed'))));
      else entry.resolve((data.responseData ?? {}) as Record<string,unknown>);
      return;
    }
    queue.push(message);
    notify?.();
  });

  options.transport.onClose(() => {
    connected = false;
    queue.length = 0;
    for (const entry of pending.values()) entry.reject(new Error('OBS disconnected'));
    pending.clear();
  });

  const waitFor = async (predicate: (message: ObsMessage) => boolean): Promise<ObsMessage> => {
    const take = () => {
      const index = queue.findIndex(predicate);
      return index < 0 ? null : queue.splice(index,1)[0];
    };
    const found = take();
    if (found) return found;
    while (true) {
      await new Promise<void>((resolve,reject) => {
        const timer = setTimeout(() => {notify = null;reject(new Error('OBS handshake timed out'));},timeoutMs);
        notify = () => {clearTimeout(timer);resolve();};
      });
      const next = take();
      if (next) return next;
    }
  };

  const request = (requestType: string, requestData: Record<string,unknown> = {}) =>
    new Promise<Record<string,unknown>>((resolve,reject) => {
      if (!connected) {reject(new Error('OBS disconnected'));return;}
      const requestId = randomUUID();
      pending.set(requestId,{resolve,reject});
      const timer = setTimeout(() => {pending.delete(requestId);reject(new Error('OBS request timed out'));},timeoutMs);
      const entry = pending.get(requestId)!;
      entry.resolve = data => {clearTimeout(timer);resolve(data);};
      entry.reject = error => {clearTimeout(timer);reject(error);};
      options.transport.send({op:6,d:{requestType,requestId,requestData}});
    });

  return {
    async connect() {
      if (connected) return;
      try {
        password = options.password();
        if (typeof password !== 'string' || !password) throw new Error('missing');
      } catch (error) {
        // Only pass through our own sanitized keyring guidance, never tool output.
        const guidance = error instanceof Error ? error.message : '';
        if (/keyring/i.test(guidance) && !/exit|spawn|ENOENT/i.test(guidance)) throw new Error(guidance);
        throw new Error('OBS password unavailable from the keyring. Unlock the desktop keyring and store a role=obs credential.');
      }
      await options.transport.connect();
      const hello = await waitFor(message => message.op === 0);
      const auth = hello.d?.authentication as {salt?: string;challenge?: string} | undefined;
      const identify: Record<string,unknown> = {rpcVersion:Number(hello.d?.rpcVersion ?? 1)};
      if (auth?.salt && auth.challenge) identify.authentication = obsAuthentication(password,String(auth.salt),String(auth.challenge));
      options.transport.send({op:1,d:identify});
      await waitFor(message => message.op === 2);
      connected = true;
      log('OBS scene control connected');
    },
    async listScenes() {
      const response = await request('GetSceneList');
      const scenes = response.scenes;
      if (!Array.isArray(scenes)) return [];
      return scenes.flatMap(scene => {
        const name = (scene as Record<string,unknown>)?.sceneName;
        return typeof name === 'string' ? [name] : [];
      });
    },
    async setProgramScene(name: string) {
      if (typeof name !== 'string' || !name.trim()) throw new Error('A scene name is required');
      await request('SetCurrentProgramScene',{sceneName:name});
      currentScene = name;
      log(`OBS program scene: ${sanitize(name)}`);
    },
    async getStatus() {
      const response = await request('GetRecordStatus');
      return {connected,currentScene,recording:response.outputActive === true};
    },
    call: (requestType, requestData = {}) => request(requestType, requestData),
    async disconnect() {
      connected = false;
      queue.length = 0;
      for (const entry of pending.values()) entry.reject(new Error('OBS disconnected'));
      pending.clear();
      options.transport.close();
      log('OBS scene control disconnected');
    }
  };
}

/** Real local scene control: loopback transport + keyring credential. */
export function createLocalObsAdapter(log?: (message: string) => void): ObsAdapter {
  return createObsAdapter({transport:createWebSocketTransport(),password:readObsPassword,log});
}
