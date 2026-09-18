import { writeFile } from 'node:fs/promises';

const required = [
  'RELEASE_VERSION', 'RELEASE_COMMIT', 'GITHUB_TARBALL_SHA256',
  'NPM_INTEGRITY', 'NPM_TARBALL_URL', 'CONTAINER_IMAGE', 'CONTAINER_DIGEST',
];
for (const key of required) if (!process.env[key]) throw new Error(`missing ${key}`);
const version = process.env.RELEASE_VERSION;
const tag = `v${version}`;
const manifest = {
  schemaVersion: 1,
  version,
  commit: process.env.RELEASE_COMMIT,
  tag,
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
  },
  container: {
    image: process.env.CONTAINER_IMAGE,
    digest: process.env.CONTAINER_DIGEST,
    platforms: process.env.CONTAINER_PLATFORM_DIGEST ? { 'linux/amd64': process.env.CONTAINER_PLATFORM_DIGEST } : {},
  },
};
const out = process.env.OUTPUT || 'release-manifest.json';
await writeFile(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(out);