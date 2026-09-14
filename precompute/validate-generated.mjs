import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256File, validateBatchCache } from './lib/cache-format.mjs';
import { cronForBoundary } from './lib/schedule.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generatedDir = path.join(root, 'generated');
const index = JSON.parse(await readFile(path.join(generatedDir, 'index.json'), 'utf8'));
if (index.schema !== 1) throw new Error('index schema mismatch');
if (!Array.isArray(index.boundaries) || index.boundaries.length !== 4) throw new Error('expected four exact boundaries');
if (!Array.isArray(index.caches) || index.caches.length !== 3) throw new Error('expected three calculation-day caches');
for (let i = 0; i < index.boundaries.length; i += 1) {
  if (index.boundaries[i].calcJdn !== index.activeCalcJdn + i) throw new Error('boundary calc sequence mismatch');
  if (i) {
    const hours = (Date.parse(index.boundaries[i].utc) - Date.parse(index.boundaries[i - 1].utc)) / 3_600_000;
    if (!(hours > 22 && hours < 26)) throw new Error(`unexpected Venus-boundary spacing: ${hours}h`);
  }
}
for (const descriptor of index.caches) {
  const cachePath = path.join(generatedDir, descriptor.path);
  const cache = validateBatchCache(JSON.parse(await readFile(cachePath, 'utf8')), {
    calcJdn: descriptor.calcJdn,
    targetCount: index.rollingTargetDaysPerCalculationDay,
    engineFingerprint: index.engineFingerprint,
  });
  if (cache.targetStartJdn !== descriptor.targetStartJdn) throw new Error('descriptor target start mismatch');
  if (await sha256File(cachePath) !== descriptor.sha256) throw new Error(`checksum mismatch: ${descriptor.path}`);
}
const numericCacheFiles = (await readdir(path.join(generatedDir, 'calc'))).filter((name) => /^-?\d+\.json$/.test(name));
if (numericCacheFiles.length !== 3) throw new Error(`expected exactly 3 current cache files, got ${numericCacheFiles.length}`);
const workflow = await readFile(path.join(root, '.github', 'workflows', 'precompute-seer-cache.yml'), 'utf8');
for (const boundary of index.boundaries.slice(1, 3)) {
  if (!workflow.includes(`cron: '${cronForBoundary(boundary.utc)}'`)) throw new Error(`workflow missing cron for ${boundary.utc}`);
}
console.log('Generated cache validation: PASS');
