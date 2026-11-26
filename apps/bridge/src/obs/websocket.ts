import WebSocket from 'ws';
import type {ObsMessage,ObsTransport} from './transport.ts';

/**
 * Loopback-only OBS WebSocket v5 transport. Scene control never leaves the
 * operator's machine and has no start-stream capability.
 */
export function createWebSocketTransport(url = 'ws://127.0.0.1:4455'): ObsTransport {
  const parsed = new URL(url);
  if (!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname)) throw new Error('OBS transport is restricted to loopback');
  let socket: WebSocket | null = null;
  const messageHandlers: ((message: ObsMessage) => void)[] = [];
  const closeHandlers: (() => void)[] = [];
  return {
    connect() {
      return new Promise<void>((resolve,reject) => {
        const ws = new WebSocket(url,{handshakeTimeout:3000});
        socket = ws;
        ws.once('open',() => resolve());
        ws.once('error',() => reject(new Error('OBS connection failed. Enable OBS WebSocket on loopback and retry.')));
        ws.on('message',data => {
          try {
            const message = JSON.parse(data.toString()) as ObsMessage;
            for (const handler of messageHandlers) handler(message);
          } catch { /* Ignore malformed frames from an untrusted local process. */ }
        });
        ws.on('close',() => {for (const handler of closeHandlers) handler();});
      });
    },
    send(message) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    },
    onMessage(handler) {messageHandlers.push(handler);},
    onClose(handler) {closeHandlers.push(handler);},
    close() {socket?.close();}
  };
}
