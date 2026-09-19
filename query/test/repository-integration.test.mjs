import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { queryBatch, queryDate, queryRange, queryReverse, queryYear } from '../index.mjs';
import { createExternalCacheFixture } from './helpers/external-cache-fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixture = await createExternalCacheFixture();
const generatedDir = fixture.generatedDir;

async function nativeAvailable() {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  try {
    await Promise.all([
      access(path.join(root, 'prototype', 'build', `seer_year_batch${suffix}`)),
      access(path.join(root, 'prototype', 'build', `seer_year_structure${suffix}`)),
    ]);
    return true;
  } catch {
    return false;
  }
}

test('shared query layer reads an external verified cache without changing its record semantics', async () => {
  const record = fixture.records[0];
  const result = await queryDate({
    calculation: { jdn: String(fixture.calcJdn) },
    target: { jdn: String(record.targetJdn) },
    presentation: 'canonical',
    include: ['structure', 'provenance'],
  }, { generatedDir });
  assert.equal(result.calculationDay.jdn, String(fixture.calcJdn));
  assert.equal(result.targetDay.jdn, String(record.targetJdn));
  assert.equal(result.pastafarianDate.year, String(record.year));
  assert.equal(result.pastafarianDate.cutlet.canonicalIndex, record.cutletIndex + 1);
  assert.equal(result.pastafarianDate.cutlet.day, record.dayInCutlet);
  assert.equal(result.pastafarianDate.month.canonicalIndex, record.monthIndex + 1);
  assert.equal(result.pastafarianDate.month.day, record.dayInMonth);
  assert.equal(result.structure.cutletCount, record.cutletCount);
  assert.equal(result.structure.monthCount, record.monthCount);
});

test('batch and fixed range share one external-cache provider contract', async () => {
  const first = fixture.targetStartJdn;
  const batch = await queryBatch({
    defaults: { calculation: { jdn: String(fixture.calcJdn) }, presentation: 'canonical' },
    queries: [
      { id: 'a', target: { jdn: String(first) } },
      { id: 'b', target: { jdn: String(first + 1) } },
    ],
  }, { generatedDir });
  assert.deepEqual(batch.results.map((x) => x.ok), [true, true]);

  const range = await queryRange({
    calculation: { jdn: String(fixture.calcJdn) },
    start: { jdn: String(first) },
    count: '3',
    presentation: 'canonical',
  }, { generatedDir });
  assert.deepEqual(range.results.map((x) => x.targetDay.jdn), [String(first), String(first + 1), String(first + 2)]);
});

test('rolling provider falls through to the exact engine for a complete year', async (t) => {
  if (!(await nativeAvailable())) return t.skip('native exact runtime is not built');
  const requestedYear = String(fixture.records[0].year);
  const result = await queryYear(
    requestedYear,
    { calculation: { jdn: String(fixture.calcJdn) }, presentation: 'canonical' },
    { generatedDir },
  );
  assert.equal(result.year.number, requestedYear);
  assert.ok(Number.isInteger(result.year.lengthDays));
  assert.ok(result.year.lengthDays >= 1);
  assert.equal(BigInt(result.year.endJdn) - BigInt(result.year.startJdn) + 1n, BigInt(result.year.lengthDays));
  assert.ok(Array.isArray(result.year.cutlets) && result.year.cutlets.length >= 1);
  assert.ok(Array.isArray(result.year.months) && result.year.months.length >= 1);
});

test('reverse conversion can use exact year logic with an external cache directory', async (t) => {
  if (!(await nativeAvailable())) return t.skip('native exact runtime is not built');
  const forward = await queryDate({
    calculation: { jdn: String(fixture.calcJdn) },
    target: { jdn: String(fixture.calcJdn + 30) },
    presentation: 'canonical',
  }, { generatedDir });
  const date = forward.pastafarianDate;
  const reversed = await queryReverse({
    calculation: { jdn: String(fixture.calcJdn) },
    pastafarianDate: {
      year: date.year,
      cutlet: { canonicalIndex: date.cutlet.canonicalIndex, day: date.cutlet.day },
      month: { canonicalIndex: date.month.canonicalIndex, day: date.month.day },
    },
    presentation: 'canonical',
  }, { generatedDir });
  assert.equal(reversed.targetDay.jdn, forward.targetDay.jdn);
});
