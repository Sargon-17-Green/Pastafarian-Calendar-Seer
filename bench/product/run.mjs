#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as queryApi from '../../query/index.mjs';
import { listen } from '../../http/server.mjs';
import { createPublicIdentityProvider } from '../../http/public-identity.mjs';
import {
  collectMachineMetadata,
  distribution,
  formatNumber,
  measureColdSeries,
  measureScenario,
  snapshotProcessTree,
} from './lib.mjs';
import {
  FAR_FUTURE_CALC_JDN,
  buildScenarios,
  loadCacheFixture,
} from './cases.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const coldWorkerPath = path.join(here, 'cold-worker.mjs');

function parsePositive(value, name, fallback) {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a positive integer`);
  return n;
}

function parseArgs(argv) {
  const map = new Map();
  for (const arg of argv) {
    if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
    const equals = arg.indexOf('=');
    if (equals < 0) map.set(arg.slice(2), 'true');
    else map.set(arg.slice(2, equals), arg.slice(equals + 1));
  }
  const generatedDir = path.resolve(map.get('generated-dir') ?? process.env.SEER_CACHE_DIR ?? path.join(root, '.cache-build', 'bench'));
  const environment = map.get('environment') ?? process.env.SEER_BENCH_ENVIRONMENT ?? `${process.platform}-${process.arch}`;
  const safeEnvironment = environment.replace(/[^A-Za-z0-9_.-]+/g, '-');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const smoke = map.get('smoke') === 'true';
  const concurrencyText = map.get('concurrency') ?? (smoke ? '1,4' : '1,8,32,128,300');
  return {
    generatedDir,
    environment,
    samples: parsePositive(map.get('samples'), 'samples', 20),
    cheapSamples: parsePositive(map.get('cheap-samples'), 'cheap-samples', 100),
    heavySamples: parsePositive(map.get('heavy-samples'), 'heavy-samples', 5),
    coldSamples: parsePositive(map.get('cold-samples'), 'cold-samples', 20),
    warmup: parsePositive(map.get('warmup'), 'warmup', smoke ? 1 : 2),
    smoke,
    concurrency: concurrencyText.split(',').map((item) => parsePositive(item.trim(), 'concurrency', null)),
    output: path.resolve(map.get('output') ?? path.join(root, 'bench', 'results', `product-benchmark-${safeEnvironment}-${timestamp}.json`)),
  };
}

function repetitionsFor(scenario, options) {
  if (scenario.profile === 'cheap') return options.cheapSamples;
  if (scenario.profile === 'heavy') return options.heavySamples;
  return options.samples;
}

async function httpJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function measureHttpCached(baseUrl, fixture, options) {
  if (!fixture) return {
    id: 'http_cached_date',
    skipped: true,
    reason: 'No compatible verified rolling cache snapshot was accepted by the public provider.',
  };
  const target = fixture.targetStartJdn.toString();
  const url = `${baseUrl}/v1/date?calculationJdn=${fixture.calcJdn}&targetJdn=${target}&presentation=canonical`;
  return measureScenario({
    id: 'http_cached_date',
    description: 'Loopback HTTP v1 cached date request, including adapter and JSON serialization.',
    profile: 'cheap',
    warmup: options.warmup,
    repetitions: options.cheapSamples,
    async operation() {
      const { response, body } = await httpJson(url);
      if (response.status !== 200) throw new Error(`HTTP cached date returned ${response.status}`);
      return body;
    },
    validate(value) {
      if (value?.targetDay?.jdn !== target) throw new Error('HTTP cached date target mismatch');
    },
  });
}

async function acceptCacheFixture(fixture) {
  if (!fixture) return { fixture: null, reason: 'cache-data snapshot is unavailable' };
  try {
    const target = fixture.targetStartJdn.toString();
    const value = await queryApi.queryDate({
      calculation: { jdn: fixture.calcJdn.toString() },
      target: { jdn: target },
      presentation: 'canonical',
      include: ['provenance'],
    }, { generatedDir: fixture.generatedDir });
    if (value?.targetDay?.jdn !== target ||
        !fixture.dataRevision ||
        value?.provenance?.dataRevision !== fixture.dataRevision) {
      return { fixture: null, reason: 'cache-data snapshot was rejected by the public provider' };
    }
    return { fixture, reason: null };
  } catch (error) {
    return {
      fixture: null,
      reason: `cache-data snapshot was rejected: ${error?.code ?? error?.name ?? 'error'}`,
    };
  }
}

function overhead(httpScenario, directScenario) {
  if (!httpScenario || httpScenario.skipped || !directScenario) return null;
  const httpP50 = httpScenario.wallMs?.p50;
  const directP50 = directScenario.wallMs?.p50;
  if (!Number.isFinite(httpP50) || !Number.isFinite(directP50) || directP50 <= 0) return null;
  return {
    basis: 'p50 steady-state cached date wall time',
    httpP50Ms: httpP50,
    directP50Ms: directP50,
    deltaMs: httpP50 - directP50,
    ratio: httpP50 / directP50,
  };
}

async function concurrencyLevel(baseUrl, level, index, requestCountOverride = null) {
  const requestCount = requestCountOverride ?? Math.max(100, level);
  let next = 0;
  const latencies = new Array(requestCount);
  const statuses = new Map();
  const errors = new Map();
  const treeBefore = await snapshotProcessTree();
  const cpuBefore = process.cpuUsage();
  const started = process.hrtime.bigint();

  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= requestCount) return;
      const calc = FAR_FUTURE_CALC_JDN;
      const target = FAR_FUTURE_CALC_JDN + 1n + BigInt(index * 4096 + i * 17);
      const url = `${baseUrl}/v1/date?calculationJdn=${calc}&targetJdn=${target}&presentation=canonical`;
      const t0 = process.hrtime.bigint();
      let response;
      let body;
      try {
        ({ response, body } = await httpJson(url));
      } catch (error) {
        latencies[i] = Number(process.hrtime.bigint() - t0) / 1e6;
        errors.set('FETCH_ERROR', (errors.get('FETCH_ERROR') ?? 0) + 1);
        continue;
      }
      latencies[i] = Number(process.hrtime.bigint() - t0) / 1e6;
      statuses.set(String(response.status), (statuses.get(String(response.status)) ?? 0) + 1);
      if (response.status !== 200) {
        const code = body?.error?.code ?? `HTTP_${response.status}`;
        errors.set(code, (errors.get(code) ?? 0) + 1);
      } else if (body?.calculationDay?.jdn !== calc.toString() || body?.targetDay?.jdn !== target.toString()) {
        errors.set('RESULT_MISMATCH', (errors.get('RESULT_MISMATCH') ?? 0) + 1);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(level, requestCount) }, () => worker()));
  const ended = process.hrtime.bigint();
  const cpu = process.cpuUsage(cpuBefore);
  const treeAfter = await snapshotProcessTree();
  const wallMs = Number(ended - started) / 1e6;
  const successCount = statuses.get('200') ?? 0;
  return {
    concurrency: level,
    requestCount,
    successCount,
    errorCount: requestCount - successCount,
    statuses: Object.fromEntries(statuses),
    errors: Object.fromEntries(errors),
    wallMs,
    offeredRequestsPerSecond: requestCount * 1000 / wallMs,
    successfulRequestsPerSecond: successCount * 1000 / wallMs,
    latencyMs: distribution(latencies),
    nodeCpuMs: (cpu.user + cpu.system) / 1000,
    processTree: {
      scope: treeAfter.scope,
      cpuTotalMs: treeAfter.scope === treeBefore.scope ? Math.max(0, treeAfter.cpuMs - treeBefore.cpuMs) : null,
      rssBeforeBytes: treeBefore.rssBytes,
      rssAfterBytes: treeAfter.rssBytes,
      processCountBefore: treeBefore.processCount,
      processCountAfter: treeAfter.processCount,
    },
  };
}

function markdown(result) {
  const lines = [
    '# Public product benchmark',
    '',
    `- Environment: \`${result.machine.benchmarkEnvironment ?? 'unspecified'}\``,
    `- Commit: \`${result.machine.commit ?? 'unknown'}\``,
    `- Engine fingerprint: \`${result.machine.engineFingerprint ?? 'unknown'}\``,
    `- Native backend requested: \`${result.machine.nativeBackendRequested}\``,
    `- Resource scope: \`${result.machine.resourceMetricScope}\``,
    `- Policy: **informational baseline; no performance thresholds**`,
    '',
    '## Product scenarios',
    '',
    '| Scenario | n | p50 wall ms | p95 | p99 | mean Node CPU ms | tree CPU / iteration ms |',
    '|---|---:|---:|---:|---:|---:|---:|',
  ];
  for (const item of result.scenarios) {
    if (item.skipped) {
      lines.push(`| ${item.id} | skipped | — | — | — | — | — |`);
      continue;
    }
    lines.push(`| ${item.id} | ${item.repetitions} | ${formatNumber(item.wallMs?.p50)} | ${formatNumber(item.wallMs?.p95)} | ${formatNumber(item.wallMs?.p99)} | ${formatNumber(item.nodeCpuMs?.mean)} | ${formatNumber(item.processTree?.cpuPerIterationMs)} |`);
  }
  const cold = result.coldProcess;
  lines.push(
    '',
    '## Cold process',
    '',
    `Fresh-process p50 wall: **${formatNumber(cold.processWallMs?.p50)} ms**; p95: **${formatNumber(cold.processWallMs?.p95)} ms**; p99: **${formatNumber(cold.processWallMs?.p99)} ms**.`,
    '',
    '## HTTP overhead',
    '',
    result.httpOverhead
      ? `Cached-date p50 HTTP/direct ratio: **${formatNumber(result.httpOverhead.ratio, 2)}×**; delta: **${formatNumber(result.httpOverhead.deltaMs)} ms**.`
      : 'HTTP overhead was not computed because a verified cache-hit baseline was unavailable.',
    '',
    '## Concurrency / queue behavior',
    '',
    '| Concurrency | Requests | Success | Errors | p50 ms | p95 | p99 | req/s offered | req/s successful |',
    '|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  );
  for (const item of result.concurrency) {
    lines.push(`| ${item.concurrency} | ${item.requestCount} | ${item.successCount} | ${item.errorCount} | ${formatNumber(item.latencyMs.p50)} | ${formatNumber(item.latencyMs.p95)} | ${formatNumber(item.latencyMs.p99)} | ${formatNumber(item.offeredRequestsPerSecond, 1)} | ${formatNumber(item.successfulRequestsPerSecond, 1)} |`);
  }
  lines.push(
    '',
    'No latency/CPU/RSS/throughput threshold is applied by this suite. OPT-07 weighted transition maps remain DO NOT ADOPT unless new product-level evidence justifies reopening that research.',
    '',
  );
  return lines.join('\n');
}

const options = parseArgs(process.argv.slice(2));
process.env.SEER_REQUIRE_ENGINE_SERVICE = '1';
process.env.SEER_BENCH_ENVIRONMENT ??= options.environment;

const discoveredCache = await loadCacheFixture(options.generatedDir);
const discoveredFixture = discoveredCache ? { ...discoveredCache, generatedDir: options.generatedDir } : null;
const cacheAcceptance = await acceptCacheFixture(discoveredFixture);
const fixture = cacheAcceptance.fixture;
const acceptedGeneratedDir = fixture ? options.generatedDir : null;
console.error(`[bench] cache ${fixture ? 'accepted' : 'unavailable'}${cacheAcceptance.reason ? `: ${cacheAcceptance.reason}` : ''}`);
const exactFixture = discoveredFixture;
const coldCalc = exactFixture?.calcJdn ?? FAR_FUTURE_CALC_JDN;
const coldTarget = exactFixture?.missTargetJdn ?? (FAR_FUTURE_CALC_JDN + 1n);
console.error('[bench] cold-process start');
const coldProcess = await measureColdSeries({
  workerPath: coldWorkerPath,
  generatedDir: acceptedGeneratedDir,
  calculationJdn: coldCalc.toString(),
  targetJdn: coldTarget.toString(),
}, options.coldSamples);
console.error('[bench] cold-process done');

const publicIdentity = await createPublicIdentityProvider({ generatedDir: options.generatedDir }).snapshot();
const machine = await collectMachineMetadata({ rootDir: root, publicIdentity });
const { scenarios: definitions, workload } = await buildScenarios(queryApi, fixture, {
  smoke: options.smoke,
  exactFixture,
});
const scenarios = [];
for (const definition of definitions) {
  console.error(`[bench] scenario ${definition.id} start`);
  scenarios.push(await measureScenario({
    ...definition,
    warmup: options.warmup,
    repetitions: repetitionsFor(definition, options),
  }));
  console.error(`[bench] scenario ${definition.id} done`);
}

const server = await listen({
  host: '127.0.0.1',
  port: 0,
  queryOptions: acceptedGeneratedDir ? { generatedDir: acceptedGeneratedDir } : {},
});
let httpCached;
let concurrency;
try {
  const address = server.address();
  if (!address || typeof address !== 'object') throw new Error('HTTP benchmark server has no TCP address');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.error('[bench] http_cached_date start');
  httpCached = await measureHttpCached(baseUrl, fixture, options);
  console.error('[bench] http_cached_date done');
  const warmUrl = `${baseUrl}/v1/date?calculationJdn=${FAR_FUTURE_CALC_JDN}&targetJdn=${FAR_FUTURE_CALC_JDN + 1n}&presentation=canonical`;
  const warmResponse = await httpJson(warmUrl);
  if (warmResponse.response.status !== 200) throw new Error(`HTTP exact-service warmup returned ${warmResponse.response.status}`);
  concurrency = [];
  for (let i = 0; i < options.concurrency.length; i += 1) {
    const level = options.concurrency[i];
    console.error(`[bench] concurrency ${level} start`);
    concurrency.push(await concurrencyLevel(baseUrl, level, i, options.smoke ? Math.max(8, level * 2) : null));
    console.error(`[bench] concurrency ${level} done`);
  }
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

scenarios.push(httpCached);
const directCached = scenarios.find((item) => item.id === 'cached_date' && !item.skipped);
const result = {
  schema: 1,
  suite: 'pastafarian-calendar-seer-public-product',
  policy: {
    performanceThresholds: null,
    baselineStatus: 'informational',
    opt07WeightedTransitionMaps: 'DO_NOT_ADOPT',
  },
  options: {
    environment: options.environment,
    samples: options.samples,
    cheapSamples: options.cheapSamples,
    heavySamples: options.heavySamples,
    coldSamples: options.coldSamples,
    warmup: options.warmup,
    smoke: options.smoke,
    concurrency: options.concurrency,
  },
  machine,
  cache: fixture ? {
    available: true,
    calculationJdn: fixture.calcJdn.toString(),
    targetStartJdn: fixture.targetStartJdn.toString(),
    targetCount: fixture.targetCount,
    dataRevision: fixture.dataRevision,
    snapshotCommit: process.env.SEER_BENCH_CACHE_COMMIT ?? null,
  } : {
    available: false,
    reason: cacheAcceptance.reason,
    snapshotCommit: process.env.SEER_BENCH_CACHE_COMMIT ?? null,
  },
  workload,
  coldProcess,
  scenarios,
  httpOverhead: overhead(httpCached, directCached),
  concurrency,
};

await mkdir(path.dirname(options.output), { recursive: true });
await writeFile(options.output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
const markdownPath = options.output.replace(/\.json$/i, '.md');
await writeFile(markdownPath, `${markdown(result)}\n`, 'utf8');
console.log(JSON.stringify({ output: options.output, markdown: markdownPath, commit: machine.commit, environment: options.environment }));
