import test from 'node:test';
import assert from 'node:assert/strict';
import { queryBatch, queryRange, SeerQueryError } from '../index.mjs';

function providerWithCalls(calls) {
  return Object.freeze({
    id: 'fake',
    async query({ calculationJdn, targetJdn }) {
      calls.push({ calculationJdn, targetJdn });
      return {
        record: {
          targetJdn: Number(targetJdn), year: 5000,
          cutletIndex: 0, dayInCutlet: 1,
          monthIndex: 0, dayInMonth: 1,
          cutletCount: 5, monthCount: 40,
        },
      };
    },
  });
}

const boundaryInstants = [];
const fakeBoundary = Object.freeze({
  async calculationDayAt(instant) {
    boundaryInstants.push(instant.getTime());
    return 1000n;
  },
  async dayBoundaries() {
    return { startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-01-02T00:00:00.000Z' };
  },
});

test('batch captures one instant and returns per-item validation errors', async () => {
  boundaryInstants.length = 0;
  const calls = [];
  const result = await queryBatch({
    queries: [
      { id: 'a', target: { offsetDays: '0' } },
      { id: 'bad', target: { gregorian: '2026-02-31' } },
      { id: 'b', target: { offsetDays: '2' } },
    ],
  }, {
    provider: providerWithCalls(calls),
    dayBoundaryService: fakeBoundary,
    now: new Date('2026-01-01T12:00:00Z'),
  });
  assert.deepEqual(result.results.map((x) => x.ok), [true, false, true]);
  assert.equal(result.results[1].error.code, 'INVALID_GREGORIAN_DATE');
  assert.equal(new Set(boundaryInstants).size, 1);
  assert.deepEqual(calls.map((x) => x.targetJdn), [1000n, 1002n]);
});

test('duplicate batch ids reject the envelope', async () => {
  await assert.rejects(
    () => queryBatch({ queries: [{ id: 'x' }, { id: 'x' }] }, { provider: providerWithCalls([]), dayBoundaryService: fakeBoundary }),
    (error) => error instanceof SeerQueryError && error.code === 'DUPLICATE_BATCH_ID',
  );
});

test('fixed range uses one fixed calculation day and exact step', async () => {
  const calls = [];
  const result = await queryRange({
    calculation: { jdn: '900' },
    start: { jdn: '1000' },
    count: '3',
    stepDays: '2',
    presentation: 'canonical',
  }, { provider: providerWithCalls(calls) });
  assert.equal(result.results.length, 3);
  assert.deepEqual(calls, [
    { calculationJdn: 900n, targetJdn: 1000n },
    { calculationJdn: 900n, targetJdn: 1002n },
    { calculationJdn: 900n, targetJdn: 1004n },
  ]);
});

test('descending range reaches endInclusive exactly', async () => {
  const calls = [];
  const result = await queryRange({
    calculation: { jdn: '900' },
    start: { jdn: '10' },
    endInclusive: { jdn: '4' },
    stepDays: '-2',
    presentation: 'canonical',
  }, { provider: providerWithCalls(calls) });
  assert.deepEqual(calls.map((x) => x.targetJdn), [10n, 8n, 6n, 4n]);
  assert.equal(result.results.length, 4);
});

test('unreachable range end is rejected rather than truncated', async () => {
  await assert.rejects(
    () => queryRange({ calculation: { jdn: '900' }, start: { jdn: '10' }, endInclusive: { jdn: '5' }, stepDays: '-2' }, { provider: providerWithCalls([]) }),
    (error) => error instanceof SeerQueryError && error.code === 'UNREACHABLE_RANGE_END',
  );
});

test('same-as-target with absolute start discards irrelevant calculation and observer', async () => {
  const calls = [];
  const result = await queryRange({
    calculationMode: 'same-as-target',
    calculation: { totallyInvalid: true },
    observer: { longitude: 999999 },
    start: { jdn: '50' },
    count: '2',
    presentation: 'canonical',
  }, { provider: providerWithCalls(calls) });
  assert.equal(result.results.length, 2);
  assert.deepEqual(calls, [
    { calculationJdn: 50n, targetJdn: 50n },
    { calculationJdn: 51n, targetJdn: 51n },
  ]);
  assert.equal(result.results[0].observer, undefined);
});

test('same-as-target boundaries make observer relevant again', async () => {
  await assert.rejects(
    () => queryRange({
      calculationMode: 'same-as-target',
      observer: { longitude: 999999 },
      start: { jdn: '50' },
      count: '1',
      include: ['boundaries'],
    }, { provider: providerWithCalls([]), dayBoundaryService: fakeBoundary }),
    (error) => error instanceof SeerQueryError && error.code === 'INVALID_LONGITUDE',
  );
});

test('same-as-target without start uses the resolved base day only to choose start', async () => {
  const calls = [];
  const result = await queryRange({
    calculationMode: 'same-as-target',
    count: '2',
    presentation: 'canonical',
  }, {
    provider: providerWithCalls(calls),
    dayBoundaryService: fakeBoundary,
    now: new Date('2026-01-01T12:00:00Z'),
  });
  assert.equal(result.results[0].targetDay.jdn, '1000');
  assert.deepEqual(calls, [
    { calculationJdn: 1000n, targetJdn: 1000n },
    { calculationJdn: 1001n, targetJdn: 1001n },
  ]);
});
