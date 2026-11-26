import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as countdown from '../packages/broadcast-ui/src/countdown.js';

test('deadline countdown rounds up and clamps after pauses or forward jumps', () => {
  assert.equal(countdown.remainingSeconds(10000, 8500), 2);
  assert.equal(countdown.remainingSeconds(10000, 12000), 0);
  assert.equal(countdown.remainingSeconds(10000, 10000), 0);
  assert.equal(countdown.remainingSeconds(10000, 0), 10);
});

test('nonfinite time input is rejected instead of showing NaN', () => {
  assert.equal(typeof countdown.remainingSeconds, 'function');
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(() => countdown.remainingSeconds(value, 0), TypeError);
    assert.throws(() => countdown.remainingSeconds(0, value), TypeError);
  }
});
