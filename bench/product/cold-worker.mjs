#!/usr/bin/env node
import { queryDate } from '../../query/index.mjs';
import { snapshotProcessTree } from './lib.mjs';

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const generatedDir = option('generated-dir');
const calculationJdn = option('calculation-jdn');
const targetJdn = option('target-jdn');
if (!generatedDir || !calculationJdn || !targetJdn) {
  throw new Error('cold-worker requires --generated-dir, --calculation-jdn and --target-jdn');
}

const treeBefore = await snapshotProcessTree();
const cpuBefore = process.cpuUsage();
const start = process.hrtime.bigint();
const result = await queryDate({
  calculation: { jdn: calculationJdn },
  target: { jdn: targetJdn },
  presentation: 'canonical',
}, { generatedDir });
const end = process.hrtime.bigint();
const cpu = process.cpuUsage(cpuBefore);
const treeAfter = await snapshotProcessTree();

if (result?.targetDay?.jdn !== targetJdn) throw new Error('cold-worker target mismatch');
process.stdout.write(`${JSON.stringify({
  queryWallMs: Number(end - start) / 1e6,
  nodeCpuMs: (cpu.user + cpu.system) / 1000,
  processTreeCpuMs: treeAfter.scope === treeBefore.scope
    ? Math.max(0, treeAfter.cpuMs - treeBefore.cpuMs)
    : null,
  processTreeRssAfterBytes: treeAfter.rssBytes,
  resourceScope: treeAfter.scope,
})}\n`);
