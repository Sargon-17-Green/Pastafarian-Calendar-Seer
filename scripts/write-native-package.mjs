#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TARGETS = Object.freeze({
  'linux-x64': {
    name: 'pastafarian-calendar-seer-linux-x64',
    os: ['linux'],
    cpu: ['x64'],
    libc: ['glibc'],
    minimumGlibc: '2.36',
    suffix: '',
  },
  'linux-arm64': {
    name: 'pastafarian-calendar-seer-linux-arm64',
    os: ['linux'],
    cpu: ['arm64'],
    libc: ['glibc'],
    minimumGlibc: '2.36',
    suffix: '',
  },
  'win32-x64': {
    name: 'pastafarian-calendar-seer-win32-x64',
    os: ['win32'],
    cpu: ['x64'],
    suffix: '.exe',
  },
});

const [target, outputArg] = process.argv.slice(2);
const meta = TARGETS[target];
if (!meta || !outputArg) {
  console.error('Usage: node scripts/write-native-package.mjs <linux-x64|linux-arm64|win32-x64> <stage-dir>');
  process.exit(2);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(outputArg);
const rootPackage = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const binDir = path.join(output, 'bin');
const files = (await readdir(binDir, { withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .sort();
const required = ['seer_year_batch', 'seer_year_locator', 'seer_year_structure', 'seer_engine_service']
  .map((name) => `${name}${meta.suffix}`);
for (const name of required) {
  if (!files.includes(name)) throw new Error(`native stage is missing required binary: ${name}`);
}

const sha256 = {};
for (const name of files) {
  const bytes = await readFile(path.join(binDir, name));
  sha256[name] = createHash('sha256').update(bytes).digest('hex');
}
let sourceCommit = process.env.GITHUB_SHA || '';
if (!sourceCommit) {
  try {
    sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    sourceCommit = 'unknown';
  }
}
const manifest = {
  schema: 1,
  package: meta.name,
  version: rootPackage.version,
  target,
  backend: 'portable',
  sourceCommit,
  build: {
    toolchain: process.env.SEER_NATIVE_TOOLCHAIN || null,
    runtimePackages: process.env.SEER_NATIVE_RUNTIME_PACKAGES || null,
    glibc: process.env.SEER_NATIVE_GLIBC || null,
    minimumGlibc: meta.minimumGlibc ?? null,
    gnuRuntimeLinkage: 'static',
    gmpLinkage: 'dynamic',
  },
  binaries: required,
  files: sha256,
  gmp: {
    version: '6.3.0',
    linkage: 'dynamic',
    builtFromBundledSource: true,
    cpuBaseline: process.env.SEER_GMP_CPU_BASELINE || null,
    verification: 'make check',
    sourceArchive: 'third_party/source/gmp-6.3.0.tar.xz',
    sourceSha256: 'a3c2b80201b89e68616f4ad30bc66aee4927c3ce50e33929ca819d5c43538898',
  },
};
await writeFile(path.join(output, 'runtime-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const nativePackage = {
  name: meta.name,
  version: rootPackage.version,
  description: `Prebuilt exact native runtime for pastafarian-calendar-seer (${target})`,
  license: 'MIT',
  type: 'module',
  os: meta.os,
  cpu: meta.cpu,
  ...(meta.libc ? { libc: meta.libc } : {}),
  engines: { node: '>=20' },
  files: ['bin', 'licenses', 'third_party/source', 'runtime-manifest.json', 'THIRD_PARTY_NOTICES.md', 'LICENSE'],
  exports: {
    './package.json': './package.json',
    './runtime-manifest.json': './runtime-manifest.json',
  },
  repository: rootPackage.repository,
  homepage: rootPackage.homepage,
};
await writeFile(path.join(output, 'package.json'), JSON.stringify(nativePackage, null, 2) + '\n');
await writeFile(path.join(output, 'LICENSE'), await readFile(path.join(root, 'LICENSE'), 'utf8'));
const notices = `# Third-party runtime notices

This platform package contains executable artifacts built from the MIT-licensed
Pastafarian Calendar Seer sources plus third-party runtime libraries.

## GNU MP (GMP) 6.3.0

The packaged exact engine uses GNU MP. The GMP shared library shipped in this
package is built during the same release job directly from the pinned upstream
GMP 6.3.0 source archive; distro/MSYS2 GMP binaries are not redistributed.
GMP 6.3.0 is dual-licensed under LGPLv3 or GPLv2, at the recipient's choice.
This distribution uses the LGPLv3 option. The exact source archive used for the
build is included at \`third_party/source/gmp-6.3.0.tar.xz\`; its SHA-256 is
recorded in \`runtime-manifest.json\`. The LGPLv3 text is included under
\`licenses/\`.

## GCC runtime libraries

The exact runtime is built by an eligible GCC compilation process with
libstdc++, libgcc and libgomp linked statically into the executable artifacts.
The applicable upstream GPLv3 and GCC Runtime Library Exception 3.1 texts are
included under \`licenses/\`. No separate GCC/OpenMP shared library is shipped
in the platform package.

## MinGW-w64 winpthreads

The Windows build links MinGW-w64 winpthreads statically. Its upstream license
text is included under \`licenses/\`; no libwinpthread DLL is shipped.

The presence of a third-party license does not change the MIT license of the
Pastafarian Calendar Seer source code. See each bundled license for the terms
that apply to that component.
`;
await writeFile(path.join(output, 'THIRD_PARTY_NOTICES.md'), notices);
console.log(JSON.stringify({ ok: true, target, package: meta.name, version: rootPackage.version, files: sha256 }, null, 2));
