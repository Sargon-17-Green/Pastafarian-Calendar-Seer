import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeerClient, SeerClientError } from '../index.mjs';

function response(status, body, contentType = 'application/json') {
  return new Response(
    typeof body === 'string' ? body : JSON.stringify(body),
    { status, headers: { 'content-type': contentType } },
  );
}

test('browser client uses fetch only and maps POST query methods', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push([url, init]);
    return response(200, { ok: true });
  };
  const client = createSeerClient('https://seer.example/', { fetch: fetchImpl });
  await client.queryDate({ target: { jdn: '1' } });
  await client.queryReverse({ pastafarianDate: { year: '1' } });
  await client.queryBatch({ queries: [{ id: 'a' }] });
  await client.queryRange({ start: { jdn: '1' }, count: '1' });
  assert.deepEqual(calls.map(([url]) => url), [
    'https://seer.example/v1/date',
    'https://seer.example/v1/reverse',
    'https://seer.example/v1/batch',
    'https://seer.example/v1/range',
  ]);
  for (const [, init] of calls) {
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['content-type'], 'application/json');
    assert.equal(init.headers.accept, 'application/json');
  }
});

test('browser client maps GET query selectors', async () => {
  const urls = [];
  const client = createSeerClient('https://seer.example', {
    fetch: async (url) => {
      urls.push(url);
      return response(200, { ok: true });
    },
  });
  await client.queryNow({
    observer: { preset: 'kisurra', longitude: 45.481 },
    locale: 'he',
    presentation: 'canonical',
    include: ['resolution'],
  });
  await client.queryCalculationDay({
    at: '2026-09-18T00:00:00Z',
    observer: 'kisurra',
    include: ['boundaries'],
  });
  await client.queryYear('5000', {
    calculation: { jdn: '2461302' },
    locale: 'he',
    presentation: 'canonical',
    include: ['provenance'],
  });
  assert.match(urls[0], /^https:\/\/seer\.example\/v1\/now\?/);
  assert.match(urls[0], /observer=kisurra/);
  assert.match(urls[0], /longitude=45\.481/);
  assert.match(urls[0], /locale=he/);
  assert.match(urls[0], /presentation=canonical/);
  assert.match(urls[1], /^https:\/\/seer\.example\/v1\/calculation-day\?/);
  assert.match(urls[1], /include=boundaries/);
  assert.match(urls[2], /^https:\/\/seer\.example\/v1\/year\/5000\?/);
  assert.match(urls[2], /calculationJdn=2461302/);
  assert.match(urls[2], /locale=he/);
});

test('browser client exposes structured server errors', async () => {
  const client = createSeerClient('https://seer.example', {
    fetch: async () => response(422, {
      error: {
        code: 'INVALID_JDN',
        message: 'bad jdn',
        field: 'target.jdn',
        details: { demo: true },
      },
    }),
  });
  await assert.rejects(
    client.queryDate({ target: { jdn: 'bad' } }),
    (error) => error instanceof SeerClientError &&
      error.status === 422 &&
      error.code === 'INVALID_JDN' &&
      error.field === 'target.jdn' &&
      error.details.demo === true,
  );
});
test('browser client supports same-origin relative endpoints with injected fetch', async () => {
  let seen;
  const client = createSeerClient('', {
    fetch: async (url) => {
      seen = url;
      return response(200, { locales: [] });
    },
  });
  await client.getLocales();
  assert.equal(seen, '/v1/locales');
});
