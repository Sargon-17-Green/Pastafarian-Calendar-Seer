import { queryError } from './errors.mjs';

export const DEFAULT_EXACT_CONCURRENCY = 8;
export const DEFAULT_EXACT_QUEUE_MAX = 256;

function parseExplicitPositiveInteger(value, name, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new TypeError(`${name} must be an integer between ${min} and ${max}.`);
  }
  return n;
}

function envPositiveInteger(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

export function resolveExactConcurrency(value) {
  if (value !== undefined) return parseExplicitPositiveInteger(value, 'maxExactConcurrency', 1, 64);
  return envPositiveInteger('SEER_EXACT_CONCURRENCY', DEFAULT_EXACT_CONCURRENCY, 1, 64);
}

export function resolveExactQueueMax(value) {
  if (value !== undefined) return parseExplicitPositiveInteger(value, 'maxExactQueue', 1, 10000);
  return envPositiveInteger('SEER_EXACT_QUEUE_MAX', DEFAULT_EXACT_QUEUE_MAX, 1, 10000);
}
export async function mapConcurrent(items, concurrency, worker) {
  if (items.length === 0) return [];
  const results = new Array(items.length);
  let next = 0;
  async function runWorker() {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runWorker(),
  );
  await Promise.all(workers);
  return results;
}

export function createExactAdmission({ maxConcurrency, maxQueue } = {}) {
  const concurrency = resolveExactConcurrency(maxConcurrency);
  const queueLimit = resolveExactQueueMax(maxQueue);
  let active = 0;
  const waiting = [];
  function release() {
    active -= 1;
    const next = waiting.shift();
    if (next) next();
  }

  async function acquire() {
    if (active < concurrency) {
      active += 1;
      return;
    }
    if (waiting.length >= queueLimit) {
      throw queryError(
        'SEER_UNAVAILABLE',
        'Exact Seer engine admission queue is full.',
        {
          details: {
            admissionFailure: 'overloaded',
            maxConcurrency: concurrency,
            maxQueue: queueLimit,
          },
        },
      );
    }
    await new Promise((resolve) => waiting.push(resolve));
    active += 1;
  }
  return Object.freeze({
    concurrency,
    queueLimit,
    async run(task) {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
  });
}
