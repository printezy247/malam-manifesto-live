import { CANVAS, validateRegions } from '../../contracts/src/layout.js';

export type Region = { role: string; x: number; y: number; width: number; height: number };
export type Composition = { orientation: 'portrait'; regions: Region[]; overlaps?:readonly (readonly [string,string])[] };
export const sourceLayouts=['scene','square','phone'] as const;
export type SourceLayout=typeof sourceLayouts[number];
export const sourceRoles=['media','media2','media3'] as const;
export type SourceRole=typeof sourceRoles[number];
export type SourceRect=Omit<Region,'role'>;
type Box = [number, number, number, number];
const region = (role: string, box: Box): Region => ({role, x:box[0], y:box[1], width:box[2], height:box[3]});
// Portrait-only canvas (1080x1920) for TikTok LIVE. Every template has exactly
// one composition, keyed `templateId:portrait`.
// Safe area: sources, title, main and caption stay above ~y1560 and left of
// x960 (TikTok rail). The disclosure is the only element allowed into the risky
// bottom band — it is non-essential legal text.
function portrait(main: Box, media?: Box, media2?: Box, media3?: Box, overlaps?:Composition['overlaps']): Composition {
  return {orientation:'portrait', overlaps, regions:[
    region('header',[72,56,840,64]), region('title',[72,160,840,240]),
    region('main',main), ...(media ? [region('media',media)] : []), ...(media2 ? [region('media2',media2)] : []), ...(media3 ? [region('media3',media3)] : []),
    region('caption',[72,1380,840,180]), region('disclosure',[72,1600,840,160]),
    region('platform-exclusion',[960,0,120,1920]), region('platform-exclusion',[0,1780,1080,140])
  ]};
}
const focus=portrait([72,1110,840,250],[72,430,840,370],[72,820,840,260]);
const focusDevices=portrait([72,1110,840,250],[72,430,550,650],[642,430,270,470]);
const commentary=portrait([72,455,840,188],[72,430,410,930],[502,430,410,930],[304,960,376,400],
  [['main','media'],['main','media2'],['media','media3'],['media2','media3']]);
export const compositions: Record<string,Composition> = {
  'starting-soon:portrait': portrait([200,500,680,400],[72,940,840,340]),
  'hype-intro:portrait': portrait([120,450,840,900]),
  'title-card:portrait': portrait([120,470,840,870]),
  'vigil:portrait': portrait([160,470,760,870]),
  'principles-board:portrait': portrait([72,460,840,900]),
  'board:portrait': portrait([72,460,840,900]),
  'presenter:portrait': portrait([72,1000,840,360],[72,430,840,540]),
  'chart:portrait': portrait([72,1000,840,360],[72,430,840,540]),
  'qa:portrait': portrait([72,470,580,860],undefined,[680,470,232,860]),
  'poll:portrait': portrait([72,470,580,860],undefined,[680,470,232,860]),
  'chat-highlight:portrait': portrait([72,1000,840,360],[72,430,840,540]),
  'resource-card:portrait': portrait([72,470,580,860],undefined,[680,470,232,860]),
  'short-break:portrait': portrait([280,500,520,400],[72,940,840,340]),
  'technical-difficulty:portrait': portrait([320,480,440,860]),
  'end-screen:portrait': portrait([72,470,580,860],undefined,[680,470,232,860]),
  'recap-closing:portrait': portrait([72,910,840,450],undefined,[72,56,840,1504],undefined,
    [['header','media2'],['title','media2'],['main','media2'],['caption','media2']]),
  // Gaming reality-show scenes: one or two phone camera slots.
  'duo-cam:portrait': portrait([72,1150,840,210],[72,440,420,660],[492,440,420,660]),
  'vs-battle:portrait': portrait([72,1130,840,230],[72,440,420,660],[492,440,420,660]),
  'gameplay:portrait': portrait([72,970,840,390],[72,430,840,520]),
  'player-intro:portrait': portrait([72,1130,840,230],[252,430,480,660]),
  // Trading-show scenes: MT5 screens + phone cams inside the portrait safe area.
  'live-shop:portrait': portrait([72,1190,840,170],[72,900,840,260],[108,430,768,432]),
  'fight-mode:portrait': portrait([72,1130,840,230],[72,430,840,330],[72,780,840,330]),
  'trader-focus:portrait': focus,
  'commentary:portrait': commentary,
  'winner:portrait': focus,
  'manifesto-about:portrait': portrait([72,750,840,610],[72,430,840,280])
};

const deviceLayouts:Record<string,Composition>={
  'fight-mode':portrait([72,1130,840,230],[72,430,410,660],[502,430,410,660]),
  'trader-focus':focusDevices,
  'winner':focusDevices,
  'gameplay':portrait([72,1130,840,230],[72,430,840,660]),
};

// Dedicated capture feeds keep their shape when other sources switch to device framing.
export function fixedSourceAspect(templateId:string,role:SourceRole):readonly [number,number]|null|undefined {
  if(role!=='media2')return undefined;
  if(templateId==='live-shop')return [16,9];
  if(templateId==='recap-closing')return null;
  return undefined;
}

export function resolveComposition(templateId:string,layout?:{
  sourceLayout?:SourceLayout;slots?:Partial<Record<SourceRole,SourceRect>>;
  mainOffsetX?:number;mainOffsetY?:number;
}):Composition {
  const format=layout?.sourceLayout??'scene';
  const base=compositions[`${templateId}:portrait`];
  const selected=format==='scene'?base:deviceLayouts[templateId]??base;
  return {...selected,regions:selected.regions.map(region=>{
    if(region.role==='main')return {...region,x:region.x+(layout?.mainOffsetX??0),y:region.y+(layout?.mainOffsetY??0)};
    const role=sourceRoles.find(role=>region.role===role);
    if(!role)return region;
    const box=layout?.slots?.[role]??region;
    const fixed=fixedSourceAspect(templateId,role);
    const aspect=fixed===undefined?(format==='scene'?null:format==='square'?[1,1]:[9,16]):fixed;
    if(!aspect)return {...box,role};
    const [w,h]=aspect;
    const factor=Math.floor(Math.min(box.width/w,box.height/h));
    const width=w*factor,height=h*factor;
    return {role,x:box.x+Math.floor((box.width-width)/2),y:box.y+Math.floor((box.height-height)/2),width,height};
  })};
}
export function versusCenter(layout:Composition):{x:number;y:number}|null {
  const first=layout.regions.find(region=>region.role==='media');
  const second=layout.regions.find(region=>region.role==='media2');
  if(!first||!second)return null;
  return {x:Math.round((first.x+second.x)/2+(first.width+second.width)/4),
    y:Math.round((first.y+second.y)/2+(first.height+second.height)/4)};
}
export function validateComposition(layout: Composition): string[] {
  const issues = validateRegions(layout.regions, CANVAS).map(issue=>issue.code);
  const visible = layout.regions.filter(r=>r.role !== 'platform-exclusion');
  if (new Set(visible.map(r=>r.role)).size !== visible.length) issues.push('DUPLICATE');
  for (const role of ['header','title','main','caption','disclosure']) if (!visible.some(r=>r.role===role)) issues.push('MISSING');
  for(let i=0;i<visible.length;i++) for(let j=i+1;j<visible.length;j++) {
    const a=visible[i], b=visible[j];
    if(layout.overlaps?.some(([first,second])=>(first===a.role&&second===b.role)||(second===a.role&&first===b.role)))continue;
    if(a.x < b.x+b.width && a.x+a.width>b.x && a.y<b.y+b.height && a.y+a.height>b.y) issues.push('COLLISION');
  }
  return issues;
}
