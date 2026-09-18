import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { queryBatch, queryDate, queryRange, queryReverse, queryYear, SeerQueryError } from '../index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const generatedDir = path.resolve(here, '..', '..', 'generated');

async function fixture() {
  const index = JSON.parse(await readFile(path.join(generatedDir, 'index.json'), 'utf8'));
  const descriptor = index.caches[0];
  assert.ok(descriptor);
  const cache = JSON.parse(await readFile(path.join(generatedDir, descriptor.path), 'utf8'));
  assert.ok(cache.records.length >= 3);
  return { descriptor, cache };
}

test('shared query layer reads a real generated cache without changing its semantics', async () => {
  const { descriptor, cache } = await fixture();
  const record = cache.records[0];
  const result = await queryDate({
    calculation: { jdn: String(descriptor.calcJdn) },
    target: { jdn: String(record.targetJdn) },
    presentation: 'canonical',
    include: ['structure', 'provenance'],
  }, { generatedDir });
  assert.equal(result.calculationDay.jdn, String(descriptor.calcJdn));
  assert.equal(result.targetDay.jdn, String(record.targetJdn));
  assert.equal(result.pastafarianDate.year, String(record.year));
  assert.equal(result.pastafarianDate.cutlet.canonicalIndex, record.cutletIndex + 1);
  assert.equal(result.pastafarianDate.cutlet.day, record.dayInCutlet);
  assert.equal(result.pastafarianDate.month.canonicalIndex, record.monthIndex + 1);
  assert.equal(result.pastafarianDate.month.day, record.dayInMonth);
  assert.equal(result.structure.cutletCount, record.cutletCount);
  assert.equal(result.structure.monthCount, record.monthCount);
});

test('batch and fixed range share the same real precomputed provider semantics', async () => {
  const { descriptor, cache } = await fixture();
  const first = cache.records[0].targetJdn;
  const batch = await queryBatch({
    defaults: { calculation: { jdn: String(descriptor.calcJdn) }, presentation: 'canonical' },
    queries: [
      { id: 'a', target: { jdn: String(first) } },
      { id: 'b', target: { jdn: String(first + 1) } },
    ],
  }, { generatedDir });
  assert.deepEqual(batch.results.map((x) => x.ok), [true, true]);

  const range = await queryRange({
    calculation: { jdn: String(descriptor.calcJdn) },
    start: { jdn: String(first) },
    count: '3',
    presentation: 'canonical',
  }, { generatedDir });
  assert.deepEqual(range.results.map((x) => x.targetDay.jdn), [String(first), String(first + 1), String(first + 2)]);
});

test('rolling provider falls through to the exact engine for a complete year', async () => {
  const { descriptor, cache } = await fixture();
  const requestedYear = String(cache.records[0].year);
  const result = await queryYear(
    requestedYear,
    {
      calculation: { jdn: String(descriptor.calcJdn) },
      presentation: 'canonical',
    },
    { generatedDir },
  );
  assert.equal(result.year.number, requestedYear);
  assert.ok(Number.isInteger(result.year.lengthDays));
  assert.ok(result.year.lengthDays >= 1);
  assert.equal(
    BigInt(result.year.endJdn) - BigInt(result.year.startJdn) + 1n,
    BigInt(result.year.lengthDays),
  );
  assert.ok(Array.isArray(result.year.cutlets) && result.year.cutlets.length >= 1);
  assert.ok(Array.isArray(result.year.months) && result.year.months.length >= 1);
});

test('reverse conversion round-trips a real generated record through the exact year provider', async () => {
  const { descriptor, cache } = await fixture();
  const record = cache.records[Math.min(2, cache.records.length - 1)];
  const reversed = await queryReverse({
    calculation: { jdn: String(descriptor.calcJdn) },
    pastafarianDate: {
      year: String(record.year),
      cutlet: { canonicalIndex: record.cutletIndex + 1, day: record.dayInCutlet },
      month: { canonicalIndex: record.monthIndex + 1, day: record.dayInMonth },
    },
    presentation: 'canonical',
  }, { generatedDir });
  assert.equal(reversed.targetDay.jdn, String(record.targetJdn));
  assert.equal(reversed.pastafarianDate.year, String(record.year));
  assert.equal(reversed.pastafarianDate.cutlet.canonicalIndex, record.cutletIndex + 1);
  assert.equal(reversed.pastafarianDate.month.canonicalIndex, record.monthIndex + 1);
});
