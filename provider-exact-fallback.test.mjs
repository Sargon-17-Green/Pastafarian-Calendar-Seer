import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPrecomputedProvider } from '../provider-precomputed.mjs';

async function fakeExecutable(dir, name, body) {
  const file = path.join(dir, name);
  await writeFile(file, `#!/usr/bin/env node\n${body}\n`, 'utf8');
  await chmod(file, 0o755);
  return file;
}

test('cache miss falls through to exact batch and exact year reconstruction', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'seer-exact-fallback-'));
  const generatedDir = path.join(root, 'generated');
  const dataDir = path.join(root, 'prototype', 'data');
  await mkdir(generatedDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  await writeFile(path.join(generatedDir, 'index.json'), JSON.stringify({ caches: [] }), 'utf8');

  const batch = await fakeExecutable(root, 'fake-batch', String.raw`
const [calc, start, count] = process.argv.slice(2).map(Number);
const records=[];
for(let i=0;i<count;i++) records.push({targetJdn:start+i,year:5000,cutletIndex:i<2?2:5,dayInCutlet:i<2?i+1:i-1,monthIndex:i%2?4:7,dayInMonth:i<2?1:2,cutletCount:2,monthCount:2});
process.stdout.write(JSON.stringify({schema:1,engine:'fake-exact-batch',calcJdn:calc,targetStartJdn:start,targetCount:count,records})+'\\n');`);
  const locator = await fakeExecutable(root, 'fake-locator', String.raw`
const [calc, number] = process.argv.slice(2).map(Number);
process.stdout.write(JSON.stringify({schema:1,engine:'fake-locator',calcJdn:calc,year:number,startJdn:100,endJdn:103,lengthDays:4})+'\\n');`);

  const provider = createPrecomputedProvider({ generatedDir, yearBatchBinary: batch, yearLocatorBinary: locator, dataDir });
  const result = await provider.query({ calculationJdn: 2461300n, targetJdn: 2462000n });
  assert.equal(result.record.targetJdn, 2462000);
  assert.equal(result.provenance.engineRevision, 'fake-exact-batch');

  const fullYear = await provider.year({ calculationJdn: 2461300n, year: 5000n, includeDays: true });
  assert.equal(fullYear.year.number, 5000);
  assert.equal(fullYear.year.lengthDays, 4);
  assert.equal(fullYear.year.cutlets.length, 2);
  assert.equal(fullYear.year.months.length, 2);
  assert.equal(fullYear.year.days.length, 4);
  assert.equal(fullYear.provenance.engineRevision, 'fake-exact-batch');
});
