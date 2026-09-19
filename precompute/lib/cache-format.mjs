import { createHash } from 'node:crypto';
import { readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const INDEX_SCHEMA = 1;
export const CACHE_SCHEMA = 1;
export const TARGET_COUNT = 366;

export async function sha256File(filePath) {
  const data = await readFile(filePath);
  return createHash('sha256').update(data).digest('hex');
}

export async function sha256Tree(dirPath) {
  const hash = createHash('sha256');
  async function walk(current, relative = '') {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const rel = path.posix.join(relative.split(path.sep).join('/'), entry.name);
      if (entry.isDirectory()) await walk(full, rel);
      else if (entry.isFile()) {
        hash.update(rel); hash.update('\0'); hash.update(await readFile(full)); hash.update('\0');
      }
    }
  }
  await walk(dirPath);
  return hash.digest('hex');
}

export const ENGINE_SOURCE_FILES = Object.freeze([
  'pastafarian_year_batch.cpp',
  'rns_primes.hpp',
  'rns_primes32.hpp',
  'sauce_fast127_v12.hpp',
  'short_selection_o1.hpp',
  'seer_calendar_core.cpp',
  'seer_calendar_core.hpp',
  'seer_engine_service.cpp',
  'seer_month_dp_internal.hpp',
  'seer_selection_core.hpp',
  'seer_weave_avx2.cpp',
  'seer_weave_core.hpp',
  'seer_weave_portable.cpp',
  'seer_year_core.cpp',
  'seer_year_core.hpp',
  'seer_year_locator.cpp',
  'seer_year_structure.cpp',
]);

export async function sha256EngineInputs({ sourceDir, sourceFiles = ENGINE_SOURCE_FILES, dataFiles }) {
  const hash = createHash('sha256');
  hash.update('seer-engine-inputs-v5\0');
  for (const name of [...sourceFiles].sort((a, b) => a.localeCompare(b, 'en'))) {
    hash.update(`source/${name}`); hash.update('\0');
    const sourceBytes = await readFile(path.join(sourceDir, name));
    const canonicalSource = Buffer.from(sourceBytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
    hash.update(canonicalSource); hash.update('\0');
  }
  for (const [label, filePath] of Object.entries(dataFiles).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    hash.update(`data/${label}`); hash.update('\0');
    hash.update(await readFile(filePath)); hash.update('\0');
  }
  return hash.digest('hex');
}
export async function writeJsonAtomic(filePath, value) {
  const tmp = `${filePath}.tmp-${process.pid}`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tmp, filePath);
}

export function validateBatchCache(cache, { calcJdn, targetCount = TARGET_COUNT, engineFingerprint } = {}) {
  if (!cache || cache.schema !== CACHE_SCHEMA) throw new Error('cache schema mismatch');
  if (!Number.isSafeInteger(cache.calcJdn)) throw new Error('cache calcJdn is not a safe integer');
  if (calcJdn !== undefined && cache.calcJdn !== calcJdn) throw new Error('cache calcJdn mismatch');
  if (!Number.isSafeInteger(cache.targetStartJdn)) throw new Error('cache targetStartJdn is not a safe integer');
  if (cache.targetCount !== targetCount) throw new Error('cache targetCount mismatch');
  if (engineFingerprint && cache.engineFingerprint !== engineFingerprint) throw new Error('cache engine fingerprint mismatch');
  if (!Array.isArray(cache.records) || cache.records.length !== cache.targetCount) throw new Error('cache record count mismatch');
  for (let i = 0; i < cache.records.length; i += 1) {
    const expected = cache.targetStartJdn + i;
    const record = cache.records[i];
    if (!record || record.targetJdn !== expected) throw new Error(`cache target continuity mismatch at index ${i}`);
    for (const key of ['year', 'cutletIndex', 'dayInCutlet', 'monthIndex', 'dayInMonth', 'cutletCount', 'monthCount']) {
      if (!Number.isInteger(record[key])) throw new Error(`cache record ${i} has invalid ${key}`);
    }
  }
  return cache;
}

export function activeCalcFromIndex(index, instantInput) {
  if (!index || index.schema !== INDEX_SCHEMA || !Array.isArray(index.boundaries) || index.boundaries.length < 2) {
    throw new Error('invalid cache index');
  }
  const ms = instantInput instanceof Date ? instantInput.getTime() : new Date(instantInput).getTime();
  if (!Number.isFinite(ms)) throw new Error('invalid instant');
  for (let i = 0; i + 1 < index.boundaries.length; i += 1) {
    const start = Date.parse(index.boundaries[i].utc);
    const end = Date.parse(index.boundaries[i + 1].utc);
    if (ms >= start && ms < end) return index.boundaries[i].calcJdn;
  }
  throw new RangeError('instant is outside the precomputed boundary horizon');
}

export function lookupRecord(index, cache, instantInput, targetJdn) {
  const calcJdn = activeCalcFromIndex(index, instantInput);
  if (cache.calcJdn !== calcJdn) throw new Error(`wrong cache loaded: expected calc ${calcJdn}, got ${cache.calcJdn}`);
  if (!Number.isSafeInteger(targetJdn)) throw new RangeError('targetJdn must be a safe integer');
  const offset = targetJdn - cache.targetStartJdn;
  if (offset < 0 || offset >= cache.targetCount) throw new RangeError('target is outside the precomputed rolling-year cache');
  return cache.records[offset];
}

export async function fileExists(filePath) {
  try { await stat(filePath); return true; } catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
}
