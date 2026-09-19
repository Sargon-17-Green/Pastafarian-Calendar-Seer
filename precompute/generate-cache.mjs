import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CACHE_SCHEMA,
  INDEX_SCHEMA,
  TARGET_COUNT,
  fileExists,
  sha256File,
  sha256EngineInputs,
  sha256Tree,
  validateBatchCache,
  writeJsonAtomic,
} from './lib/cache-format.mjs';
import { KISURRA_OBSERVER } from './vendor/pastafari-calendar-1.4.1/observer-location.js';
import {
  DAY_BOUNDARY_MODEL_VERSION,
  boundaryForDayJdn,
  currentDayAt,
} from './vendor/pastafari-calendar-1.4.1/venus-day-boundary.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dataDir = path.join(root, 'prototype', 'data');
const binaryPath = process.env.SEER_YEAR_BATCH_BIN || path.join(root, 'prototype', 'build', process.platform === 'win32' ? 'seer_year_batch.exe' : 'seer_year_batch');
const argv = process.argv.slice(2);

function option(name) {
  const prefix = `${name}=`;
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const force = argv.includes('--force');
const nowText = option('--now');
const now = nowText === undefined ? new Date() : new Date(nowText);
if (!Number.isFinite(now.getTime())) throw new RangeError('invalid --now instant');

const generatedDir = path.resolve(option('--output-dir') || process.env.SEER_CACHE_OUTPUT_DIR || path.join(root, '.cache-build', 'rolling'));
const calcDir = path.join(generatedDir, 'calc');
const sourceCommit = option('--source-commit') || process.env.GITHUB_SHA || null;
if (sourceCommit !== null && !/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error('source commit must be a full 40-character Git SHA');

await mkdir(calcDir, { recursive: true });

const engineFingerprint = await sha256EngineInputs({
  sourceDir: path.join(root, 'prototype', 'src'),
  dataFiles: {
    positiveGates: path.join(dataDir, 'gates_100k_u16.bin'),
    negativeGates: path.join(dataDir, 'gates_negative_100k_u16.bin'),
  },
});
const astronomyFingerprint = await sha256Tree(path.join(here, 'vendor', 'pastafari-calendar-1.4.1'));
const state = currentDayAt(now, KISURRA_OBSERVER);
const activeCalc = Number(state.jdn);
if (!Number.isSafeInteger(activeCalc)) throw new RangeError('active calculation JDN is outside JS safe-integer range');
const requiredCalcs = [activeCalc, activeCalc + 1, activeCalc + 2];
const UNIX_EPOCH_JD = 2_440_587.5;
const MS_PER_DAY = 86_400_000;
const boundaries = [0, 1, 2, 3].map((offset) => {
  const calcJdn = activeCalc + offset;
  const boundary = boundaryForDayJdn(BigInt(calcJdn), KISURRA_OBSERVER);
  const activationMs = Math.ceil((boundary.jd - UNIX_EPOCH_JD) * MS_PER_DAY);
  return {
    calcJdn,
    utc: new Date(activationMs).toISOString(),
    modelInstantUtc: boundary.instant.toISOString(),
    jd: boundary.jd,
  };
});

function runBatch(calcJdn) {
  const result = spawnSync(binaryPath, [String(calcJdn), String(calcJdn), String(TARGET_COUNT)], {
    cwd: dataDir,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`seer_year_batch failed for calc ${calcJdn} (exit ${result.status}):\n${result.stderr || result.stdout}`);
  }
  let parsed;
  try { parsed = JSON.parse(result.stdout); }
  catch (error) { throw new Error(`seer_year_batch emitted invalid JSON for calc ${calcJdn}: ${error.message}`); }
  const cache = {
    ...parsed,
    schema: CACHE_SCHEMA,
    calcJdn,
    targetStartJdn: calcJdn,
    targetCount: TARGET_COUNT,
    engineFingerprint,
    generatedBy: 'precompute/generate-cache.mjs',
  };
  validateBatchCache(cache, { calcJdn, targetCount: TARGET_COUNT, engineFingerprint });
  return cache;
}

const cacheDescriptors = [];
const builtCalcs = [];
const reusedCalcs = [];
for (const calcJdn of requiredCalcs) {
  const filename = `${calcJdn}.json`;
  const absolute = path.join(calcDir, filename);
  let needsBuild = force || !(await fileExists(absolute));
  if (!needsBuild) {
    try {
      const existing = JSON.parse(await readFile(absolute, 'utf8'));
      validateBatchCache(existing, { calcJdn, targetCount: TARGET_COUNT, engineFingerprint });
    } catch {
      needsBuild = true;
    }
  }
  if (needsBuild) {
    await writeJsonAtomic(absolute, runBatch(calcJdn));
    builtCalcs.push(calcJdn);
  } else {
    reusedCalcs.push(calcJdn);
  }
  cacheDescriptors.push({
    calcJdn,
    path: `calc/${filename}`,
    sha256: await sha256File(absolute),
    targetStartJdn: calcJdn,
    targetCount: TARGET_COUNT,
  });
}

const keep = new Set(requiredCalcs.map((value) => `${value}.json`));
for (const entry of await readdir(calcDir, { withFileTypes: true })) {
  if (entry.isFile() && /^-?\d+\.json$/.test(entry.name) && !keep.has(entry.name)) {
    await rm(path.join(calcDir, entry.name));
  }
}

const index = {
  schema: INDEX_SCHEMA,
  generatedAtUtc: new Date().toISOString(),
  generatedForInstantUtc: now.toISOString(),
  boundaryModel: DAY_BOUNDARY_MODEL_VERSION,
  astronomyFingerprint,
  engineFingerprint,
  producer: {
    repository: process.env.GITHUB_REPOSITORY || 'Sargon-17-Green/Pastafarian-Calendar-Seer',
    ...(sourceCommit ? { sourceCommit: sourceCommit.toLowerCase() } : {}),
  },
  observer: {
    name: 'Kisurra',
    latitude: KISURRA_OBSERVER.latitude,
    longitude: KISURRA_OBSERVER.longitude,
    elevationM: KISURRA_OBSERVER.elevationM,
  },
  activeCalcJdn: activeCalc,
  lookAheadCalculationDays: 2,
  rollingTargetDaysPerCalculationDay: TARGET_COUNT,
  boundaries,
  caches: cacheDescriptors,
};
await writeJsonAtomic(path.join(generatedDir, 'index.json'), index);

process.stdout.write(`${JSON.stringify({
  outputDir: generatedDir,
  activeCalcJdn: activeCalc,
  caches: requiredCalcs,
  builtCalcs,
  reusedCalcs,
  nextBoundaryUtc: boundaries[1].utc,
  engineFingerprint,
  astronomyFingerprint,
}, null, 2)}\n`);
