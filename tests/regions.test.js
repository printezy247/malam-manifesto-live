import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as layout from '../packages/contracts/src/layout.js';

const canvas = { width: 1080, height: 1920 };
const region = (role, x = 0, y = 0, width = 100, height = 100) => ({ role, x, y, width, height });

test('valid integer regions fit exactly on canvas edges', () => {
  assert.deepEqual(layout.validateRegions([region('caption', 980, 1820)], canvas), []);
});

test('invalid geometry cannot reach the renderer', () => {
  for (const bad of [region('caption', -1), region('caption', 1000), region('caption', NaN), region('caption', 0.5), region('caption', 0, 0, 0), region('caption', 0, 0, Infinity)]) {
    assert.ok(layout.validateRegions([bad], canvas).length > 0);
  }
  assert.ok(layout.validateRegions([], { width: Infinity, height: 1920 }).length > 0);
  assert.ok(layout.validateRegions([null], canvas).length > 0);
});

test('caption and disclosure cannot overlap platform exclusions, touching edges is allowed', () => {
  for (const role of ['caption', 'disclosure']) {
    assert.ok(layout.validateRegions([region(role), region('platform-exclusion', 99)], canvas).length > 0);
    assert.deepEqual(layout.validateRegions([region(role), region('platform-exclusion', 100)], canvas), []);
  }
});
