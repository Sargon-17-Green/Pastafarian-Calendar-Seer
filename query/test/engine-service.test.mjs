import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
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
  return 2461303;
}

async function lowerGateDay() {
  const bytes = await readFile(path.join(dataDir, 'gates_negative_100k_u16.bin'));
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

function fakeRangePayload(calc, start, count, engine = 'fake-service') {
  return {
    schema: 1,
    engine,
    calcJdn: calc,
    targetStartJdn: start,
    targetCount: count,
    records: Array.from({ length: count }, (_, i) => ({
      targetJdn: start + i,
      year: 5000,
      cutletIndex: 0,
      dayInCutlet: i + 1,
      monthIndex: 0,
      dayInMonth: i + 1,
      cutletCount: 1,
      monthCount: 1,
    })),
  };
}

function fakeServiceSource(behavior) {
  return `
const readline = require('node:readline');
const behavior = ${JSON.stringify(behavior)};
function response(line) {
  const f = line.split(String.fromCharCode(9));
  if (f[0] !== 'R' || f.length !== 4) {
    return JSON.stringify({ schema: 1, ok: false, error: 'bad fake command' });
  }
  const calc = Number(f[1]);
  const start = Number(f[2]);
  const count = Number(f[3]);
  const records = Array.from({ length: count }, (_, i) => ({
    targetJdn: start + i, year: 5000, cutletIndex: 0, dayInCutlet: i + 1,
    monthIndex: 0, dayInMonth: i + 1, cutletCount: 1, monthCount: 1,
  }));
  return JSON.stringify({
    schema: 1, engine: 'fake-service', calcJdn: calc,
    targetStartJdn: start, targetCount: count, records,
  });
}
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  if (line === 'X') process.exit(0);
  if (behavior.mode === 'hang') return;
  if (behavior.mode === 'crash') process.exit(23);
  if (behavior.mode === 'stderr-crash') {
    process.stderr.write('E'.repeat(100000), () => process.exit(24));
    return;
  }
  if (behavior.mode === 'malformed') {
    process.stdout.write('not-json' + String.fromCharCode(10));
    return;
  }
  const send = () => process.stdout.write(response(line) + String.fromCharCode(10));
  if (behavior.mode === 'late') setTimeout(send, behavior.delayMs ?? 250);
  else send();
});
`;
}

function makeFakeServiceSpawnRunner(behaviors) {
  let spawns = 0;
  const runner = (_binary, _args, options) => {
    const behavior = behaviors[Math.min(spawns, behaviors.length - 1)] ?? { mode: 'ok' };
    spawns += 1;
    return spawn(
      process.execPath,
      ['--input-type=commonjs', '-e', fakeServiceSource(behavior)],
      { ...options, cwd: root, env: { ...process.env } },
    );
  };
  runner.spawnCount = () => spawns;
  return runner;
}

function makeFakeExecFileRunner() {
  let calls = 0;
  const runner = async (_binary, args) => {
    calls += 1;
    const [calc, start, count] = args.map(Number);
    return {
      stdout: JSON.stringify(fakeRangePayload(calc, start, count, 'fake-one-shot')),
      stderr: '',
    };
  };
  runner.callCount = () => calls;
  return runner;
}

function configureServiceRequirement(t, required) {
  const old = process.env.SEER_REQUIRE_ENGINE_SERVICE;
  if (required) process.env.SEER_REQUIRE_ENGINE_SERVICE = '1';
  else delete process.env.SEER_REQUIRE_ENGINE_SERVICE;
  closeExactEngineServicesForTests();
  t.after(() => {
    closeExactEngineServicesForTests();
    if (old == null) delete process.env.SEER_REQUIRE_ENGINE_SERVICE;
    else process.env.SEER_REQUIRE_ENGINE_SERVICE = old;
  });
}

function fakeEngine({ runner, timeoutMs = 60, execFileRunner, dataDirOverride = dataDir } = {}) {
  return createExactEngine({
    generatedDir,
    dataDir: dataDirOverride,
    engineServiceBinary: path.join(root, 'query', 'exact-engine.mjs'),
    yearBatchBinary: path.join(root, 'query', 'exact-engine.mjs'),
    timeoutMs,
    serviceSpawnRunner: runner,
    ...(execFileRunner ? { execFileRunner } : {}),
  });
}

function isServiceFailure(error, failure) {
  return error?.code === 'SEER_UNAVAILABLE'
    && error?.details?.serviceFailure === failure;
}

test('persistent service enforces a real per-request timeout when the child never answers', async (t) => {
  configureServiceRequirement(t, true);
  const runner = makeFakeServiceSpawnRunner([{ mode: 'hang' }]);
  const engine = fakeEngine({ runner, timeoutMs: 60 });
  const started = Date.now();

  await assert.rejects(
    engine.queryRange({ calculationJdn: 2461303, targetStartJdn: 2461303, count: 1 }),
    (error) => isServiceFailure(error, 'timeout'),
  );

  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 40, `timeout fired implausibly early: ${elapsed} ms`);
  assert.ok(elapsed < 1500, `timeout did not bound the persistent request: ${elapsed} ms`);
  assert.equal(runner.spawnCount(), 1);
});

test('late response from a timed-out child is never delivered to the next request', async (t) => {
  configureServiceRequirement(t, true);
  const runner = makeFakeServiceSpawnRunner([
    { mode: 'late', delayMs: 900 },
    { mode: 'ok' },
  ]);
  const engine = fakeEngine({ runner, timeoutMs: 500 });
  await assert.rejects(
    engine.queryRange({ calculationJdn: 2461303, targetStartJdn: 100, count: 1 }),
    (error) => isServiceFailure(error, 'timeout'),
  );
  await new Promise((resolve) => setTimeout(resolve, 950));

  const recovered = await engine.queryRange({
    calculationJdn: 2461303,
    targetStartJdn: 200,
    count: 1,
  });
  assert.equal(recovered.records[0].targetJdn, 200);
  assert.equal(recovered.provenance.engineRevision, 'fake-service');
  assert.equal(runner.spawnCount(), 2);
});

test('malformed service line poisons the child and a fresh child recovers', async (t) => {
  configureServiceRequirement(t, true);
  const runner = makeFakeServiceSpawnRunner([
    { mode: 'malformed' },
    { mode: 'ok' },
  ]);
  const engine = fakeEngine({ runner, timeoutMs: 1000 });

  await assert.rejects(
    engine.queryRange({ calculationJdn: 2461303, targetStartJdn: 300, count: 1 }),
    (error) => isServiceFailure(error, 'protocol'),
  );
  const recovered = await engine.queryRange({
    calculationJdn: 2461303,
    targetStartJdn: 301,
    count: 1,
  });
  assert.equal(recovered.records[0].targetJdn, 301);
  assert.equal(runner.spawnCount(), 2);
});

test('service crash rejects the request and subsequent request uses a fresh child', async (t) => {
  configureServiceRequirement(t, true);
  const runner = makeFakeServiceSpawnRunner([
    { mode: 'crash' },
    { mode: 'ok' },
  ]);
  const engine = fakeEngine({ runner, timeoutMs: 1500 });

  await assert.rejects(
    engine.queryRange({ calculationJdn: 2461303, targetStartJdn: 400, count: 1 }),
    (error) => error?.code === 'SEER_UNAVAILABLE',
  );
  const recovered = await engine.queryRange({
    calculationJdn: 2461303,
    targetStartJdn: 401,
    count: 1,
  });
  assert.equal(recovered.records[0].targetJdn, 401);
  assert.equal(runner.spawnCount(), 2);
});

test('timeout followed immediately by a valid request recycles the persistent child', async (t) => {
  configureServiceRequirement(t, true);
  const runner = makeFakeServiceSpawnRunner([
    { mode: 'hang' },
    { mode: 'ok' },
  ]);
  const engine = fakeEngine({ runner, timeoutMs: 500 });

  await assert.rejects(
    engine.queryRange({ calculationJdn: 2461303, targetStartJdn: 500, count: 1 }),
    (error) => isServiceFailure(error, 'timeout'),
  );
  const recovered = await engine.queryRange({
    calculationJdn: 2461303,
    targetStartJdn: 501,
    count: 1,
  });
  assert.equal(recovered.records[0].targetJdn, 501);
  assert.equal(runner.spawnCount(), 2);
});

test('one timeout cleans every pending request on the poisoned child', async (t) => {
  configureServiceRequirement(t, true);
  const runner = makeFakeServiceSpawnRunner([{ mode: 'hang' }]);
  const engine = fakeEngine({ runner, timeoutMs: 70 });
  const settled = await Promise.allSettled([
    engine.queryRange({ calculationJdn: 2461303, targetStartJdn: 600, count: 1 }),
    engine.queryRange({ calculationJdn: 2461303, targetStartJdn: 601, count: 1 }),
    engine.queryRange({ calculationJdn: 2461303, targetStartJdn: 602, count: 1 }),
  ]);

  assert.equal(runner.spawnCount(), 1);
  assert.equal(settled.length, 3);
  for (const result of settled) {
    assert.equal(result.status, 'rejected');
    assert.ok(isServiceFailure(result.reason, 'timeout'));
  }
});

test('fallback-allowed mode falls back after service timeout and can recover to service', async (t) => {
  configureServiceRequirement(t, false);
  const runner = makeFakeServiceSpawnRunner([
    { mode: 'hang' },
    { mode: 'ok' },
  ]);
  const execFileRunner = makeFakeExecFileRunner();
  const engine = fakeEngine({ runner, timeoutMs: 500, execFileRunner });

  const fallback = await engine.queryRange({
    calculationJdn: 2461303,
    targetStartJdn: 700,
    count: 1,
  });
  assert.equal(fallback.records[0].targetJdn, 700);
  assert.equal(fallback.provenance.engineRevision, 'fake-one-shot');
  assert.equal(execFileRunner.callCount(), 1);

  const recovered = await engine.queryRange({
    calculationJdn: 2461303,
    targetStartJdn: 701,
    count: 1,
  });
  assert.equal(recovered.records[0].targetJdn, 701);
  assert.equal(recovered.provenance.engineRevision, 'fake-service');
  assert.equal(execFileRunner.callCount(), 1);
  assert.equal(runner.spawnCount(), 2);
});

function makeBackpressureSpawnRunner(writes, drainDelayMs = 60) {
  return (_binary, _args, _options) => {
    const child = new EventEmitter();
    child.killed = false;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.ref = () => child;
    child.unref = () => child;
    child.kill = () => {
      if (child.killed) return false;
      child.killed = true;
      queueMicrotask(() => child.emit('exit', null, 'SIGKILL'));
      return true;
    };

    const stdin = new EventEmitter();
    stdin.destroyed = false;
    stdin.ref = () => stdin;
    stdin.unref = () => stdin;
    stdin.destroy = () => { stdin.destroyed = true; };
    stdin.write = (payload) => {
      writes.push({ payload, at: Date.now() });
      const f = payload.trim().split('\t');
      const response = fakeRangePayload(Number(f[1]), Number(f[2]), Number(f[3]));
      setTimeout(() => {
        if (!child.killed) child.stdout.write(JSON.stringify(response) + '\n');
      }, 5);
      if (writes.length === 1) {
        setTimeout(() => {
          if (!child.killed) stdin.emit('drain');
        }, drainDelayMs);
        return false;
      }
      return true;
    };
    child.stdin = stdin;
    return child;
  };
}

test('persistent service stops writing until stdin drain after backpressure', async (t) => {
  configureServiceRequirement(t, true);
  const writes = [];
  const engine = fakeEngine({
    runner: makeBackpressureSpawnRunner(writes, 80),
    timeoutMs: 500,
  });

  const first = engine.queryRange({
    calculationJdn: 2461303, targetStartJdn: 800, count: 1,
  });
  const second = engine.queryRange({
    calculationJdn: 2461303, targetStartJdn: 801, count: 1,
  });

  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(writes.length, 1, 'second request was written before drain');
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.records[0].targetJdn, 800);
  assert.equal(b.records[0].targetJdn, 801);
  assert.equal(writes.length, 2);
  assert.ok(writes[1].at - writes[0].at >= 50);
});

test('service registry evicts old identities instead of growing without bound', async (t) => {
  configureServiceRequirement(t, true);
  const oldMax = process.env.SEER_SERVICE_REGISTRY_MAX;
  process.env.SEER_SERVICE_REGISTRY_MAX = '2';
  const dirs = await Promise.all([
    mkdtemp(path.join(os.tmpdir(), 'seer-reg-a-')),
    mkdtemp(path.join(os.tmpdir(), 'seer-reg-b-')),
    mkdtemp(path.join(os.tmpdir(), 'seer-reg-c-')),
  ]);
  for (let i = 0; i < dirs.length; i += 1) {
    await writeFile(path.join(dirs[i], 'gates_100k_u16.bin'), Buffer.from([i + 1]));
    await writeFile(path.join(dirs[i], 'gates_negative_100k_u16.bin'), Buffer.from([11 + i]));
  }
  t.after(async () => {
    closeExactEngineServicesForTests();
    if (oldMax == null) delete process.env.SEER_SERVICE_REGISTRY_MAX;
    else process.env.SEER_SERVICE_REGISTRY_MAX = oldMax;
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  const runner = makeFakeServiceSpawnRunner([{ mode: 'ok' }]);
  const engines = dirs.map((dir) => fakeEngine({
    runner, timeoutMs: 1000, dataDirOverride: dir,
  }));
  for (let i = 0; i < engines.length; i += 1) {
    const result = await engines[i].queryRange({
      calculationJdn: 2461303, targetStartJdn: 900 + i, count: 1,
    });
    assert.equal(result.records[0].targetJdn, 900 + i);
  }
  assert.equal(runner.spawnCount(), 3);

  const revisited = await engines[0].queryRange({
    calculationJdn: 2461303, targetStartJdn: 999, count: 1,
  });
  assert.equal(revisited.records[0].targetJdn, 999);
  assert.equal(runner.spawnCount(), 4);
});

test('stderr retained on service crash is bounded', async (t) => {
  configureServiceRequirement(t, true);
  const runner = makeFakeServiceSpawnRunner([{ mode: 'stderr-crash' }]);
  const engine = fakeEngine({ runner, timeoutMs: 1500 });

  await assert.rejects(
    engine.queryRange({ calculationJdn: 2461303, targetStartJdn: 1000, count: 1 }),
    (error) => {
      assert.equal(error?.code, 'SEER_UNAVAILABLE');
      const causeMessage = String(error?.cause?.message ?? '');
      assert.ok(causeMessage.length < 9000, `stderr tail was not bounded: ${causeMessage.length}`);
      return true;
    },
  );
});

function makeOversizedStdoutSpawnRunner() {
  return (_binary, _args, _options) => {
    const child = new EventEmitter();
    child.killed = false;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.ref = () => child;
    child.unref = () => child;
    child.kill = () => {
      if (child.killed) return false;
      child.killed = true;
      queueMicrotask(() => child.emit('exit', null, 'SIGKILL'));
      return true;
    };
    const stdin = new EventEmitter();
    stdin.ref = () => stdin;
    stdin.unref = () => stdin;
    stdin.destroy = () => {};
    stdin.write = () => {
      queueMicrotask(() => {
        if (!child.killed) child.stdout.write('X'.repeat((32 * 1024 * 1024) + 1));
      });
      return true;
    };
    child.stdin = stdin;
    return child;
  };
}

test('unterminated persistent-service stdout is bounded', async (t) => {
  configureServiceRequirement(t, true);
  const engine = fakeEngine({
    runner: makeOversizedStdoutSpawnRunner(),
    timeoutMs: 1500,
  });

  await assert.rejects(
    engine.queryRange({ calculationJdn: 2461303, targetStartJdn: 1100, count: 1 }),
    (error) => isServiceFailure(error, 'protocol'),
  );
});
