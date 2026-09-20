import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const STANDARD_CALC_JDN = 2461302n;
export const STANDARD_TARGET_JDN = 2461304n;
export const FOUNDATION_JDN = -13334246n;
export const FAR_PAST_CALC_JDN = -13334146n;
export const FAR_PAST_TARGET_JDN = -13337246n;
export const FAR_FUTURE_CALC_JDN = 6732954n;
export const FAR_FUTURE_TARGET_JDN = 6732955n;

function exact(value) {
  return String(value);
}

function dateRequest(calculationJdn, targetJdn) {
  return {
    calculation: { jdn: exact(calculationJdn) },
    target: { jdn: exact(targetJdn) },
    presentation: 'canonical',
  };
}

export async function loadCacheFixture(generatedDir) {
  try {
    const index = JSON.parse(await readFile(path.join(generatedDir, 'index.json'), 'utf8'));
    const descriptor = index?.caches?.[0];
    if (!descriptor || !Number.isSafeInteger(descriptor.calcJdn) ||
        !Number.isSafeInteger(descriptor.targetStartJdn) ||
        !Number.isSafeInteger(descriptor.targetCount) || descriptor.targetCount < 1) {
      throw new Error('rolling cache index has no usable descriptor');
    }
    return {
      generatedDir,
      calcJdn: BigInt(descriptor.calcJdn),
      targetStartJdn: BigInt(descriptor.targetStartJdn),
      targetCount: descriptor.targetCount,
      dataRevision: descriptor.sha256 ?? null,
      missTargetJdn: BigInt(descriptor.targetStartJdn + descriptor.targetCount + 25),
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function validateDateTarget(expected) {
  return (value) => {
    if (value?.targetDay?.jdn !== exact(expected)) {
      throw new Error(`benchmark date target mismatch: ${value?.targetDay?.jdn} != ${expected}`);
    }
  };
}

export async function buildScenarios(api, cacheFixture, { smoke = false, exactFixture = cacheFixture } = {}) {
  const generatedDir = cacheFixture?.generatedDir;
  const missCalc = exactFixture?.calcJdn ?? FAR_FUTURE_CALC_JDN;
  const missTarget = exactFixture?.missTargetJdn ?? FAR_FUTURE_TARGET_JDN;
  const batchCount = smoke ? 8 : 128;
  const fixedRangeCount = smoke ? 8 : 128;
  const sameTargetCount = smoke ? 2 : 32;
  const reverseSeed = await api.queryDate(dateRequest(STANDARD_CALC_JDN, STANDARD_TARGET_JDN), { generatedDir });
  const reverseRequest = {
    calculation: { jdn: exact(STANDARD_CALC_JDN) },
    pastafarianDate: reverseSeed.pastafarianDate,
    presentation: 'canonical',
  };

  const scenarios = [];
  if (cacheFixture) {
    const cachedRequest = dateRequest(cacheFixture.calcJdn, cacheFixture.targetStartJdn);
    cachedRequest.include = ['provenance'];
    scenarios.push({
      id: 'cached_date',
      description: 'Verified rolling-cache date lookup through the public Node query API.',
      profile: 'cheap',
      operation: () => api.queryDate(cachedRequest, { generatedDir: cacheFixture.generatedDir }),
      validate(value) {
        validateDateTarget(cacheFixture.targetStartJdn)(value);
        if (cacheFixture.dataRevision && value?.provenance?.dataRevision !== cacheFixture.dataRevision) {
          throw new Error('cached_date did not prove the expected rolling-cache data revision');
        }
      },
    });
  }

  scenarios.push(
    {
      id: 'cache_miss_exact_date',
      description: 'Out-of-cache exact date lookup in a warm process.',
      operation: () => api.queryDate(dateRequest(missCalc, missTarget), { generatedDir }),
      validate: validateDateTarget(missTarget),
    },
    {
      id: 'c_equals_t',
      description: 'Exact date with calculation day equal to target day (c=t).',
      operation: () => api.queryDate(dateRequest(FAR_FUTURE_CALC_JDN, FAR_FUTURE_CALC_JDN), { generatedDir }),
      validate: validateDateTarget(FAR_FUTURE_CALC_JDN),
    },
    {
      id: 'foundation_vicinity',
      description: 'Exact query in the immediate vicinity of the Foundation anchor.',
      profile: 'heavy',
      operation: () => api.queryDate(dateRequest(FOUNDATION_JDN + 2n, FOUNDATION_JDN + 1n), { generatedDir }),
      validate: validateDateTarget(FOUNDATION_JDN + 1n),
    },
    {
      id: 'far_past',
      description: 'Known-valid far-past exact date query.',
      operation: () => api.queryDate(dateRequest(FAR_PAST_CALC_JDN, FAR_PAST_TARGET_JDN), { generatedDir }),
      validate: validateDateTarget(FAR_PAST_TARGET_JDN),
    },
    {
      id: 'far_future',
      description: 'Known-valid far-future exact date query.',
      operation: () => api.queryDate(dateRequest(FAR_FUTURE_CALC_JDN, FAR_FUTURE_TARGET_JDN), { generatedDir }),
      validate: validateDateTarget(FAR_FUTURE_TARGET_JDN),
    },
    {
      id: 'reverse',
      description: 'Public reverse conversion from a complete canonical Pastafarian tuple.',
      operation: () => api.queryReverse(reverseRequest, { generatedDir }),
      validate: validateDateTarget(STANDARD_TARGET_JDN),
    },
    {
      id: 'year_without_days',
      description: 'Exact year structure without materializing every day.',
      operation: () => api.queryYear('5000', {
        calculation: { jdn: exact(STANDARD_CALC_JDN) },
        presentation: 'canonical',
      }, { generatedDir }),
      validate(value) {
        if (value?.year?.number !== '5000' || !Number.isInteger(value?.year?.lengthDays)) {
          throw new Error('year_without_days returned an invalid year');
        }
        if ('days' in (value?.year ?? {})) throw new Error('year_without_days unexpectedly returned days');
      },
    },
    {
      id: 'year_with_days',
      description: 'Exact year structure including every day.',
      profile: 'heavy',
      operation: () => api.queryYear('5000', {
        calculation: { jdn: exact(STANDARD_CALC_JDN) },
        presentation: 'canonical',
        include: ['days'],
      }, { generatedDir }),
      validate(value) {
        if (value?.year?.number !== '5000' || !Array.isArray(value?.year?.days) ||
            value.year.days.length !== value.year.lengthDays) {
          throw new Error('year_with_days returned an invalid day sequence');
        }
      },
    },
    {
      id: smoke ? 'batch_8_smoke' : 'batch_128',
      description: `Public batch API with ${batchCount} independent exact date queries under one calculation day.`,
      operation: () => api.queryBatch({
        defaults: {
          calculation: { jdn: exact(missCalc) },
          presentation: 'canonical',
        },
        queries: Array.from({ length: batchCount }, (_, i) => ({
          id: `q${i}`,
          target: { jdn: exact(missTarget + BigInt(i)) },
        })),
      }, { generatedDir }),
      validate(value) {
        if (!Array.isArray(value?.results) || value.results.length !== batchCount ||
            value.results.some((item) => !item.ok)) {
          throw new Error('batch_128 returned a failed or missing item');
        }
      },
    },
    {
      id: smoke ? 'fixed_range_8_smoke' : 'fixed_range_128',
      description: `Public fixed-calculation range with ${fixedRangeCount} consecutive targets.`,
      operation: () => api.queryRange({
        calculation: { jdn: exact(missCalc) },
        start: { jdn: exact(missTarget) },
        count: String(fixedRangeCount),
        calculationMode: 'fixed',
        presentation: 'canonical',
      }, { generatedDir }),
      validate(value) {
        if (!Array.isArray(value?.results) || value.results.length !== fixedRangeCount) {
          throw new Error('fixed_range_128 returned the wrong result count');
        }
      },
    },
    {
      id: smoke ? 'same_as_target_range_2_smoke' : 'same_as_target_range_32',
      description: `Public same-as-target range with ${sameTargetCount} independent calculation days.`,
      profile: 'heavy',
      operation: () => api.queryRange({
        start: { jdn: exact(FAR_FUTURE_CALC_JDN) },
        count: String(sameTargetCount),
        calculationMode: 'same-as-target',
        presentation: 'canonical',
      }, { generatedDir }),
      validate(value) {
        if (!Array.isArray(value?.results) || value.results.length !== sameTargetCount ||
            value.results.some((item) => item.calculationDay.jdn !== item.targetDay.jdn)) {
          throw new Error('same_as_target_range_32 violated c=t');
        }
      },
    },
    {
      id: 'warm_persistent_service_date',
      description: 'Repeated exact date on an already-started persistent native service.',
      profile: 'cheap',
      operation: () => api.queryDate(dateRequest(FAR_FUTURE_CALC_JDN, FAR_FUTURE_TARGET_JDN + 7n), { generatedDir }),
      validate: validateDateTarget(FAR_FUTURE_TARGET_JDN + 7n),
    },
  );
  return {
    scenarios,
    missCalc,
    missTarget,
    reverseRequest,
    workload: {
      exactMiss: {
        calculationJdn: exact(missCalc),
        targetJdn: exact(missTarget),
      },
      batchCount,
      fixedRangeCount,
      sameTargetCount,
    },
  };
}
