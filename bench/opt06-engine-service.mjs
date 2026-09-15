import { spawn, execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const generatedDir = path.join(root, 'generated');
const dataDir = path.join(root, 'prototype', 'data');
const serviceBinary = path.join(root, 'prototype', 'build', 'seer_engine_service');
const structureBinary = path.join(root, 'prototype', 'build', 'seer_year_structure');
const index = JSON.parse(await readFile(path.join(generatedDir, 'index.json'), 'utf8'));
const calc = Number(index.caches[0].calcJdn);
const requestedYear = 4980;

function serviceClient() {
  const child = spawn(serviceBinary, [], { cwd: dataDir, stdio: ['pipe', 'pipe', 'inherit'] });
  child.stdout.setEncoding('utf8');
  let buffer = '';
  const pending = [];
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    for (;;) {
      const i = buffer.indexOf('\n');
      if (i < 0) break;
      const line = buffer.slice(0, i).replace(/\r$/, '');
      buffer = buffer.slice(i + 1);
      if (!line) continue;
      pending.shift()?.(JSON.parse(line));
    }
  });
  return {
    child,
    request(fields) {
      return new Promise((resolve) => {
        pending.push(resolve);
        child.stdin.write(`${fields.join('\t')}\n`);
      });
    },
    close() {
      child.stdin.end('X\n');
    },
  };
}

const svc = serviceClient();
const t0 = performance.now();
await svc.request(['Y', String(calc), String(requestedYear), '0']);
const t1 = performance.now();
const beforeRepeat = await svc.request(['S']);
const t2 = performance.now();
await svc.request(['Y', String(calc), String(requestedYear), '0']);
const t3 = performance.now();
const afterRepeat = await svc.request(['S']);

const d0 = performance.now();
await execFileAsync(structureBinary, [String(calc), String(requestedYear), '0'], {
  cwd: dataDir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
});
const d1 = performance.now();

let rssKb = null;
if (process.platform === 'linux') {
  try {
    const status = await readFile(`/proc/${svc.child.pid}/status`, 'utf8');
    const m = /^VmRSS:\s+(\d+)\s+kB$/m.exec(status);
    if (m) rssKb = Number(m[1]);
  } catch {}
}

console.log(JSON.stringify({
  calcJdn: calc,
  year: requestedYear,
  serviceFirstMs: t1 - t0,
  serviceRepeatMs: t3 - t2,
  directFreshProcessMs: d1 - d0,
  serviceRssKb: rssKb,
  beforeRepeat: beforeRepeat.stats,
  afterRepeat: afterRepeat.stats,
}, null, 2));

if (afterRepeat.stats.prevSteps !== beforeRepeat.stats.prevSteps ||
    afterRepeat.stats.nextSteps !== beforeRepeat.stats.nextSteps ||
    afterRepeat.stats.anchors !== beforeRepeat.stats.anchors) {
  throw new Error('covered repeated year unexpectedly extended the persistent chain');
}
svc.close();
