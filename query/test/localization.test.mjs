import test from 'node:test';
import assert from 'node:assert/strict';
import { queryDate, queryYear, SeerQueryError } from '../index.mjs';
import {
  getLocalePack,
  listLocales,
  localizedName,
  validateLocalePack,
} from '../locales/catalog.mjs';

const record = Object.freeze({
  targetJdn: 101,
  year: 5000,
  cutletIndex: 14,
  dayInCutlet: 346,
  monthIndex: 22,
  dayInMonth: 22,
  cutletCount: 8,
  monthCount: 47,
});

const rawYear = Object.freeze({
  number: 5000,
  startJdn: 100,
  endJdn: 101,
  lengthDays: 2,
  cutlets: Object.freeze([
    Object.freeze({ cutletIndex: 0, lengthDays: 1, startOffset: 0, endOffset: 0 }),
    Object.freeze({ cutletIndex: 16, lengthDays: 1, startOffset: 1, endOffset: 1 }),
  ]),
  months: Object.freeze([
    Object.freeze({ monthIndex: 0, lengthDays: 1 }),
    Object.freeze({ monthIndex: 46, lengthDays: 1 }),
  ]),
});

const provider = Object.freeze({
  id: 'localization-fixture',
  async query() {
    return {
      record,
      provenance: { engineRevision: 'same-engine', dataRevision: 'same-data' },
    };
  },
  async year({ includeDays }) {
    assert.equal(includeDays, false);
    return { year: rawYear, provenance: { engineRevision: 'same-engine' } };
  },
});

function stripPresentation(value) {
  if (Array.isArray(value)) return value.map(stripPresentation);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'locale' || key === 'formatted' || key === 'name') continue;
    out[key] = stripPresentation(item);
  }
  return out;
}

test('locale catalog is complete, immutable and discoverable', () => {
  const locales = listLocales();
  assert.deepEqual(locales.map((x) => x.code), ['en', 'he']);
  assert.equal(Object.isFrozen(locales), true);
  assert.equal(locales[0].default, true);
  assert.equal(locales[1].selfName, 'עברית');
  assert.equal(locales[1].direction, 'rtl');
  assert.equal(locales[1].properNamePolicy, 'english-retained');

  for (const code of ['en', 'he']) {
    const pack = getLocalePack(code);
    assert.equal(validateLocalePack(pack), pack);
    assert.equal(Object.isFrozen(pack), true);
    assert.equal(Object.isFrozen(pack.cutlets), true);
    assert.equal(Object.isFrozen(pack.months), true);
    assert.equal(pack.cutlets.length, 17);
    assert.equal(pack.months.length, 47);
    assert.equal(new Set(pack.cutlets).size, 17);
    assert.equal(new Set(pack.months).size, 47);
    for (let index = 1; index <= 17; index += 1) {
      assert.equal(typeof localizedName(pack, 'cutlet', index), 'string');
    }
    for (let index = 1; index <= 47; index += 1) {
      assert.equal(typeof localizedName(pack, 'month', index), 'string');
    }
  }
});

test('English uses the locale pack and preserves the v1 output', async () => {
  const result = await queryDate(
    { calculation: { jdn: '100' }, locale: 'EN' },
    { provider },
  );
  assert.equal(result.locale, 'en');
  assert.equal(result.pastafarianDate.cutlet.name, 'Akkad');
  assert.equal(result.pastafarianDate.month.name, 'Honey');
  assert.equal(result.formatted, 'Year 5000 — Akkad, day 346; Honey, day 22');
});

test('Hebrew localizes only presentation fields', async () => {
  const canonical = await queryDate(
    { calculation: { jdn: '100' }, presentation: 'canonical', include: ['provenance'] },
    { provider },
  );
  const english = await queryDate(
    { calculation: { jdn: '100' }, locale: 'en', include: ['provenance'] },
    { provider },
  );
  const hebrew = await queryDate(
    { calculation: { jdn: '100' }, locale: 'HE', include: ['provenance'] },
    { provider },
  );
  assert.equal(hebrew.locale, 'he');
  assert.match(hebrew.formatted, /^שנה /);
  assert.match(hebrew.formatted, /\u20685000\u2069/);
  assert.match(hebrew.formatted, /\u2068Akkad\u2069/);
  assert.equal(hebrew.pastafarianDate.cutlet.name, 'Akkad');
  assert.equal(hebrew.pastafarianDate.month.name, 'Honey');
  assert.deepEqual(stripPresentation(english), canonical);
  assert.deepEqual(stripPresentation(hebrew), canonical);
});

test('locale validation is strict only when presentation is full', async () => {
  await assert.rejects(
    queryDate({ calculation: { jdn: '100' }, locale: 'en_us' }, { provider }),
    (error) => error instanceof SeerQueryError && error.code === 'INVALID_LOCALE',
  );
  await assert.rejects(
    queryDate({ calculation: { jdn: '100' }, locale: 'en-US' }, { provider }),
    (error) => error instanceof SeerQueryError && error.code === 'LOCALE_NOT_SUPPORTED',
  );
  await assert.rejects(
    queryDate({ calculation: { jdn: '100' }, locale: '../../he' }, { provider }),
    (error) => error instanceof SeerQueryError && error.code === 'INVALID_LOCALE',
  );
  const baseline = await queryDate(
    { calculation: { jdn: '100' }, presentation: 'canonical' },
    { provider },
  );
  const canonical = await queryDate(
    {
      calculation: { jdn: '100' },
      presentation: 'canonical',
      locale: '../../not-a-locale',
    },
    { provider },
  );
  assert.deepEqual(canonical, baseline);
  assert.equal(canonical.locale, undefined);
});

test('year structures are invariant across locales including maximum indices', async () => {
  const canonical = await queryYear(
    '5000',
    { calculation: { jdn: '100' }, presentation: 'canonical' },
    { provider },
  );
  const en = await queryYear('5000', { calculation: { jdn: '100' }, locale: 'en' }, { provider });
  const he = await queryYear('5000', { calculation: { jdn: '100' }, locale: 'he' }, { provider });
  assert.equal(en.year.cutlets.at(-1).canonicalIndex, 17);
  assert.equal(he.year.months.at(-1).canonicalIndex, 47);
  assert.equal(en.year.cutlets.at(-1).name, 'The Empty Jar');
  assert.equal(he.year.months.at(-1).name, 'Sand');
  assert.deepEqual(stripPresentation(en), canonical);
  assert.deepEqual(stripPresentation(he), canonical);
});

test('locale-pack validator rejects incomplete and structurally unsafe packs', () => {
  const en = getLocalePack('en');
  assert.throws(
    () => validateLocalePack({ ...en, cutlets: en.cutlets.slice(0, 16) }),
    /exactly 17 cutlet names/,
  );
  assert.throws(
    () => validateLocalePack({ ...en, months: [...en.months.slice(0, 46), en.months[0]] }),
    /duplicate month display name/,
  );
  assert.throws(
    () => validateLocalePack({ ...en, code: 'EN' }),
    /canonical BCP 47 casing/,
  );
  assert.throws(
    () => validateLocalePack({ ...en, direction: 'sideways' }),
    /direction/,
  );
});
