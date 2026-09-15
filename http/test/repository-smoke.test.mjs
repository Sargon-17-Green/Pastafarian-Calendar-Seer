import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSeerHttpServer } from '../server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('HTTP adapter serves an exact record from the repository cache', async () => {
  const index = JSON.parse(await readFile(path.join(root, 'generated', 'index.json'), 'utf8'));
  assert.ok(index.caches.length > 0);
  const desc = index.caches[0];
  const cache = JSON.parse(await readFile(path.join(root, 'generated', desc.path), 'utf8'));
  assert.ok(cache.records.length > 0);
  const target = cache.records[0].targetJdn;

  const server = createSeerHttpServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const r = await fetch(`http://127.0.0.1:${port}/v1/date?calculationJdn=${desc.calcJdn}&targetJdn=${target}&presentation=canonical`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.calculationDay.jdn, String(desc.calcJdn));
    assert.equal(body.targetDay.jdn, String(target));
    assert.ok(body.pastafarianDate.cutlet.canonicalIndex >= 1 && body.pastafarianDate.cutlet.canonicalIndex <= 17);
    assert.ok(body.pastafarianDate.month.canonicalIndex >= 1 && body.pastafarianDate.month.canonicalIndex <= 47);
    assert.equal('latitude' in (body.observer ?? {}), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
