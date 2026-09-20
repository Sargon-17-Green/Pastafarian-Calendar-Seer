import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { restoreCacheSnapshot } from '../restore-cache-snapshot.mjs';

const REF = 'a'.repeat(40);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('cache snapshot restore preserves Git blob bytes exactly', async (t) => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'seer-bench-cache-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const cacheRaw = Buffer.from('{"schema":1,"records":[]}\n', 'utf8');
  const indexRaw = Buffer.from(`${JSON.stringify({
    schema: 1,
    engineFingerprint: 'b'.repeat(64),
    caches: [{
      calcJdn: 1,
      path: 'calc/1.json',
      sha256: hash(cacheRaw),
      targetStartJdn: 1,
      targetCount: 1,
    }],
  }, null, 2)}\n`, 'utf8');
  const blobs = new Map([
    ['index.json', indexRaw],
    ['calc/1.json', cacheRaw],
  ]);
  const readBlob = async (_repo, _ref, repoPath) => {
    const value = blobs.get(repoPath);
    if (!value) throw new Error(`missing test blob: ${repoPath}`);
    return value;
  };

  const result = await restoreCacheSnapshot({
    repositoryDir: '.',
    ref: REF,
    outputDir,
    readBlob,
  });

  assert.equal(result.indexSha256, hash(indexRaw));
  assert.deepEqual(await readFile(path.join(outputDir, 'index.json')), indexRaw);
  assert.deepEqual(await readFile(path.join(outputDir, 'calc', '1.json')), cacheRaw);
});

test('cache snapshot restore rejects a blob whose bytes do not match the descriptor', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'seer-bench-cache-bad-'));
  const expected = Buffer.from('expected\n');
  const actual = Buffer.from('changed\r\n');
  const indexRaw = Buffer.from(JSON.stringify({
    schema: 1,
    engineFingerprint: 'c'.repeat(64),
    caches: [{
      calcJdn: 1,
      path: 'calc/1.json',
      sha256: hash(expected),
      targetStartJdn: 1,
      targetCount: 1,
    }],
  }), 'utf8');
  const blobs = new Map([
    ['index.json', indexRaw],
    ['calc/1.json', actual],
  ]);
  try {
    await assert.rejects(
      restoreCacheSnapshot({
        repositoryDir: '.',
        ref: REF,
        outputDir,
        readBlob: async (_repo, _ref, repoPath) => blobs.get(repoPath),
      }),
      /checksum mismatch/,
    );
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
