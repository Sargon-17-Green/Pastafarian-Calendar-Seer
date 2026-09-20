import assert from 'node:assert/strict';
import test from 'node:test';
import { distribution, percentile } from '../lib.mjs';

test('percentile uses linear interpolation over sorted samples', () => {
  assert.equal(percentile([4, 1, 3, 2], 0.5), 2.5);
  assert.equal(percentile([10], 0.99), 10);
  assert.equal(percentile([], 0.5), null);
});

test('distribution emits tail percentiles only with enough observations', () => {
  const nineteen = distribution(Array.from({ length: 19 }, (_, i) => i + 1));
  assert.equal(nineteen.p95, null);
  assert.equal(nineteen.p99, null);

  const twenty = distribution(Array.from({ length: 20 }, (_, i) => i + 1));
  assert.notEqual(twenty.p95, null);
  assert.equal(twenty.p99, null);

  const hundred = distribution(Array.from({ length: 100 }, (_, i) => i + 1));
  assert.notEqual(hundred.p95, null);
  assert.notEqual(hundred.p99, null);
});
