import {parseDisplaySnapshot,type DisplaySnapshot} from '../../../packages/contracts/src/display.ts';
export function acceptSnapshot(current: DisplaySnapshot | null, input: unknown): DisplaySnapshot {
  const incoming = parseDisplaySnapshot(input);
  if(current && (incoming.sessionId!==current.sessionId || incoming.revision<=current.revision)) return current;
  return incoming;
}
