import { createCacheRequestContext } from '../precompute/cache-lookup.mjs';
import { createExactEngine } from './exact-engine.mjs';
import { queryError } from './errors.mjs';

function cleanProvenance(index, descriptor) {
  const out = {};
  if (typeof index.engineFingerprint === 'string') out.engineRevision = index.engineFingerprint;
  if (typeof descriptor.sha256 === 'string') out.dataRevision = descriptor.sha256;
  return out;
}

function safeNumberOrNull(value) {
  const n = typeof value === 'bigint' ? value : BigInt(value);
  if (n < BigInt(Number.MIN_SAFE_INTEGER) || n > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(n);
}

export function createPrecomputedProvider({
  generatedDir,
  yearBatchBinary,
  yearLocatorBinary,
  dataDir,
  exactTimeoutMs,
  exactMaxBuffer,
  cacheContext,
} = {}) {
  if (!generatedDir) throw new TypeError('generatedDir is required');
  const cache = cacheContext ?? createCacheRequestContext({ generatedDir });
  const exact = createExactEngine({
    generatedDir,
    yearBatchBinary,
    yearLocatorBinary,
    dataDir,
    timeoutMs: exactTimeoutMs,
    maxBuffer: exactMaxBuffer,
  });

  return Object.freeze({
    // Stable compatibility id; behavior is cache-first plus canonical exact fallback.
    id: 'precomputed',

    async query({ calculationJdn, targetJdn }) {
      const calcJdn = safeNumberOrNull(calculationJdn);
      const target = safeNumberOrNull(targetJdn);

      if (calcJdn !== null && target !== null) {
        try {
          const loaded = await cache.loadRecord(calcJdn, target);
          return {
            record: loaded.record,
            structure: {
              ...(Number.isInteger(loaded.record.cutletCount) ? { cutletCount: loaded.record.cutletCount } : {}),
              ...(Number.isInteger(loaded.record.monthCount) ? { monthCount: loaded.record.monthCount } : {}),
            },
            provenance: cleanProvenance(loaded.index, loaded.descriptor),
          };
        } catch (error) {
          if (!(error instanceof RangeError)) {
            throw queryError('SEER_UNAVAILABLE', 'The precomputed cache is present but could not be verified.', {
              details: { provider: 'precomputed' }, cause: error,
            });
          }
          // Cache horizon is an implementation detail, never a public date-domain boundary.
        }
      }

      return exact.query({ calculationJdn, targetJdn });
    },

    async year({ calculationJdn, year, includeDays = false }) {
      return exact.year({ calculationJdn, year, includeDays });
    },
  });
}
