import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL('../../../', import.meta.url));

test('Seer Next: observe exact-native repeated weave work (informational)', { timeout: 180_000 }, async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    path.join(root, 'bench/next/recomputation-probe.mjs'),
    '--iterations=3',
  ], { cwd: root, timeout: 170_000, maxBuffer: 2 * 1024 * 1024 });
  const result = JSON.parse(stdout);
  assert.equal(result.schema, 'seer-next-recomputation-probe-v1');
  assert.equal(result.cold.latency.n, 1);
  assert.equal(result.repeated.latency.n, 3);
  assert.equal(result.alternating.latency.n, 3);
  assert.equal(result.yearWithoutDays.weaveEvents, 0);
  assert.ok(Number.isInteger(result.repeated.weaveEvents));
  assert.ok(Number.isInteger(result.alternating.weaveEvents));
  console.log('SEER_NEXT_REAL_PROBE=' + JSON.stringify(result));
});
