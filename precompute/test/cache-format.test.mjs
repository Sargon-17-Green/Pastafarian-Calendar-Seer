import assert from 'node:assert/strict';
import test from 'node:test';
import { activeCalcFromIndex, lookupRecord, validateBatchCache } from '../lib/cache-format.mjs';

const index = {
  schema: 1,
  boundaries: [
    { calcJdn: 100, utc: '2026-09-14T23:17:18.093Z' },
    { calcJdn: 101, utc: '2026-09-15T23:15:19.798Z' },
    { calcJdn: 102, utc: '2026-09-16T23:13:16.559Z' },
  ],
};
const cache = {
  schema: 1,
  calcJdn: 101,
  targetStartJdn: 101,
  targetCount: 2,
  records: [
    { targetJdn: 101, year: 1, cutletIndex: 1, dayInCutlet: 1, monthIndex: 2, dayInMonth: 1, cutletCount: 5, monthCount: 12 },
    { targetJdn: 102, year: 1, cutletIndex: 1, dayInCutlet: 2, monthIndex: 2, dayInMonth: 2, cutletCount: 5, monthCount: 12 },
  ],
};

test('index switches calculation day at the exact precomputed instant', () => {
  assert.equal(activeCalcFromIndex(index, '2026-09-15T23:15:19.797Z'), 100);
  assert.equal(activeCalcFromIndex(index, '2026-09-15T23:15:19.798Z'), 101);
});

test('lookup is indexed and rejects targets outside cache coverage', () => {
  validateBatchCache(cache, { calcJdn: 101, targetCount: 2 });
  assert.equal(lookupRecord(index, cache, '2026-09-15T23:15:20Z', 102).dayInMonth, 2);
  assert.throws(() => lookupRecord(index, cache, '2026-09-15T23:15:20Z', 103), /outside the precomputed/);
});
