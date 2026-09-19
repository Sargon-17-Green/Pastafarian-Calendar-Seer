import { performance } from 'node:perf_hooks';
import { mapConcurrent } from '../query/concurrency.mjs';

const JOBS = Number(process.env.SEER_BENCH_JOBS ?? 500);
const DELAY_MS = Number(process.env.SEER_BENCH_DELAY_MS ?? 3);
const LIMIT = Number(process.env.SEER_BENCH_CONCURRENCY ?? 8);

function makeWorkload() {
  let active = 0;
  let peak = 0;
  async function job() {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    active -= 1;
  }
  return { job, peak: () => peak };
}

async function measure(label, scheduler) {
  const workload = makeWorkload();
  const jobs = Array.from({ length: JOBS }, (_, i) => i);
  const started = performance.now();
  await scheduler(jobs, workload.job);
  const elapsedMs = performance.now() - started;
  return {
    label,
    jobs: JOBS,
    delayMs: DELAY_MS,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    jobsPerSecond: Number((JOBS * 1000 / elapsedMs).toFixed(1)),
    peakConcurrency: workload.peak(),
  };
}

const before = await measure(
  'before-unbounded-Promise.all',
  (jobs, job) => Promise.all(jobs.map(job)),
);
const after = await measure(
  `after-bounded-${LIMIT}`,
  (jobs, job) => mapConcurrent(jobs, LIMIT, job),
);
const serialized = await measure(
  'serialized-1',
  (jobs, job) => mapConcurrent(jobs, 1, job),
);

console.log(JSON.stringify({
  schema: 1,
  workload: 'fake exact jobs with fixed async latency',
  before,
  after,
  serialized,
  boundedVsSerializedSpeedup: Number(
    (serialized.elapsedMs / after.elapsedMs).toFixed(2),
  ),
}, null, 2));
