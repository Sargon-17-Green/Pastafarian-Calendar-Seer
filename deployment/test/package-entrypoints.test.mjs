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
  'queryDate', 'queryNow', 'queryBatch', 'queryRange',
  'queryCalculationDay', 'queryYear', 'gregorianToJdn', 'jdnToGregorian',
];

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

test('package metadata exposes stable zero-dependency entry points', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.main, './index.mjs');
  assert.equal(pkg.exports['.'], './index.mjs');
  assert.equal(pkg.exports['./http'], './http/index.mjs');
  assert.equal(pkg.bin['pastafarian-seer'], './query/cli.mjs');
  assert.equal(pkg.bin['pastafarian-seer-http'], './http/server.mjs');
  assert.equal(pkg.scripts['build:native'], 'node ./scripts/build-runtime.mjs');
  assert.deepEqual(pkg.dependencies ?? {}, {});
  assert.deepEqual(pkg.optionalDependencies ?? {}, {});
});
test('package file allowlist excludes repository-only material', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const files = pkg.files.map(String);
  assert.ok(files.includes('generated'));
  assert.ok(files.includes('prototype/data'));
  assert.ok(files.includes('prototype/src'));
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
