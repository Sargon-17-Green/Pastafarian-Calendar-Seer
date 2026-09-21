import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeerHttpServer } from '../server.mjs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server.address();
}

test('hosted exact HTTP admission rejects overflow without blocking liveness', async (t) => {
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  let calls = 0;

  const queryApi = {
    async queryDate(request) {
      calls += 1;
      if (calls === 1) await firstGate;
      return { ok: true, target: request.target?.jdn ?? null };
    },
  };

  const server = createSeerHttpServer({
    queryApi,
    maxHttpExactConcurrency: 1,
    maxHttpExactQueue: 2,
  });
  const address = await listen(server);
  t.after(() => {
    releaseFirst?.();
    return new Promise((resolve) => server.close(resolve));
  });

  const origin = `http://127.0.0.1:${address.port}`;
  const requests = Array.from({ length: 6 }, (_, index) => {
    const target = 1_000_000 + index * 1000;
    return fetch(`${origin}/v1/date?calculationJdn=2342550&targetJdn=${target}`);
  });

  for (let i = 0; i < 100 && calls === 0; i += 1) await sleep(2);
  assert.equal(calls, 1, 'one exact request should be active before release');

  const health = await fetch(`${origin}/_health/live`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });

  await sleep(25);
  releaseFirst();

  const responses = await Promise.all(requests);
  const statuses = responses.map((response) => response.status).sort((a, b) => a - b);
  assert.deepEqual(statuses, [200, 200, 200, 503, 503, 503]);
  assert.equal(calls, 3, 'only active + bounded queue requests may reach queryDate');

  const overloadBodies = [];
  for (const response of responses) {
    if (response.status === 503) overloadBodies.push(await response.json());
  }
  assert.equal(overloadBodies.length, 3);
  for (const body of overloadBodies) {
    assert.equal(body.error?.code, 'SEER_UNAVAILABLE');
    assert.equal(body.error?.details?.admissionFailure, 'overloaded');
    assert.equal(body.error?.details?.layer, 'http');
    assert.equal(body.error?.details?.maxConcurrency, 1);
    assert.equal(body.error?.details?.maxQueue, 2);
  }
});

test('HTTP exact admission is disabled unless concurrency is configured', async (t) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const queryApi = {
    async queryDate() {
      calls += 1;
      await gate;
      return { ok: true };
    },
  };

  const server = createSeerHttpServer({ queryApi });
  const address = await listen(server);
  t.after(() => {
    release?.();
    return new Promise((resolve) => server.close(resolve));
  });

  const origin = `http://127.0.0.1:${address.port}`;
  const requests = Array.from({ length: 4 }, (_, index) =>
    fetch(`${origin}/v1/date?calculationJdn=2342550&targetJdn=${1093452 + index}`));

  for (let i = 0; i < 100 && calls < 4; i += 1) await sleep(2);
  assert.equal(calls, 4, 'legacy/default behavior remains unbounded at the HTTP layer');

  release();
  const responses = await Promise.all(requests);
  assert.deepEqual(responses.map((response) => response.status), [200, 200, 200, 200]);
});

test('HTTP exact queue setting without HTTP concurrency fails fast', () => {
  assert.throws(
    () => createSeerHttpServer({
      queryApi: { async queryDate() { return { ok: true }; } },
      maxHttpExactQueue: 2,
    }),
    /requires SEER_HTTP_EXACT_CONCURRENCY\/maxHttpExactConcurrency/,
  );
});
