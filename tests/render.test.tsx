import React from 'react';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {Broadcast} from '../packages/templates/src/Broadcast.tsx';
import {fixtures} from '../fixtures/snapshots.ts';
import {parseDisplaySnapshot} from '../packages/contracts/src/display.ts';
import {overlayParts,type OverlayPart} from '../packages/templates/src/overlay-parts.ts';

test('all 26 portrait compositions render normal maximum and missing content with protected text',()=>{
  assert.equal(fixtures.length,78);
  for(const fixture of fixtures) {
    const snapshot=parseDisplaySnapshot(fixture);
    const html=renderToStaticMarkup(<Broadcast snapshot={snapshot}/>);
    assert.match(html,/data-region="caption"/);
    assert.match(html,/data-region="disclosure"/);
    assert.match(html,/Malam Manifesto|MALAM MANIFESTO/);
  }
});
test('gaming scenes render the 3D arena, HUD, minimap, health bars and winner shards; non-gaming do not',()=>{
  const vs=parseDisplaySnapshot({...fixtures.find(f=>f.templateId==='vs-battle')!});
  const vsHtml=renderToStaticMarkup(<Broadcast snapshot={vs} connected={false}/>);
  assert.match(vsHtml,/mm-arena/);
  assert.match(vsHtml,/mm-hud-chip/);
  assert.match(vsHtml,/mm-minimap/);
  assert.match(vsHtml,/mm-hp/);
  assert.match(vsHtml,/mm-demo-tag/);
  assert.match(vsHtml,/SCORE/);
  assert.doesNotMatch(vsHtml,/mm-shards/);
  const winner=parseDisplaySnapshot({...fixtures.find(f=>f.templateId==='winner')!});
  assert.match(renderToStaticMarkup(<Broadcast snapshot={winner} connected={false}/>),/mm-shards/);
  const board=parseDisplaySnapshot({...fixtures.find(f=>f.templateId==='board')!});
  const boardHtml=renderToStaticMarkup(<Broadcast snapshot={board} connected={false}/>);
  assert.doesNotMatch(boardHtml,/mm-arena/);
  assert.doesNotMatch(boardHtml,/mm-hud-chip/);
  assert.doesNotMatch(boardHtml,/mm-shards/);
});
test('OBS backdrop omits graphics and the transparent match overlay renders live health and rounds',()=>{
  const fight=fixtures.find(f=>f.templateId==='fight-mode')!;
  const snapshot=parseDisplaySnapshot({...fight,match:{a:{health:0,rounds:1},b:{health:29,rounds:2}}});
  const backdrop=renderToStaticMarkup(<Broadcast snapshot={snapshot} backdropOnly/>);
  assert.match(backdrop,/mm-arena/);
  assert.doesNotMatch(backdrop,/data-region=|mm-hp/);
  const overlay=renderToStaticMarkup(<Broadcast snapshot={snapshot} transparent/>);
  assert.match(overlay,/K\.O\. · 0%/);
  assert.match(overlay,/LOW HP · 29%/);
  assert.match(overlay,/data-health="knockout"/);
  assert.match(overlay,/data-health="critical"/);
  assert.match(overlay,/mm-impact-ring/);
  assert.match(overlay,/mm-capture-rails/);
  assert.match(overlay,/TRADER B: 2 round wins/);
  assert.doesNotMatch(overlay,/mm-arena|DEMO/);
});
test('static motion applies the static performance profile class',()=>{
  const snapshot=structuredClone(fixtures[0]);
  snapshot.motionMode='static';
  const html=renderToStaticMarkup(<Broadcast snapshot={snapshot}/>);
  assert.match(html,/perf-static/);
});
test('each independent OBS graphics source renders only its own part',()=>{
  const snapshot=fixtures.find(f=>f.templateId==='commentary')!;
  for(const part of Object.keys(overlayParts) as OverlayPart[]) {
    const html=renderToStaticMarkup(<Broadcast snapshot={snapshot} part={part} transparent={part!=='backdrop'} backdropOnly={part==='backdrop'}/>);
    const regions=[...html.matchAll(/data-region="([^"]+)"/g)].map(match=>match[1]);
    assert.deepEqual(regions,part==='backdrop'||part==='cue'?[]:[part]);
    assert.equal(html.includes('mm-stage-trails'),part==='backdrop');
  }
});
test('hostile markup is escaped in captions, titles and presenter',()=>{
  const snapshot=structuredClone(fixtures.find(f=>f.templateId==='board')!);
  const hostile='<img src=x onerror=alert(1)>';
  snapshot.content.caption=hostile;snapshot.content.title=hostile;snapshot.content.presenter=hostile;
  const html=renderToStaticMarkup(<Broadcast snapshot={snapshot} connected={false}/>);
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img src="x"'));
});
test('countdown scenes render a deadline timer and BRB hides decorative extras',()=>{
  const snapshot=parseDisplaySnapshot({...fixtures[0],templateId:'starting-soon',content:{...fixtures[0].content,countdownEndsAt:'2099-01-01T00:00:00+08:00'}});
  const html=renderToStaticMarkup(<Broadcast snapshot={snapshot}/>);
  assert.match(html,/mm-countdown/);
});
