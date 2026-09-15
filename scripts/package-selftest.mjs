import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { queryCalculationDay, queryDate } from '../index.mjs';
import { listen } from '../http/index.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const index = JSON.parse(await readFile(path.join(packageRoot, 'generated/index.json'), 'utf8'));
const cache = index.caches?.[0];
assert.ok(cache, 'generated cache index must contain at least one cache');
const calculationJdn = cache.calcJdn;
const targetJdn = cache.targetStartJdn + Math.min(5, cache.targetCount - 1);
const request = {
  calculation: { jdn: calculationJdn },
  target: { jdn: targetJdn },
  presentation: 'canonical',
};

const direct = await queryDate(request);
assert.equal(direct.targetDay.jdn, String(targetJdn));

const boundary = await queryCalculationDay({
  at: index.generatedForInstantUtc,
  include: ['boundaries'],
});
assert.equal(boundary.jdn, String(index.activeCalcJdn));
assert.equal(typeof boundary.boundaries?.startsAt, 'string');
assert.equal(typeof boundary.boundaries?.endsAt, 'string');

const server = await listen({ host: '127.0.0.1', port: 0 });
try {
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/v1/date?calculationJdn=${calculationJdn}&targetJdn=${targetJdn}&presentation=canonical`;
  const response = await fetch(url);
  const text = await response.text();
  assert.equal(response.status, 200, text);
  const body = JSON.parse(text);
  assert.equal(body.targetDay.jdn, String(targetJdn));
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

console.log(JSON.stringify({
  ok: true,
  calculationJdn,
  targetJdn,
  checks: ['cache-query', 'venus-boundary', 'http-loopback'],
}));
