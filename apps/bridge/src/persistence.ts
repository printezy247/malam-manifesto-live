import {existsSync,mkdirSync,readFileSync,openSync,writeFileSync,fsyncSync,closeSync,renameSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {parseDisplaySnapshot,type DisplaySnapshot} from '../../../packages/contracts/src/display.ts';

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
    try {previous=parseDisplaySnapshot(JSON.parse(readFileSync(file,'utf8')));} catch { /* Preserve the valid backup on corruption. */ }
    if(previous) atomicWrite(file+'.bak',JSON.stringify(previous));
  }
  atomicWrite(file,JSON.stringify(snapshot));
}
export function loadSnapshot(file:string):{snapshot:DisplaySnapshot|null;recovered:boolean} {
  for(const candidate of [file,file+'.bak']) {
    try {return {snapshot:parseDisplaySnapshot(JSON.parse(readFileSync(candidate,'utf8'))),recovered:candidate!==file};}
    catch { /* Try only the validated last-known-good backup. */ }
  }
  return {snapshot:null,recovered:existsSync(file)||existsSync(file+'.bak')};
}
