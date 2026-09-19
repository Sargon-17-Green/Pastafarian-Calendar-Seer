import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256File, validateBatchCache } from './cache-format.mjs';

export async function assessCacheRefresh({
  cacheDir,
  activeCalcJdn,
  engineFingerprint,
  astronomyFingerprint,
}) {
  const requiredCalcs = [activeCalcJdn, activeCalcJdn + 1, activeCalcJdn + 2];
  const reasons = [];
  let index;
  try {
    index = JSON.parse(await readFile(path.join(cacheDir, 'index.json'), 'utf8'));
  } catch (error) {
    reasons.push(error?.code === 'ENOENT' ? 'index-missing' : 'index-unreadable');
    return { refreshRequired: true, reasons, requiredCalcs };
  }

  if (index?.schema !== 1) reasons.push('index-schema');
  if (index?.engineFingerprint !== engineFingerprint) reasons.push('engine-fingerprint');
  if (index?.astronomyFingerprint !== astronomyFingerprint) reasons.push('astronomy-fingerprint');
  if (index?.activeCalcJdn !== activeCalcJdn) reasons.push('active-calculation-day');
  if (index?.lookAheadCalculationDays !== 2 || index?.rollingTargetDaysPerCalculationDay !== 366) reasons.push('cache-policy');

  const descriptors = Array.isArray(index?.caches) ? index.caches : [];
  for (const calcJdn of requiredCalcs) {
    const descriptor = descriptors.find((item) => item?.calcJdn === calcJdn);
    if (!descriptor) {
      reasons.push(`missing-${calcJdn}`);
      continue;
    }
    if (descriptor.path !== `calc/${calcJdn}.json` || !/^[0-9a-f]{64}$/i.test(descriptor.sha256 ?? '')) {
      reasons.push(`descriptor-${calcJdn}`);
      continue;
    }
    const cachePath = path.join(cacheDir, descriptor.path);
    try {
      if (await sha256File(cachePath) !== descriptor.sha256.toLowerCase()) throw new Error('checksum');
      const cache = validateBatchCache(JSON.parse(await readFile(cachePath, 'utf8')), {
        calcJdn,
        targetCount: 366,
        engineFingerprint,
      });
      if (cache.targetStartJdn !== descriptor.targetStartJdn || cache.targetCount !== descriptor.targetCount) throw new Error('descriptor');
    } catch {
      reasons.push(`invalid-${calcJdn}`);
    }
  }

  return {
    refreshRequired: reasons.length > 0,
    reasons: [...new Set(reasons)],
    requiredCalcs,
  };
}
