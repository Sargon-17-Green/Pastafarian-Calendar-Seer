import test from 'node:test';
import assert from 'node:assert/strict';
import { queryRange } from '../index.mjs';
import { createPrecomputedProvider } from '../provider-precomputed.mjs';

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
