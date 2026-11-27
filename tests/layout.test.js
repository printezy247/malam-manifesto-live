import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCanvas, CANVAS } from '../packages/contracts/src/layout.js';

test('the only canvas this build renders is TikTok LIVE portrait 1080x1920', () => {
  assert.deepEqual(getCanvas(), { width: 1080, height: 1920 });
  assert.deepEqual(CANVAS, { width: 1080, height: 1920 });
  assert.ok(Object.isFrozen(CANVAS));
  assert.notEqual(getCanvas(), CANVAS);
});
