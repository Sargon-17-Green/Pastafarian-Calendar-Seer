import test from 'node:test';
import assert from 'node:assert/strict';
import { createTracedSeerClient, SeerClientError } from '../transport.mjs';

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('production transport delegates to the existing browser client and records the exchange', async () => {
  const traces = [];
  let seen;
  const client = createTracedSeerClient('https://seer.example/', {
    onTrace: (trace) => traces.push(trace),
    fetch: async (url, init) => {
      seen = { url, init };
      return jsonResponse(200, { targetDay: { jdn: '2' } });
    },
  });
  const result = await client.queryDate({ target: { jdn: '2' } });
  assert.equal(result.targetDay.jdn, '2');
  assert.equal(seen.url, 'https://seer.example/v1/date');
  assert.equal(seen.init.method, 'POST');
  assert.deepEqual(traces[0].request, { target: { jdn: '2' } });
  assert.equal(traces[0].status, 200);
});

test('same-origin base remains relative', async () => {
  let seen;
  const client = createTracedSeerClient('', {
    fetch: async (url) => {
      seen = url;
      return jsonResponse(200, { status: 'ok' });
    },
  });
  await client.getStatus();
  assert.equal(seen, '/v1/status');
});

test('structured Seer errors keep status, code, field and details', async () => {
  const traces = [];
  const client = createTracedSeerClient('https://seer.example', {
    onTrace: (trace) => traces.push(trace),
    fetch: async () => jsonResponse(503, {
      error: {
        code: 'SEER_UNAVAILABLE',
        message: 'exact provider absent',
        field: 'year',
        details: { provider: 'native' },
      },
    }),
  });
  await assert.rejects(
    client.queryYear('5000'),
    (error) => error instanceof SeerClientError &&
      error.status === 503 &&
      error.code === 'SEER_UNAVAILABLE' &&
      error.field === 'year' &&
      error.details.provider === 'native',
  );
  assert.equal(traces[0].response.error.code, 'SEER_UNAVAILABLE');
});

test('network failures are traced and remain transport failures', async () => {
  const traces = [];
  const client = createTracedSeerClient('https://seer.example', {
    onTrace: (trace) => traces.push(trace),
    fetch: async () => { throw new TypeError('network down'); },
  });
  await assert.rejects(client.getMeta(), /network down/);
  assert.equal(traces[0].status, 0);
  assert.equal(traces[0].networkError, 'network down');
});
