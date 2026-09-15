import { createCacheRequestContext } from '../precompute/cache-lookup.mjs';
import { createExactEngine } from './exact-engine.mjs';
import { queryError } from './errors.mjs';

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
} = {}) {
  if (!generatedDir) throw new TypeError('generatedDir is required');
  const cache = cacheContext ?? createCacheRequestContext({ generatedDir });
  const exact = createExactEngine({ generatedDir, yearBatchBinary, yearLocatorBinary, yearStructureBinary, engineServiceBinary, dataDir, timeoutMs: exactTimeoutMs, maxBuffer: exactMaxBuffer, execFileRunner });

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
      // Preserve per-item error classification by retrying each unique target independently.
      const settled = await Promise.allSettled(targets.map((targetJdn) => exact.query({ calculationJdn: calc, targetJdn })));
      for (let i = 0; i < targets.length; i += 1) {
        const waiters = waitersByTarget.get(targets[i].toString());
        const item = settled[i];
        for (const waiter of waiters) {
          if (item.status === 'fulfilled') waiter.resolve(item.value);
          else waiter.reject(item.reason);
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

      await Promise.all([...byCalculation.values()].map(async (group) => {
        const targets = [...group.waitersByTarget.keys()].map(BigInt).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        let run = [];
        const runs = [];
        for (const target of targets) {
          if (run.length === 0 || (target === run[run.length - 1] + 1n && run.length < MAX_EXACT_BATCH_COUNT)) run.push(target);
          else { runs.push(run); run = [target]; }
        }
        if (run.length) runs.push(run);
        for (const targetsInRun of runs) await resolveRun(group.calculationJdn, targetsInRun, group.waitersByTarget);
      }));
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
            throw queryError('SEER_UNAVAILABLE', 'The precomputed cache is present but could not be verified.', { details: { provider: 'precomputed' }, cause: error });
          }
        }
      }
      return queuedExactQuery(calculationJdn, targetJdn);
    },

    async year({ calculationJdn, year, includeDays = false }) {
      return exact.year({ calculationJdn, year, includeDays });
    },
  });
}
