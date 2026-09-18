#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  queryDate,
  queryRange,
  queryReverse,
  queryYear,
} from '../index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const fixturePath = path.join(here, 'fixtures', 'architecture-conformance.json');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
if (fixture.foundationJdn !== -13334246) throw new Error('Seer Foundation JDN fixture mismatch');
process.env.SEER_REQUIRE_ENGINE_SERVICE = '1';

function elapsed(start) {
  return Number((performance.now() - start).toFixed(3));
}
function canonicalRequest(calculationJdn, targetJdn) {
  return {
    calculation: { jdn: String(calculationJdn) },
    target: { jdn: String(targetJdn) },
    presentation: 'canonical',
  };
}
async function time(label, fn) {
  const start = performance.now();
  const value = await fn();
  console.error(JSON.stringify({ metric: label, milliseconds: elapsed(start) }));
  return value;
}

const dates = {};
for (const item of fixture.dateCases) {
  dates[item.name] = await time(`date:${item.name}`, () =>
    queryDate(canonicalRequest(item.calculationJdn, item.targetJdn)));
}

const ranges = {};
for (const item of fixture.rangeCases) {
  const request = {
    start: { jdn: String(item.startJdn) },
    count: String(item.count),
    presentation: 'canonical',
    ...(item.calculationMode ? { calculationMode: item.calculationMode } : {}),
    ...(item.calculationJdn == null ? {} : { calculation: { jdn: String(item.calculationJdn) } }),
  };
  ranges[item.name] = await time(`range:${item.name}`, () => queryRange(request));
}

const years = {};
for (const item of fixture.yearCases) {
  years[item.name] = await time(`year:${item.name}`, () => queryYear(String(item.year), {
    calculation: { jdn: String(item.calculationJdn) },
    presentation: 'canonical',
  }));
}
const reverseSource = dates['cross-foundation'];
if (!reverseSource) throw new Error('missing cross-foundation source case');
const reverseRequest = {
  calculation: { jdn: reverseSource.calculationDay.jdn },
  pastafarianDate: {
    year: reverseSource.pastafarianDate.year,
    cutlet: {
      canonicalIndex: reverseSource.pastafarianDate.cutlet.canonicalIndex,
      day: reverseSource.pastafarianDate.cutlet.day,
    },
    month: {
      canonicalIndex: reverseSource.pastafarianDate.month.canonicalIndex,
      day: reverseSource.pastafarianDate.month.day,
    },
  },
  presentation: 'canonical',
};
const reverse = await time('reverse:cross-foundation', () => queryReverse(reverseRequest));
if (reverse.targetDay.jdn !== reverseSource.targetDay.jdn) {
  throw new Error('reverse target mismatch');
}

years['reverse-source-year'] = await time('year:reverse-source', () => queryYear(
  reverseSource.pastafarianDate.year,
  {
    calculation: { jdn: reverseSource.calculationDay.jdn },
    presentation: 'canonical',
  },
));
const alternateMonth = years['reverse-source-year'].year.months.find(
  (item) => item.canonicalIndex !== reverseSource.pastafarianDate.month.canonicalIndex,
);
if (!alternateMonth) throw new Error('reverse conflict fixture requires at least two months');
const conflictRequest = {
  ...reverseRequest,
  pastafarianDate: {
    ...reverseRequest.pastafarianDate,
    month: { canonicalIndex: alternateMonth.canonicalIndex, day: 1 },
  },
};

const repeated = await time('date:persistent-repeat', () =>
  queryDate(canonicalRequest(
    fixture.dateCases[2].calculationJdn,
    fixture.dateCases[2].targetJdn + 1,
  )));
const negBytes = await readFile(path.join(root, 'prototype', 'data', 'gates_negative_u16.bin'));
let negativeSpan = 0;
for (let i = 0; i < negBytes.length; i += 2) negativeSpan += negBytes.readUInt16LE(i);
const lowerGateDay = fixture.foundationJdn - negativeSpan;

async function captureCode(label, operation) {
  try {
    await operation();
  } catch (error) {
    if (typeof error?.code !== 'string') throw error;
    console.error(JSON.stringify({ semanticError: label, code: error.code }));
    return error.code;
  }
  throw new Error(`${label} unexpectedly succeeded`);
}

const errors = {
  calculationBelowDomain: await captureCode('calculationBelowDomain', () =>
    queryDate(canonicalRequest(lowerGateDay, fixture.foundationJdn))),
  targetBelowDomain: await captureCode('targetBelowDomain', () =>
    queryDate(canonicalRequest(fixture.foundationJdn, lowerGateDay))),
  reverseConflict: await captureCode('reverseConflict', () => queryReverse(conflictRequest)),
};

const snapshot = {
  schema: 1,
  foundationJdn: fixture.foundationJdn,
  dates,
  ranges,
  years,
  reverse,
  repeated,
  errors,
};
const expectedPath = path.join(here, 'fixtures', 'architecture-conformance.expected.json');
if (!process.argv.includes('--record')) {
  const expected = JSON.parse(await readFile(expectedPath, 'utf8'));
  if (JSON.stringify(snapshot) !== JSON.stringify(expected)) {
    throw new Error('architecture conformance output differs from canonical expected fixture');
  }
}

const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
if (outputArg) {
  await writeFile(outputArg.slice('--output='.length), serialized, 'utf8');
} else {
  process.stdout.write(serialized);
}

const counter = process.env.SEER_TEST_SERVICE_SPAWN_COUNTER_FILE;
if (counter) {
  const lines = (await readFile(counter, 'utf8')).split(/\r?\n/).filter(Boolean);
  if (lines.length !== 1) {
    throw new Error(`expected one persistent service spawn, got ${lines.length}`);
  }
  console.error(JSON.stringify({ persistentServiceSpawns: lines.length }));
}
