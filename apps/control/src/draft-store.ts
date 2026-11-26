import type { DisplaySnapshot } from '../../../packages/contracts/src/display.ts';
export type DraftHistory = {past:DisplaySnapshot[];present:DisplaySnapshot;future:DisplaySnapshot[]};
export const createDraft=(snapshot:DisplaySnapshot):DraftHistory=>({past:[],present:structuredClone(snapshot),future:[]});
export const editDraft=(h:DraftHistory,next:DisplaySnapshot):DraftHistory=>({past:[...h.past,h.present].slice(-50),present:structuredClone(next),future:[]});
export const undoDraft=(h:DraftHistory):DraftHistory=>h.past.length ? {past:h.past.slice(0,-1),present:h.past.at(-1)!,future:[h.present,...h.future]}:h;
export const redoDraft=(h:DraftHistory):DraftHistory=>h.future.length ? {past:[...h.past,h.present],present:h.future[0],future:h.future.slice(1)}:h;
