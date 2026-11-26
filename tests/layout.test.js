import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCanvas } from '../packages/contracts/src/layout.js';

test('portrait and landscape use explicit broadcast dimensions', () => {
  assert.deepEqual(getCanvas('portrait'), { width: 1080, height: 1920 });
  assert.deepEqual(getCanvas('landscape'), { width: 1920, height: 1080 });
  assert.throws(() => getCanvas('invalid'));
});
