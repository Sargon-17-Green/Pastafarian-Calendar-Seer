import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CACHE_SCHEMA,
  INDEX_SCHEMA,
  TARGET_COUNT,
  fileExists,
  sha256File,
  sha256Tree,
  validateBatchCache,
  writeJsonAtomic,
} from './lib/cache-format.mjs';
import { rewriteGeneratedSchedule } from './lib/schedule.mjs';
import { KISURRA_OBSERVER } from './vendor/pastafari-calendar-1.4.1/observer-location.js';
import {
  DAY_BOUNDARY_MODEL_VERSION,
  boundaryForDayJdn,
  currentDayAt,
} from './vendor/pastafari-calendar-1.4.1/venus-day-boundary.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const generatedDir = path.join(root, 'generated');
const calcDir = path.join(generatedDir, 'calc');
const workflowPath = path.join(root, '.github', 'workflows', 'precompute-seer-cache.yml');
const binaryPath = process.env.SEER_YEAR_BATCH_BIN || path.join(root, 'prototype', 'build', 'seer_year_batch');
const dataDir = path.join(root, 'prototype', 'data');

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const noWorkflowRewrite = args.has('--no-workflow-rewrite');
const nowArg = process.argv.slice(2).find((arg) => arg.startsWith('--now='));
const now = nowArg ? new Date(nowArg.slice('--now='.length)) : new Date();
if (!Number.isFinite(now.getTime())) throw new RangeError('invalid --now instant');

await mkdir(calcDir, { recursive: true });

const engineFingerprint = await sha256Tree(path.join(root, 'prototype', 'src'));
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
  // Date uses millisecond resolution and TimeClip may land fractionally before the
  // solved JD.  Cache activation is therefore rounded UP to the first millisecond
  // that is certainly not earlier than the astronomical root.
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
  if (needsBuild) await writeJsonAtomic(absolute, runBatch(calcJdn));
  cacheDescriptors.push({
    calcJdn,
    path: `calc/${filename}`,
    sha256: await sha256File(absolute),
    targetStartJdn: calcJdn,
    targetCount: TARGET_COUNT,
  });
}

// Keep only the active day and the two-day look-ahead in the current tree.
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

if (!noWorkflowRewrite) {
  const workflow = await readFile(workflowPath, 'utf8');
  const nextWorkflow = rewriteGeneratedSchedule(workflow, boundaries.slice(1, 3));
  if (nextWorkflow !== workflow) await writeFile(workflowPath, nextWorkflow, 'utf8');
}

process.stdout.write(`${JSON.stringify({
  activeCalcJdn: activeCalc,
  caches: requiredCalcs,
  nextBoundaryUtc: boundaries[1].utc,
  followingBoundaryUtc: boundaries[2].utc,
  engineFingerprint,
  astronomyFingerprint,
}, null, 2)}\n`);
