export type Cue={id:string;text:string;expiresAt:number};
export type CueAction={type:'push';cue:Cue}|{type:'tick'}|{type:'clear'};
export function reduceCue(state:Cue[],action:CueAction,now:number):Cue[] {
  if(action.type==='clear') return [];
  const active=state.filter(c=>c.expiresAt>now);
  if(action.type==='push' && action.cue.expiresAt>now && !active.some(c=>c.id===action.cue.id)) active.push(action.cue);
  return active.slice(-20);
}
