import test from 'node:test';
import assert from 'node:assert/strict';
import { queryBatch, queryRange } from '../index.mjs';
import { createPrecomputedProvider } from '../provider-precomputed.mjs';
import { fileURLToPath } from 'node:url';
import { createExactAdmission } from '../concurrency.mjs';
import { createExactEngine } from '../exact-engine.mjs';
import { queryError } from '../errors.mjs';

const missCache = Object.freeze({
  async loadRecord() { throw new RangeError('cache miss'); },
});

function record(targetJdn) {
  return {
    targetJdn: Number(targetJdn),
    year: 5000,
    cutletIndex: 0,
    dayInCutlet: 1,
    monthIndex: 0,
    dayInMonth: 1,
    cutletCount: 1,
    monthCount: 1,
  };
}

function instrumentedExact({ bulkFailure, badTarget } = {}) {
  let active = 0;
  let peak = 0;
  let rangeCalls = 0;
  let itemCalls = 0;
  const ranges = [];
  async function enter(work) {
    active += 1;
    peak = Math.max(peak, active);
    await Promise.resolve();
    try {
      return await work();
    } finally {
      active -= 1;
    }
  }

  const engine = Object.freeze({
    async queryRange({ calculationJdn, targetStartJdn, count }) {
      rangeCalls += 1;
      ranges.push({ calculationJdn, targetStartJdn, count });
      return enter(() => {
        if (bulkFailure) throw bulkFailure();
        return {
          records: Array.from(
            { length: count },
            (_, i) => record(BigInt(targetStartJdn) + BigInt(i)),
          ),
          provenance: { engineRevision: 'fake-exact' },
        };
      });
    },
    async query({ calculationJdn, targetJdn }) {
      itemCalls += 1;
      return enter(() => {
        if (badTarget !== undefined && BigInt(targetJdn) === BigInt(badTarget)) {
          throw queryError(
            'TARGET_OUT_OF_SUPPORTED_DOMAIN',
            'fake item target outside domain',
          );
        }
        const value = record(targetJdn);
        return {
          record: value,
          structure: { cutletCount: 1, monthCount: 1 },
          provenance: { engineRevision: 'fake-exact' },
        };
      });
    },
  });

  return {
    engine,
    stats: () => ({ active, peak, rangeCalls, itemCalls, ranges }),
  };
}

function providerFor(fake, maxExactConcurrency = 8) {
  return createPrecomputedProvider({
    generatedDir: 'unused-by-fake-provider',
    cacheContext: missCache,
    exactEngine: fake.engine,
    maxExactConcurrency,
  });
}
test('10,000 same-as-target items keep exact concurrency bounded and ordered', async () => {
  const fake = instrumentedExact();
  const limit = 8;
  const provider = providerFor(fake, limit);

  const result = await queryRange({
    calculationMode: 'same-as-target',
    start: { jdn: '3000000' },
    count: '10000',
    presentation: 'canonical',
  }, { provider, maxRangeItems: 10000 });

  const stats = fake.stats();
  assert.equal(result.results.length, 10000);
  assert.equal(result.results[0].targetDay.jdn, '3000000');
  assert.equal(result.results[9999].targetDay.jdn, '3009999');
  assert.equal(stats.rangeCalls, 10000);
  assert.equal(stats.peak, limit);
});

test('10,000 logical misses preserve duplicate dedup and contiguous-run coalescing', async () => {
  const fake = instrumentedExact();
  const provider = providerFor(fake, 8);
  const targets = Array.from(
    { length: 10000 },
    (_, i) => 4000000n + BigInt(i % 1000),
  );

  const answers = await Promise.all(
    targets.map((targetJdn) => provider.query({
      calculationJdn: 2461303n,
      targetJdn,
    })),
  );
  const stats = fake.stats();
  assert.equal(answers.length, 10000);
  assert.equal(stats.rangeCalls, 1);
  assert.equal(stats.itemCalls, 0);
  assert.equal(stats.ranges[0].count, 1000);
  assert.equal(answers[0].record.targetJdn, 4000000);
  assert.equal(answers[1000].record.targetJdn, 4000000);
});

test('provider-wide bulk failure does not trigger N expensive item retries', async () => {
  const fake = instrumentedExact({
    bulkFailure: () => queryError('SEER_UNAVAILABLE', 'fake exact infrastructure failure'),
  });
  const provider = providerFor(fake, 4);
  const settled = await Promise.allSettled(
    Array.from({ length: 1000 }, (_, i) => provider.query({
      calculationJdn: 2461303n,
      targetJdn: 5000000n + BigInt(i),
    })),
  );

  const stats = fake.stats();
  assert.equal(stats.rangeCalls, 1);
  assert.equal(stats.itemCalls, 0);
  assert.ok(settled.every((item) =>
    item.status === 'rejected' && item.reason?.code === 'SEER_UNAVAILABLE'));
});
test('target-domain bulk failure preserves per-item batch errors and ordering', async () => {
  const badTarget = 6000017n;
  const fake = instrumentedExact({
    bulkFailure: () => queryError(
      'TARGET_OUT_OF_SUPPORTED_DOMAIN',
      'fake range crosses target domain',
    ),
    badTarget,
  });
  const provider = providerFor(fake, 4);

  const response = await queryBatch({
    defaults: {
      calculation: { jdn: '2461303' },
      presentation: 'canonical',
    },
    queries: Array.from({ length: 32 }, (_, i) => ({
      id: `item-${i}`,
      target: { jdn: String(6000000 + i) },
    })),
  }, { provider });

  assert.deepEqual(
    response.results.map((item) => item.id),
    Array.from({ length: 32 }, (_, i) => `item-${i}`),
  );
  assert.equal(response.results[17].ok, false);
  assert.equal(
    response.results[17].error.code,
    'TARGET_OUT_OF_SUPPORTED_DOMAIN',
  );
  assert.ok(response.results.every((item, i) => i === 17 || item.ok));
  const stats = fake.stats();
  assert.equal(stats.rangeCalls, 1);
  assert.equal(stats.itemCalls, 32);
  assert.equal(stats.peak, 1);
});

test('exact admission queue is bounded and reports overload explicitly', async () => {
  const admission = createExactAdmission({ maxConcurrency: 2, maxQueue: 2 });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let active = 0;
  let peak = 0;
  const task = () => admission.run(async () => {
    active += 1;
    peak = Math.max(peak, active);
    try {
      await gate;
    } finally {
      active -= 1;
    }
  });

  const accepted = [task(), task(), task(), task()];
  await assert.rejects(
    task(),
    (error) =>
      error?.code === 'SEER_UNAVAILABLE'
      && error?.details?.admissionFailure === 'overloaded',
  );
  assert.equal(peak, 2);
  release();
  await Promise.all(accepted);
  assert.equal(active, 0);
});
test('oversized decimal range count is rejected before BigInt construction', async () => {
  const provider = Object.freeze({
    id: 'must-not-run',
    async query() {
      assert.fail('provider must not be reached for oversized count');
    },
  });
  const huge = '9'.repeat(1_000_000);
  await assert.rejects(
    queryRange({
      calculation: { jdn: '900' },
      start: { jdn: '1000' },
      count: huge,
      presentation: 'canonical',
    }, { provider }),
    (error) => error?.code === 'REQUEST_TOO_LARGE' && error?.field === 'count',
  );
});

test('process-wide admission bounds one-shot fallback across engine instances', async () => {
  const generatedDir = fileURLToPath(new URL('../../generated/', import.meta.url));
  const placeholderBinary = fileURLToPath(new URL('../exact-engine.mjs', import.meta.url));
  let active = 0;
  let peak = 0;
  let calls = 0;

  const execFileRunner = async (_binary, args) => {
    calls += 1;
    active += 1;
    peak = Math.max(peak, active);
    try {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const [calc, start, count] = args.map(Number);
      return {
        stdout: JSON.stringify({
          schema: 1,
          engine: 'fake-one-shot',
          calcJdn: calc,
          targetStartJdn: start,
          targetCount: count,
          records: Array.from(
            { length: count },
            (_, i) => record(start + i),
          ),
        }),
        stderr: '',
      };
    } finally {
      active -= 1;
    }
  };

  const unavailableSpawn = () => {
    const error = new Error('fake persistent service unavailable');
    error.code = 'ENOENT';
    throw error;
  };

  const engines = Array.from({ length: 40 }, () => createExactEngine({
    generatedDir,
    engineServiceBinary: placeholderBinary,
    yearBatchBinary: placeholderBinary,
    execFileRunner,
    serviceSpawnRunner: unavailableSpawn,
    maxConcurrency: 64,
    maxQueue: 64,
  }));
  const answers = await Promise.all(engines.map((engine, i) =>
    engine.queryRange({
      calculationJdn: 2461303,
      targetStartJdn: 7000000 + i,
      count: 1,
    })));

  assert.equal(answers.length, 40);
  assert.equal(calls, 40);
  assert.ok(peak > 1, `expected useful parallelism, got peak=${peak}`);
  assert.ok(peak <= 8, `process-wide exact peak exceeded default: ${peak}`);
});
