import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { queryCalculationDay, queryDate } from '../index.mjs';
import { listen } from '../http/index.mjs';
import { createSeerClient } from 'pastafarian-calendar-seer/client';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exportedSchemaPath = fileURLToPath(import.meta.resolve('pastafarian-calendar-seer/schemas/date-response.schema.json'));
const exportedSchema = JSON.parse(await readFile(exportedSchemaPath, 'utf8'));
assert.equal(exportedSchema.$id, 'date-response.schema.json');
const packagedSchemaCount = (await readdir(path.join(packageRoot, 'api', 'schemas'))).filter((name) => name.endsWith('.json')).length;
const packagedLocales = (await readdir(path.join(packageRoot, 'query', 'locales'))).filter((name) => name.endsWith('.mjs')).sort();
assert.deepEqual(packagedLocales, ['catalog.mjs', 'en.mjs', 'he.mjs']);

const calculationJdn = 2461303;
const targetJdn = 2461308;
const request = {
  calculation: { jdn: calculationJdn },
  target: { jdn: targetJdn },
  presentation: 'canonical',
};
const fixtureProvider = Object.freeze({
  id: 'package-selftest-fixture',
  async query({ targetJdn: target }) {
    return {
      record: {
        targetJdn: Number(target),
        year: 5000,
        cutletIndex: 2,
        dayInCutlet: 7,
        monthIndex: 4,
        dayInMonth: 11,
        cutletCount: 9,
        monthCount: 23,
      },
      structure: { cutletCount: 9, monthCount: 23 },
      provenance: { engineRevision: 'package-selftest-fixture' },
    };
  },
});

function collectRefs(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, out);
  } else if (value && typeof value === 'object') {
    if (typeof value.$ref === 'string') out.push(value.$ref);
    for (const [key, item] of Object.entries(value)) if (key !== '$ref') collectRefs(item, out);
  }
  return out;
}

async function verifyOpenApiSchemaClosure(baseUrl) {
  const openapiUrl = new URL('/openapi.json', baseUrl);
  const openapiResponse = await fetch(openapiUrl);
  assert.equal(openapiResponse.status, 200);
  const queue = collectRefs(await openapiResponse.json()).map((ref) => ({ ref, baseUrl: openapiUrl }));
  const seen = new Set();
  while (queue.length) {
    const { ref, baseUrl: parentUrl } = queue.shift();
    const resolved = new URL(ref, parentUrl);
    if (resolved.hash) resolved.hash = '';
    assert.equal(resolved.origin, openapiUrl.origin, 'external schema ref is not self-contained: ' + ref);
    assert.match(resolved.pathname, /^\/schemas\/[A-Za-z0-9.-]+\.schema\.json$/);
    if (seen.has(resolved.href)) continue;
    seen.add(resolved.href);
    const response = await fetch(resolved);
    const text = await response.text();
    assert.equal(response.status, 200, 'unresolved schema ref ' + resolved.href + ': ' + text);
    const schema = JSON.parse(text);
    assert.equal(schema.$id, resolved.pathname.split('/').at(-1), 'schema $id must be relocatable');
    for (const nested of collectRefs(schema)) queue.push({ ref: nested, baseUrl: resolved });
  }
  assert.ok(seen.size >= 1, 'OpenAPI must reference at least one packaged schema');
  return seen.size;
}

const queryOptions = { provider: fixtureProvider };
const direct = await queryDate(request, queryOptions);
assert.equal(direct.targetDay.jdn, String(targetJdn));
const localizedDirect = await queryDate({ ...request, presentation: 'full', locale: 'he' }, queryOptions);
assert.equal(localizedDirect.locale, 'he');
assert.match(localizedDirect.formatted, /^שנה /);

const boundary = await queryCalculationDay({
  at: '2026-09-19T12:00:00Z',
  include: ['boundaries'],
});
assert.equal(typeof boundary.jdn, 'string');
assert.equal(typeof boundary.boundaries?.startsAt, 'string');
assert.equal(typeof boundary.boundaries?.endsAt, 'string');

const server = await listen({ host: '127.0.0.1', port: 0, queryOptions });
try {
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/v1/date?calculationJdn=${calculationJdn}&targetJdn=${targetJdn}&presentation=canonical`;
  const response = await fetch(url);
  const text = await response.text();
  assert.equal(response.status, 200, text);
  const body = JSON.parse(text);
  assert.equal(body.targetDay.jdn, String(targetJdn));
  const localizedResponse = await fetch(`http://127.0.0.1:${port}/v1/date?calculationJdn=${calculationJdn}&targetJdn=${targetJdn}&locale=he`);
  const localizedHttp = await localizedResponse.json();
  assert.equal(localizedResponse.status, 200);
  assert.equal(localizedHttp.locale, 'he');
  const languageHeaderResponse = await fetch(
    `http://127.0.0.1:${port}/v1/date?calculationJdn=${calculationJdn}&targetJdn=${targetJdn}`,
    { headers: { 'accept-language': 'he' } },
  );
  assert.equal(languageHeaderResponse.status, 200);
  assert.equal((await languageHeaderResponse.json()).locale, 'en');
  const malformedLocale = await fetch(
    `http://127.0.0.1:${port}/v1/date?calculationJdn=${calculationJdn}&targetJdn=${targetJdn}&locale=en_us`,
  );
  assert.equal(malformedLocale.status, 422);
  assert.equal((await malformedLocale.json()).error.code, 'INVALID_LOCALE');
  const unsupportedLocale = await fetch(
    `http://127.0.0.1:${port}/v1/date?calculationJdn=${calculationJdn}&targetJdn=${targetJdn}&locale=en-US`,
  );
  assert.equal(unsupportedLocale.status, 406);
  assert.equal((await unsupportedLocale.json()).error.code, 'LOCALE_NOT_SUPPORTED');
  const browserClient = createSeerClient('http://127.0.0.1:' + port);
  const clientBody = await browserClient.queryDate(request);
  assert.equal(clientBody.targetDay.jdn, String(targetJdn));
  const clientLocalized = await browserClient.queryDate({ ...request, presentation: 'full', locale: 'he' });
  assert.equal(clientLocalized.locale, 'he');
  const locales = await browserClient.getLocales();
  assert.deepEqual(locales.locales.map((item) => item.code), ['en', 'he']);
  const schemaCount = await verifyOpenApiSchemaClosure('http://127.0.0.1:' + port + '/');
  assert.equal(schemaCount, packagedSchemaCount);
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

console.log(JSON.stringify({
  ok: true,
  calculationJdn,
  targetJdn,
  checks: ['fixture-query', 'venus-boundary', 'localized-direct', 'localized-http', 'accept-language-explicit-only', 'locale-errors', 'browser-client', 'locale-discovery', 'openapi-schema-closure'],
}));
