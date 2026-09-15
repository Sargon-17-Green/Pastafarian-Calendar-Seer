import test from 'node:test';
import assert from 'node:assert/strict';
import { gregorianToJdn, jdnToGregorian } from '../gregorian.mjs';

test('known Gregorian/JDN anchors', () => {
  assert.equal(gregorianToJdn('1970-01-01'), 2440588n);
  assert.equal(gregorianToJdn('2000-01-01'), 2451545n);
  assert.equal(gregorianToJdn('2026-09-15'), 2461299n);
  assert.deepEqual(jdnToGregorian(2461299n), { era: 'CE', year: '2026', month: 9, day: 15 });
});

test('BCE and far dates round-trip exactly', () => {
  const inputs = [
    { era: 'BCE', year: '1', month: 1, day: 1 },
    { era: 'BCE', year: '762', month: 6, day: 7 },
    { era: 'BCE', year: '41222', month: 12, day: 22 },
    { era: 'CE', year: '100000', month: 2, day: 28 },
  ];
  for (const input of inputs) assert.deepEqual(jdnToGregorian(gregorianToJdn(input)), input);
});
