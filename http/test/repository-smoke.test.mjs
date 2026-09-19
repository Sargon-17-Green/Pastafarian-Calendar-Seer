import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSeerHttpServer } from '../server.mjs';
import { createExternalCacheFixture } from '../../query/test/helpers/external-cache-fixture.mjs';

test('HTTP adapter serves a verified record from an external cache directory', async () => {
  const fixture = await createExternalCacheFixture();
  const target = fixture.records[0].targetJdn;
  const server = createSeerHttpServer({ queryOptions: { generatedDir: fixture.generatedDir } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const r = await fetch(`http://127.0.0.1:${port}/v1/date?calculationJdn=${fixture.calcJdn}&targetJdn=${target}&presentation=canonical`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.calculationDay.jdn, String(fixture.calcJdn));
    assert.equal(body.targetDay.jdn, String(target));
    assert.ok(body.pastafarianDate.cutlet.canonicalIndex >= 1 && body.pastafarianDate.cutlet.canonicalIndex <= 17);
    assert.ok(body.pastafarianDate.month.canonicalIndex >= 1 && body.pastafarianDate.month.canonicalIndex <= 47);
    assert.equal('latitude' in (body.observer ?? {}), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
