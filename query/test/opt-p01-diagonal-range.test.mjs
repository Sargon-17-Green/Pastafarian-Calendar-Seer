import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { queryRange } from '../index.mjs';
import { createPrecomputedProvider } from '../provider-precomputed.mjs';
import { createExactEngine, closeExactEngineServicesForTests } from '../exact-engine.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const generatedDir = path.join(root, 'generated');
const dataDir = path.join(root, 'prototype', 'data');

function shaped(day, provenance = { engineRevision: 'exact-engine' }) {
  return {
    record: {
      targetJdn: Number(day), year: 5000,
      cutletIndex: 0, dayInCutlet: 1,
      monthIndex: 0, dayInMonth: 1,
      cutletCount: 5, monthCount: 40,
    },
    structure: { cutletCount: 5, monthCount: 40 },
    provenance,
  };
}

test('same-as-target ranges shorter than eight items stay on the canonical per-item path', async () => {
  let diagonalCalls = 0;
  let queryCalls = 0;
  const provider = Object.freeze({
    id: 'fake',
    async query({ calculationJdn, targetJdn }) {
      queryCalls += 1;
      assert.equal(calculationJdn, targetJdn);
      return shaped(targetJdn);
    },
    async queryDiagonal() {
      diagonalCalls += 1;
      throw new Error('short range must not use diagonal prefetch');
    },
  });
  const result = await queryRange({
    start: { jdn: '1000' }, count: '4', calculationMode: 'same-as-target', presentation: 'canonical',
  }, { provider });
  assert.equal(result.results.length, 4);
  assert.equal(diagonalCalls, 0);
  assert.equal(queryCalls, 4);
});

test('same-as-target ranges of eight items use one diagonal prefetch while preserving response construction', async () => {
  let diagonalCalls = 0;
  let queryCalls = 0;
  const provider = Object.freeze({
    id: 'fake',
    async query() {
      queryCalls += 1;
      throw new Error('prefetched records should satisfy every date query');
    },
    async queryDiagonal({ targetStartJdn, count, stepDays }) {
      diagonalCalls += 1;
      return Array.from({ length: count }, (_, i) => shaped(targetStartJdn + BigInt(i) * stepDays));
    },
  });
  const result = await queryRange({
    start: { jdn: '1000' }, count: '8', stepDays: '2', calculationMode: 'same-as-target',
    presentation: 'canonical', include: ['provenance'],
  }, { provider });
  assert.equal(result.results.length, 8);
  assert.equal(diagonalCalls, 1);
  assert.equal(queryCalls, 0);
  assert.deepEqual(result.results.map((x) => x.targetDay.jdn), ['1000','1002','1004','1006','1008','1010','1012','1014']);
  assert.ok(result.results.every((x) => x.provenance.engineRevision === 'exact-engine'));
});

test('invalid observer is rejected before diagonal prefetch', async () => {
  let diagonalCalls = 0;
  const provider = Object.freeze({
    id: 'must-not-run',
    async query() { throw new Error('provider must not run'); },
    async queryDiagonal() {
      diagonalCalls += 1;
      throw new Error('diagonal prefetch must not run');
    },
  });
  await assert.rejects(
    queryRange({
      start: { jdn: '1000' },
      count: '8',
      calculationMode: 'same-as-target',
      observer: null,
      presentation: 'canonical',
    }, { provider }),
    (error) => error?.code === 'INVALID_OBSERVER' && error?.field === 'observer',
  );
  assert.equal(diagonalCalls, 0);
});

test('cache hit inside a large diagonal range is preserved and exact misses split around it', async () => {
  const exactCalls = [];
  const exactEngine = Object.freeze({
    async queryDiagonal({ targetStartJdn, count, stepDays }) {
      exactCalls.push({ targetStartJdn, count, stepDays });
      return {
        records: Array.from({ length: count }, (_, i) => shaped(targetStartJdn + BigInt(i) * stepDays).record),
        provenance: { engineRevision: 'exact-engine' },
      };
    },
    async queryRange() { throw new Error('unexpected per-item fallback'); },
    async year() { throw new Error('not used'); },
  });
  const cacheContext = Object.freeze({
    async loadRecord(_calc, target) {
      if (target !== 1010) throw new RangeError('miss');
      return {
        record: shaped(1010n).record,
        index: { engineFingerprint: 'engine-fingerprint' },
        descriptor: { sha256: 'd'.repeat(64) },
      };
    },
  });
  const provider = createPrecomputedProvider({
    generatedDir: '/unused', cacheContext, exactEngine,
    expectedEngineFingerprint: 'engine-fingerprint',
  });
  const values = await provider.queryDiagonal({ targetStartJdn: 1000n, count: 20, stepDays: 1n });
  assert.deepEqual(exactCalls, [
    { targetStartJdn: 1000n, count: 10, stepDays: 1n },
    { targetStartJdn: 1011n, count: 9, stepDays: 1n },
  ]);
  assert.equal(values[10].provenance.engineRevision, 'engine-fingerprint');
  assert.equal(values[10].provenance.dataRevision, 'd'.repeat(64));
  assert.equal(values[9].provenance.engineRevision, 'exact-engine');
  assert.equal(values[11].provenance.engineRevision, 'exact-engine');
});


function legacyServiceSpawnRunner({ rejectAll = false } = {}) {
  return (_binary, _args, options) => {
    const source = String.raw`
const readline = require('node:readline');
const rejectAll = ${JSON.stringify(rejectAll)};
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  if (line === 'X') process.exit(0);
  const f = line.split(String.fromCharCode(9));
  if (!rejectAll && f[0] === 'R' && f.length === 4) {
    const calc = Number(f[1]), start = Number(f[2]), count = Number(f[3]);
    const records = Array.from({ length: count }, (_, i) => ({
      targetJdn: start + i, year: 5000, cutletIndex: 0, dayInCutlet: 1,
      monthIndex: 0, dayInMonth: 1, cutletCount: 5, monthCount: 40,
    }));
    process.stdout.write(JSON.stringify({
      schema: 1, engine: 'legacy-r-service', calcJdn: calc,
      targetStartJdn: start, targetCount: count, records,
    }) + String.fromCharCode(10));
    return;
  }
  process.stdout.write(JSON.stringify({
    schema: 1, ok: false, error: 'unknown service command',
  }) + String.fromCharCode(10));
});
`;
    return spawn(process.execPath, ['--input-type=commonjs', '-e', source], {
      ...options,
      cwd: root,
      env: { ...process.env },
    });
  };
}

function exactEngineForFallback(t, {
  serviceSpawnRunner,
  execFileRunner,
  maxConcurrency = 4,
  requireService = false,
} = {}) {
  const oldRequire = process.env.SEER_REQUIRE_ENGINE_SERVICE;
  if (requireService) process.env.SEER_REQUIRE_ENGINE_SERVICE = '1';
  else delete process.env.SEER_REQUIRE_ENGINE_SERVICE;
  closeExactEngineServicesForTests();
  t.after(() => {
    closeExactEngineServicesForTests();
    if (oldRequire == null) delete process.env.SEER_REQUIRE_ENGINE_SERVICE;
    else process.env.SEER_REQUIRE_ENGINE_SERVICE = oldRequire;
  });
  return createExactEngine({
    generatedDir,
    dataDir,
    engineServiceBinary: path.join(root, 'query', 'exact-engine.mjs'),
    yearBatchBinary: path.join(root, 'query', 'exact-engine.mjs'),
    serviceSpawnRunner,
    ...(execFileRunner ? { execFileRunner } : {}),
    maxConcurrency,
    timeoutMs: 2000,
  });
}

test('new JS falls back to legacy R when required service does not implement D', async (t) => {
  const engine = exactEngineForFallback(t, {
    serviceSpawnRunner: legacyServiceSpawnRunner(),
    requireService: true,
  });
  const result = await engine.queryDiagonal({
    targetStartJdn: 2000,
    count: 8,
    stepDays: 2,
  });
  assert.deepEqual(
    result.records.map((record) => record.targetJdn),
    [2000, 2002, 2004, 2006, 2008, 2010, 2012, 2014],
  );
  assert.equal(result.provenance.engineRevision, 'legacy-r-service');
});

test('one-shot diagonal fallback preserves bounded exact concurrency', async (t) => {
  let calls = 0;
  let active = 0;
  let peak = 0;
  const execFileRunner = async (_binary, args) => {
    calls += 1;
    active += 1;
    peak = Math.max(peak, active);
    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      const [calc, start, count] = args.map(Number);
      return {
        stdout: JSON.stringify({
          schema: 1,
          engine: 'fake-one-shot',
          calcJdn: calc,
          targetStartJdn: start,
          targetCount: count,
          records: Array.from({ length: count }, (_, i) => ({
            targetJdn: start + i, year: 5000,
            cutletIndex: 0, dayInCutlet: 1,
            monthIndex: 0, dayInMonth: 1,
            cutletCount: 5, monthCount: 40,
          })),
        }),
        stderr: '',
      };
    } finally {
      active -= 1;
    }
  };
  const engine = exactEngineForFallback(t, {
    serviceSpawnRunner: legacyServiceSpawnRunner({ rejectAll: true }),
    execFileRunner,
    maxConcurrency: 4,
    requireService: false,
  });
  const result = await engine.queryDiagonal({
    targetStartJdn: 3000,
    count: 8,
    stepDays: 3,
  });
  assert.deepEqual(
    result.records.map((record) => record.targetJdn),
    [3000, 3003, 3006, 3009, 3012, 3015, 3018, 3021],
  );
  assert.equal(calls, 8);
  assert.equal(peak, 4);
  assert.equal(result.provenance.engineRevision, 'fake-one-shot');
});
