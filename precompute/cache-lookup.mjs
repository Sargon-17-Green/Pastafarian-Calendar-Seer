import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { activeCalcFromIndex, lookupRecord, validateBatchCache } from './lib/cache-format.mjs';

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
