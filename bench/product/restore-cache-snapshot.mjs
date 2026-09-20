#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const SHA40 = /^[0-9a-f]{40}$/;
const CACHE_PATH = /^calc\/-?\d+\.json$/;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function parseRestoreArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--ref=')) values.ref = arg.slice(6);
    else if (arg.startsWith('--output-dir=')) values.outputDir = arg.slice(13);
    else if (arg === '--ref') values.ref = argv[++i];
    else if (arg === '--output-dir') values.outputDir = argv[++i];
    else throw new Error(`unexpected argument: ${arg}`);
  }
  if (!SHA40.test(values.ref ?? '')) throw new Error('--ref must be a full 40-character Git SHA');
  if (!values.outputDir) throw new Error('--output-dir is required');
  return { ref: values.ref, outputDir: path.resolve(values.outputDir) };
}

async function gitBlob(repositoryDir, ref, repoPath) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['show', `${ref}:${repoPath}`], {
      cwd: repositoryDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    let bytes = 0;
    const maxBytes = 64 * 1024 * 1024;
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        child.kill();
        reject(new Error(`Git blob exceeds ${maxBytes} bytes: ${repoPath}`));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`git show failed for ${repoPath}: ${Buffer.concat(stderr).toString('utf8').trim()}`));
        return;
      }
      resolve(Buffer.concat(stdout));
    });
  });
}

export async function restoreCacheSnapshot({
  repositoryDir = root,
  ref,
  outputDir,
  readBlob = gitBlob,
} = {}) {
  if (!SHA40.test(ref ?? '')) throw new Error('ref must be a full 40-character Git SHA');
  if (!outputDir) throw new Error('outputDir is required');
  const resolvedOutput = path.resolve(outputDir);
  const indexRaw = await readBlob(repositoryDir, ref, 'index.json');
  let index;
  try {
    index = JSON.parse(indexRaw.toString('utf8'));
  } catch (error) {
    throw new Error('cache-data index.json is not valid UTF-8 JSON', { cause: error });
  }
  if (!index || !Array.isArray(index.caches) || typeof index.engineFingerprint !== 'string') {
    throw new Error('cache-data index.json has an invalid shape');
  }

  const blobs = [];
  for (const descriptor of index.caches) {
    if (!descriptor || !CACHE_PATH.test(descriptor.path ?? '') ||
        typeof descriptor.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(descriptor.sha256)) {
      throw new Error('cache-data index contains an invalid descriptor');
    }
    const raw = await readBlob(repositoryDir, ref, descriptor.path);
    const actual = sha256(raw);
    if (actual.toLowerCase() !== descriptor.sha256.toLowerCase()) {
      throw new Error(`cache-data blob checksum mismatch for ${descriptor.path}: ${actual} != ${descriptor.sha256}`);
    }
    blobs.push({ descriptor, raw });
  }

  await rm(resolvedOutput, { recursive: true, force: true });
  await mkdir(path.join(resolvedOutput, 'calc'), { recursive: true });
  await writeFile(path.join(resolvedOutput, 'index.json'), indexRaw);
  for (const { descriptor, raw } of blobs) {
    await writeFile(path.join(resolvedOutput, descriptor.path), raw);
  }

  return Object.freeze({
    ref,
    indexSha256: sha256(indexRaw),
    cacheCount: blobs.length,
    engineFingerprint: index.engineFingerprint,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseRestoreArgs(process.argv.slice(2));
  const result = await restoreCacheSnapshot({
    repositoryDir: root,
    ref: options.ref,
    outputDir: options.outputDir,
  });
  console.log(JSON.stringify(result));
}
