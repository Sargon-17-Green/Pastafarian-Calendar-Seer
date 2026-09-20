import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createExactAdmission } from '../concurrency.mjs';
import { queryBatch } from '../index.mjs';
import { queryError } from '../errors.mjs';
import { createPrecomputedProvider } from '../provider-precomputed.mjs';

function fixtureRecord(targetJdn) {
  return {
    targetJdn,
    year: 5000,
    cutletIndex: 0,
    dayInCutlet: 1,
    monthIndex: 0,
    dayInMonth: 1,
    cutletCount: 1,
    monthCount: 1,
  };
}

test('provider telemetry reports real cache hit/miss and exact work without query values', async () => {
  const events = [];
  const telemetry = {
    cache(event) { events.push(['cache', event]); },
    exactWork(event) { events.push(['exact', event]); },
  };
  const exactEngine = {
    async queryRange({ targetStartJdn, count }) {
      return {
        records: Array.from({ length: count }, (_, i) => fixtureRecord(Number(targetStartJdn) + i)),
        provenance: { engineRevision: 'fixture' },
      };
    },
    async query() { return { record: fixtureRecord(11), structure: {}, provenance: {} }; },
    async year() {
      return {
        year: {
          number: 5000, startJdn: 10, endJdn: 10, lengthDays: 1,
          cutlets: [], months: [],
        },
        provenance: {},
      };
    },
  };
  const cacheContext = {
    async loadRecord(_calc, target) {
      if (target !== 10) throw new Error('miss');
      return {
        record: fixtureRecord(10),
        index: { engineFingerprint: 'engine-fixture' },
        descriptor: { sha256: 'data-fixture' },
      };
    },
  };

  const provider = createPrecomputedProvider({
    generatedDir: 'unused-fixture-dir',
    cacheContext,
    expectedEngineFingerprint: 'engine-fixture',
    exactEngine,
    telemetry,
  });

  await provider.query({ calculationJdn: 1n, targetJdn: 10n });
  await provider.query({ calculationJdn: 1n, targetJdn: 11n });
  await provider.year({ calculationJdn: 1n, year: 5000n });

  assert.deepEqual(events.filter(([kind]) => kind === 'cache').map(([, e]) => e.outcome), ['hit', 'miss']);
  assert.ok(events.some(([kind, event]) =>
    kind === 'exact' && event.operation === 'range' && event.items === 1 && event.unit === 'day'));
  assert.ok(events.some(([kind, event]) =>
    kind === 'exact' && event.operation === 'year' && event.items === 1 && event.unit === 'year'));
  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes('calculationJdn'), false);
  assert.equal(serialized.includes('targetJdn'), false);
});

test('exact admission telemetry reports queue depth and saturation including rejection', async () => {
  const events = [];
  const admission = createExactAdmission({
    maxConcurrency: 1,
    maxQueue: 1,
    scope: 'test-admission',
    telemetry: { queue(event) { events.push(event); } },
  });

  let releaseFirst;
  const first = admission.run(() => new Promise((resolve) => { releaseFirst = resolve; }));
  await new Promise((resolve) => setImmediate(resolve));
  const second = admission.run(async () => 'second');
  await new Promise((resolve) => setImmediate(resolve));

  await assert.rejects(
    admission.run(async () => 'third'),
    (error) => error?.code === 'SEER_UNAVAILABLE',
  );
  releaseFirst('first');
  assert.equal(await first, 'first');
  assert.equal(await second, 'second');

  assert.ok(events.some((event) => event.saturated && event.queued === 1));
  assert.ok(events.some((event) => event.rejected === true));
  assert.deepEqual(
    { active: events.at(-1).active, queued: events.at(-1).queued },
    { active: 0, queued: 0 },
  );
});

test('batch item failures emit a typed error hook while preserving HTTP-style partial success semantics', async () => {
  const errors = [];
  const result = await queryBatch({
    queries: [{
      id: 'item-1',
      calculation: { jdn: '100' },
      target: { jdn: '101' },
      presentation: 'canonical',
    }],
  }, {
    provider: {
      async query() { throw queryError('SEER_UNAVAILABLE', 'fixture unavailable'); },
    },
    telemetry: { error(event) { errors.push(event); } },
    now: new Date('2026-09-20T00:00:00Z'),
  });

  assert.equal(result.results[0].ok, false);
  assert.equal(result.results[0].error.code, 'SEER_UNAVAILABLE');
  assert.deepEqual(errors, [{ code: 'SEER_UNAVAILABLE', scope: 'query-batch-item' }]);
});
