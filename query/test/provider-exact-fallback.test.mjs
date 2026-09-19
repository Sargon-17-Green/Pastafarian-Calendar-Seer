import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPrecomputedProvider } from '../provider-precomputed.mjs';
import { fakeNodeExecutable, nodeScriptExecFile } from './helpers/fake-node-executable.mjs';

test('cache miss falls through to exact batch and exact year reconstruction', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'seer-exact-fallback-'));
  const generatedDir = path.join(root, 'generated');
  const dataDir = path.join(root, 'prototype', 'data');
  await mkdir(generatedDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  await writeFile(path.join(generatedDir, 'index.json'), JSON.stringify({ caches: [] }), 'utf8');

  const batch = await fakeNodeExecutable(root, 'fake-batch', String.raw`
const [calc, start, count] = process.argv.slice(2).map(Number);
const records=[];
for(let i=0;i<count;i++) records.push({targetJdn:start+i,year:5000,cutletIndex:i<2?2:5,dayInCutlet:i<2?i+1:i-1,monthIndex:i%2?4:7,dayInMonth:i<2?1:2,cutletCount:2,monthCount:2});
process.stdout.write(JSON.stringify({schema:1,engine:'fake-exact-batch',calcJdn:calc,targetStartJdn:start,targetCount:count,records}));`);
  const locator = await fakeNodeExecutable(root, 'fake-locator', String.raw`
const [calc, number] = process.argv.slice(2).map(Number);
process.stdout.write(JSON.stringify({schema:1,engine:'fake-locator',calcJdn:calc,year:number,startJdn:100,endJdn:103,lengthDays:4}));`);
  const structure = await fakeNodeExecutable(root, 'fake-structure', String.raw`
const [calc, number, includeDays] = process.argv.slice(2);
const records=[];
for(let i=0;i<8;i++) records.push({targetJdn:100+i,year:Number(number),cutletIndex:i<4?2:5,dayInCutlet:(i%4)+1,monthIndex:i<4?7:4,dayInMonth:(i%4)+1,cutletCount:2,monthCount:2});
process.stdout.write(JSON.stringify({schema:1,engine:'fake-structure',calcJdn:Number(calc),year:Number(number),startJdn:100,endJdn:107,lengthDays:8,cutlets:[{cutletIndex:2,startOffset:0,endOffset:3,lengthDays:4},{cutletIndex:5,startOffset:4,endOffset:7,lengthDays:4}],months:[{monthIndex:7,lengthDays:4},{monthIndex:4,lengthDays:4}],...(includeDays==='1'?{days:records}:{})}));`);

  const provider = createPrecomputedProvider({ generatedDir, yearBatchBinary: batch, yearLocatorBinary: locator, yearStructureBinary: structure, dataDir, execFileRunner: nodeScriptExecFile });
  const result = await provider.query({ calculationJdn: 2461300n, targetJdn: 2462000n });
  assert.equal(result.record.targetJdn, 2462000);
  assert.equal(result.provenance.engineRevision, 'fake-exact-batch');

  const fullYear = await provider.year({ calculationJdn: 2461300n, year: 5000n, includeDays: true });
  assert.equal(fullYear.year.number, 5000);
  assert.equal(fullYear.year.lengthDays, 8);
  assert.equal(fullYear.year.cutlets.length, 2);
  assert.equal(fullYear.year.months.length, 2);
  assert.equal(fullYear.year.days.length, 8);
  assert.equal(fullYear.provenance.engineRevision, 'fake-structure');
});


test('corrupt cache is a performance miss and falls through to exact', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'seer-corrupt-cache-fallback-'));
  const generatedDir = path.join(root, 'generated');
  const dataDir = path.join(root, 'prototype', 'data');
  await mkdir(generatedDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  const batch = await fakeNodeExecutable(root, 'fake-corrupt-fallback-batch', String.raw`
const [calc,start,count]=process.argv.slice(2).map(Number);
const records=Array.from({length:count},(_,i)=>({targetJdn:start+i,year:6001,cutletIndex:1,dayInCutlet:2,monthIndex:3,dayInMonth:4,cutletCount:5,monthCount:6}));
process.stdout.write(JSON.stringify({schema:1,engine:'exact-after-corrupt-cache',calcJdn:calc,targetStartJdn:start,targetCount:count,records}));`);
  const locator = await fakeNodeExecutable(root, 'fake-corrupt-fallback-locator', 'process.exit(2);');
  const cacheContext = Object.freeze({
    async loadRecord() { throw new Error('checksum mismatch'); },
  });
  const provider = createPrecomputedProvider({
    generatedDir, yearBatchBinary: batch, yearLocatorBinary: locator,
    dataDir, cacheContext, execFileRunner: nodeScriptExecFile,
  });
  const result = await provider.query({ calculationJdn: 900n, targetJdn: 1000n });
  assert.equal(result.record.year, 6001);
  assert.equal(result.provenance.engineRevision, 'exact-after-corrupt-cache');
});


test('engine-incompatible cache hit is ignored and exact result wins', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'seer-incompatible-cache-fallback-'));
  const generatedDir = path.join(root, 'generated');
  const dataDir = path.join(root, 'prototype', 'data');
  await mkdir(generatedDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  const batch = await fakeNodeExecutable(root, 'fake-incompatible-fallback-batch', String.raw`
const [calc,start,count]=process.argv.slice(2).map(Number);
const records=Array.from({length:count},(_,i)=>({targetJdn:start+i,year:7002,cutletIndex:2,dayInCutlet:3,monthIndex:4,dayInMonth:5,cutletCount:6,monthCount:7}));
process.stdout.write(JSON.stringify({schema:1,engine:'exact-after-fingerprint-miss',calcJdn:calc,targetStartJdn:start,targetCount:count,records}));`);
  const locator = await fakeNodeExecutable(root, 'fake-incompatible-fallback-locator', 'process.exit(2);');
  const cacheContext = Object.freeze({
    async loadRecord(calcJdn, targetJdn) {
      return {
        record: { targetJdn, year: 1, cutletIndex: 0, dayInCutlet: 1, monthIndex: 0, dayInMonth: 1, cutletCount: 1, monthCount: 1 },
        index: { engineFingerprint: 'wrong-engine' },
        descriptor: { sha256: 'a'.repeat(64), calcJdn },
      };
    },
  });
  const provider = createPrecomputedProvider({
    generatedDir, yearBatchBinary: batch, yearLocatorBinary: locator,
    dataDir, cacheContext, expectedEngineFingerprint: 'right-engine',
    execFileRunner: nodeScriptExecFile,
  });
  const result = await provider.query({ calculationJdn: 901n, targetJdn: 1001n });
  assert.equal(result.record.year, 7002);
  assert.equal(result.provenance.engineRevision, 'exact-after-fingerprint-miss');
});
