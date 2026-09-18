import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertSingleSelector,
  buildDateRequest,
  buildNowRequest,
  buildRangeRequest,
  dateSummary,
  errorPresentation,
  normalizeApiBase,
  readInitialUrlState,
  writeShareableUrl,
} from '../model.mjs';

const baseState = {
  presentation: 'canonical',
  calculationMode: 'jdn',
  calculationJdn: '2461302',
  calculationAt: '',
  observerMode: 'kisurra',
  longitude: '',
};

test('form state maps to one canonical date request without calendar logic', () => {
  assert.deepEqual(buildDateRequest({
    ...baseState,
    targetKind: 'gregorian',
    targetGregorian: '2026-09-20',
    targetJdn: 'unused',
    targetOffset: 'unused',
  }), {
    observer: { preset: 'kisurra' },
    calculation: { jdn: '2461302' },
    presentation: 'canonical',
    target: { gregorian: '2026-09-20' },
    include: ['resolution'],
  });
});

test('selector exclusivity rejects zero or multiple target selectors', () => {
  assert.throws(() => assertSingleSelector({}), /exactly one selector/);
  assert.throws(() => assertSingleSelector({ jdn: '1', offsetDays: '2' }), /exactly one selector/);
  assert.deepEqual(assertSingleSelector({ jdn: '1' }), { jdn: '1' });
});

test('range maps count and same-as-target without coercing exact integers', () => {
  const request = buildRangeRequest({
    ...baseState,
    rangeStartKind: 'jdn',
    rangeStartJdn: '-13337246',
    rangeStartGregorian: '',
    rangeStartOffset: '',
    rangeEndMode: 'count',
    rangeCount: '9007199254740993',
    rangeEndKind: 'jdn',
    rangeEndJdn: '',
    rangeEndGregorian: '',
    rangeEndOffset: '',
    rangeStepDays: '-2',
    rangeCalculationMode: 'same-as-target',
  });
  assert.equal(request.start.jdn, '-13337246');
  assert.equal(request.count, '9007199254740993');
  assert.equal(request.stepDays, '-2');
  assert.equal(request.calculationMode, 'same-as-target');
});

test('API base normalization supports same-origin and rejects credentials', () => {
  assert.equal(normalizeApiBase(''), '');
  assert.equal(normalizeApiBase('https://seer.example///'), 'https://seer.example');
  assert.equal(normalizeApiBase('/seer/'), '/seer');
  assert.throws(() => normalizeApiBase('https://user:secret@seer.example'), /Credentials/);
});

test('date response maps to the values rendered by the UI', () => {
  const summary = dateSummary({
    calculationDay: { jdn: '2461302' },
    observer: { longitude: 45.481 },
    targetDay: { jdn: '2461304', gregorian: { era: 'CE', year: '2026', month: 9, day: 20 } },
    pastafarianDate: {
      year: '5000',
      cutlet: { canonicalIndex: 5, name: 'Demo cutlet', day: 351 },
      month: { canonicalIndex: 33, name: 'Demo month', day: 69 },
    },
    formatted: 'formatted result',
  });
  assert.equal(summary.calculationJdn, '2461302');
  assert.equal(summary.gregorian, '2026-09-20');
  assert.equal(summary.cutlet, 'Demo cutlet · #5, day 351');
  assert.equal(summary.month, 'Demo month · #33, day 69');
});

test('error UI preserves authoritative API status/code/details and special-cases exact unavailability', () => {
  const view = errorPresentation({
    status: 503,
    code: 'SEER_UNAVAILABLE',
    message: 'exact provider absent',
    field: 'target.jdn',
    details: { provider: 'native' },
  });
  assert.equal(view.category, 'Exact Seer operation unavailable');
  assert.equal(view.status, 503);
  assert.equal(view.code, 'SEER_UNAVAILABLE');
  assert.deepEqual(view.details, { provider: 'native' });
  assert.match(view.explanation, /does not by itself mean the date is invalid/i);
});

test('full presentation forwards the discovered locale without browser translations', () => {
  const request = buildNowRequest({
    ...baseState,
    presentation: 'full',
    locale: 'he',
  });
  assert.equal(request.presentation, 'full');
  assert.equal(request.locale, 'he');
  assert.equal(request.observer.preset, 'kisurra');
});

test('canonical presentation omits locale even when one is selected', () => {
  const request = buildNowRequest({
    ...baseState,
    presentation: 'canonical',
    locale: 'he',
  });
  assert.equal(request.presentation, 'canonical');
  assert.equal(Object.prototype.hasOwnProperty.call(request, 'locale'), false);
});

test('shareable URL preserves full-presentation locale and parses it back', () => {
  const url = writeShareableUrl({
    mode: 'date',
    apiBase: '',
    targetKind: 'gregorian',
    target: '2026-09-20',
    calculationMode: 'jdn',
    calculation: '2461302',
    presentation: 'full',
    locale: 'he',
  }, 'https://seer.example/web/');
  const parsed = readInitialUrlState(url);
  assert.equal(parsed.presentation, 'full');
  assert.equal(parsed.locale, 'he');
});
