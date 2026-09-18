import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createSeerHttpHandler } from '../app.mjs';
import { queryError } from '../../query/errors.mjs';

function dateResult() {
  return {
    calculationDay: { jdn: '100' },
    targetDay: { jdn: '101', gregorian: { era: 'CE', year: '2026', month: 9, day: 15 } },
    pastafarianDate: {
      year: '5000',
      cutlet: { canonicalIndex: 1, name: 'Bronze', day: 2 },
      month: { canonicalIndex: 1, name: 'Clay', day: 3 },
    },
    locale: 'en',
    formatted: 'demo',
  };
}

function fakeApi(calls) {
  return {
    async queryDate(request, options) { calls.push(['date', request, options.now]); return dateResult(); },
    async queryBatch(request, options) { calls.push(['batch', request, options.now]); return { results: [] }; },
    async queryRange(request, options) { calls.push(['range', request, options.now]); return { results: [dateResult()] }; },
    async queryReverse(request, options) { calls.push(['reverse', request, options.now]); return dateResult(); },
    async queryCalculationDay(request, options) { calls.push(['calculation-day', request, options.now]); return { at: options.now.toISOString(), jdn: '100', observer: { longitude: 45.481 } }; },
    async queryYear(year, request, options) { calls.push(['year', year, request, options.now]); throw queryError('SEER_UNAVAILABLE', 'no year'); },
  };
}

async function withServer(fn) {
  const calls = [];
  const apiDir = await mkdtemp(path.join(os.tmpdir(), 'seer-http-test-'));
  await writeFile(path.join(apiDir, 'openapi.json'), '{"openapi":"3.1.0"}\n');
  await writeFile(path.join(apiDir, 'openapi.yaml'), 'openapi: 3.1.0\n');
  await mkdir(path.join(apiDir, 'schemas'));
  await writeFile(path.join(apiDir, 'schemas', 'date-response.schema.json'), '{"$id":"fixture-date-response"}\n');
  const now = new Date('2026-09-15T12:34:56.000Z');
  const server = http.createServer(createSeerHttpHandler({ queryApi: fakeApi(calls), apiDir, nowFactory: () => new Date(now) }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try { await fn(`http://127.0.0.1:${port}`, calls, now); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('GET /v1/date maps transport selectors and drops no-op location fields', async () => {
  await withServer(async (base, calls, now) => {
    const r = await fetch(`${base}/v1/date?targetJdn=101&calculationJdn=100&longitude=35.2&latitude=999&elevationMeters=oops&presentation=canonical`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
    const body = await r.json();
    assert.equal(body.pastafarianDate.cutlet.canonicalIndex, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'date');
    assert.deepEqual(calls[0][1], {
      presentation: 'canonical',
      observer: { longitude: 35.2 },
      target: { jdn: '101' },
      calculation: { jdn: '100' },
    });
    assert.equal(calls[0][2].toISOString(), now.toISOString());
  });
});

test('effective duplicate GET parameters fail but duplicate no-op fields are ignored', async () => {
  await withServer(async (base) => {
    const bad = await fetch(`${base}/v1/date?targetJdn=1&targetJdn=2`);
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).error.code, 'DUPLICATE_PARAMETER');
    const noop = await fetch(`${base}/v1/date?latitude=1&latitude=2`);
    assert.equal(noop.status, 200);
  });
});

test('POST requires JSON and returns transport errors without stacks', async () => {
  await withServer(async (base) => {
    const unsupported = await fetch(`${base}/v1/date`, { method: 'POST', body: '{}' });
    assert.equal(unsupported.status, 415);
    assert.equal((await unsupported.json()).error.code, 'UNSUPPORTED_MEDIA_TYPE');
    const malformed = await fetch(`${base}/v1/date`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
    assert.equal(malformed.status, 400);
    const body = await malformed.json();
    assert.equal(body.error.code, 'INVALID_JSON');
    assert.equal('stack' in body.error, false);
  });
});

test('POST /v1/reverse delegates a complete Pastafarian tuple', async () => {
  await withServer(async (base, calls, now) => {
    const request = {
      calculation: { jdn: '100' },
      pastafarianDate: {
        year: '5000',
        cutlet: { canonicalIndex: 1, day: 2 },
        month: { canonicalIndex: 1, day: 3 },
      },
    };
    const r = await fetch(`${base}/v1/reverse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).targetDay.jdn, '101');
    assert.deepEqual(calls.at(-1)[0], 'reverse');
    assert.deepEqual(calls.at(-1)[1], request);
    assert.equal(calls.at(-1)[2].toISOString(), now.toISOString());
  });
});
test('range supports JSON, NDJSON and CSV without changing query semantics', async () => {
  await withServer(async (base) => {
    for (const [accept, expectedType] of [
      ['application/json', 'application/json'],
      ['application/x-ndjson', 'application/x-ndjson'],
      ['text/csv', 'text/csv'],
    ]) {
      const r = await fetch(`${base}/v1/range`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept },
        body: JSON.stringify({ start: { jdn: '101' }, count: '1' }),
      });
      assert.equal(r.status, 200);
      assert.match(r.headers.get('content-type'), new RegExp(`^${expectedType.replace('/', '\\/')}`));
      const text = await r.text();
      assert.ok(text.length > 0);
    }
  });
});

test('status probes the query provider and static endpoints are served', async () => {
  await withServer(async (base) => {
    const status = await fetch(`${base}/v1/status`);
    assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), { status: 'ok' });
    const meta = await fetch(`${base}/v1/meta`);
    const metaBody = await meta.json();
    assert.equal(metaBody.observerPresets[0].longitude, 45.481);
    assert.equal(metaBody.reverse.status, 'implemented');
    assert.equal(metaBody.reverse.endpoint, '/v1/reverse');
    const openapi = await fetch(`${base}/openapi.json`);
    assert.equal((await openapi.json()).openapi, '3.1.0');
    const schema = await fetch(`${base}/schemas/date-response.schema.json`);
    assert.equal(schema.status, 200);
    assert.equal((await schema.json()).$id, 'fixture-date-response');
    const missingSchema = await fetch(`${base}/schemas/missing.schema.json`);
    assert.equal(missingSchema.status, 404);
  });
});

test('OPTIONS, 404, 405, 406 and provider errors map cleanly', async () => {
  await withServer(async (base) => {
    const opt = await fetch(`${base}/v1/date`, { method: 'OPTIONS' });
    assert.equal(opt.status, 204);
    const missing = await fetch(`${base}/v1/nope`);
    assert.equal(missing.status, 404);
    const method = await fetch(`${base}/v1/date`, { method: 'PUT' });
    assert.equal(method.status, 405);
    const notAcceptable = await fetch(`${base}/v1/date`, { headers: { accept: 'application/xml' } });
    assert.equal(notAcceptable.status, 406);
    const year = await fetch(`${base}/v1/year/5000`);
    assert.equal(year.status, 503);
    assert.equal((await year.json()).error.code, 'SEER_UNAVAILABLE');
  });
});
