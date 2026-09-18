import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

async function text(name) {
  return readFile(path.join(here, name), 'utf8');
}

test('browser example references only local static resources', async () => {
  const html = await text('index.html');
  assert.match(html, /<script type="module" src="\.\/app\.mjs"><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/style\.css">/);
  assert.match(html, /id="api-base"/);
  assert.match(html, /id="target-date"/);
  assert.match(html, /id="now-button"/);
  await readFile(path.join(here, 'app.mjs'));
  await readFile(path.join(here, 'style.css'));
});

test('example delegates transport to the browser-safe client', async () => {
  const app = await text('app.mjs');
  assert.match(app, /from '\.\.\/\.\.\/client\/index\.mjs'/);
  assert.match(app, /createSeerClient/);
  assert.match(app, /\.queryDate\(/);
  assert.match(app, /\.queryNow\(/);
  assert.doesNotMatch(app, /node:|process\.|require\(/);
});

test('example documents a runnable local integration path', async () => {
  const readme = await text('README.md');
  assert.match(readme, /npm run build:native/);
  assert.match(readme, /npm start/);
  assert.match(readme, /python -m http\.server 8000/);
  assert.match(readme, /127\.0\.0\.1:8080/);
});
