import test from 'node:test';
import assert from 'node:assert/strict';
import { queryCalculationDay, queryYear, SeerQueryError } from '../index.mjs';

const fakeBoundary = Object.freeze({
  async calculationDayAt(instant, longitude) {
    assert.ok(instant instanceof Date);
    assert.equal(longitude, 45.481);
    return 1000n;
  },
  async dayBoundaries(jdn, longitude) {
    assert.equal(jdn, 1000n);
    assert.equal(longitude, 45.481);
    return { startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-01-02T00:00:00.000Z' };
  },
});

test('calculation-day returns only effective longitude, never latitude/elevation', async () => {
  const result = await queryCalculationDay({
    observer: { latitude: 'ignored', elevationMeters: { ignored: true } },
    include: ['boundaries'],
  }, { dayBoundaryService: fakeBoundary, now: new Date('2026-01-01T12:00:00Z') });
  assert.deepEqual(result, {
    at: '2026-01-01T12:00:00.000Z',
    jdn: '1000',
    observer: { longitude: 45.481 },
    boundaries: { startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-01-02T00:00:00.000Z' },
  });
});

const yearProvider = Object.freeze({
  id: 'year-fixture',
  async query() { throw new Error('not used'); },
  async year({ calculationJdn, year, includeDays }) {
    assert.equal(calculationJdn, 900n);
    assert.equal(year, 5000n);
    assert.equal(includeDays, true);
    return {
      year: {
        number: 5000n,
        lengthDays: 2,
        startJdn: 100n,
        endJdn: 101n,
        cutlets: [
          { cutletIndex: 14, lengthDays: 2, startOffset: 0, endOffset: 1 },
        ],
        months: [
          { monthIndex: 22, lengthDays: 2 },
        ],
        days: [
          { targetJdn: 100, year: 5000, cutletIndex: 14, dayInCutlet: 1, monthIndex: 22, dayInMonth: 1 },
          { targetJdn: 101, year: 5000, cutletIndex: 14, dayInCutlet: 2, monthIndex: 22, dayInMonth: 2 },
        ],
      },
      provenance: { engineRevision: 'fixture' },
    };
  },
});

test('year query maps provider internal indices to canonical one-based names', async () => {
  const result = await queryYear('5000', {
    calculation: { jdn: '900' },
    include: ['days', 'provenance', 'resolution'],
  }, { provider: yearProvider });
  assert.equal(result.year.number, '5000');
  assert.equal(result.year.cutlets[0].canonicalIndex, 15);
  assert.equal(result.year.cutlets[0].name, 'Akkad');
  assert.equal(result.year.months[0].canonicalIndex, 23);
  assert.equal(result.year.months[0].name, 'Honey');
  assert.equal(result.year.days.length, 2);
  assert.equal(result.year.days[0].pastafarianDate.cutlet.canonicalIndex, 15);
  assert.deepEqual(result.provenance, { engineRevision: 'fixture' });
  assert.equal(result.resolution.calculationSource, 'explicit-jdn');
});

test('provider without complete-year capability fails explicitly', async () => {
  await assert.rejects(
    () => queryYear('5000', { calculation: { jdn: '900' } }, { provider: { id: 'date-only', async query() {} } }),
    (error) => error instanceof SeerQueryError && error.code === 'SEER_UNAVAILABLE',
  );
});
