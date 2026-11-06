#!/usr/bin/env node
// Seer Next, Phase 0: no optimization, no mutation of the native engine.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir, cpus, platform, arch } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const args = new Map(process.argv.slice(2).map((arg) => {
  const m = /^--([a-z-]+)=(.*)$/.exec(arg);
  if (!m) throw new Error(`Expected --name=value, got ${arg}`);
  return [m[1], m[2]];
}));
const iterations = Number(args.get('iterations') ?? '8');
if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 10000) {
  throw new Error('--iterations must be an integer between 1 and 10000');
}
const defaultBin = path.join(root, 'prototype', 'build', platform() === 'win32'
  ? 'seer_engine_service.exe' : 'seer_engine_service');
const binary = path.resolve(args.get('engine') ?? process.env.SEER_ENGINE_SERVICE_BIN ?? defaultBin);
const dataDir = path.resolve(args.get('data-dir') ?? path.join(root, 'prototype', 'data'));
const temp = await mkdtemp(path.join(tmpdir(), 'seer-next-probe-'));
const weaveFile = path.join(temp, 'weaves.txt');
const chainFile = path.join(temp, 'chains.txt');
const FIXTURES = Object.freeze({
  '2460984': { year: 5000, cutletIndex: 14, dayInCutlet: 31, monthIndex: 18, dayInMonth: 68, monthCount: 37 },
  '2461290': { year: 5000, cutletIndex: 14, dayInCutlet: 337, monthIndex: 39, dayInMonth: 69, monthCount: 37 },
});

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function eventCount() {
  try {
    const content = await readFile(weaveFile, 'utf8');
    return content.split('\n').filter((line) => line === 'year_batch_weave' || line === 'weave').length;
  } catch (e) {
    if (e?.code === 'ENOENT') return 0;
    throw e;
  }
}
function summarize(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const value = (p) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  return { n: sorted.length, minMs: sorted[0], p50Ms: value(0.5),
    ...(sorted.length >= 20 ? { p95Ms: value(0.95) } : {}),
    ...(sorted.length >= 100 ? { p99Ms: value(0.99) } : {}), maxMs: sorted.at(-1) };
}
function openSession() {
  const child = spawn(binary, [], {
    cwd: dataDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, SEER_TEST_WEAVE_COUNTER_FILE: weaveFile,
      SEER_TEST_CHAIN_COUNTER_FILE: chainFile },
  });
  let pending = null;
  let buffer = '';
  let stderr = '';
  let failure = null;
  function fail(err) {
    if (failure) return;
    failure = err;
    const current = pending;
    pending = null;
    if (current) current.reject(err);
  }
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (part) => {
    buffer += part;
    if (buffer.length > 32 * 1024 * 1024) {
      fail(new Error('Native stdout exceeded 32 MiB without framing'));
      child.kill();
      return;
    }
    let pos;
    while ((pos = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, pos);
      buffer = buffer.slice(pos + 1);
      if (!pending) {
        fail(new Error('Unsolicited native stdout line'));
        child.kill();
        return;
      }
      const current = pending;
      pending = null;
      current.resolve(line);
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (part) => { stderr = (stderr + part).slice(-8192); });
  child.on('error', (e) => fail(e));
  child.on('close', (code, signal) => fail(new Error(
    `Native engine closed (code=${code}, signal=${signal}): ${stderr}`)));
  async function request(command) {
    if (failure) throw failure;
    if (pending) throw new Error('Only one outstanding request is supported in this probe');
    const start = process.hrtime.bigint();
    let timeout;
    try {
      const response = new Promise((resolve, reject) => { pending = { resolve, reject }; });
      timeout = setTimeout(() => {
        fail(new Error(`Native request timed out: ${command}`));
        child.kill();
      }, 120000);
      child.stdin.write(`${command.split(' ').join('\t')}\n`, 'utf8');
      const line = await response;
      const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
      const parsed = JSON.parse(line);
      if (parsed?.error) throw new Error(`Native service error for ${command}: ${line}`);
      return { parsed, elapsedMs };
    } finally {
      clearTimeout(timeout);
    }
  }
  return { request, close: () => { child.stdin.end(); child.kill(); } };
}
function checkRecord(response, target) {
  if (response?.schema !== 1 || response?.calcJdn !== 2461290 ||
      response?.targetStartJdn !== target || response?.targetCount !== 1 ||
      !Array.isArray(response.records) || response.records.length !== 1) {
    throw new Error(`Malformed exact record response for ${target}`);
  }
  const record = response.records[0];
  const expected = FIXTURES[String(target)];
  if (!expected || record.targetJdn !== target ||
      Object.entries(expected).some(([name, value]) => record[name] !== value)) {
    throw new Error(`Independent saved-sum fixture mismatch for ${target}: ${JSON.stringify(record)}`);
  }
  return record;
}

const session = openSession();
try {
  async function measure(name, targets) {
    const before = await eventCount();
    const times = [];
    const outputs = [];
    for (const target of targets) {
      const { parsed, elapsedMs } = await session.request(`R 2461290 ${target} 1`);
      const record = checkRecord(parsed, target);
      times.push(elapsedMs);
      outputs.push(createHash('sha256').update(JSON.stringify(record)).digest('hex'));
    }
    return { name, targets: targets.map(String),
      weaveEvents: (await eventCount()) - before, latency: summarize(times),
      sampleMs: times, outputSha256: outputs };
  }
  const cold = await measure('first_exact_request', [2460984]);
  const repeated = await measure('repeated_same_target', Array(iterations).fill(2460984));
  const alternating = await measure('alternating_same_year', Array.from({ length: iterations }, (_, i) =>
    i % 2 ? 2461290 : 2460984));
  const beforeYear = await eventCount();
  const year = await session.request('Y 2461290 5000 0');
  if (year.parsed?.year !== 5000 || year.parsed?.calcJdn !== 2461290 ||
      'days' in (year.parsed ?? {})) throw new Error('Year-structure no-days response mismatch');
  const yearWithoutDays = { elapsedMs: year.elapsedMs,
    weaveEvents: (await eventCount()) - beforeYear };
  const result = {
    schema: 'seer-next-recomputation-probe-v1',
    baselineCommit: '7f1b3098332d891a9ea6cf8e31383d4fd39141cf',
    launchedAtUtc: new Date().toISOString(),
    enginePath: binary, engineSha256: await sha256(binary),
    positiveGateSha256: await sha256(path.join(dataDir, 'gates_100k_u16.bin')),
    negativeGateSha256: await sha256(path.join(dataDir, 'gates_negative_100k_u16.bin')),
    host: { platform: platform(), arch: arch(), cpuModel: cpus()[0]?.model ?? null,
      logicalCpus: cpus().length, node: process.version },
    workload: { calculationJdn: 2461290, independentReference: 'prototype/BENCHMARK_CASES.md', iterations },
    cold, repeated, alternating, yearWithoutDays,
    caveat: 'Native service + pipe wall latency; no native CPU/RSS measurement, no performance claim.'
  };
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (args.has('output')) await writeFile(path.resolve(args.get('output')), json, 'utf8');
  else process.stdout.write(json);
} finally {
  session.close();
  await rm(temp, { recursive: true, force: true });
}
