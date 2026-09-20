import test from 'node:test';
import assert from 'node:assert/strict';
import { queryDate } from '../index.mjs';

const fakeProvider = Object.freeze({
  id: 'fake',
  async query({ calculationJdn, targetJdn }) {
    assert.equal(typeof calculationJdn, 'bigint');
    assert.equal(typeof targetJdn, 'bigint');
    return {
      record: {
        targetJdn: Number(targetJdn), year: 5000,
        cutletIndex: 14, dayInCutlet: 346,
        monthIndex: 22, dayInMonth: 22,
        cutletCount: 8, monthCount: 47,
      },
      provenance: { engineRevision: 'test-engine', dataRevision: 'test-data' },
    };
  },
});

const fakeBoundary = Object.freeze({
  async calculationDayAt(instant, longitude) {
    assert.ok(instant instanceof Date);
    assert.equal(typeof longitude, 'number');
    return 1000n;
  },
  async dayBoundaries(jdn, longitude) {
    assert.equal(typeof jdn, 'bigint');
    assert.equal(typeof longitude, 'number');
    return { startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-01-02T00:00:00.000Z' };
  },
});

test('public canonicalIndex is one-based and English names use canonical catalog', async () => {
  const result = await queryDate({ calculation: { jdn: '2461299' } }, { provider: fakeProvider });
  assert.equal(result.pastafarianDate.cutlet.canonicalIndex, 15);
  assert.equal(result.pastafarianDate.cutlet.name, 'Akkad');
  assert.equal(result.pastafarianDate.month.canonicalIndex, 23);
  assert.equal(result.pastafarianDate.month.name, 'Honey');
  assert.equal(result.pastafarianDate.year, '5000');
  assert.equal(result.observer, undefined);
});

test('canonical presentation ignores locale', async () => {
  const result = await queryDate({ calculation: { jdn: '2461299' }, locale: 'not-a-locale', presentation: 'canonical' }, { provider: fakeProvider });
  assert.equal(result.locale, undefined);
  assert.equal(result.formatted, undefined);
  assert.equal(result.pastafarianDate.cutlet.name, undefined);
});

test('no-op-only observer is ignored when calculation JDN is explicit', async () => {
  const result = await queryDate({ calculation: { jdn: '2461299' }, observer: { latitude: 'nonsense', elevationMeters: { anything: true } } }, { provider: fakeProvider });
  assert.equal(result.observer, undefined);
});

test('offset target is exact', async () => {
  const result = await queryDate({ calculation: { jdn: '2461299' }, target: { offsetDays: '5' } }, { provider: fakeProvider });
  assert.equal(result.targetDay.jdn, '2461304');
  assert.deepEqual(result.targetDay.gregorian, { era: 'CE', year: '2026', month: 9, day: 20 });
});

test('structure exposes only structure actually supplied by provider/cache', async () => {
  const result = await queryDate({ calculation: { jdn: '2461299' }, include: ['structure'] }, { provider: fakeProvider });
  assert.deepEqual(result.structure, { cutletCount: 8, monthCount: 47 });
});

test('no-op-only observer defaults to Kisurra when an instant must be resolved', async () => {
  const result = await queryDate(
    { observer: { latitude: 'ignored', elevationMeters: null } },
    { provider: fakeProvider, dayBoundaryService: fakeBoundary, now: new Date('2026-01-01T12:00:00Z') },
  );
  assert.deepEqual(result.observer, { longitude: 45.481 });
  assert.equal(result.calculationDay.jdn, '1000');
  assert.equal(Object.prototype.hasOwnProperty.call(result.observer, 'latitude'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result.observer, 'elevationMeters'), false);
});

test('boundaries make observer relevant', async () => {
  const result = await queryDate(
    { calculation: { jdn: '1000' }, observer: { longitude: 12.5 }, include: ['boundaries'] },
    { provider: fakeProvider, dayBoundaryService: fakeBoundary },
  );
  assert.deepEqual(result.observer, { longitude: 12.5 });
  assert.deepEqual(result.boundaries, { startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-01-02T00:00:00.000Z' });
});


test('duplicate include values are rejected rather than silently deduplicated', async () => {
  await assert.rejects(
    () => queryDate(
      { calculation: { jdn: '2461299' }, include: ['structure', 'structure'] },
      { provider: fakeProvider },
    ),
    (error) => error?.code === 'UNSUPPORTED_INCLUDE' && error?.field === 'include',
  );
});


test('structural request shape is enforced even when fields are semantically irrelevant', async () => {
  for (const request of [
    { calculation: { jdn: '2461299' }, observer: null },
    { calculation: { jdn: '2461299' }, observer: { mystery: 1 } },
    { calculation: { jdn: '2461299' }, presentation: 'canonical', locale: 7 },
  ]) {
    await assert.rejects(
      () => queryDate(request, { provider: fakeProvider }),
      (error) => ['INVALID_OBSERVER', 'UNKNOWN_PARAMETER', 'INVALID_LOCALE'].includes(error?.code),
    );
  }
});

test('null observer selectors are schema-valid no-ops when observer is relevant', async () => {
  const result = await queryDate(
    {
      calculation: { at: '2026-01-01T12:00:00Z' },
      observer: { preset: null, longitude: null },
      presentation: 'canonical',
    },
    { provider: fakeProvider, dayBoundaryService: fakeBoundary },
  );
  assert.deepEqual(result.observer, { longitude: 45.481 });
  assert.equal(result.calculationDay.jdn, '1000');
});
