import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

test('public contract freezes canonical indices at 1..17 and 1..47', async () => {
  const schema = JSON.parse(await readFile(path.join(root, 'api', 'schemas', 'pastafarian-date.schema.json'), 'utf8'));
  assert.deepEqual(schema.properties.cutlet.properties.canonicalIndex, { type: 'integer', minimum: 1, maximum: 17 });
  assert.deepEqual(schema.properties.month.properties.canonicalIndex, { type: 'integer', minimum: 1, maximum: 47 });
});
