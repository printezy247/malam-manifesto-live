import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDisplaySnapshot, makeSnapshot } from '../packages/contracts/src/display.ts';
import { compositions, validateComposition } from '../packages/templates/src/layouts.ts';
import { acceptSnapshot } from '../apps/overlay/src/snapshot-client.ts';
import { editDraft, undoDraft, redoDraft, createDraft } from '../apps/control/src/draft-store.ts';
import { reduceCue } from '../packages/broadcast-ui/src/cues.ts';
import { motionDuration } from '../packages/broadcast-ui/src/motion.ts';

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
});

test('52 explicit orientation maps protect captions and disclosures and reject custom collisions', () => {
  assert.equal(Object.keys(compositions).length, 52);
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
});

test('overlay rejects stale, duplicate and foreign-session snapshots', () => {
  const current = {...makeSnapshot(), revision:5};
  assert.equal(acceptSnapshot(current, {...current, revision:4}), current);
  assert.equal(acceptSnapshot(current, {...current, revision:5}), current);
  assert.equal(acceptSnapshot(current, {...current, sessionId:'old-session', revision:99}), current);
  assert.equal(acceptSnapshot(current, {...current, revision:6}).revision, 6);
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
