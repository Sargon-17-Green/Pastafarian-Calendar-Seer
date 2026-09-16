import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createExactEngine } from '../exact-engine.mjs';

async function fixture(t, stderr) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'seer-domain-errors-'));
  const generatedDir = path.join(root, 'generated');
  const dataDir = path.join(root, 'data');
  await mkdir(generatedDir);
  await mkdir(dataDir);
  const bins = {};
  for (const name of ['batch', 'locator', 'structure']) {
    bins[name] = path.join(root, name);
    await writeFile(bins[name], 'stub\n');
  }
  t.after(() => rm(root, { recursive: true, force: true }));
  const execFileRunner = async () => {
    const error = new Error('native failed');
    error.code = 1;
    error.stdout = '';
    error.stderr = stderr;
    throw error;
  };
  const oldRequire = process.env.SEER_REQUIRE_ENGINE_SERVICE;
  delete process.env.SEER_REQUIRE_ENGINE_SERVICE;
  try {
    return createExactEngine({
      generatedDir,
      dataDir,
      yearBatchBinary: bins.batch,
      yearLocatorBinary: bins.locator,
      yearStructureBinary: bins.structure,
      execFileRunner,
    });
  } finally {
    if (oldRequire == null) delete process.env.SEER_REQUIRE_ENGINE_SERVICE;
    else process.env.SEER_REQUIRE_ENGINE_SERVICE = oldRequire;
  }
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error?.code === code);
}

test('direct batch fallback reports calculation-domain exhaustion', async (t) => {
  const engine = await fixture(t, 'seer_year_batch: day beyond bidirectional gate corpus\n');
  await expectCode(engine.queryRange({ calculationJdn: 1n, targetStartJdn: 2n, count: 1 }), 'CALCULATION_OUT_OF_SUPPORTED_DOMAIN');
});

test('direct batch fallback reports target-domain exhaustion', async (t) => {
  const engine = await fixture(t, 'seer_year_batch: no previous year in gate corpus\n');
  await expectCode(engine.queryRange({ calculationJdn: 1n, targetStartJdn: 2n, count: 1 }), 'TARGET_OUT_OF_SUPPORTED_DOMAIN');
});
test('direct year fallback distinguishes calculation and year domains', async (t) => {
  const calcEngine = await fixture(t, 'seer_year_structure: no anchor candidates in gate corpus\n');
  await expectCode(calcEngine.year({ calculationJdn: 1n, year: 5000n }), 'CALCULATION_OUT_OF_SUPPORTED_DOMAIN');

  const yearEngine = await fixture(t, 'seer_year_structure: no next year in gate corpus\n');
  await expectCode(yearEngine.year({ calculationJdn: 1n, year: 5000n }), 'YEAR_OUT_OF_SUPPORTED_DOMAIN');
});

test('unclassified native failures remain service-unavailable errors', async (t) => {
  const engine = await fixture(t, 'seer_year_batch: internal invariant failed\n');
  await expectCode(engine.queryRange({ calculationJdn: 1n, targetStartJdn: 2n, count: 1 }), 'SEER_UNAVAILABLE');
});
