import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertReleaseIdentityConsistency,
  createPublicIdentityProvider,
} from '../../http/public-identity.mjs';

const packageManifest = { name: 'pastafarian-calendar-seer', version: '0.2.3' };
const commit = '0123456789abcdef0123456789abcdef01234567';
const releaseIdentity = {
  schemaVersion: 1,
  packageName: packageManifest.name,
  packageVersion: packageManifest.version,
  releaseTag: 'v0.2.3',
  commit,
  artifactMode: 'container',
};

test('package, tag and commit must describe one immutable release', () => {
  assert.doesNotThrow(() => assertReleaseIdentityConsistency({
    packageManifest,
    releaseIdentity,
    expectedTag: 'v0.2.3',
    expectedCommit: commit,
    requireComplete: true,
  }));

  assert.throws(() => assertReleaseIdentityConsistency({
    packageManifest,
    releaseIdentity: { ...releaseIdentity, packageVersion: '0.2.4' },
  }), /package version mismatch/);
  assert.throws(() => assertReleaseIdentityConsistency({
    packageManifest,
    releaseIdentity: { ...releaseIdentity, releaseTag: 'v0.2.4' },
  }), /tag mismatch/);
  assert.throws(() => assertReleaseIdentityConsistency({
    packageManifest,
    releaseIdentity,
    expectedCommit: 'f'.repeat(40),
  }), /commit mismatch/);
});

test('release manifest and container metadata must agree with runtime identity', () => {
  const releaseManifest = {
    version: '0.2.3',
    tag: 'v0.2.3',
    commit,
    runtimeIdentity: {
      packageVersion: '0.2.3',
      releaseTag: 'v0.2.3',
      commit,
    },
  };
  const containerMetadata = { version: '0.2.3', refName: 'v0.2.3', revision: commit };
  assert.doesNotThrow(() => assertReleaseIdentityConsistency({
    packageManifest,
    releaseIdentity,
    releaseManifest,
    containerMetadata,
    requireComplete: true,
  }));
  assert.throws(() => assertReleaseIdentityConsistency({
    packageManifest,
    releaseIdentity,
    releaseManifest: { ...releaseManifest, commit: 'a'.repeat(40) },
  }), /release manifest identity mismatch/);
  assert.throws(() => assertReleaseIdentityConsistency({
    packageManifest,
    releaseIdentity,
    containerMetadata: { ...containerMetadata, revision: 'b'.repeat(40) },
  }), /container commit metadata mismatch/);
});

test('strict production mode refuses an incomplete package identity before serving', async () => {
  const provider = createPublicIdentityProvider({
    packageManifest,
    releaseIdentity: {
      schemaVersion: 1,
      packageName: packageManifest.name,
      packageVersion: packageManifest.version,
      releaseTag: null,
      commit: null,
      artifactMode: 'package',
    },
    engineFingerprint: 'e'.repeat(64),
    requireReleaseIdentity: true,
  });
  await assert.rejects(provider.snapshot(), /immutable release identity is incomplete/);
});

test('rolling cache revision is separate from engine identity and public output is allow-listed', async () => {
  const generatedDir = await mkdtemp(path.join(os.tmpdir(), 'seer-public-identity-'));
  const engineFingerprint = 'c'.repeat(64);
  const raw = Buffer.from(JSON.stringify({
    schema: 1,
    engineFingerprint,
    producer: {
      sourceCommit: 'd'.repeat(40),
      hostname: 'must-not-leak.example',
    },
  }) + '\n');
  await writeFile(path.join(generatedDir, 'index.json'), raw);

  const provider = createPublicIdentityProvider({
    packageManifest,
    releaseIdentity: {
      ...releaseIdentity,
      secret: 'must-not-leak',
      internalPath: 'C:/must-not-leak',
      pid: 1234,
      hostname: 'must-not-leak.example',
    },
    engineFingerprint,
    generatedDir,
    requireReleaseIdentity: true,
  });
  const snapshot = await provider.snapshot();
  assert.equal(snapshot.engineFingerprint, engineFingerprint);
  assert.equal(snapshot.cacheRevision, `sha256:${createHash('sha256').update(raw).digest('hex')}`);
  assert.notEqual(snapshot.cacheRevision, snapshot.engineFingerprint);
  assert.deepEqual(Object.keys(snapshot).sort(), [
    'artifactMode',
    'cacheRevision',
    'commit',
    'engineFingerprint',
    'packageVersion',
    'releaseTag',
    'supportedFeatures',
  ]);
  assert.equal(JSON.stringify(snapshot).includes('must-not-leak'), false);
});
