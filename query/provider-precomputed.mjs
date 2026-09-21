import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCacheRequestContext } from '../precompute/cache-lookup.mjs';
import { sha256EngineInputs } from '../precompute/lib/cache-format.mjs';
import { createExactEngine } from './exact-engine.mjs';
import { mapConcurrent, resolveExactConcurrency } from './concurrency.mjs';

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MAX_EXACT_BATCH_COUNT = 10_000;

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

function exactShape(record, provenance) {
  return {
    record,
    structure: {
      cutletCount: record.cutletCount,
      monthCount: record.monthCount,
    },
    provenance,
  };
}

export function createPrecomputedProvider({
  generatedDir,
  yearBatchBinary,
  yearLocatorBinary,
  yearStructureBinary,
  engineServiceBinary,
  dataDir,
  exactTimeoutMs,
  exactMaxBuffer,
  execFileRunner,
  cacheContext,
  runtimeRoot = moduleRoot,
  expectedEngineFingerprint,
  maxExactConcurrency,
  maxExactQueue,
  exactEngine,
} = {}) {
  if (!generatedDir) throw new TypeError('generatedDir is required');
  const cache = cacheContext ?? createCacheRequestContext({ generatedDir });
  const exactConcurrency = resolveExactConcurrency(maxExactConcurrency);
  const exact = exactEngine ?? createExactEngine({
    generatedDir: path.join(runtimeRoot, 'generated'),
    yearBatchBinary,
    yearLocatorBinary,
    yearStructureBinary,
    engineServiceBinary,
    dataDir,
    timeoutMs: exactTimeoutMs,
    maxBuffer: exactMaxBuffer,
    execFileRunner,
    maxConcurrency: exactConcurrency,
    maxQueue: maxExactQueue,
  });
  let engineFingerprintPromise;
  async function localEngineFingerprint() {
    if (expectedEngineFingerprint !== undefined) return expectedEngineFingerprint;
    if (!engineFingerprintPromise) engineFingerprintPromise = sha256EngineInputs({
      sourceDir: path.join(runtimeRoot, 'prototype', 'src'),
      dataFiles: {
        positiveGates: path.join(runtimeRoot, 'prototype', 'data', 'gates_100k_u16.bin'),
        negativeGates: path.join(runtimeRoot, 'prototype', 'data', 'gates_negative_100k_u16.bin'),
      },
    });
    return engineFingerprintPromise;
  }

  async function cachedShape(calculationJdn, targetJdn) {
    const calcJdn = safeNumberOrNull(calculationJdn);
    const target = safeNumberOrNull(targetJdn);
    if (calcJdn === null || target === null) return null;
    try {
      const loaded = await cache.loadRecord(calcJdn, target);
      if (loaded.index.engineFingerprint !== await localEngineFingerprint()) throw new Error('cache engine fingerprint mismatch');
      return {
        record: loaded.record,
        structure: {
          ...(Number.isInteger(loaded.record.cutletCount) ? { cutletCount: loaded.record.cutletCount } : {}),
          ...(Number.isInteger(loaded.record.monthCount) ? { monthCount: loaded.record.monthCount } : {}),
        },
        provenance: cleanProvenance(loaded.index, loaded.descriptor),
      };
    } catch {
      return null;
    }
  }

  let queue = [];
  let flushScheduled = false;

  async function resolveRun(calc, targets, waitersByTarget) {
    const start = targets[0];
    try {
      const supplied = await exact.queryRange({ calculationJdn: calc, targetStartJdn: start, count: targets.length });
      for (let i = 0; i < targets.length; i += 1) {
        const waiters = waitersByTarget.get(targets[i].toString());
        const shaped = exactShape(supplied.records[i], supplied.provenance);
        for (const waiter of waiters) waiter.resolve(shaped);
      }
      return;
    } catch (bulkError) {
      if (bulkError?.code !== 'TARGET_OUT_OF_SUPPORTED_DOMAIN') {
        for (const targetJdn of targets) {
          const waiters = waitersByTarget.get(targetJdn.toString());
          for (const waiter of waiters) waiter.reject(bulkError);
        }
        return;
      }

      // A target-domain bulk error can be item-specific. Retry only this case, sequentially
      // inside the calculation-day worker so fallback cannot multiply exact concurrency.
      for (let i = 0; i < targets.length; i += 1) {
        const targetJdn = targets[i];
        const waiters = waitersByTarget.get(targetJdn.toString());
        try {
          const item = await exact.query({ calculationJdn: calc, targetJdn });
          for (const waiter of waiters) waiter.resolve(item);
        } catch (itemError) {
          for (const waiter of waiters) waiter.reject(itemError);
          if (itemError?.code !== 'TARGET_OUT_OF_SUPPORTED_DOMAIN') {
            for (let j = i + 1; j < targets.length; j += 1) {
              const remaining = waitersByTarget.get(targets[j].toString());
              for (const waiter of remaining) waiter.reject(itemError);
            }
            break;
          }
        }
      }
    }
  }

  async function flushExactQueue() {
    flushScheduled = false;
    const work = queue;
    queue = [];
    try {
      const byCalculation = new Map();
      for (const item of work) {
        const key = item.calculationJdn.toString();
        let group = byCalculation.get(key);
        if (!group) {
          group = { calculationJdn: item.calculationJdn, waitersByTarget: new Map() };
          byCalculation.set(key, group);
        }
        const targetKey = item.targetJdn.toString();
        let waiters = group.waitersByTarget.get(targetKey);
        if (!waiters) { waiters = []; group.waitersByTarget.set(targetKey, waiters); }
        waiters.push(item);
      }

      await mapConcurrent([...byCalculation.values()], exactConcurrency, async (group) => {
        const targets = [...group.waitersByTarget.keys()].map(BigInt).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        let run = [];
        const runs = [];
        for (const target of targets) {
          if (run.length === 0 || (target === run[run.length - 1] + 1n && run.length < MAX_EXACT_BATCH_COUNT)) run.push(target);
          else { runs.push(run); run = [target]; }
        }
        if (run.length) runs.push(run);
        for (const targetsInRun of runs) await resolveRun(group.calculationJdn, targetsInRun, group.waitersByTarget);
      });
    } catch (error) {
      for (const waiter of work) waiter.reject(error);
    }
  }

  function queuedExactQuery(calculationJdn, targetJdn) {
    return new Promise((resolve, reject) => {
      queue.push({ calculationJdn: BigInt(calculationJdn), targetJdn: BigInt(targetJdn), resolve, reject });
      if (!flushScheduled) {
        flushScheduled = true;
        queueMicrotask(() => { void flushExactQueue(); });
      }
    });
  }

  return Object.freeze({
    id: 'precomputed',

    async query({ calculationJdn, targetJdn }) {
      const cached = await cachedShape(calculationJdn, targetJdn);
      if (cached) return cached;
      return queuedExactQuery(calculationJdn, targetJdn);
    },

    async queryDiagonal({ targetStartJdn, count, stepDays = 1n }) {
      const start = BigInt(targetStartJdn);
      const step = BigInt(stepDays);
      const size = Number(count);
      if (!Number.isSafeInteger(size) || size < 1 || size > MAX_EXACT_BATCH_COUNT || step === 0n) {
        throw new RangeError('invalid exact diagonal range');
      }

      const results = new Array(size);
      const misses = [];
      for (let i = 0; i < size; i += 1) {
        const day = start + BigInt(i) * step;
        const cached = await cachedShape(day, day);
        if (cached) results[i] = cached;
        else misses.push({ index: i, day });
      }

      const runs = [];
      let run = [];
      for (const miss of misses) {
        if (run.length === 0 ||
            (miss.index === run[run.length - 1].index + 1 && run.length < MAX_EXACT_BATCH_COUNT)) {
          run.push(miss);
        } else {
          runs.push(run);
          run = [miss];
        }
      }
      if (run.length) runs.push(run);

      for (const missesInRun of runs) {
        const useDiagonal = missesInRun.length >= 8 && typeof exact.queryDiagonal === 'function';
        if (useDiagonal) {
          try {
            const supplied = await exact.queryDiagonal({
              targetStartJdn: missesInRun[0].day,
              count: missesInRun.length,
              stepDays: step,
            });
            for (let i = 0; i < missesInRun.length; i += 1) {
              results[missesInRun[i].index] = exactShape(supplied.records[i], supplied.provenance);
            }
            continue;
          } catch (error) {
            if (error?.code !== 'CALCULATION_OUT_OF_SUPPORTED_DOMAIN' &&
                error?.code !== 'TARGET_OUT_OF_SUPPORTED_DOMAIN') throw error;
          }
        }

        const supplied = await Promise.all(missesInRun.map(({ day }) => queuedExactQuery(day, day)));
        for (let i = 0; i < missesInRun.length; i += 1) results[missesInRun[i].index] = supplied[i];
      }

      return results;
    },

    async year({ calculationJdn, year, includeDays = false }) {
      return exact.year({ calculationJdn, year, includeDays });
    },
  });
}
