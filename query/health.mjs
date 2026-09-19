import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { activeCalcFromIndex, validateBatchCache } from '../precompute/lib/cache-format.mjs';
import { createExactEngine } from './exact-engine.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_RUNTIME_ROOT = path.resolve(here, '..');
const DEFAULT_GENERATED_DIR = path.join(DEFAULT_RUNTIME_ROOT, 'generated');

export const DEFAULT_HEALTH_TIMEOUT_MS = 750;
const MAX_INDEX_BYTES = 1024 * 1024;
const MAX_CACHE_BYTES = 16 * 1024 * 1024;

async function readBounded(filePath, maxBytes) {
  const handle = await open(filePath, 'r');
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw new Error('health probe path is not a regular file');
    if (!Number.isSafeInteger(before.size) || before.size > maxBytes) {
      throw new Error('health probe file exceeds bounded size');
    }

    const buffer = Buffer.allocUnsafe(before.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const after = await handle.stat();
    if (after.size !== before.size || offset !== before.size) {
      throw new Error('health probe file changed during bounded read');
    }
    return buffer.subarray(0, offset);
  } finally {
    await handle.close();
  }
}

function parseIndex(bytes) {
  const index = JSON.parse(bytes.toString('utf8'));
  if (!index || index.schema !== 1 || !Array.isArray(index.caches) || !Array.isArray(index.boundaries)) {
    throw new Error('invalid cache index');
  }
  return index;
}

function descriptorFor(index, calcJdn) {
  const descriptor = index.caches.find((item) => item?.calcJdn === calcJdn);
  if (!descriptor || descriptor.path !== `calc/${calcJdn}.json` ||
      typeof descriptor.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(descriptor.sha256)) {
    throw new Error('invalid active cache descriptor');
  }
  return descriptor;
}

export async function probeCacheState({
  generatedDir = DEFAULT_GENERATED_DIR,
  now = new Date(),
} = {}) {
  let indexBytes;
  try {
    indexBytes = await readBounded(path.join(generatedDir, 'index.json'), MAX_INDEX_BYTES);
  } catch (error) {
    if (error?.code === 'ENOENT') return 'absent';
    return 'corrupt';
  }

  try {
    const index = parseIndex(indexBytes);
    let calcJdn;
    try {
      calcJdn = activeCalcFromIndex(index, now);
    } catch (error) {
      if (error instanceof RangeError) return 'stale';
      throw error;
    }

    const descriptor = descriptorFor(index, calcJdn);
    const cacheBytes = await readBounded(path.join(generatedDir, descriptor.path), MAX_CACHE_BYTES);
    const checksum = createHash('sha256').update(cacheBytes).digest('hex');
    if (checksum.toLowerCase() !== descriptor.sha256.toLowerCase()) throw new Error('cache checksum mismatch');

    const cache = JSON.parse(cacheBytes.toString('utf8'));
    validateBatchCache(cache, {
      calcJdn,
      targetCount: index.rollingTargetDaysPerCalculationDay,
      engineFingerprint: index.engineFingerprint,
    });
    if (descriptor.targetStartJdn !== cache.targetStartJdn || descriptor.targetCount !== cache.targetCount) {
      throw new Error('cache descriptor mismatch');
    }
    return 'ok';
  } catch {
    return 'corrupt';
  }
}

export function createSeerHealthProbe({
  generatedDir,
  runtimeRoot = DEFAULT_RUNTIME_ROOT,
  engineServiceBinary,
  yearBatchBinary,
  yearLocatorBinary,
  yearStructureBinary,
  dataDir,
  timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
  serviceSpawnRunner,
  exactEngine,
  nowFactory = () => new Date(),
} = {}) {
  const configuredCacheDir = generatedDir ?? process.env.SEER_CACHE_DIR;
  const cacheDir = configuredCacheDir ?? DEFAULT_GENERATED_DIR;
  const cacheRequiredForHealth = configuredCacheDir !== undefined;
  const exact = exactEngine ?? createExactEngine({
    generatedDir: path.join(runtimeRoot, 'generated'),
    engineServiceBinary,
    yearBatchBinary,
    yearLocatorBinary,
    yearStructureBinary,
    dataDir,
    timeoutMs,
    serviceSpawnRunner,
  });

  return Object.freeze({
    async probe({ now = nowFactory() } = {}) {
      const cachePromise = probeCacheState({ generatedDir: cacheDir, now });
      let engineAvailable = false;
      try {
        await exact.probe({ timeoutMs });
        engineAvailable = true;
      } catch {
        engineAvailable = false;
      }
      const cacheState = await cachePromise;
      if (!engineAvailable) return Object.freeze({ status: 'unavailable' });
      if (cacheState === 'ok' || (cacheState === 'absent' && !cacheRequiredForHealth)) {
        return Object.freeze({ status: 'ok' });
      }
      return Object.freeze({ status: 'degraded' });
    },
  });
}
