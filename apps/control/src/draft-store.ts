import { displaySchema,type DisplaySnapshot } from '../../../packages/contracts/src/display.ts';
export type DraftHistory = {past:DisplaySnapshot[];present:DisplaySnapshot;future:DisplaySnapshot[]};
export const createDraft=(snapshot:DisplaySnapshot):DraftHistory=>({past:[],present:structuredClone(snapshot),future:[]});
export const editDraft=(h:DraftHistory,next:DisplaySnapshot):DraftHistory=>({past:[...h.past,h.present].slice(-50),present:structuredClone(next),future:[]});
export const undoDraft=(h:DraftHistory):DraftHistory=>h.past.length ? {past:h.past.slice(0,-1),present:h.past.at(-1)!,future:[h.present,...h.future]}:h;
export const redoDraft=(h:DraftHistory):DraftHistory=>h.future.length ? {past:[...h.past,h.present],present:h.future[0],future:h.future.slice(1)}:h;

const draftKey=(sessionId:string)=>`malam-manifesto:draft:${sessionId}`;
export const sameDraft=(a:DisplaySnapshot,b:DisplaySnapshot)=>JSON.stringify(a)===JSON.stringify(b);

export function restoreDraft(program:DisplaySnapshot):DraftHistory {
  try {
    const raw=localStorage.getItem(draftKey(program.sessionId));
    const parsed=raw&&displaySchema.safeParse(JSON.parse(raw));
    if(parsed&&parsed.success&&parsed.data.sessionId===program.sessionId)return createDraft(parsed.data);
  }catch{/* Storage may be unavailable. */}
  return createDraft(program);
}

export function storeDraft(snapshot:DisplaySnapshot,program:DisplaySnapshot):void {
  try {
    const key=draftKey(snapshot.sessionId);
    if(sameDraft(snapshot,program))localStorage.removeItem(key);
    else if(displaySchema.safeParse(snapshot).success)localStorage.setItem(key,JSON.stringify(snapshot));
  }catch{/* Storage may be unavailable. */}
}
