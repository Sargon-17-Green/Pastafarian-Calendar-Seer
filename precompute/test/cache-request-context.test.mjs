import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCacheRequestContext } from '../cache-lookup.mjs';

function sha256(data) { return createHash('sha256').update(data).digest('hex'); }

async function fixture() {
  const generatedDir = await mkdtemp(path.join(os.tmpdir(), 'seer-opt01-'));
  const calcJdn = 2461299;
  const targetStartJdn = calcJdn;
  const targetCount = 366;
  const engineFingerprint = 'engine-test';
  const records = Array.from({ length: targetCount }, (_, i) => ({
    targetJdn: targetStartJdn + i,
    year: 5000,
    cutletIndex: i % 17,
    dayInCutlet: 1,
    monthIndex: i % 47,
    dayInMonth: 1,
    cutletCount: 17,
    monthCount: 47,
  }));
  const cache = { schema: 1, calcJdn, targetStartJdn, targetCount, engineFingerprint, records };
  const cacheRaw = Buffer.from(`${JSON.stringify(cache, null, 2)}\n`);
  await mkdir(path.join(generatedDir, 'calc'), { recursive: true });
  await writeFile(path.join(generatedDir, 'calc', `${calcJdn}.json`), cacheRaw);
  const index = {
    schema: 1,
    rollingTargetDaysPerCalculationDay: targetCount,
    engineFingerprint,
    boundaries: [
      { calcJdn, utc: '2026-09-14T23:17:18.094Z' },
      { calcJdn: calcJdn + 1, utc: '2026-09-15T23:15:19.799Z' },
    ],
    caches: [{ calcJdn, path: `calc/${calcJdn}.json`, sha256: sha256(cacheRaw), targetStartJdn, targetCount }],
  };
  await writeFile(path.join(generatedDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  return { generatedDir, calcJdn, targetStartJdn, targetCount };
}

test('one request context reads index and one calculation-day cache once', async () => {
  const f = await fixture();
  const reads = new Map();
  const readFileImpl = async (file) => {
    reads.set(file, (reads.get(file) ?? 0) + 1);
    return readFile(file);
  };
  const context = createCacheRequestContext({ generatedDir: f.generatedDir, readFileImpl });
  const answers = await Promise.all(Array.from({ length: f.targetCount }, (_, i) => context.loadRecord(f.calcJdn, f.targetStartJdn + i)));
  assert.equal(answers.length, 366);
  assert.equal([...reads.values()].reduce((a, b) => a + b, 0), 2);
  assert.deepEqual([...reads.values()].sort(), [1, 1]);
  assert.equal(answers[365].record.targetJdn, f.targetStartJdn + 365);
  assert.ok(Object.isFrozen(answers[0].index));
  assert.ok(Object.isFrozen(answers[0].record));
});

test('concurrent duplicate loads share the same pending cache load', async () => {
  const f = await fixture();
  let reads = 0;
  const context = createCacheRequestContext({
    generatedDir: f.generatedDir,
    readFileImpl: async (file) => { reads += 1; await new Promise((r) => setTimeout(r, 5)); return readFile(file); },
  });
  await Promise.all(Array.from({ length: 32 }, () => context.loadRecord(f.calcJdn, f.targetStartJdn)));
  assert.equal(reads, 2);
});

test('coverage absence remains RangeError while checksum corruption is not a cache miss', async () => {
  const f = await fixture();
  const missing = createCacheRequestContext({ generatedDir: f.generatedDir });
  await assert.rejects(() => missing.loadRecord(f.calcJdn + 99, f.targetStartJdn), RangeError);

  const cachePath = path.join(f.generatedDir, 'calc', `${f.calcJdn}.json`);
  await writeFile(cachePath, '{}\n');
  const corrupt = createCacheRequestContext({ generatedDir: f.generatedDir });
  await assert.rejects(
    () => corrupt.loadRecord(f.calcJdn, f.targetStartJdn),
    (error) => !(error instanceof RangeError) && /checksum mismatch/.test(error.message),
  );
});

test('index snapshot is pinned within the request context', async () => {
  const f = await fixture();
  const context = createCacheRequestContext({ generatedDir: f.generatedDir });
  const first = await context.loadRecord(f.calcJdn, f.targetStartJdn);
  const indexPath = path.join(f.generatedDir, 'index.json');
  const changed = JSON.parse(await readFile(indexPath, 'utf8'));
  changed.engineFingerprint = 'replacement-version';
  await writeFile(indexPath, `${JSON.stringify(changed, null, 2)}\n`);
  const second = await context.loadRecord(f.calcJdn, f.targetStartJdn + 1);
  assert.strictEqual(second.index, first.index);
  assert.equal(second.index.engineFingerprint, 'engine-test');
});
