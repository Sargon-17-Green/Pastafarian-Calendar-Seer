#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertReleaseIdentityConsistency } from '../http/public-identity.mjs';

const argv = process.argv.slice(2);
function option(name) {
  const prefix = `--${name}=`;
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

const rootDir = path.resolve(option('root') || process.cwd());
const packageManifest = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
const packageVersion = option('version') || process.env.RELEASE_VERSION || packageManifest.version;
const releaseTag = option('tag') || process.env.RELEASE_TAG || null;
const commit = option('commit') || process.env.RELEASE_COMMIT || null;
const artifactMode = option('mode') || process.env.RELEASE_ARTIFACT_MODE || 'package';

const identity = {
  schemaVersion: 1,
  packageName: packageManifest.name,
  packageVersion,
  releaseTag,
  commit: commit?.toLowerCase() ?? null,
  artifactMode,
};

const normalized = assertReleaseIdentityConsistency({
  packageManifest,
  releaseIdentity: identity,
  expectedTag: releaseTag,
  expectedCommit: commit,
  requireComplete: true,
});

const output = path.resolve(rootDir, option('output') || 'release-identity.json');
await writeFile(output, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  packageVersion: normalized.packageVersion,
  releaseTag: normalized.releaseTag,
  commit: normalized.commit,
  artifactMode: normalized.artifactMode,
}));
