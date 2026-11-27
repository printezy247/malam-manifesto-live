import { z } from 'zod';
import { resolveComposition, sourceLayouts, validateComposition } from '../../templates/src/layouts.ts';
import { getCanvas } from './layout.js';

export const templateIds = ['starting-soon','hype-intro','title-card','vigil','principles-board','board','presenter','chart','qa','poll','chat-highlight','resource-card','short-break','technical-difficulty','end-screen','recap-closing','duo-cam','vs-battle','gameplay','player-intro','live-shop','fight-mode','trader-focus','commentary','winner','manifesto-about'] as const;
export const matchTemplates = new Set<string>(['vs-battle','fight-mode','commentary']);
const fighter = z.strictObject({health:z.number().int().min(0).max(100), rounds:z.number().int().min(0).max(3)});
// Per-composition content capacity. These are the "maximum permitted content"
// bounds that every layout can render legibly; the schema rejects anything larger.
export const pointLimits: Record<typeof templateIds[number],{count:number;chars:number}> = {
  'starting-soon':{count:3,chars:100}, 'short-break':{count:3,chars:100}, 'technical-difficulty':{count:3,chars:100},
  'vigil':{count:2,chars:120}, 'title-card':{count:2,chars:140}, 'hype-intro':{count:3,chars:110},
  'principles-board':{count:4,chars:110}, 'board':{count:5,chars:120}, 'qa':{count:5,chars:120},
  'recap-closing':{count:5,chars:120}, 'presenter':{count:3,chars:110}, 'chart':{count:4,chars:110},
  'chat-highlight':{count:3,chars:130}, 'resource-card':{count:5,chars:140}, 'poll':{count:4,chars:120},
  'end-screen':{count:3,chars:120},
  'duo-cam':{count:2,chars:90}, 'vs-battle':{count:2,chars:80}, 'gameplay':{count:4,chars:110}, 'player-intro':{count:3,chars:110},
  'live-shop':{count:2,chars:100}, 'fight-mode':{count:2,chars:80}, 'trader-focus':{count:2,chars:100},
  'commentary':{count:2,chars:80}, 'winner':{count:2,chars:80}, 'manifesto-about':{count:4,chars:120}
};
const slotRect=z.strictObject({x:z.number().int().min(0),y:z.number().int().min(0),width:z.number().int().min(24).max(3840),height:z.number().int().min(24).max(3840)});
const text = (max: number) => z.string().refine(s=>Array.from(s).length<=max, `Maximum ${max} characters`).refine(s=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s),'Control characters are not allowed');
const date = z.string().datetime({offset:true}).refine(s => {
  if (!Number.isFinite(Date.parse(s))) return false;
  const [y,m,d] = s.slice(0,10).split('-').map(Number);
  return new Date(Date.UTC(y,m-1,d)).getUTCDate()===d;
},'Invalid calendar date');
export const displaySchema = z.strictObject({
  schemaVersion:z.literal(1), sessionId:z.string().regex(/^[a-zA-Z0-9-]{1,64}$/),
  revision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER-1), templateId:z.enum(templateIds),
  orientation:z.literal('portrait'), motionMode:z.enum(['standard','low','static']),
  match:z.strictObject({a:fighter,b:fighter}).optional(),
  content:z.strictObject({title:text(80).refine(s=>!!s.trim(),'Title is required'),presenter:text(60),
    points:z.array(text(160)).max(5),caption:text(240),disclosure:text(240),countdownEndsAt:date.nullable(),
    chartDescription:text(240).default(''), locale:z.enum(['en','ms']).default('en'),
    link:text(200).refine(s=>!s.trim()||/^(https?:\/\/|www\.)\S+$/i.test(s.trim()),'Use a full http(s) URL').nullable().default(null)})
  ,layout:z.strictObject({mainOffsetX:z.number().int().min(-48).max(48),mainOffsetY:z.number().int().min(-48).max(48),textScale:z.enum(['normal','large']),
    sourceLayout:z.enum(sourceLayouts).optional(),sourceFit:z.enum(['fit','fill']).optional(),
    slots:z.strictObject({media:slotRect.optional(),media2:slotRect.optional(),media3:slotRect.optional()}).default({})}).default({mainOffsetX:0,mainOffsetY:0,textScale:'normal',slots:{}})
}).superRefine((s,ctx)=>{
  const limit=pointLimits[s.templateId];
  if(s.content.points.length>limit.count) ctx.addIssue({code:'custom',path:['content','points'],message:`This layout supports at most ${limit.count} points`});
  s.content.points.forEach((point,index)=>{ if(Array.from(point).length>limit.chars) ctx.addIssue({code:'custom',path:['content','points',index],message:`Keep each point under ${limit.chars} characters for this layout`}); });
  const mode=s.layout.sourceLayout??'scene';
  const layout=resolveComposition(s.templateId,mode==='scene'?{...s.layout,slots:{}}:s.layout);
  if(validateComposition(layout).length) ctx.addIssue({code:'custom',path:['layout'],message:'Placement collides with a protected region or canvas edge'});
  const canvas=getCanvas();
  for(const [role,slot] of Object.entries(s.layout.slots)) {
    if(slot&&(slot.x+slot.width>canvas.width||slot.y+slot.height>canvas.height)) ctx.addIssue({code:'custom',path:['layout','slots',role],message:'Source slot must fit inside the canvas'});
  }
});
export type DisplaySnapshot = z.infer<typeof displaySchema>;
export type MotionMode = DisplaySnapshot['motionMode'];
export const parseDisplaySnapshot = (input: unknown): DisplaySnapshot => displaySchema.parse(input);
export const publishSchema = z.strictObject({commandId:z.string().uuid(),expectedRevision:z.number().int().nonnegative(),snapshot:displaySchema});
export type PublishRequest = z.infer<typeof publishSchema>;
export function makeSnapshot(): DisplaySnapshot {
  return parseDisplaySnapshot({schemaVersion:1,sessionId:'local-show',revision:0,templateId:'starting-soon',orientation:'portrait',motionMode:'static',
    content:{title:'Malam Manifesto Live',presenter:'Aish Capital',points:['Fahami pasaran sebelum meneka arah.','Proses berdisiplin mengalahkan ramalan.'],caption:'',disclosure:'Kandungan pendidikan sahaja. Bukan nasihat kewangan.',countdownEndsAt:null,chartDescription:'',locale:'ms',link:null}});
}
