import {existsSync,mkdirSync,readFileSync,openSync,writeFileSync,fsyncSync,closeSync,renameSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {displaySchema,parseDisplaySnapshot,type DisplaySnapshot} from '../../../packages/contracts/src/display.ts';

export function readStoredSnapshot(input:unknown):DisplaySnapshot|null {
  if(!input||typeof input!=='object')return null;
  const stored=input as Record<string,unknown>;
  const layout=stored.layout as Partial<DisplaySnapshot['layout']>|undefined;
  const portrait=stored.schemaVersion===1&&stored.orientation==='landscape'
    ? {...stored,orientation:'portrait',layout:{mainOffsetX:0,mainOffsetY:0,textScale:layout?.textScale??'normal',slots:{}}}
    : stored;
  const result=displaySchema.safeParse(portrait);
  if(result.success)return result.data;
  // Capture-first layouts can invalidate a previously usable main offset.
  if(result.error.issues.every(issue=>issue.path.length===1&&issue.path[0]==='layout'&&issue.code==='custom')){
    const reset=displaySchema.safeParse({...portrait,layout:{...layout,mainOffsetX:0,mainOffsetY:0}});
    if(reset.success)return reset.data;
  }
  return null;
}

function atomicWrite(file:string,data:string) {
  const temp=file+'.tmp';
  const fd=openSync(temp,'w',0o600);
  try {writeFileSync(fd,data);fsyncSync(fd);} finally {closeSync(fd);}
  renameSync(temp,file); chmodSync(file,0o600);
  const directory=openSync(dirname(file),'r');
  try {fsyncSync(directory);} finally {closeSync(directory);}
}
export function saveSnapshot(file:string,input:DisplaySnapshot):void {
  const snapshot=parseDisplaySnapshot(input);
  mkdirSync(dirname(file),{recursive:true,mode:0o700});
  if(existsSync(file)) {
    let previous:DisplaySnapshot|null=null;
    try {previous=readStoredSnapshot(JSON.parse(readFileSync(file,'utf8')));} catch { /* Preserve the valid backup on corruption. */ }
    if(previous) atomicWrite(file+'.bak',JSON.stringify(previous));
  }
  atomicWrite(file,JSON.stringify(snapshot));
}
export function loadSnapshot(file:string):{snapshot:DisplaySnapshot|null;recovered:boolean} {
  for(const candidate of [file,file+'.bak']) {
    try {
      const snapshot=readStoredSnapshot(JSON.parse(readFileSync(candidate,'utf8')));
      if(snapshot)return {snapshot,recovered:candidate!==file};
    }
    catch { /* Try only the validated last-known-good backup. */ }
  }
  return {snapshot:null,recovered:existsSync(file)||existsSync(file+'.bak')};
}
