import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createSeerHttpHandler } from '../../http/app.mjs';

async function withWebServer(fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'seer-web-test-'));
  const webRoot = path.join(root, 'web');
  const clientDir = path.join(root, 'client');
  await mkdir(webRoot);
  await mkdir(clientDir);
  await writeFile(path.join(webRoot, 'index.html'), '<!doctype html><title>Seer web</title>\n');
  await writeFile(path.join(webRoot, 'config.js'), 'globalThis.SEER_WEB_CONFIG={apiBase:""};\n');
  await writeFile(path.join(clientDir, 'index.mjs'), 'export const marker = true;\n');
  const queryApi = {
    async queryDate() {
      return {
        calculationDay: { jdn: '1' },
        targetDay: { jdn: '1', gregorian: { era: 'CE', year: '1', month: 1, day: 1 } },
        pastafarianDate: {
          year: '1',
          cutlet: { canonicalIndex: 1, day: 1 },
          month: { canonicalIndex: 1, day: 1 },
        },
      };
    },
  };
  const server = http.createServer(createSeerHttpHandler({ webRoot, clientDir, queryApi }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('configured web root serves app and client without swallowing API routes', async () => {
  await withWebServer(async (base) => {
    const root = await fetch(`${base}/`, { redirect: 'manual' });
    assert.equal(root.status, 302);
    assert.equal(root.headers.get('location'), '/web/');

    const html = await fetch(`${base}/web/`);
    assert.equal(html.status, 200);
    assert.match(html.headers.get('content-type'), /^text\/html/);
    assert.match(html.headers.get('content-security-policy'), /object-src 'none'/);
    assert.equal(html.headers.get('cache-control'), 'no-cache');
    assert.match(await html.text(), /Seer web/);

    const client = await fetch(`${base}/client/index.mjs`);
    assert.equal(client.status, 200);
    assert.match(client.headers.get('content-type'), /^text\/javascript/);
    assert.match(await client.text(), /marker/);

    const status = await fetch(`${base}/v1/status`);
    assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), { status: 'ok' });
  });
});

test('static serving has no SPA fallback and rejects non-read methods', async () => {
  await withWebServer(async (base) => {
    assert.equal((await fetch(`${base}/web/missing.js`)).status, 404);
    assert.equal((await fetch(`${base}/web/`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${base}/v1/nope`)).status, 404);
  });
});
