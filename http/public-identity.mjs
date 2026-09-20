import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { sha256EngineInputs } from '../precompute/lib/cache-format.mjs';

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(here, '..');
const PACKAGE_NAME = 'pastafarian-calendar-seer';
const COMMIT_RE = /^[0-9a-f]{40}$/;
const FINGERPRINT_RE = /^[0-9a-f]{64}$/;
const ARTIFACT_MODES = new Set(['source', 'package', 'container']);

export const SUPPORTED_FEATURES = Object.freeze([
  'now-query',
  'date-query',
  'batch-query',
  'range-query',
  'range-ndjson',
  'range-csv',
  'year-query',
  'reverse-query',
  'calculation-day',
  'locales',
  'canonical-presentation',
  'full-presentation',
  'public-status',
  'openapi',
]);

function normalizeCommit(value, label = 'commit') {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).toLowerCase();
  if (!COMMIT_RE.test(normalized)) throw new Error(`${label} must be a full 40-character Git SHA`);
  return normalized;
}

function normalizeArtifactMode(value) {
  const mode = String(value ?? '').trim();
  if (!ARTIFACT_MODES.has(mode)) throw new Error(`invalid artifact mode: ${mode || '<empty>'}`);
  return mode;
}

function validatePackageManifest(packageManifest) {
  if (!packageManifest || packageManifest.name !== PACKAGE_NAME) {
    throw new Error('package identity mismatch');
  }
  if (typeof packageManifest.version !== 'string' || !packageManifest.version || packageManifest.version.trim() !== packageManifest.version) {
    throw new Error('package version is missing or invalid');
  }
  return packageManifest;
}

export function assertReleaseIdentityConsistency({
  packageManifest,
  releaseIdentity,
  releaseManifest = null,
  containerMetadata = null,
  expectedTag = null,
  expectedCommit = null,
  requireComplete = false,
} = {}) {
  const pkg = validatePackageManifest(packageManifest);
  if (!releaseIdentity || releaseIdentity.schemaVersion !== 1) throw new Error('release identity schema mismatch');
  if (releaseIdentity.packageName !== pkg.name) throw new Error('release identity package name mismatch');
  if (releaseIdentity.packageVersion !== pkg.version) throw new Error('release identity package version mismatch');

  const artifactMode = normalizeArtifactMode(releaseIdentity.artifactMode);
  const releaseTag = releaseIdentity.releaseTag ?? null;
  const commit = normalizeCommit(releaseIdentity.commit, 'release identity commit');
  const canonicalTag = `v${pkg.version}`;

  if (releaseTag !== null && releaseTag !== canonicalTag) {
    throw new Error(`release identity tag mismatch: ${releaseTag} != ${canonicalTag}`);
  }
  if (requireComplete && (releaseTag === null || commit === null)) {
    throw new Error('immutable release identity is incomplete');
  }
  if (expectedTag !== null && releaseTag !== expectedTag) {
    throw new Error(`release identity tag mismatch: ${releaseTag ?? '<missing>'} != ${expectedTag}`);
  }
  const normalizedExpectedCommit = normalizeCommit(expectedCommit, 'expected commit');
  if (normalizedExpectedCommit !== null && commit !== normalizedExpectedCommit) {
    throw new Error(`release identity commit mismatch: ${commit ?? '<missing>'} != ${normalizedExpectedCommit}`);
  }

  if (releaseManifest !== null) {
    if (releaseManifest.version !== pkg.version || releaseManifest.tag !== releaseTag || normalizeCommit(releaseManifest.commit, 'release manifest commit') !== commit) {
      throw new Error('release manifest identity mismatch');
    }
    const manifestIdentity = releaseManifest.runtimeIdentity;
    if (!manifestIdentity ||
        manifestIdentity.packageVersion !== pkg.version ||
        manifestIdentity.releaseTag !== releaseTag ||
        normalizeCommit(manifestIdentity.commit, 'release manifest runtime commit') !== commit) {
      throw new Error('release manifest runtime identity mismatch');
    }
  }

  if (containerMetadata !== null) {
    if (containerMetadata.version !== pkg.version) throw new Error('container version metadata mismatch');
    if (containerMetadata.refName !== releaseTag) throw new Error('container release-tag metadata mismatch');
    if (normalizeCommit(containerMetadata.revision, 'container revision') !== commit) {
      throw new Error('container commit metadata mismatch');
    }
  }

  return Object.freeze({
    schemaVersion: 1,
    packageName: pkg.name,
    packageVersion: pkg.version,
    releaseTag,
    commit,
    artifactMode,
  });
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function gitText(rootDir, args) {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd: rootDir, windowsHide: true });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function sourceIdentity(rootDir, packageManifest, artifactMode) {
  const commitText = await gitText(rootDir, ['rev-parse', 'HEAD']);
  const commit = commitText && COMMIT_RE.test(commitText.toLowerCase()) ? commitText.toLowerCase() : null;
  const expectedTag = `v${packageManifest.version}`;
  let releaseTag = null;
  if (commit !== null) {
    const tagCommit = await gitText(rootDir, ['rev-list', '-n', '1', expectedTag]);
    if (tagCommit?.toLowerCase() === commit) releaseTag = expectedTag;
  }
  return {
    schemaVersion: 1,
    packageName: packageManifest.name,
    packageVersion: packageManifest.version,
    releaseTag,
    commit,
    artifactMode: artifactMode ?? (commit === null ? 'package' : 'source'),
  };
}

export async function computeEngineFingerprint(rootDir = DEFAULT_ROOT) {
  return sha256EngineInputs({
    sourceDir: path.join(rootDir, 'prototype', 'src'),
    dataFiles: {
      positiveGates: path.join(rootDir, 'prototype', 'data', 'gates_100k_u16.bin'),
      negativeGates: path.join(rootDir, 'prototype', 'data', 'gates_negative_100k_u16.bin'),
    },
  });
}

async function cacheRevisionFor(generatedDir, engineFingerprint) {
  if (!generatedDir) return null;
  try {
    const raw = await readFile(path.join(generatedDir, 'index.json'));
    const index = JSON.parse(raw.toString('utf8'));
    if (index?.engineFingerprint !== engineFingerprint) return null;
    return `sha256:${createHash('sha256').update(raw).digest('hex')}`;
  } catch {
    return null;
  }
}

export function createPublicIdentityProvider(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? DEFAULT_ROOT);
  const generatedDir = options.generatedDir ?? process.env.SEER_CACHE_DIR ?? null;
  const requireReleaseIdentity = options.requireReleaseIdentity ??
    String(process.env.SEER_REQUIRE_RELEASE_IDENTITY ?? '') === '1';
  const envArtifactModeRaw = options.artifactMode ?? process.env.SEER_ARTIFACT_MODE ?? null;
  const envArtifactMode = envArtifactModeRaw === null || envArtifactModeRaw === ''
    ? null
    : normalizeArtifactMode(envArtifactModeRaw);
  let stablePromise;

  async function loadStable() {
    const packageManifest = options.packageManifest ??
      JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
    validatePackageManifest(packageManifest);

    const bakedIdentity = options.releaseIdentity !== undefined
      ? options.releaseIdentity
      : await readJsonIfPresent(path.join(rootDir, 'release-identity.json'));
    const candidate = bakedIdentity ?? await sourceIdentity(rootDir, packageManifest, envArtifactMode);
    const releaseIdentity = assertReleaseIdentityConsistency({
      packageManifest,
      releaseIdentity: candidate,
      requireComplete: requireReleaseIdentity,
    });

    const engineFingerprint = String(options.engineFingerprint ??
      await computeEngineFingerprint(rootDir)).toLowerCase();
    if (!FINGERPRINT_RE.test(engineFingerprint)) throw new Error('engine fingerprint is invalid');

    return Object.freeze({
      packageVersion: packageManifest.version,
      releaseTag: releaseIdentity.releaseTag,
      commit: releaseIdentity.commit,
      artifactMode: releaseIdentity.artifactMode,
      engineFingerprint,
      supportedFeatures: SUPPORTED_FEATURES,
    });
  }

  async function snapshot() {
    stablePromise ??= loadStable();
    const stable = await stablePromise;
    const cacheRevision = await cacheRevisionFor(generatedDir, stable.engineFingerprint);
    return Object.freeze({
      packageVersion: stable.packageVersion,
      releaseTag: stable.releaseTag,
      commit: stable.commit,
      artifactMode: stable.artifactMode,
      engineFingerprint: stable.engineFingerprint,
      supportedFeatures: [...stable.supportedFeatures],
      cacheRevision,
    });
  }

  return Object.freeze({ snapshot });
}
