import {existsSync,mkdirSync,readFileSync,openSync,writeFileSync,fsyncSync,closeSync,renameSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {displaySchema,type DisplaySnapshot} from '../../../packages/contracts/src/display.ts';
import {readStoredSnapshot} from './persistence.ts';

export type ScenePreset={name:string;snapshot:DisplaySnapshot;updatedAt:string};
export const presetNameSchema=(name:unknown):string|null=>{
  if(typeof name!=='string') return null;
  const trimmed=name.trim();
  if(!trimmed||trimmed.length>60||/[\u0000-\u001f/\\]/.test(trimmed)) return null;
  return trimmed;
};

function readAll(file:string):ScenePreset[] {
  try {
    const parsed=JSON.parse(readFileSync(file,'utf8'));
    if(!Array.isArray(parsed)) return [];
    return parsed.flatMap(item=>{
      const name=presetNameSchema(item?.name);
      const snapshot=readStoredSnapshot(item?.snapshot);
      return name&&snapshot?[{name,snapshot,updatedAt:typeof item.updatedAt==='string'?item.updatedAt:''}]:[];
    }).slice(0,100);
  } catch {return [];}
}
function writeAll(file:string,presets:ScenePreset[]):void {
  mkdirSync(dirname(file),{recursive:true,mode:0o700});
  const temp=file+'.tmp';
  const fd=openSync(temp,'w',0o600);
  try {writeFileSync(fd,JSON.stringify(presets));fsyncSync(fd);} finally {closeSync(fd);}
  renameSync(temp,file);chmodSync(file,0o600);
}
export function listPresets(file:string):ScenePreset[] {return readAll(file);}
export function savePreset(file:string,name:string,snapshot:DisplaySnapshot):ScenePreset[] {
  const valid=presetNameSchema(name);const parsed=displaySchema.safeParse(snapshot);
  if(!valid||!parsed.success) throw new Error('INVALID_PRESET');
  const presets=readAll(file).filter(p=>p.name!==valid);
  presets.push({name:valid,snapshot:parsed.data,updatedAt:new Date().toISOString()});
  writeAll(file,presets.slice(-100));
  return readAll(file);
}
export function deletePreset(file:string,name:string):ScenePreset[] {
  const valid=presetNameSchema(name);if(!valid) throw new Error('INVALID_PRESET');
  const presets=readAll(file).filter(p=>p.name!==valid);
  writeAll(file,presets);
  return presets;
}
export function presetExists(file:string):boolean {return existsSync(file);}
