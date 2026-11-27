import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDisplaySnapshot, makeSnapshot } from '../packages/contracts/src/display.ts';
import { compositions, resolveComposition, sourceRoles, validateComposition, versusCenter } from '../packages/templates/src/layouts.ts';
import { acceptSnapshot } from '../apps/overlay/src/snapshot-client.ts';
import { editDraft, undoDraft, redoDraft, createDraft } from '../apps/control/src/draft-store.ts';
import { reduceCue } from '../packages/broadcast-ui/src/cues.ts';
import { motionDuration } from '../packages/broadcast-ui/src/motion.ts';
import { captureTransform } from '../apps/bridge/src/obs/framing.ts';

test('strict snapshots enforce Unicode bounds, real dates and inert text', () => {
  const base = makeSnapshot();
  assert.equal(parseDisplaySnapshot(base).schemaVersion, 1);
  for (const patch of [{schemaVersion: 2}, {templateId: 'unknown'}, {secret: 'forbidden'}, {revision: NaN}]) {
    assert.throws(() => parseDisplaySnapshot({...base, ...patch}));
  }
  for (const countdownEndsAt of ['yesterday', '2026-02-30T12:00:00Z', '2026-01-01T00:00:00', '2026-01-01T25:00:00Z']) {
    assert.throws(() => parseDisplaySnapshot({...base, content: {...base.content, countdownEndsAt}}));
  }
  assert.throws(() => parseDisplaySnapshot({...base, content: {...base.content, title: '😀'.repeat(81)}}));
  assert.equal(parseDisplaySnapshot({...base, content: {...base.content, title: '😀'.repeat(80)}}).content.title.length, 160);
  assert.throws(() => parseDisplaySnapshot({...base, content: {...base.content, title: '   '}}));
  const hostile = '<script>alert(1)</script>';
  assert.equal(parseDisplaySnapshot({...base, content: {...base.content, caption:hostile}}).content.caption, hostile);
  assert.throws(() => parseDisplaySnapshot({...base, content: {...base.content, link:'javascript:alert(1)'}}));
  assert.throws(() => parseDisplaySnapshot({...base,orientation:'landscape'}));
  assert.throws(() => parseDisplaySnapshot({...base,templateId:'fight-mode',match:{a:{health:101,rounds:0},b:{health:50,rounds:4}}}));
});

test('26 explicit portrait maps protect captions and disclosures and reject custom collisions', () => {
  assert.equal(Object.keys(compositions).length, 26);
  for (const key of Object.keys(compositions)) assert.match(key, /:portrait$/);
  for (const composition of Object.values(compositions)) {
    assert.deepEqual(validateComposition(composition), []);
    assert.ok(composition.regions.some(r => r.role === 'caption'));
    assert.ok(composition.regions.some(r => r.role === 'disclosure'));
  }
  const layout = structuredClone(compositions['board:portrait']);
  layout.regions[0].x = -1;
  assert.ok(validateComposition(layout).length);
  const overlap = structuredClone(compositions['board:portrait']);
  overlap.regions.find(r => r.role === 'caption')!.y = 0;
  assert.ok(validateComposition(overlap).length);
  for(const templateId of ['live-shop','fight-mode','trader-focus','winner','manifesto-about']){
    const regions=compositions[`${templateId}:portrait`].regions;
    const main=regions.find(region=>region.role==='main')!;
    assert.ok(regions.filter(region=>region.role.startsWith('media')).every(region=>region.y+region.height<=main.y),templateId);
  }
});

test('layered broadcast scenes keep their capture geometry across source modes',()=>{
  for(const sourceLayout of ['scene','square','phone'] as const) {
    const tv=resolveComposition('live-shop',{sourceLayout}).regions.find(r=>r.role==='media2')!;
    assert.equal(tv.width*9,tv.height*16);
    const recap=resolveComposition('recap-closing',{sourceLayout});
    assert.deepEqual(recap.regions.find(r=>r.role==='media2'),{role:'media2',x:72,y:56,width:840,height:1504});
    assert.deepEqual(resolveComposition('winner',{sourceLayout}),resolveComposition('trader-focus',{sourceLayout}));
    const commentary=resolveComposition('commentary',{sourceLayout});
    const host=commentary.regions.find(r=>r.role==='media3')!;
    const traders=commentary.regions.filter(r=>r.role==='media'||r.role==='media2');
    const vs=versusCenter(commentary)!;
    assert.ok(vs.y+60<=host.y);
    assert.ok(traders.every(r=>host.width<r.width&&host.height<r.height&&host.x<r.x+r.width&&host.x+host.width>r.x&&host.y<r.y+r.height));
    assert.deepEqual(validateComposition(commentary),[]);
  }
  assert.deepEqual(versusCenter(resolveComposition('vs-battle')),{x:492,y:770});
  assert.deepEqual(versusCenter(resolveComposition('fight-mode')),{x:492,y:770});
});

test('overlay rejects stale, duplicate and foreign-session snapshots', () => {
  const current = {...makeSnapshot(), revision:5};
  assert.equal(acceptSnapshot(current, {...current, revision:4}), current);
  assert.equal(acceptSnapshot(current, {...current, revision:5}), current);
  assert.equal(acceptSnapshot(current, {...current, sessionId:'old-session', revision:99}), current);
  assert.equal(acceptSnapshot(current, {...current, revision:6}).revision, 6);
});

test('Fight Mode reframes both sources for side-by-side square and phone captures',()=>{
  const base={...makeSnapshot(),templateId:'fight-mode',content:{...makeSnapshot().content,points:[]}};
  const boxes=(mode:'scene'|'square'|'phone')=>{
    const snapshot=parseDisplaySnapshot({...base,layout:{...base.layout,sourceLayout:mode,sourceFit:'fit'}});
    return resolveComposition(snapshot.templateId,snapshot.layout).regions.filter(r=>sourceRoles.some(role=>r.role===role));
  };
  assert.deepEqual(boxes('scene').map(r=>[r.y,r.width,r.height]),[[430,840,330],[780,840,330]]);
  assert.deepEqual(boxes('square').map(r=>[r.x,r.y,r.width,r.height]),[[72,555,410,410],[502,555,410,410]]);
  assert.deepEqual(boxes('phone').map(r=>[r.x,r.y,r.width,r.height]),[[92,432,369,656],[522,432,369,656]]);
  assert.throws(()=>parseDisplaySnapshot({...base,layout:{...base.layout,sourceLayout:'phone',slots:{media:{x:72,y:160,width:180,height:240}}}}));
});
test('OBS applies a clean portrait transform with explicit fit or bounds crop',()=>{
  const box={x:92,y:432,width:369,height:656};
  const fit=captureTransform(box,'fit');
  assert.deepEqual([fit.positionX,fit.positionY,fit.boundsWidth,fit.boundsHeight],[92,432,369,656]);
  assert.deepEqual([fit.cropLeft,fit.cropRight,fit.cropTop,fit.cropBottom,fit.rotation],[0,0,0,0,0]);
  assert.equal(fit.boundsType,'OBS_BOUNDS_SCALE_INNER');
  assert.equal(fit.cropToBounds,false);
  const fill=captureTransform(box,'fill');
  assert.deepEqual(fill,{...fit,boundsType:'OBS_BOUNDS_SCALE_OUTER',cropToBounds:true});
});

test('draft editing, bounded undo and redo never mutate program', () => {
  const program = makeSnapshot();
  let history = createDraft(program);
  history = editDraft(history, {...history.present, content:{...history.present.content, title:'Draf baharu'}});
  assert.notEqual(history.present.content.title, program.content.title);
  assert.equal(undoDraft(history).present.content.title, program.content.title);
  assert.equal(redoDraft(undoDraft(history)).present.content.title, 'Draf baharu');
  for (let i = 0; i < 60; i++) history = editDraft(history, {...history.present, revision: i});
  let cursor = history;
  while (cursor.past.length) cursor = undoDraft(cursor);
  assert.ok(cursor.past.length <= 50);
});

test('cue queue expiry and cap are deterministic', () => {
  let cues: ReturnType<typeof reduceCue> = [];
  cues = reduceCue(cues, {type:'push', cue:{id:'a',text:'salam',expiresAt:100}}, 0);
  assert.equal(cues.length, 1);
  cues = reduceCue(cues, {type:'tick'}, 200);
  assert.equal(cues.length, 0);
  cues = reduceCue(cues, {type:'clear'}, 0);
  assert.equal(cues.length, 0);
});

test('motion durations follow the mode contract', () => {
  assert.equal(motionDuration('scene','standard'), 550);
  assert.equal(motionDuration('scene','low'), 0);
  assert.equal(motionDuration('scene','static'), 0);
});

test('per-source slot overrides stay inside the canvas and are optional', () => {
  const base = makeSnapshot();
  const withSlot = {...base, layout: {...base.layout, slots: {media: {x: 100, y: 200, width: 400, height: 300}}}};
  const parsed = parseDisplaySnapshot(withSlot);
  assert.deepEqual(parsed.layout.slots.media, {x: 100, y: 200, width: 400, height: 300});
  assert.deepEqual(parseDisplaySnapshot(base).layout.slots, {});
  for (const bad of [
    {x: 100, y: 200, width: 10, height: 300},
    {x: -1, y: 200, width: 400, height: 300},
    {x: 1.5, y: 200, width: 400, height: 300},
    {x: 900, y: 1700, width: 400, height: 300},
  ]) {
    assert.throws(() => parseDisplaySnapshot({...base, layout: {...base.layout, slots: {media: bad}}}));
  }
  assert.throws(() => parseDisplaySnapshot({...base, layout: {...base.layout, slots: {media: {x: 0, y: 0, width: 100, height: 100}, rogue: {x: 0, y: 0, width: 100, height: 100}}}}));
});
