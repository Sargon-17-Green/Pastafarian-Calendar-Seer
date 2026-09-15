import { loadCacheRecordForCalculationDay } from '../precompute/cache-lookup.mjs';
import { exactIntegerToSafeNumber } from './exact-integer.mjs';
import { queryError } from './errors.mjs';

function cleanProvenance(index, descriptor) {
  const out = {};
  if (typeof index.engineFingerprint === 'string') out.engineRevision = index.engineFingerprint;
  if (typeof descriptor.sha256 === 'string') out.dataRevision = descriptor.sha256;
  return out;
}

export function createPrecomputedProvider({ generatedDir }) {
  if (!generatedDir) throw new TypeError('generatedDir is required');
  return Object.freeze({
    id: 'precomputed',
    async query({ calculationJdn, targetJdn }) {
      const calcJdn = exactIntegerToSafeNumber(calculationJdn, {
        field: 'calculation.jdn', code: 'CALCULATION_OUT_OF_SUPPORTED_DOMAIN',
      });
      const target = exactIntegerToSafeNumber(targetJdn, {
        field: 'target.jdn', code: 'TARGET_OUT_OF_SUPPORTED_DOMAIN',
      });
      try {
        const loaded = await loadCacheRecordForCalculationDay({ generatedDir, calcJdn, targetJdn: target });
        return {
          record: loaded.record,
          structure: {
            ...(Number.isInteger(loaded.record.cutletCount) ? { cutletCount: loaded.record.cutletCount } : {}),
            ...(Number.isInteger(loaded.record.monthCount) ? { monthCount: loaded.record.monthCount } : {}),
          },
          provenance: cleanProvenance(loaded.index, loaded.descriptor),
        };
      } catch (error) {
        if (error instanceof RangeError) {
          throw queryError('SEER_UNAVAILABLE', 'The configured Seer provider has no exact result for this query.', {
            details: { provider: 'precomputed' }, cause: error,
          });
        }
        throw queryError('SEER_UNAVAILABLE', 'The configured Seer provider could not supply a verified result.', {
          details: { provider: 'precomputed' }, cause: error,
        });
      }
    },
    async year() {
      throw queryError('SEER_UNAVAILABLE', 'The rolling precomputed provider does not contain complete fixed-calculation-day year structures.', {
        details: { provider: 'precomputed' },
      });
    },
  });
}
