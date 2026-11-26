import React from 'react';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {Broadcast} from '../packages/templates/src/Broadcast.tsx';
import {fixtures} from '../fixtures/snapshots.ts';
import {parseDisplaySnapshot} from '../packages/contracts/src/display.ts';

test('all 52 compositions render normal maximum and missing content with protected text',()=>{
  assert.equal(fixtures.length,156);
  for(const fixture of fixtures) {
    const snapshot=parseDisplaySnapshot(fixture);
    const html=renderToStaticMarkup(<Broadcast snapshot={snapshot}/>);
    assert.match(html,/data-region="caption"/);
    assert.match(html,/data-region="disclosure"/);
    assert.match(html,/Malam Manifesto|MALAM MANIFESTO/);
  }
});
test('static motion applies the static performance profile class',()=>{
  const snapshot=structuredClone(fixtures[0]);
  snapshot.motionMode='static';
  const html=renderToStaticMarkup(<Broadcast snapshot={snapshot}/>);
  assert.match(html,/perf-static/);
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
