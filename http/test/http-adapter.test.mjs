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
    async queryYear(year, request, options) {
      calls.push(['year', year, request, options.now]);
      throw queryError('SEER_UNAVAILABLE', 'no year', { details: { provider: 'fixture' } });
    },
  };
}

async function withServer(fn, handlerOptions = {}) {
  const calls = [];
  const apiDir = await mkdtemp(path.join(os.tmpdir(), 'seer-http-test-'));
  await writeFile(path.join(apiDir, 'openapi.json'), '{"openapi":"3.1.0"}\n');
  await writeFile(path.join(apiDir, 'openapi.yaml'), 'openapi: 3.1.0\n');
  await mkdir(path.join(apiDir, 'schemas'));
  await writeFile(path.join(apiDir, 'schemas', 'date-response.schema.json'), '{"$id":"fixture-date-response"}\n');
  const now = new Date('2026-09-15T12:34:56.000Z');
  const server = http.createServer(createSeerHttpHandler({
    queryApi: fakeApi(calls),
    apiDir,
    nowFactory: () => new Date(now),
    healthProbe: { probe: async () => ({ status: 'ok' }) },
    ...handlerOptions,
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try { await fn(`http://127.0.0.1:${port}`, calls, now); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('GET /v1/date maps transport selectors and drops no-op location fields', async () => {
  await withServer(async (base, calls, now) => {
    const r = await fetch(`${base}/v1/date?targetJdn=101&calculationJdn=100&longitude=35.2&latitude=999&elevationMeters=oops&locale=he&presentation=canonical`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
    const body = await r.json();
    assert.equal(body.pastafarianDate.cutlet.canonicalIndex, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'date');
    assert.deepEqual(calls[0][1], {
      locale: 'he',
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

test('public status and static endpoints are served without semantic work', async () => {
  await withServer(async (base) => {
    const status = await fetch(`${base}/v1/status`);
    assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), { status: 'ok' });
    const locales = await fetch(`${base}/v1/locales`);
    assert.equal(locales.status, 200);
    const localeBody = await locales.json();
    assert.deepEqual(localeBody.locales.map((item) => item.code), ['en', 'he']);
    assert.equal(localeBody.locales[1].direction, 'rtl');
    const meta = await fetch(`${base}/v1/meta`);
    const metaBody = await meta.json();
    assert.equal(metaBody.observerPresets[0].longitude, 45.481);
    assert.deepEqual(metaBody.exactDomain, {
      kind: 'finite',
      minimumJdnExclusive: '-63473948',
      maximumJdnInclusive: '36828783',
    });
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
    const opt = await fetch(`${base}/v1/date`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://app.example',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    assert.equal(opt.status, 204);
    assert.equal(opt.headers.get('access-control-allow-origin'), '*');
    assert.match(opt.headers.get('access-control-allow-methods'), /POST/);
    assert.match(opt.headers.get('access-control-allow-headers'), /Content-Type/i);
    const missing = await fetch(`${base}/v1/nope`);
    assert.equal(missing.status, 404);
    const method = await fetch(`${base}/v1/date`, { method: 'PUT' });
    assert.equal(method.status, 405);
    const notAcceptable = await fetch(`${base}/v1/date`, { headers: { accept: 'application/xml' } });
    assert.equal(notAcceptable.status, 406);
    const year = await fetch(`${base}/v1/year/5000`);
    assert.equal(year.status, 503);
    const yearError = (await year.json()).error;
    assert.equal(yearError.code, 'SEER_UNAVAILABLE');
    assert.deepEqual(yearError.details, { provider: 'fixture' });
  });
});


test('liveness, readiness and public status have separate bounded semantics', async () => {
  let probes = 0;
  const healthProbe = {
    async probe() {
      probes += 1;
      return { status: 'degraded', internalPath: 'C:/secret', pid: 1234, queueDepth: 99 };
    },
  };
  await withServer(async (base, calls) => {
    const live = await fetch(`${base}/_health/live`);
    assert.equal(live.status, 200);
    assert.deepEqual(await live.json(), { status: 'ok' });
    assert.equal(probes, 0);
    assert.equal(calls.length, 0);

    const ready = await fetch(`${base}/_health/ready`);
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { status: 'degraded' });
    assert.equal(probes, 1);
    assert.equal(calls.length, 0);

    const publicStatus = await fetch(`${base}/v1/status`);
    assert.equal(publicStatus.status, 200);
    assert.deepEqual(await publicStatus.json(), { status: 'degraded' });
    assert.equal(probes, 2);
    assert.equal(calls.length, 0);
  }, { healthProbe });
});


test('readiness and public status fail closed on a hung health probe while liveness stays live', async () => {
  const healthProbe = { probe: async () => new Promise(() => {}) };
  await withServer(async (base, calls) => {
    const started = Date.now();
    const ready = await fetch(`${base}/_health/ready`);
    const readyMs = Date.now() - started;
    assert.equal(ready.status, 503);
    assert.deepEqual(await ready.json(), { status: 'unavailable' });
    assert.ok(readyMs < 1000, `readiness exceeded bounded deadline: ${readyMs} ms`);

    const status = await fetch(`${base}/v1/status`);
    assert.equal(status.status, 503);
    assert.deepEqual(await status.json(), { status: 'unavailable' });

    const live = await fetch(`${base}/_health/live`);
    assert.equal(live.status, 200);
    assert.deepEqual(await live.json(), { status: 'ok' });
    assert.equal(calls.length, 0);
  }, { healthProbe, healthTimeoutMs: 25 });
});

test('request correlation headers, structured logs and HTTP metrics are privacy-safe', async () => {
  const logs = [];
  const metricEvents = [];
  let nextId = 0;
  const ids = ['server-id-success', 'server-id-error', 'server-id-options'];
  const logger = {
    info(record) { logs.push(record); },
    error(record) { logs.push(record); },
  };
  const metrics = {
    counter(name, value, attributes) { metricEvents.push(['counter', name, value, attributes]); },
    histogram(name, value, attributes) { metricEvents.push(['histogram', name, value, attributes]); },
    gauge(name, value, attributes) { metricEvents.push(['gauge', name, value, attributes]); },
  };

  await withServer(async (base) => {
    const success = await fetch(
      `${base}/v1/date?target=2026-09-15&longitude=12.3456789`,
      {
        headers: {
          'x-request-id': 'client-controlled-id',
          authorization: 'Bearer do-not-log',
          cookie: 'session=do-not-log',
        },
      },
    );
    assert.equal(success.status, 200);
    assert.equal(success.headers.get('x-request-id'), 'server-id-success');
    assert.match(success.headers.get('access-control-expose-headers'), /X-Request-ID/i);

    const error = await fetch(`${base}/v1/year/5000`);
    assert.equal(error.status, 503);
    assert.equal(error.headers.get('x-request-id'), 'server-id-error');

    const options = await fetch(`${base}/v1/date`, { method: 'OPTIONS' });
    assert.equal(options.status, 204);
    assert.equal(options.headers.get('x-request-id'), 'server-id-options');
    assert.match(options.headers.get('access-control-expose-headers'), /X-Request-ID/i);

    assert.equal(logs.length, 3);
    assert.deepEqual(logs[0].release, {
      packageVersion: '9.9.9-test',
      releaseTag: 'v9.9.9-test',
      commit: 'abc123',
      engineFingerprint: 'engine-test',
      cacheRevision: 'cache-test',
    });
    assert.equal(logs[0].method, 'GET');
    assert.equal(logs[0].route, '/v1/date');
    assert.equal(logs[0].status, 200);
    assert.equal(logs[0].resourceClass, 'exact-single');
    assert.equal(logs[0].outcome, 'success');
    assert.ok(logs[0].latencyMs >= 0);
    assert.equal(logs[1].route, '/v1/year/{year}');
    assert.equal(logs[1].errorCode, 'SEER_UNAVAILABLE');

    const serialized = JSON.stringify(logs);
    for (const forbidden of [
      '2026-09-15', '12.3456789', 'client-controlled-id',
      'Bearer do-not-log', 'session=do-not-log', 'target=', 'longitude=',
    ]) assert.equal(serialized.includes(forbidden), false, forbidden);

    assert.ok(metricEvents.some(([kind, name]) => kind === 'counter' && name === 'http.request.count'));
    assert.ok(metricEvents.some(([kind, name]) => kind === 'histogram' && name === 'http.request.latency_ms'));
    assert.ok(metricEvents.some(([kind, name, , attrs]) =>
      kind === 'counter' && name === 'http.error.count' && attrs.errorCode === 'SEER_UNAVAILABLE'));
  }, {
    logger,
    metrics,
    requestIdFactory: () => ids[nextId++],
    releaseIdentity: {
      packageVersion: '9.9.9-test',
      releaseTag: 'v9.9.9-test',
      commit: 'abc123',
      engineFingerprint: 'engine-test',
      cacheRevision: 'cache-test',
      ignoredSecret: 'must-not-appear',
    },
  });
});

test('unexpected internal errors are correlated but never logged as raw Error objects', async () => {
  const logs = [];
  const secret = 'AUTH-SECRET-2026-09-15-12.3456789';
  await withServer(async (base) => {
    const response = await fetch(`${base}/v1/date?target=2026-09-15&longitude=12.3456789`, {
      headers: { authorization: secret, cookie: `session=${secret}` },
    });
    assert.equal(response.status, 500);
    assert.equal(response.headers.get('x-request-id'), 'internal-error-id');
    assert.deepEqual(await response.json(), {
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' },
    });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].requestId, 'internal-error-id');
    assert.equal(logs[0].errorCode, 'INTERNAL_ERROR');
    const serialized = JSON.stringify(logs);
    assert.equal(serialized.includes(secret), false);
    assert.equal(serialized.includes('2026-09-15'), false);
    assert.equal(serialized.includes('12.3456789'), false);
    assert.equal(serialized.includes('stack'), false);
  }, {
    requestIdFactory: () => 'internal-error-id',
    logger: {
      info(record) { logs.push(record); },
      error(record) { logs.push(record); },
    },
    queryApi: {
      ...fakeApi([]),
      async queryDate() { throw new Error(secret); },
    },
  });
});
