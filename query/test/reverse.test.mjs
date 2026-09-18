import test from 'node:test';
import assert from 'node:assert/strict';
import { queryReverse, SeerQueryError } from '../index.mjs';

const rawYear = {
  number: 5000,
  startJdn: 1000,
  endJdn: 1007,
  lengthDays: 8,
  cutlets: [
    { cutletIndex: 2, startOffset: 0, endOffset: 3, lengthDays: 4 },
    { cutletIndex: 5, startOffset: 4, endOffset: 7, lengthDays: 4 },
  ],
  months: [
    { monthIndex: 7, lengthDays: 4 },
    { monthIndex: 4, lengthDays: 4 },
  ],
};

const records = new Map([
  [1000n, { targetJdn: 1000, year: 5000, cutletIndex: 2, dayInCutlet: 1, monthIndex: 7, dayInMonth: 1, cutletCount: 2, monthCount: 2 }],
  [1001n, { targetJdn: 1001, year: 5000, cutletIndex: 2, dayInCutlet: 2, monthIndex: 4, dayInMonth: 1, cutletCount: 2, monthCount: 2 }],
  [1002n, { targetJdn: 1002, year: 5000, cutletIndex: 2, dayInCutlet: 3, monthIndex: 7, dayInMonth: 2, cutletCount: 2, monthCount: 2 }],
]);

function provider() {
  return {
    id: 'reverse-fixture',
    async year({ calculationJdn, year, includeDays }) {
      assert.equal(calculationJdn, 900n);
      assert.equal(year, 5000n);
      assert.equal(includeDays, false);
      return { year: rawYear, provenance: { engineRevision: 'fixture-year' } };
    },
    async query({ calculationJdn, targetJdn }) {
      assert.equal(calculationJdn, 900n);
      const record = records.get(targetJdn);
      if (!record) throw new Error(`unexpected target ${targetJdn}`);
      return { record, provenance: { engineRevision: 'fixture-day' } };
    },
  };
}

function request(overrides = {}) {
  return {
    calculation: { jdn: '900' },
    pastafarianDate: {
      year: '5000',
      cutlet: { canonicalIndex: 3, day: 2 },
      month: { canonicalIndex: 5, day: 1 },
    },
    ...overrides,
  };
}

test('reverse conversion resolves a complete canonical Pastafarian tuple', async () => {
  const result = await queryReverse(request({ include: ['provenance', 'resolution'] }), { provider: provider() });
  assert.equal(result.calculationDay.jdn, '900');
  assert.equal(result.targetDay.jdn, '1001');
  assert.equal(result.pastafarianDate.year, '5000');
  assert.equal(result.pastafarianDate.cutlet.canonicalIndex, 3);
  assert.equal(result.pastafarianDate.cutlet.day, 2);
  assert.equal(result.pastafarianDate.month.canonicalIndex, 5);
  assert.equal(result.pastafarianDate.month.day, 1);
  assert.equal(result.provenance.engineRevision, 'fixture-day');
  assert.equal(result.resolution.targetSource, 'pastafarian-date');
});

test('reverse conversion supports canonical presentation without localized names', async () => {
  const result = await queryReverse(request({ presentation: 'canonical' }), { provider: provider() });
  assert.equal(result.locale, undefined);
  assert.equal(result.formatted, undefined);
  assert.equal(result.pastafarianDate.cutlet.name, undefined);
  assert.equal(result.pastafarianDate.month.name, undefined);
});

test('reverse conversion localizes only presentation fields', async () => {
  const en = await queryReverse(request({ locale: 'en' }), { provider: provider() });
  const he = await queryReverse(request({ locale: 'he' }), { provider: provider() });
  assert.equal(he.locale, 'he');
  assert.match(he.formatted, /^שנה /);
  assert.equal(he.targetDay.jdn, en.targetDay.jdn);
  assert.equal(he.pastafarianDate.year, en.pastafarianDate.year);
  assert.equal(he.pastafarianDate.cutlet.canonicalIndex, en.pastafarianDate.cutlet.canonicalIndex);
  assert.equal(he.pastafarianDate.cutlet.day, en.pastafarianDate.cutlet.day);
  assert.equal(he.pastafarianDate.month.canonicalIndex, en.pastafarianDate.month.canonicalIndex);
  assert.equal(he.pastafarianDate.month.day, en.pastafarianDate.month.day);
});

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error instanceof SeerQueryError && error.code === code);
}

test('reverse conversion rejects coordinates that do not occur in the requested year', async () => {
  await expectCode(queryReverse(request({
    pastafarianDate: { year: '5000', cutlet: { canonicalIndex: 4, day: 1 }, month: { canonicalIndex: 5, day: 1 } },
  }), { provider: provider() }), 'PASTAFARIAN_DATE_NOT_IN_YEAR');
  await expectCode(queryReverse(request({
    pastafarianDate: { year: '5000', cutlet: { canonicalIndex: 3, day: 5 }, month: { canonicalIndex: 5, day: 1 } },
  }), { provider: provider() }), 'PASTAFARIAN_DATE_NOT_IN_YEAR');
});

test('reverse conversion detects inconsistent cutlet and month coordinates', async () => {
  await expectCode(queryReverse(request({
    pastafarianDate: { year: '5000', cutlet: { canonicalIndex: 3, day: 2 }, month: { canonicalIndex: 8, day: 1 } },
  }), { provider: provider() }), 'PASTAFARIAN_DATE_CONFLICT');
});

test('reverse conversion validates the complete canonical tuple shape', async () => {
  await expectCode(queryReverse({ calculation: { jdn: '900' } }, { provider: provider() }), 'MISSING_PASTAFARIAN_DATE');
  await expectCode(queryReverse(request({
    pastafarianDate: { year: '5000', cutlet: { canonicalIndex: 18, day: 1 }, month: { canonicalIndex: 5, day: 1 } },
  }), { provider: provider() }), 'INVALID_PASTAFARIAN_DATE');
  await expectCode(queryReverse(request({
    pastafarianDate: { year: '5000', cutlet: { canonicalIndex: 3, day: 2 }, month: { canonicalIndex: 5, day: 124 } },
  }), { provider: provider() }), 'INVALID_PASTAFARIAN_DATE');
});
