import { spawn, spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import os from 'node:os';

const CLOCK_TICKS = (() => {
  if (process.platform !== 'linux') return null;
  const result = spawnSync('getconf', ['CLK_TCK'], { encoding: 'utf8' });
  const parsed = Number(result.stdout?.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
})();

export function percentile(values, q) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const h = (sorted.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  const fraction = h - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * fraction;
}

function finite(values) {
  return values.filter((value) => Number.isFinite(value));
}

export function distribution(values) {
  const samples = finite(values);
  if (samples.length === 0) {
    return { samples: 0, min: null, mean: null, p50: null, p95: null, p99: null, max: null };
  }
  const sum = samples.reduce((a, b) => a + b, 0);
  return {
    samples: samples.length,
    min: Math.min(...samples),
    mean: sum / samples.length,
    p50: percentile(samples, 0.50),
    p95: samples.length >= 20 ? percentile(samples, 0.95) : null,
    p99: samples.length >= 100 ? percentile(samples, 0.99) : null,
    max: Math.max(...samples),
  };
}

function parseLinuxStat(text) {
  const close = text.lastIndexOf(')');
  if (close < 0) return null;
  const fields = text.slice(close + 1).trim().split(/\s+/);
  if (fields.length < 22) return null;
  return {
    ppid: Number(fields[1]),
    utime: Number(fields[11]),
    stime: Number(fields[12]),
  };
}

async function linuxProcessSnapshot() {
  const entries = await readdir('/proc', { withFileTypes: true });
  const processes = new Map();
  await Promise.all(entries
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map(async (entry) => {
      const pid = Number(entry.name);
      try {
        const [statText, statusText] = await Promise.all([
          readFile(`/proc/${pid}/stat`, 'utf8'),
          readFile(`/proc/${pid}/status`, 'utf8'),
        ]);
        const stat = parseLinuxStat(statText);
        if (!stat || !Number.isFinite(stat.ppid)) return;
        const rssMatch = /^VmRSS:\s+(\d+)\s+kB$/m.exec(statusText);
        processes.set(pid, {
          pid,
          ppid: stat.ppid,
          cpuMs: ((stat.utime + stat.stime) * 1000) / CLOCK_TICKS,
          rssBytes: rssMatch ? Number(rssMatch[1]) * 1024 : 0,
        });
      } catch {}
    }));
  return processes;
}

function descendants(processes, rootPid) {
  const byParent = new Map();
  for (const item of processes.values()) {
    let list = byParent.get(item.ppid);
    if (!list) {
      list = [];
      byParent.set(item.ppid, list);
    }
    list.push(item.pid);
  }
  const wanted = new Set([rootPid]);
  const stack = [rootPid];
  while (stack.length) {
    const pid = stack.pop();
    for (const child of byParent.get(pid) ?? []) {
      if (wanted.has(child)) continue;
      wanted.add(child);
      stack.push(child);
    }
  }
  return [...wanted].map((pid) => processes.get(pid)).filter(Boolean);
}

export async function snapshotProcessTree(rootPid = process.pid) {
  if (process.platform === 'linux') {
    const processes = await linuxProcessSnapshot();
    const items = descendants(processes, rootPid);
    return {
      scope: 'linux-process-tree',
      processCount: items.length,
      cpuMs: items.reduce((sum, item) => sum + item.cpuMs, 0),
      rssBytes: items.reduce((sum, item) => sum + item.rssBytes, 0),
    };
  }
  const usage = process.cpuUsage();
  return {
    scope: 'node-process-only',
    processCount: 1,
    cpuMs: (usage.user + usage.system) / 1000,
    rssBytes: process.memoryUsage().rss,
  };
}

function diffCpu(before, after) {
  if (before.scope !== after.scope) return null;
  const value = after.cpuMs - before.cpuMs;
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export async function measureScenario({ id, description, operation, validate, warmup = 2, repetitions = 20, profile = 'standard' }) {
  for (let i = 0; i < warmup; i += 1) {
    const value = await operation();
    await validate?.(value);
  }

  const treeBefore = await snapshotProcessTree();
  const wallMs = [];
  const nodeCpuMs = [];
  const nodeRssAfterBytes = [];
  let lastValue;

  for (let i = 0; i < repetitions; i += 1) {
    const cpuBefore = process.cpuUsage();
    const start = process.hrtime.bigint();
    lastValue = await operation();
    const end = process.hrtime.bigint();
    const cpu = process.cpuUsage(cpuBefore);
    await validate?.(lastValue);
    wallMs.push(Number(end - start) / 1e6);
    nodeCpuMs.push((cpu.user + cpu.system) / 1000);
    nodeRssAfterBytes.push(process.memoryUsage().rss);
  }

  const treeAfter = await snapshotProcessTree();
  const treeCpuTotalMs = diffCpu(treeBefore, treeAfter);
  return {
    id,
    description,
    profile,
    lifecycle: 'warm-process',
    warmup,
    repetitions,
    wallMs: distribution(wallMs),
    nodeCpuMs: distribution(nodeCpuMs),
    nodeRssAfterBytes: distribution(nodeRssAfterBytes),
    processTree: {
      scope: treeAfter.scope,
      cpuTotalMs: treeCpuTotalMs,
      cpuPerIterationMs: treeCpuTotalMs === null ? null : treeCpuTotalMs / repetitions,
      rssBeforeBytes: treeBefore.rssBytes,
      rssAfterBytes: treeAfter.rssBytes,
      processCountBefore: treeBefore.processCount,
      processCountAfter: treeAfter.processCount,
    },
  };
}

export async function runColdWorker({ workerPath, generatedDir, calculationJdn, targetJdn }) {
  const args = [
    workerPath,
    `--generated-dir=${generatedDir}`,
    `--calculation-jdn=${calculationJdn}`,
    `--target-jdn=${targetJdn}`,
  ];
  const started = process.hrtime.bigint();
  const child = spawn(process.execPath, args, {
    env: { ...process.env, SEER_REQUIRE_ENGINE_SERVICE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  const ended = process.hrtime.bigint();
  if (code !== 0) {
    throw new Error(`cold benchmark worker exited ${code}: ${stderr || stdout}`);
  }
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length !== 1) throw new Error(`cold benchmark worker emitted ${lines.length} output lines`);
  return {
    processWallMs: Number(ended - started) / 1e6,
    ...JSON.parse(lines[0]),
  };
}

export async function measureColdSeries(options, repetitions) {
  const samples = [];
  for (let i = 0; i < repetitions; i += 1) samples.push(await runColdWorker(options));
  return {
    id: 'cold_process_exact_date',
    description: 'Fresh Node process plus fresh persistent native service for one exact cache-miss date query.',
    lifecycle: 'cold-process',
    repetitions,
    processWallMs: distribution(samples.map((item) => item.processWallMs)),
    queryWallMs: distribution(samples.map((item) => item.queryWallMs)),
    nodeCpuMs: distribution(samples.map((item) => item.nodeCpuMs)),
    processTreeCpuMs: distribution(samples.map((item) => item.processTreeCpuMs)),
    processTreeRssAfterBytes: distribution(samples.map((item) => item.processTreeRssAfterBytes)),
    resourceScope: samples[0]?.resourceScope ?? null,
  };
}

function commandFirstLine(command, args) {
  try {
    const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true });
    const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
    return text.split(/\r?\n/)[0] || null;
  } catch {
    return null;
  }
}

export function gitCommit(rootDir) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8', windowsHide: true });
  const value = result.stdout?.trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(value ?? '') ? value : null;
}

export async function collectMachineMetadata({ rootDir, publicIdentity = null } = {}) {
  const cpus = os.cpus();
  const tree = await snapshotProcessTree();
  return {
    capturedAtUtc: new Date().toISOString(),
    commit: gitCommit(rootDir),
    packageVersion: publicIdentity?.packageVersion ?? null,
    releaseTag: publicIdentity?.releaseTag ?? null,
    artifactMode: publicIdentity?.artifactMode ?? 'source',
    engineFingerprint: publicIdentity?.engineFingerprint ?? null,
    cacheRevision: publicIdentity?.cacheRevision ?? null,
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    cpu: {
      logicalCount: cpus.length,
      models: [...new Set(cpus.map((cpu) => cpu.model))],
      nominalMHz: [...new Set(cpus.map((cpu) => cpu.speed))],
    },
    totalMemoryBytes: os.totalmem(),
    node: {
      version: process.version,
      versions: process.versions,
    },
    compiler: commandFirstLine(process.env.CXX || 'g++', ['--version']),
    benchmarkEnvironment: process.env.SEER_BENCH_ENVIRONMENT ?? null,
    nativeBackendRequested: process.env.SEER_RNS_BACKEND ?? 'auto',
    marchRequested: process.env.SEER_MARCH ?? null,
    resourceMetricScope: tree.scope,
    runner: {
      os: process.env.RUNNER_OS ?? null,
      arch: process.env.RUNNER_ARCH ?? null,
      imageOs: process.env.ImageOS ?? null,
      imageVersion: process.env.ImageVersion ?? null,
    },
    exactConcurrency: Number(process.env.SEER_EXACT_CONCURRENCY ?? 8),
    exactQueueMax: Number(process.env.SEER_EXACT_QUEUE_MAX ?? 256),
    serviceQueueMax: Number(process.env.SEER_SERVICE_QUEUE_MAX ?? 64),
  };
}

export function formatNumber(value, digits = 3) {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(digits);
}
