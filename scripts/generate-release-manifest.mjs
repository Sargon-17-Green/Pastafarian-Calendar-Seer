import { readFile, writeFile } from 'node:fs/promises';

const required = [
  'RELEASE_VERSION',
  'RELEASE_COMMIT',
  'GITHUB_TARBALL_SHA256',
  'NPM_INTEGRITY',
  'NPM_TARBALL_URL',
  'CONTAINER_IMAGE',
  'CONTAINER_DIGEST',
  'CONTAINER_AMD64_DIGEST',
  'CONTAINER_ARM64_DIGEST',
];

for (const key of required) {
  if (!process.env[key]) throw new Error(`missing ${key}`);
}

const version = process.env.RELEASE_VERSION;
const packageManifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
if (packageManifest.name !== 'pastafarian-calendar-seer' || packageManifest.version !== version) {
  throw new Error(`release/package identity mismatch: ${packageManifest.name}@${packageManifest.version} != pastafarian-calendar-seer@${version}`);
}
if (!/^[0-9a-f]{40}$/.test(process.env.RELEASE_COMMIT)) throw new Error('RELEASE_COMMIT must be a full lowercase Git SHA');
const tag = `v${version}`;
const npmSbom = `pastafarian-calendar-seer-${version}.cdx.json`;
const amd64Sbom = `pastafarian-calendar-seer-${version}-container-amd64.spdx.json`;
const arm64Sbom = `pastafarian-calendar-seer-${version}-container-arm64.spdx.json`;

const manifest = {
  schemaVersion: 1,
  version,
  commit: process.env.RELEASE_COMMIT,
  tag,
  runtimeIdentity: {
    packageVersion: version,
    releaseTag: tag,
    commit: process.env.RELEASE_COMMIT.toLowerCase(),
  },
  githubRelease: {
    url: `https://github.com/Sargon-17-Green/Pastafarian-Calendar-Seer/releases/tag/${tag}`,
    tarball: `pastafarian-calendar-seer-${version}.tgz`,
    tarballSha256: process.env.GITHUB_TARBALL_SHA256,
  },
  npm: {
    package: 'pastafarian-calendar-seer',
    version,
    integrity: process.env.NPM_INTEGRITY,
    tarball: process.env.NPM_TARBALL_URL,
    sbom: npmSbom,
  },
  container: {
    image: process.env.CONTAINER_IMAGE,
    digest: process.env.CONTAINER_DIGEST,
    platforms: {
      'linux/amd64': process.env.CONTAINER_AMD64_DIGEST,
      'linux/arm64': process.env.CONTAINER_ARM64_DIGEST,
    },
    sboms: {
      'linux/amd64': amd64Sbom,
      'linux/arm64': arm64Sbom,
    },
  },
};

const out = process.env.OUTPUT || 'release-manifest.json';
await writeFile(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(out);
