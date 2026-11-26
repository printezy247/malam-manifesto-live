import { getCanvas, validateRegions } from '../../contracts/src/layout.js';

export type Region = { role: string; x: number; y: number; width: number; height: number };
export type Composition = { orientation: 'portrait' | 'landscape'; regions: Region[] };
type Box = [number, number, number, number];
const region = (role: string, box: Box): Region => ({role, x:box[0], y:box[1], width:box[2], height:box[3]});
// Each template has its own art direction. Coordinates are not scaled/cropped between orientations.
// Portrait safe area: sources, title, main and caption stay above ~y1560 and
// left of x960 (TikTok rail). The disclosure is the only element allowed into
// the risky bottom band — it is non-essential legal text.
function portrait(main: Box, media?: Box, media2?: Box, media3?: Box): Composition {
  return {orientation:'portrait', regions:[
    region('header',[72,56,840,64]), region('title',[72,160,840,240]),
    region('main',main), ...(media ? [region('media',media)] : []), ...(media2 ? [region('media2',media2)] : []), ...(media3 ? [region('media3',media3)] : []),
    region('caption',[72,1380,840,180]), region('disclosure',[72,1600,840,160]),
    region('platform-exclusion',[960,0,120,1920]), region('platform-exclusion',[0,1780,1080,140])
  ]};
}
function landscape(main: Box, media?: Box, media2?: Box, media3?: Box): Composition {
  return {orientation:'landscape', regions:[
    region('header',[72,40,1776,60]), region('title',[72,120,1776,160]),
    region('main',main), ...(media ? [region('media',media)] : []), ...(media2 ? [region('media2',media2)] : []), ...(media3 ? [region('media3',media3)] : []),
    region('caption',[72,800,1776,110]), region('disclosure',[72,930,1776,80]),
    region('platform-exclusion',[0,1030,1920,50])
  ]};
}
export const compositions: Record<string,Composition> = {
  'starting-soon:portrait': portrait([200,500,680,400],[72,940,840,340]),
  'starting-soon:landscape': landscape([680,300,760,500],[72,300,560,500]),
  'hype-intro:portrait': portrait([120,450,840,900]),
  'hype-intro:landscape': landscape([240,300,1440,500]),
  'title-card:portrait': portrait([120,470,840,870]),
  'title-card:landscape': landscape([460,280,1000,520]),
  'vigil:portrait': portrait([160,470,760,870]),
  'vigil:landscape': landscape([660,320,600,480]),
  'principles-board:portrait': portrait([72,460,840,900]),
  'principles-board:landscape': landscape([160,300,1600,500]),
  'board:portrait': portrait([72,460,840,900]),
  'board:landscape': landscape([72,300,1776,500]),
  'presenter:portrait': portrait([72,1000,840,360],[72,430,840,540]),
  'presenter:landscape': landscape([72,300,800,500],[896,300,952,500]),
  'chart:portrait': portrait([72,1000,840,360],[72,430,840,540]),
  'chart:landscape': landscape([72,300,900,500],[996,300,864,500]),
  'qa:portrait': portrait([72,470,580,860],undefined,[680,470,232,860]),
  'qa:landscape': landscape([300,300,1150,500],undefined,[1480,300,368,500]),
  'poll:portrait': portrait([72,470,580,860],undefined,[680,470,232,860]),
  'poll:landscape': landscape([300,300,1150,500],undefined,[1480,300,368,500]),
  'chat-highlight:portrait': portrait([72,1000,840,360],[72,430,840,540]),
  'chat-highlight:landscape': landscape([72,300,900,500],[996,300,864,500]),
  'resource-card:portrait': portrait([72,470,580,860],undefined,[680,470,232,860]),
  'resource-card:landscape': landscape([300,300,1150,500],undefined,[1480,300,368,500]),
  'short-break:portrait': portrait([280,500,520,400],[72,940,840,340]),
  'short-break:landscape': landscape([660,290,720,490],[72,290,540,490]),
  'technical-difficulty:portrait': portrait([320,480,440,860]),
  'technical-difficulty:landscape': landscape([660,340,600,460]),
  'end-screen:portrait': portrait([72,470,580,860],undefined,[680,470,232,860]),
  'end-screen:landscape': landscape([300,300,1150,500],undefined,[1480,300,368,500]),
  'recap-closing:portrait': portrait([72,470,580,860],undefined,[680,470,232,860]),
  'recap-closing:landscape': landscape([300,300,1150,500],undefined,[1480,300,368,500]),
  // Gaming reality-show scenes: one or two phone camera slots.
  'duo-cam:portrait': portrait([72,1150,840,210],[72,440,420,660],[492,440,420,660]),
  'duo-cam:landscape': landscape([72,660,1776,140],[72,300,880,340],[980,300,868,340]),
  'vs-battle:portrait': portrait([72,1130,840,230],[72,440,420,660],[492,440,420,660]),
  'vs-battle:landscape': landscape([72,620,1776,180],[72,300,880,300],[980,300,868,300]),
  'gameplay:portrait': portrait([72,970,840,390],[72,430,840,520]),
  'gameplay:landscape': landscape([1200,300,648,500],[72,300,1100,500]),
  'player-intro:portrait': portrait([72,1130,840,230],[252,430,480,660]),
  'player-intro:landscape': landscape([1300,300,548,500],[72,300,1200,500]),
  // Trading-show scenes: MT5 screens + phone cams inside the portrait safe area.
  'live-shop:portrait': portrait([72,430,840,150],[72,1070,840,260],[72,600,840,440]),
  'live-shop:landscape': landscape([72,300,420,500],[540,300,700,500],[1280,300,568,500]),
  'fight-mode:portrait': portrait([72,430,840,210],[72,660,840,330],[72,1010,840,330]),
  'fight-mode:landscape': landscape([72,620,1776,180],[72,300,880,300],[980,300,868,300]),
  'trader-focus:portrait': portrait([72,430,840,240],[72,690,840,370],[72,1070,840,260]),
  'trader-focus:landscape': landscape([72,300,400,500],[500,300,1000,500],[1520,300,328,500]),
  'commentary:portrait': portrait([72,430,840,170],[72,620,400,190],[472,620,400,190],[72,830,840,500]),
  'commentary:landscape': landscape([72,300,1776,140],[72,460,700,310],[800,460,700,310],[1520,460,328,310]),
  'winner:portrait': portrait([72,430,840,320],[72,780,410,340],[502,780,410,340]),
  'winner:landscape': landscape([460,300,1000,500],[72,300,330,500],[1518,300,330,500]),
  'manifesto-about:portrait': portrait([72,470,840,560],[72,1060,840,280]),
  'manifesto-about:landscape': landscape([300,300,1100,500],[1480,300,368,500])
};
export function validateComposition(layout: Composition): string[] {
  const issues = validateRegions(layout.regions, getCanvas(layout.orientation)).map(issue=>issue.code);
  const visible = layout.regions.filter(r=>r.role !== 'platform-exclusion');
  if (new Set(visible.map(r=>r.role)).size !== visible.length) issues.push('DUPLICATE');
  for (const role of ['header','title','main','caption','disclosure']) if (!visible.some(r=>r.role===role)) issues.push('MISSING');
  for(let i=0;i<visible.length;i++) for(let j=i+1;j<visible.length;j++) {
    const a=visible[i], b=visible[j];
    if(a.x < b.x+b.width && a.x+a.width>b.x && a.y<b.y+b.height && a.y+a.height>b.y) issues.push('COLLISION');
  }
  return issues;
}
