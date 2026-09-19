import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  sha256EngineInputs,
  sha256File,
  sha256Tree,
  validateBatchCache,
} from './lib/cache-format.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
function option(name) {
  const prefix = `${name}=`;
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const generatedDir = path.resolve(option('--generated-dir') || process.env.SEER_CACHE_DIR || path.join(root, '.cache-build', 'rolling'));
const expectedSourceCommit = option('--expected-source-commit') || null;
if (expectedSourceCommit !== null && !/^[0-9a-f]{40}$/i.test(expectedSourceCommit)) throw new Error('expected source commit must be a full Git SHA');

const top = (await readdir(generatedDir, { withFileTypes: true })).map((entry) => `${entry.isDirectory() ? 'd' : 'f'}:${entry.name}`).sort();
if (JSON.stringify(top) !== JSON.stringify(['d:calc', 'f:index.json'])) throw new Error(`unexpected cache artifact contents: ${top.join(', ')}`);

const index = JSON.parse(await readFile(path.join(generatedDir, 'index.json'), 'utf8'));
if (index.schema !== 1) throw new Error('index schema mismatch');
if (!Array.isArray(index.boundaries) || index.boundaries.length !== 4) throw new Error('expected four exact boundaries');
if (!Array.isArray(index.caches) || index.caches.length !== 3) throw new Error('expected three calculation-day caches');
if (index.lookAheadCalculationDays !== 2 || index.rollingTargetDaysPerCalculationDay !== 366) throw new Error('rolling cache policy mismatch');

const expectedEngineFingerprint = await sha256EngineInputs({
  sourceDir: path.join(root, 'prototype', 'src'),
  dataFiles: {
    positiveGates: path.join(root, 'prototype', 'data', 'gates_100k_u16.bin'),
    negativeGates: path.join(root, 'prototype', 'data', 'gates_negative_100k_u16.bin'),
  },
});
if (index.engineFingerprint !== expectedEngineFingerprint) throw new Error('cache engine fingerprint is incompatible with this source checkout');

const expectedAstronomyFingerprint = await sha256Tree(path.join(root, 'precompute', 'vendor', 'pastafari-calendar-1.4.1'));
if (index.astronomyFingerprint !== expectedAstronomyFingerprint) throw new Error('cache astronomy fingerprint is incompatible with this source checkout');

if (index.producer?.sourceCommit !== undefined && !/^[0-9a-f]{40}$/i.test(index.producer.sourceCommit)) throw new Error('invalid producer source commit');
if (expectedSourceCommit && index.producer?.sourceCommit?.toLowerCase() !== expectedSourceCommit.toLowerCase()) {
  throw new Error('cache producer source commit does not match expected source commit');
}

for (let i = 0; i < index.boundaries.length; i += 1) {
  if (index.boundaries[i].calcJdn !== index.activeCalcJdn + i) throw new Error('boundary calc sequence mismatch');
  if (i) {
    const hours = (Date.parse(index.boundaries[i].utc) - Date.parse(index.boundaries[i - 1].utc)) / 3_600_000;
    if (!(hours > 22 && hours < 26)) throw new Error(`unexpected Venus-boundary spacing: ${hours}h`);
  }
}

const expectedFiles = new Set();
for (const descriptor of index.caches) {
  const expectedPath = `calc/${descriptor.calcJdn}.json`;
  if (descriptor.path !== expectedPath) throw new Error(`invalid cache path: ${descriptor.path}`);
  expectedFiles.add(`${descriptor.calcJdn}.json`);
  const cachePath = path.join(generatedDir, descriptor.path);
  const cache = validateBatchCache(JSON.parse(await readFile(cachePath, 'utf8')), {
    calcJdn: descriptor.calcJdn,
    targetCount: index.rollingTargetDaysPerCalculationDay,
    engineFingerprint: index.engineFingerprint,
  });
  if (cache.targetStartJdn !== descriptor.targetStartJdn || cache.targetCount !== descriptor.targetCount) {
    throw new Error(`descriptor mismatch: ${descriptor.path}`);
  }
  if (await sha256File(cachePath) !== descriptor.sha256) throw new Error(`checksum mismatch: ${descriptor.path}`);
}
const actualFiles = new Set((await readdir(path.join(generatedDir, 'calc'))).filter((name) => /^-?\d+\.json$/.test(name)));
if (actualFiles.size !== expectedFiles.size || [...actualFiles].some((name) => !expectedFiles.has(name))) {
  throw new Error('cache directory does not exactly match index descriptors');
}

console.log(JSON.stringify({
  ok: true,
  activeCalcJdn: index.activeCalcJdn,
  sourceCommit: index.producer?.sourceCommit ?? null,
  engineFingerprint: index.engineFingerprint,
  cacheCount: index.caches.length,
}));
