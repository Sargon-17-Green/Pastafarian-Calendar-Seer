import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as publicApi from '../../index.mjs';
import * as queryApi from '../../query/index.mjs';
import * as httpApi from '../../http/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const queryNames = [
  'queryDate', 'queryNow', 'queryBatch', 'queryRange', 'queryReverse',
  'queryCalculationDay', 'queryYear', 'gregorianToJdn', 'jdnToGregorian',
];

const runtimeSources = [
  'pastafarian_year_batch.cpp', 'rns_primes.hpp', 'rns_primes32.hpp',
  'sauce_fast127_v12.hpp', 'short_selection_o1.hpp',
  'seer_calendar_core.cpp', 'seer_calendar_core.hpp', 'seer_engine_service.cpp',
  'seer_month_dp_internal.hpp', 'seer_selection_core.hpp',
  'seer_weave_avx2.cpp', 'seer_weave_core.hpp', 'seer_weave_portable.cpp',
  'seer_year_core.cpp', 'seer_year_core.hpp', 'seer_year_locator.cpp', 'seer_year_structure.cpp',
].map((name) => `prototype/src/${name}`);

test('root package entry point is the verified query API', () => {
  for (const name of queryNames) {
    assert.equal(typeof publicApi[name], 'function', `${name} must be exported`);
    assert.equal(publicApi[name], queryApi[name], `${name} must not wrap or fork semantics`);
  }
  assert.equal(publicApi.SeerQueryError, queryApi.SeerQueryError);
  assert.equal(publicApi.DEFAULT_GENERATED_DIR, queryApi.DEFAULT_GENERATED_DIR);
});
test('HTTP package entry point delegates to the Stage 4 modules', async () => {
  assert.equal(typeof httpApi.createSeerHttpHandler, 'function');
  assert.equal(typeof httpApi.createSeerHttpServer, 'function');
  assert.equal(typeof httpApi.listen, 'function');
  const app = await import('../../http/app.mjs');
  const server = await import('../../http/server.mjs');
  assert.equal(httpApi.createSeerHttpHandler, app.createSeerHttpHandler);
  assert.equal(httpApi.createSeerHttpServer, server.createSeerHttpServer);
  assert.equal(httpApi.listen, server.listen);
});

test('package metadata exposes stable entry points with platform-native optional dependencies', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.main, './index.mjs');
  assert.equal(pkg.exports['.'], './index.mjs');
  assert.equal(pkg.exports['./http'], './http/index.mjs');
  assert.equal(pkg.exports['./client'], './client/index.mjs');
  assert.equal(pkg.exports['./schemas/*'], './api/schemas/*');
  assert.equal(pkg.bin['pastafarian-seer'], 'query/cli.mjs');
  assert.equal(pkg.bin['pastafarian-seer-http'], 'http/server.mjs');
  assert.equal(pkg.scripts['build:native'], 'node ./scripts/build-runtime.mjs');
  assert.equal(pkg.scripts.preinstall, undefined);
  assert.equal(pkg.scripts.install, undefined);
  assert.equal(pkg.scripts.postinstall, undefined);
  assert.equal(pkg.scripts.test, 'node ./scripts/package-selftest.mjs');
  assert.equal(pkg.scripts['test:repo'], 'node --test precompute/test/*.test.mjs query/test/*.test.mjs client/test/*.test.mjs http/test/*.test.mjs deployment/test/*.test.mjs');
  assert.equal(pkg.engines.node, '>=20');
  assert.equal(pkg.os, undefined);
  assert.equal(pkg.cpu, undefined);
  assert.equal(pkg.repository.url, 'git+https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer.git');
  assert.deepEqual(pkg.dependencies ?? {}, {});
  assert.deepEqual(pkg.optionalDependencies, {
    'pastafarian-calendar-seer-linux-x64': pkg.version,
    'pastafarian-calendar-seer-linux-arm64': pkg.version,
    'pastafarian-calendar-seer-win32-x64': pkg.version,
  });
  assert.equal(pkg.os, undefined);
  assert.equal(pkg.cpu, undefined);
});
test('package file allowlist excludes repository-only material', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const files = pkg.files.map(String);
  assert.equal(files.some((entry) => entry === 'generated' || entry.startsWith('generated/')), false);
  assert.ok(files.includes('client/*.mjs'));
  assert.equal(files.some((entry) => entry === 'web' || entry.startsWith('web/')), false);
  assert.ok(files.includes('api/openapi.json'));
  assert.ok(files.includes('api/openapi.yaml'));
  assert.equal(files.includes('api'), false);
  assert.ok(files.includes('precompute/cache-lookup.mjs'));
  assert.ok(files.includes('precompute/lib/cache-format.mjs'));
  assert.equal(files.includes('precompute/lib/schedule.mjs'), false);
  assert.equal(files.includes('precompute/validate-generated.mjs'), false);
  assert.ok(files.includes('precompute/vendor/pastafari-calendar-1.4.1/venus-day-boundary.js'));
  assert.equal(files.includes('precompute/*.mjs'), false);
  assert.ok(files.includes('prototype/data/gates_u16.bin'));
  assert.ok(files.includes('prototype/data/gates_negative_u16.bin'));
  assert.ok(files.includes('prototype/data/gates_100k_u16.bin'));
  assert.ok(files.includes('prototype/data/gates_negative_100k_u16.bin'));
  assert.equal(files.includes('prototype/data'), false);
  assert.equal(files.includes('prototype/src'), false);
  for (const source of runtimeSources) assert.ok(files.includes(source), source);
  assert.equal(files.includes('prototype/src/opt07_transition_research.cpp'), false);
  assert.equal(files.includes('prototype/src/month_count_table_bench.cpp'), false);
  assert.equal(files.includes('prototype/data/canonical_saved_sum_vectors.tsv'), false);
  assert.equal(files.includes('api/tests/test_contract.py'), false);
  assert.ok(files.includes('api/schemas/*.json'));
  assert.equal(files.includes('api/examples/valid/date-minimal.json'), false);
  assert.equal(files.includes('precompute/generate-cache.mjs'), false);
  assert.equal(files.includes('precompute/query.mjs'), false);
  assert.ok(files.includes('scripts/package-selftest.mjs'));
  assert.ok(files.includes('scripts/build-runtime.mjs'));
  assert.ok(files.includes('scripts/build-runtime.ps1'));
  assert.ok(files.includes('scripts/build-runtime.sh'));
  for (const entry of files) {
    assert.equal(entry.includes('.github'), false);
    assert.equal(/handoff/i.test(entry), false);
    assert.equal(/results/i.test(entry), false);
  }
  const serverText = await readFile(path.join(root, 'http/server.mjs'), 'utf8');
  assert.ok(serverText.startsWith('#!/usr/bin/env node\n'));
});
