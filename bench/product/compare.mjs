#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

function delta(before, after) {
  if (!Number.isFinite(before) || !Number.isFinite(after) || before === 0) return null;
  return {
    absolute: after - before,
    percent: ((after - before) / before) * 100,
  };
}

function metric(item, path) {
  let value = item;
  for (const key of path) value = value?.[key];
  return Number.isFinite(value) ? value : null;
}

if (process.argv.length !== 4) {
  console.error('usage: node bench/product/compare.mjs BASELINE.json CANDIDATE.json');
  process.exit(2);
}
const [baselinePath, candidatePath] = process.argv.slice(2);
const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
const candidate = JSON.parse(await readFile(candidatePath, 'utf8'));

const baseById = new Map((baseline.scenarios ?? []).filter((item) => !item.skipped).map((item) => [item.id, item]));
const rows = [];
for (const current of candidate.scenarios ?? []) {
  const previous = baseById.get(current.id);
  if (!previous || current.skipped) continue;
  rows.push({
    id: current.id,
    wallP50: delta(metric(previous, ['wallMs', 'p50']), metric(current, ['wallMs', 'p50'])),
    wallP95: delta(metric(previous, ['wallMs', 'p95']), metric(current, ['wallMs', 'p95'])),
    wallP99: delta(metric(previous, ['wallMs', 'p99']), metric(current, ['wallMs', 'p99'])),
    nodeCpuMean: delta(metric(previous, ['nodeCpuMs', 'mean']), metric(current, ['nodeCpuMs', 'mean'])),
    treeCpuPerIteration: delta(metric(previous, ['processTree', 'cpuPerIterationMs']), metric(current, ['processTree', 'cpuPerIterationMs'])),
    treeRssAfter: delta(metric(previous, ['processTree', 'rssAfterBytes']), metric(current, ['processTree', 'rssAfterBytes'])),
  });
}

const output = {
  schema: 1,
  policy: 'informational-only-no-thresholds',
  baseline: {
    commit: baseline.machine?.commit ?? null,
    environment: baseline.machine?.benchmarkEnvironment ?? null,
  },
  candidate: {
    commit: candidate.machine?.commit ?? null,
    environment: candidate.machine?.benchmarkEnvironment ?? null,
  },
  comparableEnvironment: baseline.machine?.benchmarkEnvironment === candidate.machine?.benchmarkEnvironment,
  rows,
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
