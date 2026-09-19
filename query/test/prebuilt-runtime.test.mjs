import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  prebuiltRuntimeDescriptor,
  prebuiltRuntimeHint,
  resolvePrebuiltBinary,
} from '../prebuilt-runtime.mjs';

async function fixture({ nativeVersion = '0.2.3', includeBinary = true } = {}) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'seer-prebuilt-'));
  await writeFile(path.join(rootDir, 'package.json'), JSON.stringify({
    name: 'pastafarian-calendar-seer',
    version: '0.2.3',
  }));
  const nativeRoot = path.join(rootDir, 'node_modules', 'pastafarian-calendar-seer-win32-x64');
  await mkdir(path.join(nativeRoot, 'bin'), { recursive: true });
  await writeFile(path.join(nativeRoot, 'package.json'), JSON.stringify({
    name: 'pastafarian-calendar-seer-win32-x64',
    version: nativeVersion,
  }));
  if (includeBinary) await writeFile(path.join(nativeRoot, 'bin', 'seer_year_batch.exe'), 'fixture');
  return { rootDir, nativeRoot };
}
test('platform mapping is explicit and unsupported platforms stay client-installable', () => {
  assert.equal(prebuiltRuntimeDescriptor('linux', 'x64').name, 'pastafarian-calendar-seer-linux-x64');
  assert.equal(prebuiltRuntimeDescriptor('linux', 'x64').minimumGlibc, '2.36');
  assert.equal(prebuiltRuntimeDescriptor('linux', 'arm64').name, 'pastafarian-calendar-seer-linux-arm64');
  assert.equal(prebuiltRuntimeDescriptor('linux', 'arm64').minimumGlibc, '2.36');
  assert.equal(prebuiltRuntimeDescriptor('win32', 'x64').name, 'pastafarian-calendar-seer-win32-x64');
  assert.equal(prebuiltRuntimeDescriptor('darwin', 'arm64'), null);
});

test('resolver finds an exact-version optional prebuilt binary', async (t) => {
  const { rootDir, nativeRoot } = await fixture();
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const resolved = await resolvePrebuiltBinary({
    rootDir,
    basename: 'seer_year_batch',
    platform: 'win32',
    arch: 'x64',
  });
  assert.equal(resolved, path.join(nativeRoot, 'bin', 'seer_year_batch.exe'));
});

test('missing optional package is a clean cache-independent miss', async (t) => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'seer-prebuilt-missing-'));
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  await writeFile(path.join(rootDir, 'package.json'), JSON.stringify({
    name: 'pastafarian-calendar-seer',
    version: '0.2.3',
  }));
  assert.equal(await resolvePrebuiltBinary({
    rootDir,
    basename: 'seer_year_batch',
    platform: 'win32',
    arch: 'x64',
  }), null);
});
test('resolver rejects native package version drift', async (t) => {
  const { rootDir } = await fixture({ nativeVersion: '0.2.2' });
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  await assert.rejects(
    resolvePrebuiltBinary({ rootDir, basename: 'seer_year_batch', platform: 'win32', arch: 'x64' }),
    (error) => error.code === 'SEER_PREBUILT_VERSION_MISMATCH'
      && error.details?.expectedVersion === '0.2.3'
      && error.details?.installedVersion === '0.2.2',
  );
});

test('resolver rejects incomplete native packages', async (t) => {
  const { rootDir } = await fixture({ includeBinary: false });
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  await assert.rejects(
    resolvePrebuiltBinary({ rootDir, basename: 'seer_year_batch', platform: 'win32', arch: 'x64' }),
    (error) => error.code === 'SEER_PREBUILT_INCOMPLETE',
  );
});

test('runtime hint distinguishes supported-but-omitted from unsupported', async (t) => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'seer-prebuilt-hint-'));
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  await writeFile(path.join(rootDir, 'package.json'), JSON.stringify({
    name: 'pastafarian-calendar-seer',
    version: '0.2.3',
  }));
  const supported = await prebuiltRuntimeHint({
    rootDir,
    platform: 'linux',
    arch: 'arm64',
    glibcVersion: '2.36',
  });
  assert.equal(supported.supported, true);
  assert.match(supported.message, /without --omit=optional/);
  assert.equal(supported.details.version, '0.2.3');

  const unsupported = await prebuiltRuntimeHint({ rootDir, platform: 'darwin', arch: 'arm64' });
  assert.equal(unsupported.supported, false);
  assert.match(unsupported.message, /No prebuilt exact Seer runtime/);
});

test('Linux prebuilt rejects glibc below the published baseline before execution', async (t) => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'seer-prebuilt-glibc-'));
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  await writeFile(path.join(rootDir, 'package.json'), JSON.stringify({
    name: 'pastafarian-calendar-seer',
    version: '0.2.3',
  }));

  await assert.rejects(
    resolvePrebuiltBinary({
      rootDir,
      basename: 'seer_year_batch',
      platform: 'linux',
      arch: 'x64',
      glibcVersion: '2.35',
    }),
    (error) => error.code === 'SEER_PREBUILT_LIBC_UNSUPPORTED'
      && error.details?.minimumGlibc === '2.36'
      && error.details?.runtimeGlibc === '2.35',
  );

  const hint = await prebuiltRuntimeHint({
    rootDir,
    platform: 'linux',
    arch: 'x64',
    glibcVersion: '2.35',
  });
  assert.equal(hint.supported, false);
  assert.match(hint.message, /requires glibc >= 2\.36; detected 2\.35/);
});
