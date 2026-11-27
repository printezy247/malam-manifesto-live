import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getPerformanceProfile,profileWhenActive,type PerformanceTier} from '../packages/contracts/src/performance.ts';
import {reduceCue} from '../packages/broadcast-ui/src/cues.ts';

test('static profile disables decorative loops and expensive effects',()=>{
  const profile=getPerformanceProfile('static');
  assert.equal(profile.decorativeMotion,false);
  assert.equal(profile.assetQuality,'low');
  assert.equal(profile.pollingMs,null);
  assert.equal(profile.className,'perf-static');
});

test('profiles vary decoration and asset quality but never data accuracy',()=>{
  const tiers:PerformanceTier[]=['static','standard','enhanced'];
  const profiles=tiers.map(getPerformanceProfile);
  assert.deepEqual(profiles.map(p=>p.decorativeMotion),[false,true,true]);
  assert.deepEqual(profiles.map(p=>p.assetQuality),['low','standard','high']);
  for(const profile of profiles) {
    assert.equal(profile.cueLimit,20);
    assert.equal('dataAccuracy' in profile,false);
  }
});

test('inactive scenes release timers and pause unnecessary work',()=>{
  const active=getPerformanceProfile('enhanced');
  const inactive=profileWhenActive(active,false);
  assert.equal(inactive.decorativeMotion,false);
  assert.equal(inactive.pollingMs,null);
  assert.equal(inactive.assetQuality,'low');
  assert.equal(profileWhenActive(active,true),active);
});

test('cue queue stays capped at 20 after a synthetic burst',()=>{
  let cues:ReturnType<typeof reduceCue>=[];
  for(let i=0;i<200;i++) cues=reduceCue(cues,{type:'push',cue:{id:String(i),text:'Cue '+i,expiresAt:10000}},0);
  assert.equal(cues.length,20);
  assert.equal(cues[0].id,'180');
  assert.equal(cues.at(-1)!.id,'199');
});
