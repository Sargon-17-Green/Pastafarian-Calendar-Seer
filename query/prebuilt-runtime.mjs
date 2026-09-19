import { access, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

export const PREBUILT_RUNTIME_PACKAGES = Object.freeze({
  'linux:x64': Object.freeze({
    name: 'pastafarian-calendar-seer-linux-x64',
    suffix: '',
    minimumGlibc: '2.36',
  }),
  'linux:arm64': Object.freeze({
    name: 'pastafarian-calendar-seer-linux-arm64',
    suffix: '',
    minimumGlibc: '2.36',
  }),
  'win32:x64': Object.freeze({
    name: 'pastafarian-calendar-seer-win32-x64',
    suffix: '.exe',
  }),
});

export function prebuiltRuntimeDescriptor(platform = process.platform, arch = process.arch) {
  return PREBUILT_RUNTIME_PACKAGES[`${platform}:${arch}`] ?? null;
}

export function runtimeGlibcVersion() {
  try {
    const version = process.report?.getReport?.().header?.glibcVersionRuntime;
    return typeof version === 'string' && version ? version : null;
  } catch {
    return null;
  }
}

function compareDottedVersions(left, right) {
  const a = String(left).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const b = String(right).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const width = Math.max(a.length, b.length);
  for (let i = 0; i < width; i += 1) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0);
    if (delta !== 0) return delta < 0 ? -1 : 1;
  }
  return 0;
}

function runtimeCompatibility(descriptor, platform, glibcVersion) {
  if (!descriptor?.minimumGlibc) return { ok: true };
  const detected = glibcVersion ?? (platform === process.platform ? runtimeGlibcVersion() : null);
  if (!detected) {
    return {
      ok: false,
      reason: 'glibc-unavailable',
      message: `Prebuilt exact Seer runtime for ${platform} requires glibc >= ${descriptor.minimumGlibc}; this runtime did not report glibc.`,
      details: { minimumGlibc: descriptor.minimumGlibc, runtimeGlibc: null },
    };
  }
  if (compareDottedVersions(detected, descriptor.minimumGlibc) < 0) {
    return {
      ok: false,
      reason: 'glibc-too-old',
      message: `Prebuilt exact Seer runtime requires glibc >= ${descriptor.minimumGlibc}; detected ${detected}.`,
      details: { minimumGlibc: descriptor.minimumGlibc, runtimeGlibc: detected },
    };
  }
  return { ok: true, details: { minimumGlibc: descriptor.minimumGlibc, runtimeGlibc: detected } };
}

async function readable(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
async function rootVersion(rootDir) {
  const pkg = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
  if (typeof pkg.version !== 'string' || !pkg.version) throw new Error('root package version is invalid');
  return pkg.version;
}

export async function resolvePrebuiltBinary({
  rootDir,
  basename,
  platform = process.platform,
  arch = process.arch,
  glibcVersion,
} = {}) {
  const descriptor = prebuiltRuntimeDescriptor(platform, arch);
  if (!descriptor) return null;
  const compatibility = runtimeCompatibility(descriptor, platform, glibcVersion);
  if (!compatibility.ok) {
    const error = new Error(compatibility.message);
    error.code = 'SEER_PREBUILT_LIBC_UNSUPPORTED';
    error.details = { platform, arch, package: descriptor.name, ...compatibility.details };
    throw error;
  }

  let packageJsonPath;
  try {
    packageJsonPath = require.resolve(`${descriptor.name}/package.json`, { paths: [rootDir] });
  } catch {
    return null;
  }

  const [rootPackageVersion, nativePackage] = await Promise.all([
    rootVersion(rootDir),
    readFile(packageJsonPath, 'utf8').then(JSON.parse),
  ]);
  if (nativePackage.version !== rootPackageVersion) {
    const error = new Error(
      `Prebuilt Seer runtime version mismatch: ${descriptor.name}@${nativePackage.version ?? '<missing>'} ` +
      `cannot serve pastafarian-calendar-seer@${rootPackageVersion}.`,
    );
    error.code = 'SEER_PREBUILT_VERSION_MISMATCH';
    error.details = {
      package: descriptor.name,
      installedVersion: nativePackage.version ?? null,
      expectedVersion: rootPackageVersion,
    };
    throw error;
  }
  const binary = path.join(path.dirname(packageJsonPath), 'bin', `${basename}${descriptor.suffix}`);
  if (!(await readable(binary))) {
    const error = new Error(`Prebuilt Seer runtime package is incomplete: missing ${path.basename(binary)}.`);
    error.code = 'SEER_PREBUILT_INCOMPLETE';
    error.details = { package: descriptor.name, binary: path.basename(binary) };
    throw error;
  }
  return binary;
}

export async function prebuiltRuntimeHint({
  rootDir,
  platform = process.platform,
  arch = process.arch,
  glibcVersion,
} = {}) {
  const descriptor = prebuiltRuntimeDescriptor(platform, arch);
  if (!descriptor) {
    return {
      supported: false,
      message: `No prebuilt exact Seer runtime is published for ${platform}/${arch}.`,
      details: { platform, arch },
    };
  }
  const compatibility = runtimeCompatibility(descriptor, platform, glibcVersion);
  if (!compatibility.ok) {
    return {
      supported: false,
      message: compatibility.message,
      details: { platform, arch, package: descriptor.name, ...compatibility.details },
    };
  }
  const version = await rootVersion(rootDir);
  return {
    supported: true,
    message:
      `Expected optional package ${descriptor.name}@${version}. ` +
      'Install normally without --omit=optional, or run npm run build:native for a source-build fallback.',
    details: { platform, arch, package: descriptor.name, version },
  };
}
