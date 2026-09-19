import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createSeerHealthProbe, probeCacheState } from '../health.mjs';

async function cacheFixture() {
  const generatedDir = await mkdtemp(path.join(os.tmpdir(), 'seer-health-cache-'));
  await mkdir(path.join(generatedDir, 'calc'), { recursive: true });
  const calcJdn = 2461303;
  const engineFingerprint = 'fixture-engine';
  const cache = {
    schema: 1,
    calcJdn,
    targetStartJdn: calcJdn,
    targetCount: 1,
    engineFingerprint,
    records: [{
      targetJdn: calcJdn,
      year: 5000,
      cutletIndex: 0,
      dayInCutlet: 1,
      monthIndex: 0,
      dayInMonth: 1,
      cutletCount: 1,
      monthCount: 1,
    }],
  };
  const raw = Buffer.from(`${JSON.stringify(cache)}\n`);
  const sha256 = createHash('sha256').update(raw).digest('hex');
  await writeFile(path.join(generatedDir, 'calc', `${calcJdn}.json`), raw);
  const index = {
    schema: 1,
    engineFingerprint,
    rollingTargetDaysPerCalculationDay: 1,
    boundaries: [
      { utc: '2026-09-15T00:00:00.000Z', calcJdn },
      { utc: '2026-09-16T00:00:00.000Z', calcJdn: calcJdn + 1 },
    ],
    caches: [{
      calcJdn,
      path: `calc/${calcJdn}.json`,
      sha256,
      targetStartJdn: calcJdn,
      targetCount: 1,
    }],
  };
  await writeFile(path.join(generatedDir, 'index.json'), `${JSON.stringify(index)}\n`);
  return { generatedDir, calcJdn };
}

const healthyInstant = new Date('2026-09-15T12:00:00.000Z');

test('cache probe distinguishes healthy, stale and corrupt cache without conversion', async () => {
  const fixture = await cacheFixture();
  assert.equal(await probeCacheState({ generatedDir: fixture.generatedDir, now: healthyInstant }), 'ok');
  assert.equal(await probeCacheState({
    generatedDir: fixture.generatedDir,
    now: new Date('2026-09-17T12:00:00.000Z'),
  }), 'stale');

  await writeFile(path.join(fixture.generatedDir, 'calc', `${fixture.calcJdn}.json`), '{"corrupt":true}\n');
  assert.equal(await probeCacheState({ generatedDir: fixture.generatedDir, now: healthyInstant }), 'corrupt');
});

test('health status degrades stale or corrupt cache but is unavailable only when exact runtime is unavailable', async () => {
  const fixture = await cacheFixture();
  let probes = 0;
  const exactEngine = { probe: async () => { probes += 1; return { mode: 'service' }; } };
  const health = createSeerHealthProbe({
    generatedDir: fixture.generatedDir,
    exactEngine,
    nowFactory: () => healthyInstant,
  });
  assert.deepEqual(await health.probe(), { status: 'ok' });
  assert.equal(probes, 1);

  const stale = createSeerHealthProbe({
    generatedDir: fixture.generatedDir,
    exactEngine,
    nowFactory: () => new Date('2026-09-17T12:00:00.000Z'),
  });
  assert.deepEqual(await stale.probe(), { status: 'degraded' });

  await writeFile(path.join(fixture.generatedDir, 'calc', `${fixture.calcJdn}.json`), '{"corrupt":true}\n');
  const corrupt = createSeerHealthProbe({
    generatedDir: fixture.generatedDir,
    exactEngine,
    nowFactory: () => healthyInstant,
  });
  assert.deepEqual(await corrupt.probe(), { status: 'degraded' });

  const missingEngine = createSeerHealthProbe({
    generatedDir: fixture.generatedDir,
    exactEngine: { probe: async () => { throw new Error('missing engine'); } },
    nowFactory: () => healthyInstant,
  });
  assert.deepEqual(await missingEngine.probe(), { status: 'unavailable' });
});


test('optional cache absence stays healthy but explicitly configured cache absence is degraded', async (t) => {
  const oldCacheDir = process.env.SEER_CACHE_DIR;
  delete process.env.SEER_CACHE_DIR;
  t.after(() => {
    if (oldCacheDir === undefined) delete process.env.SEER_CACHE_DIR;
    else process.env.SEER_CACHE_DIR = oldCacheDir;
  });

  const exactEngine = { probe: async () => ({ mode: 'service' }) };
  const optional = createSeerHealthProbe({ exactEngine, nowFactory: () => healthyInstant });
  assert.deepEqual(await optional.probe(), { status: 'ok' });

  const emptyRoot = await mkdtemp(path.join(os.tmpdir(), 'seer-health-empty-'));
  const configured = createSeerHealthProbe({
    generatedDir: path.join(emptyRoot, 'configured-cache'),
    exactEngine,
    nowFactory: () => healthyInstant,
  });
  assert.deepEqual(await configured.probe(), { status: 'degraded' });
});
