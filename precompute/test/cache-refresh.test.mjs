import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assessCacheRefresh } from '../lib/cache-refresh.mjs';

function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function records(start) {
  return Array.from({ length: 366 }, (_, i) => ({
    targetJdn: start + i,
    year: 5000,
    cutletIndex: i % 17,
    dayInCutlet: 1,
    monthIndex: i % 47,
    dayInMonth: 1,
    cutletCount: 17,
    monthCount: 47,
  }));
}

async function fixture() {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'seer-refresh-plan-'));
  await mkdir(path.join(cacheDir, 'calc'));
  const engineFingerprint = 'engine-v1';
  const astronomyFingerprint = 'astronomy-v1';
  const activeCalcJdn = 1000;
  const caches = [];
  for (const calcJdn of [1000, 1001, 1002]) {
    const cache = { schema: 1, calcJdn, targetStartJdn: calcJdn, targetCount: 366, engineFingerprint, records: records(calcJdn) };
    const raw = Buffer.from(`${JSON.stringify(cache)}\n`);
    await writeFile(path.join(cacheDir, 'calc', `${calcJdn}.json`), raw);
    caches.push({ calcJdn, path: `calc/${calcJdn}.json`, sha256: hash(raw), targetStartJdn: calcJdn, targetCount: 366 });
  }
  const index = { schema: 1, activeCalcJdn, lookAheadCalculationDays: 2, rollingTargetDaysPerCalculationDay: 366, engineFingerprint, astronomyFingerprint, caches };
  await writeFile(path.join(cacheDir, 'index.json'), `${JSON.stringify(index)}\n`);
  return { cacheDir, engineFingerprint, astronomyFingerprint, activeCalcJdn };
}

test('valid current three-day cache requires no refresh', async () => {
  const f = await fixture();
  const plan = await assessCacheRefresh(f);
  assert.equal(plan.refreshRequired, false);
  assert.deepEqual(plan.reasons, []);
});

test('day rollover, engine drift, and corruption each force a refresh', async () => {
  const f = await fixture();
  assert.equal((await assessCacheRefresh({ ...f, activeCalcJdn: f.activeCalcJdn + 1 })).refreshRequired, true);
  assert.equal((await assessCacheRefresh({ ...f, engineFingerprint: 'engine-v2' })).refreshRequired, true);
  const index = JSON.parse(await readFile(path.join(f.cacheDir, 'index.json'), 'utf8'));
  await writeFile(path.join(f.cacheDir, index.caches[0].path), '{}\n');
  const plan = await assessCacheRefresh(f);
  assert.equal(plan.refreshRequired, true);
  assert.ok(plan.reasons.some((reason) => reason.startsWith('invalid-')));
});
