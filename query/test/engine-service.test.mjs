import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExactEngine, closeExactEngineServicesForTests } from '../exact-engine.mjs';

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const generatedDir = path.join(root, 'generated');
const dataDir = path.join(root, 'prototype', 'data');
const serviceBinary = path.join(root, 'prototype', 'build', process.platform === 'win32' ? 'seer_engine_service.exe' : 'seer_engine_service');
const batchBinary = path.join(root, 'prototype', 'build', process.platform === 'win32' ? 'seer_year_batch.exe' : 'seer_year_batch');
const structureBinary = path.join(root, 'prototype', 'build', process.platform === 'win32' ? 'seer_year_structure.exe' : 'seer_year_structure');

async function nativeAvailable() {
  try {
    await Promise.all([access(serviceBinary), access(batchBinary), access(structureBinary)]);
    return true;
  } catch {
    return false;
  }
}

async function canonicalCalc() {
  const index = JSON.parse(await readFile(path.join(generatedDir, 'index.json'), 'utf8'));
  return Number(index.caches[0].calcJdn);
}

async function lowerGateDay() {
  const bytes = await readFile(path.join(dataDir, 'gates_negative_u16.bin'));
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 2) sum += bytes.readUInt16LE(i);
  return -13_334_246 - sum;
}

function startProtocolService(extraEnv = {}) {
  const child = spawn(serviceBinary, [], {
    cwd: dataDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env, ...extraEnv },
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let buffer = '';
  let stderr = '';
  const pending = [];
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    for (;;) {
      const i = buffer.indexOf('\n');
      if (i < 0) break;
      const line = buffer.slice(0, i).replace(/\r$/, '');
      buffer = buffer.slice(i + 1);
      if (!line) continue;
      const waiter = pending.shift();
      if (!waiter) continue;
      try { waiter.resolve(JSON.parse(line)); } catch (error) { waiter.reject(error); }
    }
  });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('exit', (code, signal) => {
    const error = new Error(`service exited code=${code} signal=${signal}: ${stderr}`);
    for (const waiter of pending.splice(0)) waiter.reject(error);
  });
  return {
    child,
    request(fields) {
      return new Promise((resolve, reject) => {
        pending.push({ resolve, reject });
        child.stdin.write(`${fields.join('\t')}\n`);
      });
    },
    close() {
      try { child.stdin.write('X\n'); } catch {}
      try { child.stdin.end(); } catch {}
    },
  };
}

test('native service preserves exact outputs and caches contiguous year chains', async (t) => {
  if (!(await nativeAvailable())) {
    t.skip('native OPT-06 binaries are not built in this environment');
    return;
  }
  const calc = await canonicalCalc();
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'seer-opt06-native-'));
  const chainCounter = path.join(tmp, 'chain.tsv');
  const svc = startProtocolService({ SEER_SERVICE_MAX_CALCS: '2', SEER_TEST_CHAIN_COUNTER_FILE: chainCounter });
  t.after(async () => {
    svc.close();
    await rm(tmp, { recursive: true, force: true });
  });

  const y5000 = await svc.request(['Y', String(calc), '5000', '0']);
  assert.equal(y5000.year, 5000);

  const directStructure = JSON.parse((await execFileAsync(
    structureBinary, [String(calc), '5000', '0'],
    { cwd: dataDir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )).stdout);
  assert.deepEqual(y5000, directStructure);

  const serviceRange = await svc.request(['R', String(calc), String(y5000.startJdn), '3']);
  const directRange = JSON.parse((await execFileAsync(
    batchBinary, [String(calc), String(y5000.startJdn), '3'],
    { cwd: dataDir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )).stdout);
  assert.deepEqual(serviceRange, directRange);

  await svc.request(['Y', String(calc), '4998', '0']);
  let stats = await svc.request(['S']);
  assert.equal(stats.stats.anchors, 1);
  assert.equal(stats.stats.prevSteps, 2);
  const nextBeforeRepeat = stats.stats.nextSteps;
  const prevBeforeRepeat = stats.stats.prevSteps;

  await svc.request(['Y', String(calc), '4998', '0']);
  stats = await svc.request(['S']);
  assert.equal(stats.stats.prevSteps, prevBeforeRepeat);
  assert.equal(stats.stats.nextSteps, nextBeforeRepeat);

  await svc.request(['Y', String(calc), '5002', '0']);
  stats = await svc.request(['S']);
  assert.equal(stats.stats.anchors, 1);
  assert.equal(stats.stats.nextSteps, 2);
  const prevBeforeSwitch = stats.stats.prevSteps;
  const nextBeforeSwitch = stats.stats.nextSteps;

  await svc.request(['Y', String(calc), '4999', '0']);
  stats = await svc.request(['S']);
  assert.equal(stats.stats.prevSteps, prevBeforeSwitch);
  assert.equal(stats.stats.nextSteps, nextBeforeSwitch);

  await svc.request(['Y', String(calc + 1), '5000', '0']);
  await svc.request(['Y', String(calc + 2), '5000', '0']);
  stats = await svc.request(['S']);
  assert.equal(stats.stats.activeCalcs, 2);
  assert.ok(stats.stats.evictions >= 1);
  const anchorsBeforeReentry = stats.stats.anchors;

  await svc.request(['Y', String(calc), '5000', '0']);
  stats = await svc.request(['S']);
  assert.ok(stats.stats.anchors > anchorsBeforeReentry);
  assert.equal(stats.stats.activeCalcs, 2);

  const counterText = await readFile(chainCounter, 'utf8');
  assert.match(counterText, /^anchor\t/m);
  assert.match(counterText, /^prev\t/m);
  assert.match(counterText, /^next\t/m);
});

test('JS exact engine reuses one persistent service across engine instances', async (t) => {
  if (!(await nativeAvailable())) {
    t.skip('native OPT-06 binaries are not built in this environment');
    return;
  }
  const calc = await canonicalCalc();
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'seer-opt06-js-'));
  const spawnCounter = path.join(tmp, 'spawns.txt');
  const oldRequire = process.env.SEER_REQUIRE_ENGINE_SERVICE;
  const oldCounter = process.env.SEER_TEST_SERVICE_SPAWN_COUNTER_FILE;
  process.env.SEER_REQUIRE_ENGINE_SERVICE = '1';
  process.env.SEER_TEST_SERVICE_SPAWN_COUNTER_FILE = spawnCounter;

  t.after(async () => {
    closeExactEngineServicesForTests();
    if (oldRequire == null) delete process.env.SEER_REQUIRE_ENGINE_SERVICE; else process.env.SEER_REQUIRE_ENGINE_SERVICE = oldRequire;
    if (oldCounter == null) delete process.env.SEER_TEST_SERVICE_SPAWN_COUNTER_FILE; else process.env.SEER_TEST_SERVICE_SPAWN_COUNTER_FILE = oldCounter;
    await rm(tmp, { recursive: true, force: true });
  });

  const a = createExactEngine({ generatedDir, engineServiceBinary: serviceBinary, dataDir });
  const b = createExactEngine({ generatedDir, engineServiceBinary: serviceBinary, dataDir });
  const yearA = await a.year({ calculationJdn: calc, year: 5000, includeDays: false });
  const yearB = await b.year({ calculationJdn: calc, year: 5000, includeDays: false });
  assert.deepEqual(yearA.year, yearB.year);

  const first = await a.queryRange({ calculationJdn: calc, targetStartJdn: yearA.year.startJdn, count: 1 });
  const second = await b.queryRange({ calculationJdn: calc, targetStartJdn: yearA.year.startJdn, count: 1 });
  assert.deepEqual(first.records, second.records);

  const lines = (await readFile(spawnCounter, 'utf8')).trim().split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length, 1);
});
test('native service returns typed domain errors and remains usable', async (t) => {
  if (!(await nativeAvailable())) {
    t.skip('native OPT-06 binaries are not built in this environment');
    return;
  }
  const calc = await canonicalCalc();
  const lower = await lowerGateDay();
  const svc = startProtocolService();
  t.after(() => svc.close());

  const calcError = await svc.request(['R', String(lower), String(calc), '1']);
  assert.equal(calcError.ok, false);
  assert.equal(calcError.code, 'CALCULATION_OUT_OF_SUPPORTED_DOMAIN');

  const targetError = await svc.request(['R', String(calc), String(lower), '1']);
  assert.equal(targetError.ok, false);
  assert.equal(targetError.code, 'TARGET_OUT_OF_SUPPORTED_DOMAIN');

  const stats = await svc.request(['S']);
  assert.equal(stats.schema, 1);
  assert.equal((await svc.request(['Y', String(calc), '5000', '0'])).year, 5000);
});

test('JS exact engine preserves typed service-domain errors', async (t) => {
  if (!(await nativeAvailable())) {
    t.skip('native OPT-06 binaries are not built in this environment');
    return;
  }
  const calc = await canonicalCalc();
  const lower = await lowerGateDay();
  const oldRequire = process.env.SEER_REQUIRE_ENGINE_SERVICE;
  process.env.SEER_REQUIRE_ENGINE_SERVICE = '1';
  t.after(() => {
    closeExactEngineServicesForTests();
    if (oldRequire == null) delete process.env.SEER_REQUIRE_ENGINE_SERVICE;
    else process.env.SEER_REQUIRE_ENGINE_SERVICE = oldRequire;
  });
  const engine = createExactEngine({ generatedDir, engineServiceBinary: serviceBinary, dataDir });
  await assert.rejects(
    engine.queryRange({ calculationJdn: lower, targetStartJdn: calc, count: 1 }),
    (error) => error?.code === 'CALCULATION_OUT_OF_SUPPORTED_DOMAIN',
  );
  await assert.rejects(
    engine.queryRange({ calculationJdn: calc, targetStartJdn: lower, count: 1 }),
    (error) => error?.code === 'TARGET_OUT_OF_SUPPORTED_DOMAIN',
  );
});
