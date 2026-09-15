import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPrecomputedProvider } from '../provider-precomputed.mjs';
import { fakeNodeExecutable, nodeScriptExecFile } from './helpers/fake-node-executable.mjs';

test('concurrent exact misses coalesce by calculation day and contiguous target run', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'seer-opt02-bulk-'));
  const generatedDir = path.join(root, 'generated');
  const dataDir = path.join(root, 'prototype', 'data');
  const callLog = path.join(root, 'calls.log');
  await mkdir(generatedDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  const batch = await fakeNodeExecutable(root, 'fake-batch', `
const fs = require('fs');
const [calc,start,count] = process.argv.slice(2).map(Number);
fs.appendFileSync(${JSON.stringify(callLog)}, JSON.stringify({calc,start,count})+'\\n');
const records = Array.from({length: count}, (_, i) => ({targetJdn:start+i,year:5000,cutletIndex:0,dayInCutlet:1,monthIndex:0,dayInMonth:1,cutletCount:1,monthCount:1}));
process.stdout.write(JSON.stringify({schema:1,engine:'fake-batch',calcJdn:calc,targetStartJdn:start,targetCount:count,records}));`);
  const locator = await fakeNodeExecutable(root, 'fake-locator', 'process.exit(2);');
  const cacheContext = Object.freeze({ async loadRecord() { throw new RangeError('cache miss'); } });
  const provider = createPrecomputedProvider({ generatedDir, yearBatchBinary: batch, yearLocatorBinary: locator, dataDir, cacheContext, execFileRunner: nodeScriptExecFile });

  const descending = Array.from({ length: 10 }, (_, i) => 1009n - BigInt(i));
  const answers = await Promise.all(descending.map((targetJdn) => provider.query({ calculationJdn: 900n, targetJdn })));
  assert.deepEqual(answers.map((x) => BigInt(x.record.targetJdn)), descending);
  let calls = (await readFile(callLog, 'utf8')).trim().split(/\n+/).map(JSON.parse);
  assert.deepEqual(calls, [{ calc: 900, start: 1000, count: 10 }]);

  await writeFile(callLog, '', 'utf8');
  const sparse = [1000n, 1001n, 5000n, 5001n, 5001n];
  const sparseAnswers = await Promise.all(sparse.map((targetJdn) => provider.query({ calculationJdn: 901n, targetJdn })));
  assert.deepEqual(sparseAnswers.map((x) => BigInt(x.record.targetJdn)), sparse);
  calls = (await readFile(callLog, 'utf8')).trim().split(/\n+/).filter(Boolean).map(JSON.parse);
  assert.deepEqual(calls, [
    { calc: 901, start: 1000, count: 2 },
    { calc: 901, start: 5000, count: 2 },
  ]);
});

test('different calculation days are never merged', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'seer-opt02-multicalc-'));
  const generatedDir = path.join(root, 'generated');
  const dataDir = path.join(root, 'prototype', 'data');
  const callLog = path.join(root, 'calls.log');
  await mkdir(generatedDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  const batch = await fakeNodeExecutable(root, 'fake-batch', `
const fs = require('fs'); const [calc,start,count]=process.argv.slice(2).map(Number);
fs.appendFileSync(${JSON.stringify(callLog)}, JSON.stringify({calc,start,count})+'\\n');
const records=Array.from({length:count},(_,i)=>({targetJdn:start+i,year:5000,cutletIndex:0,dayInCutlet:1,monthIndex:0,dayInMonth:1,cutletCount:1,monthCount:1}));
process.stdout.write(JSON.stringify({schema:1,engine:'fake-batch',calcJdn:calc,targetStartJdn:start,targetCount:count,records}));`);
  const locator = await fakeNodeExecutable(root, 'fake-locator', 'process.exit(2);');
  const cacheContext = Object.freeze({ async loadRecord() { throw new RangeError('cache miss'); } });
  const provider = createPrecomputedProvider({ generatedDir, yearBatchBinary: batch, yearLocatorBinary: locator, dataDir, cacheContext, execFileRunner: nodeScriptExecFile });
  await Promise.all([
    provider.query({ calculationJdn: 10n, targetJdn: 100n }),
    provider.query({ calculationJdn: 10n, targetJdn: 101n }),
    provider.query({ calculationJdn: 11n, targetJdn: 100n }),
    provider.query({ calculationJdn: 11n, targetJdn: 101n }),
  ]);
  const calls = (await readFile(callLog, 'utf8')).trim().split(/\n+/).map(JSON.parse).sort((a,b)=>a.calc-b.calc);
  assert.deepEqual(calls, [
    { calc: 10, start: 100, count: 2 },
    { calc: 11, start: 100, count: 2 },
  ]);
});

test('cache hits coexist with a coalesced exact-miss run', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'seer-opt02-mixed-'));
  const generatedDir = path.join(root, 'generated');
  const dataDir = path.join(root, 'prototype', 'data');
  const callLog = path.join(root, 'calls.log');
  await mkdir(generatedDir, { recursive: true }); await mkdir(dataDir, { recursive: true });
  const batch = await fakeNodeExecutable(root, 'fake-batch', `
const fs=require('fs'); const [calc,start,count]=process.argv.slice(2).map(Number);
fs.appendFileSync(${JSON.stringify(callLog)},JSON.stringify({calc,start,count})+'\\n');
const records=Array.from({length:count},(_,i)=>({targetJdn:start+i,year:5001,cutletIndex:1,dayInCutlet:1,monthIndex:1,dayInMonth:1,cutletCount:2,monthCount:2}));
process.stdout.write(JSON.stringify({schema:1,engine:'fake-batch',calcJdn:calc,targetStartJdn:start,targetCount:count,records}));`);
  const locator = await fakeNodeExecutable(root, 'fake-locator', 'process.exit(2);');
  const cacheContext = Object.freeze({
    async loadRecord(calcJdn, targetJdn) {
      if (targetJdn === 1000) return { record: { targetJdn, year: 4999, cutletIndex: 0, dayInCutlet: 1, monthIndex: 0, dayInMonth: 1, cutletCount: 1, monthCount: 1 }, index: { engineFingerprint: 'cache-engine' }, descriptor: { sha256: 'a'.repeat(64) } };
      throw new RangeError('cache miss');
    },
  });
  const provider = createPrecomputedProvider({ generatedDir, yearBatchBinary: batch, yearLocatorBinary: locator, dataDir, cacheContext, execFileRunner: nodeScriptExecFile });
  const answers = await Promise.all([1000n,1001n,1002n].map((targetJdn) => provider.query({ calculationJdn: 900n, targetJdn })));
  assert.deepEqual(answers.map((x) => x.record.year), [4999,5001,5001]);
  const calls = (await readFile(callLog,'utf8')).trim().split(/\n+/).map(JSON.parse);
  assert.deepEqual(calls,[{calc:900,start:1001,count:2}]);
});

test('bulk native failure falls back to individual queries and preserves per-item failures', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'seer-opt02-fallback-'));
  const generatedDir = path.join(root, 'generated');
  const dataDir = path.join(root, 'prototype', 'data');
  await mkdir(generatedDir, { recursive: true }); await mkdir(dataDir, { recursive: true });
  const batch = await fakeNodeExecutable(root, 'fake-batch', `
const [calc,start,count]=process.argv.slice(2).map(Number);
if(count>1 || start===1001) process.exit(7);
const records=[{targetJdn:start,year:5000,cutletIndex:0,dayInCutlet:1,monthIndex:0,dayInMonth:1,cutletCount:1,monthCount:1}];
process.stdout.write(JSON.stringify({schema:1,engine:'fake-batch',calcJdn:calc,targetStartJdn:start,targetCount:1,records}));`);
  const locator = await fakeNodeExecutable(root, 'fake-locator', 'process.exit(2);');
  const cacheContext = Object.freeze({ async loadRecord() { throw new RangeError('cache miss'); } });
  const provider = createPrecomputedProvider({ generatedDir, yearBatchBinary: batch, yearLocatorBinary: locator, dataDir, cacheContext, execFileRunner: nodeScriptExecFile });
  const settled = await Promise.allSettled([1000n,1001n,1002n].map((targetJdn)=>provider.query({calculationJdn:900n,targetJdn})));
  assert.deepEqual(settled.map((x)=>x.status), ['fulfilled','rejected','fulfilled']);
  assert.equal(settled[1].reason.code, 'SEER_UNAVAILABLE');
});
