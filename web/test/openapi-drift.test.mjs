import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WEB_API_ROUTES } from '../model.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

test('every route referenced by the production web app exists in OpenAPI', async () => {
  const openapi = JSON.parse(await readFile(path.resolve(here, '..', '..', 'api', 'openapi.json'), 'utf8'));
  const paths = new Set(Object.keys(openapi.paths ?? {}));
  for (const route of WEB_API_ROUTES) {
    assert.ok(paths.has(route), `web route missing from OpenAPI: ${route}`);
  }
});
