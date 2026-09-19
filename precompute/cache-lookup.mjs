import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { activeCalcFromIndex, lookupRecord, validateBatchCache } from './lib/cache-format.mjs';

function bytes(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function parseJson(data, label) {
  try { return JSON.parse(bytes(data).toString('utf8')); }
  catch (error) { throw new Error(`${label} is not valid JSON`, { cause: error }); }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function validateIndex(index) {
  if (!index || typeof index !== 'object' || !Array.isArray(index.caches)) throw new Error('invalid cache index');
  return index;
}

export function createCacheRequestContext({ generatedDir, readFileImpl = readFile } = {}) {
  if (!generatedDir) throw new TypeError('generatedDir is required');
  const indexPath = path.join(generatedDir, 'index.json');
  let indexPromise;
  const cachePromises = new Map();

  async function loadIndex() {
    if (!indexPromise) indexPromise = (async () => {
      const raw = bytes(await readFileImpl(indexPath));
      const index = deepFreeze(validateIndex(parseJson(raw, 'cache index')));
      return Object.freeze({ index, indexSha256: sha256(raw) });
    })();
    return indexPromise;
  }

  async function loadCalculationDay(calcJdn) {
    if (!Number.isSafeInteger(calcJdn)) throw new RangeError('calcJdn must be a safe integer');
    let pending = cachePromises.get(calcJdn);
    if (!pending) {
      pending = (async () => {
        const { index, indexSha256 } = await loadIndex();
        const descriptor = index.caches.find((item) => item.calcJdn === calcJdn);
        if (!descriptor) throw new RangeError(`no precomputed cache for calculation day ${calcJdn}`);
        const expectedPath = `calc/${calcJdn}.json`;
        if (descriptor.path !== expectedPath || typeof descriptor.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(descriptor.sha256)) {
          throw new Error(`invalid cache descriptor for calculation day ${calcJdn}`);
        }
        const cachePath = path.join(generatedDir, descriptor.path);
        const raw = bytes(await readFileImpl(cachePath));
        const actualSha256 = sha256(raw);
        if (actualSha256.toLowerCase() !== descriptor.sha256.toLowerCase()) {
          throw new Error(`cache checksum mismatch for calculation day ${calcJdn}`);
        }
        const cache = deepFreeze(validateBatchCache(parseJson(raw, `cache ${calcJdn}`), {
          calcJdn,
          targetCount: index.rollingTargetDaysPerCalculationDay,
          engineFingerprint: index.engineFingerprint,
        }));
        if (descriptor.targetStartJdn !== cache.targetStartJdn || descriptor.targetCount !== cache.targetCount) {
          throw new Error(`cache descriptor mismatch for calculation day ${calcJdn}`);
        }
        return Object.freeze({ index, indexSha256, descriptor, cache });
      })();
      cachePromises.set(calcJdn, pending);
    }
    return pending;
  }

  async function loadRecord(calcJdn, targetJdn) {
    if (!Number.isSafeInteger(targetJdn)) throw new RangeError('targetJdn must be a safe integer');
    const loaded = await loadCalculationDay(calcJdn);
    const offset = targetJdn - loaded.cache.targetStartJdn;
    if (offset < 0 || offset >= loaded.cache.targetCount) throw new RangeError('target is outside the precomputed rolling-year cache');
    return Object.freeze({ calcJdn, record: loaded.cache.records[offset], index: loaded.index, descriptor: loaded.descriptor, indexSha256: loaded.indexSha256 });
  }

  async function loadAnswer(instant = new Date(), targetJdn) {
    const { index } = await loadIndex();
    const calcJdn = activeCalcFromIndex(index, instant);
    const loaded = await loadCalculationDay(calcJdn);
    return Object.freeze({ calcJdn, record: lookupRecord(index, loaded.cache, instant, targetJdn), index, descriptor: loaded.descriptor, indexSha256: loaded.indexSha256 });
  }

  return Object.freeze({ loadIndex, loadCalculationDay, loadRecord, loadAnswer });
}

export async function loadCacheForCalculationDay({ generatedDir, calcJdn }) {
  const loaded = await createCacheRequestContext({ generatedDir }).loadCalculationDay(calcJdn);
  return { index: loaded.index, descriptor: loaded.descriptor, cache: loaded.cache };
}

export async function loadCacheRecordForCalculationDay({ generatedDir, calcJdn, targetJdn }) {
  return createCacheRequestContext({ generatedDir }).loadRecord(calcJdn, targetJdn);
}

export async function loadCacheAnswer({ generatedDir, instant = new Date(), targetJdn }) {
  return createCacheRequestContext({ generatedDir }).loadAnswer(instant, targetJdn);
}
