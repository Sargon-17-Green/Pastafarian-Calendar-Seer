#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const [rootPackageDir, nativePackageDir] = process.argv.slice(2);
if (!rootPackageDir || !nativePackageDir) {
  console.error('Usage: node deployment/test/registry-style-install.mjs <root-package-dir> <native-package-dir>');
  process.exit(2);
}

const work = await mkdtemp(path.join(os.tmpdir(), 'seer-registry-install-'));
const packDir = path.join(work, 'packs');
await mkdir(packDir, { recursive: true });

async function pack(packageDir) {
  const { stdout } = await execFileAsync(npmCommand, ['pack', packageDir, '--pack-destination', packDir, '--json'], {
    encoding: 'utf8',
    windowsHide: true,
    shell: process.platform === 'win32',
  });
  const info = JSON.parse(stdout)[0];
  const pkg = JSON.parse(await readFile(path.join(packageDir, 'package.json'), 'utf8'));
  const tarballPath = path.join(packDir, info.filename);
  const bytes = await readFile(tarballPath);
  return {
    pkg,
    filename: info.filename,
    bytes,
    integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64'),
    shasum: createHash('sha1').update(bytes).digest('hex'),
  };
}
const packed = await Promise.all([pack(rootPackageDir), pack(nativePackageDir)]);
const packages = new Map(packed.map((item) => [item.pkg.name, item]));
let baseUrl;
const server = createServer((req, res) => {
  const url = new URL(req.url, baseUrl);
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const requestedName = parts[0];
  const item = packages.get(requestedName);
  if (parts.length === 1 && item) {
    const version = item.pkg.version;
    const body = {
      _id: item.pkg.name,
      name: item.pkg.name,
      'dist-tags': { latest: version },
      versions: {
        [version]: {
          ...item.pkg,
          _id: `${item.pkg.name}@${version}`,
          dist: {
            tarball: `${baseUrl}${encodeURIComponent(item.pkg.name)}/-/${item.filename}`,
            integrity: item.integrity,
            shasum: item.shasum,
          },
        },
      },
    };
    const encoded = Buffer.from(JSON.stringify(body));
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': encoded.length });
    res.end(encoded);
    return;
  }
  if (parts.length === 3 && parts[1] === '-' && item && parts[2] === item.filename) {
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': item.bytes.length });
    res.end(item.bytes);
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found', reason: 'package not present in test registry' }));
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
baseUrl = `http://127.0.0.1:${server.address().port}/`;

async function cleanInstall(dir, extraArgs = []) {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'package.json'), JSON.stringify({ private: true }));
  const args = [
    'install',
    `pastafarian-calendar-seer@${packed[0].pkg.version}`,
    `--registry=${baseUrl}`,
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    ...extraArgs,
  ];
  return execFileAsync(npmCommand, args, {
    cwd: dir,
    encoding: 'utf8',
    windowsHide: true,
    shell: process.platform === 'win32',
    env: { ...process.env, npm_config_cache: path.join(work, 'npm-cache') },
    maxBuffer: 16 * 1024 * 1024,
  });
}

let closeExactServices = () => {};
try {
  const consumer = path.join(work, 'consumer');
  await cleanInstall(consumer);
  const root = path.join(consumer, 'node_modules', 'pastafarian-calendar-seer');
  const native = path.join(consumer, 'node_modules', packed[1].pkg.name);
  const nativeMeta = JSON.parse(await readFile(path.join(native, 'package.json'), 'utf8'));
  assert.equal(nativeMeta.version, packed[0].pkg.version);
  assert.equal(nativeMeta.scripts, undefined, 'prebuilt package must not have install scripts');

  const api = await import(pathToFileURL(path.join(root, 'index.mjs')).href);
  const exactEngine = await import(pathToFileURL(path.join(root, 'query', 'exact-engine.mjs')).href);
  closeExactServices = exactEngine.closeExactEngineServicesForTests;
  const result = await api.queryNow({
    now: '2026-10-19T12:00:00Z',
    presentation: 'canonical',
  });
  assert.match(result.calculationDay.jdn, /^-?\d+$/);
  assert.match(result.pastafarianDate.year, /^-?\d+$/);
  const clientOnly = path.join(work, 'client-only');
  await cleanInstall(clientOnly, ['--omit=optional']);
  await import(pathToFileURL(path.join(
    clientOnly,
    'node_modules',
    'pastafarian-calendar-seer',
    'client',
    'index.mjs',
  )).href);
  await assert.rejects(
    import(pathToFileURL(path.join(
      clientOnly,
      'node_modules',
      'pastafarian-calendar-seer',
      'index.mjs',
    )).href).then((clientOnlyApi) => clientOnlyApi.queryNow({
      now: '2026-10-19T12:00:00Z',
      presentation: 'canonical',
    })),
    (error) => error?.code === 'SEER_UNAVAILABLE'
      && /optional package|No prebuilt exact Seer runtime/.test(error.message),
  );

  const unsupportedClient = path.join(work, 'unsupported-client');
  await cleanInstall(unsupportedClient, ['--os=darwin', '--cpu=arm64']);
  await import(pathToFileURL(path.join(
    unsupportedClient,
    'node_modules',
    'pastafarian-calendar-seer',
    'client',
    'index.mjs',
  )).href);

  console.log(JSON.stringify({
    ok: true,
    registry: 'local-http',
    installScripts: false,
    version: packed[0].pkg.version,
    nativePackage: packed[1].pkg.name,
    simulatedAgeDays: 30,
    calculationDayJdn: result.calculationDay.jdn,
    pastafarianYear: result.pastafarianDate.year,
    clientOnlyOmitOptional: true,
    unsupportedPlatformClientInstall: true,
  }, null, 2));
} finally {
  closeExactServices();
  await new Promise((resolve) => server.close(resolve));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(work, { recursive: true, force: true });
      break;
    } catch (error) {
      if (error?.code !== 'EBUSY' || attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
