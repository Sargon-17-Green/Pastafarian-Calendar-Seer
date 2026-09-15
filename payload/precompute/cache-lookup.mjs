import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { activeCalcFromIndex, lookupRecord, validateBatchCache } from './lib/cache-format.mjs';

export async function loadCacheForCalculationDay({ generatedDir, calcJdn }) {
  if (!Number.isSafeInteger(calcJdn)) throw new RangeError('calcJdn must be a safe integer');
  const index = JSON.parse(await readFile(path.join(generatedDir, 'index.json'), 'utf8'));
  const descriptor = index.caches.find((item) => item.calcJdn === calcJdn);
  if (!descriptor) throw new RangeError(`no precomputed cache for calculation day ${calcJdn}`);
  const cachePath = path.join(generatedDir, descriptor.path);
  const cache = validateBatchCache(JSON.parse(await readFile(cachePath, 'utf8')), {
    calcJdn,
    targetCount: index.rollingTargetDaysPerCalculationDay,
    engineFingerprint: index.engineFingerprint,
  });
  if (descriptor.targetStartJdn !== cache.targetStartJdn || descriptor.targetCount !== cache.targetCount) {
    throw new Error(`cache descriptor mismatch for calculation day ${calcJdn}`);
  }
  return { index, descriptor, cache };
}

export async function loadCacheRecordForCalculationDay({ generatedDir, calcJdn, targetJdn }) {
  const { index, descriptor, cache } = await loadCacheForCalculationDay({ generatedDir, calcJdn });
  if (!Number.isSafeInteger(targetJdn)) throw new RangeError('targetJdn must be a safe integer');
  const offset = targetJdn - cache.targetStartJdn;
  if (offset < 0 || offset >= cache.targetCount) throw new RangeError('target is outside the precomputed rolling-year cache');
  return { calcJdn, record: cache.records[offset], index, descriptor };
}

export async function loadCacheAnswer({ generatedDir, instant = new Date(), targetJdn }) {
  const index = JSON.parse(await readFile(path.join(generatedDir, 'index.json'), 'utf8'));
  const calcJdn = activeCalcFromIndex(index, instant);
  const descriptor = index.caches.find((item) => item.calcJdn === calcJdn);
  if (!descriptor) throw new RangeError(`no precomputed cache for calculation day ${calcJdn}`);
  const cachePath = path.join(generatedDir, descriptor.path);
  const cache = validateBatchCache(JSON.parse(await readFile(cachePath, 'utf8')), {
    calcJdn,
    targetCount: index.rollingTargetDaysPerCalculationDay,
    engineFingerprint: index.engineFingerprint,
  });
  if (descriptor.targetStartJdn !== cache.targetStartJdn || descriptor.targetCount !== cache.targetCount) {
    throw new Error(`cache descriptor mismatch for calculation day ${calcJdn}`);
  }
  return { calcJdn, record: lookupRecord(index, cache, instant, targetJdn), index, descriptor };
}
