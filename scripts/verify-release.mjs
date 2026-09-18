import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const source = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const allowIncomplete = process.argv.includes('--allow-incomplete');
const requested = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const version = requested || source.version;
const tag = `v${version}`;
const owner = 'Sargon-17-Green';
const repo = 'Pastafarian-Calendar-Seer';
const image = 'ghcr.io/sargon-17-green/pastafarian-calendar-seer';
const slsaV1 = 'https://slsa.dev/provenance/v1';

async function get(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = new Error(`${response.status} ${response.statusText}: ${url}`);
    error.status = response.status;
    throw error;
  }
  return response;
}
async function json(url, options) { return (await get(url, options)).json(); }
async function bytes(url, options) { return new Uint8Array(await (await get(url, options)).arrayBuffer()); }
function digest(algorithm, data, encoding = 'hex') { return createHash(algorithm).update(data).digest(encoding); }

let ref = await json(`https://api.github.com/repos/${owner}/${repo}/git/ref/tags/${encodeURIComponent(tag)}`);
let commit = ref.object.sha;
if (ref.object.type === 'tag') commit = (await json(`https://api.github.com/repos/${owner}/${repo}/git/tags/${commit}`)).object.sha;
const release = await json(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`);
if (release.tag_name !== tag) throw new Error(`GitHub release tag mismatch: ${release.tag_name} != ${tag}`);
if (!allowIncomplete && release.immutable !== true) throw new Error('GitHub release is not immutable');const tgzName = `pastafarian-calendar-seer-${version}.tgz`;
const shaName = `${tgzName}.sha256`;
const tgzAsset = release.assets.find((a) => a.name === tgzName);
const shaAsset = release.assets.find((a) => a.name === shaName);
if (!tgzAsset || !shaAsset) throw new Error('GitHub release tarball/checksum assets missing');
const tgz = await bytes(tgzAsset.browser_download_url);
const shaText = new TextDecoder().decode(await bytes(shaAsset.browser_download_url)).trim();
const githubSha256 = digest('sha256', tgz);
const shaMatch = shaText.match(/^([0-9a-f]{64})\s+(.+)$/i);
if (!shaMatch || shaMatch[1].toLowerCase() !== githubSha256 || shaMatch[2] !== tgzName) {
  throw new Error('GitHub release SHA-256 file does not exactly match the tarball');
}

const status = {
  version, tag, commit,
  github: { immutable: release.immutable === true, sha256: githubSha256 },
  npm: null, container: null, manifest: null,
};

try {
  const npmMeta = await json(`https://registry.npmjs.org/${source.name}/${version}`);
  const npmTgz = await bytes(npmMeta.dist.tarball);
  const npmSha256 = digest('sha256', npmTgz);
  const actualSri = `sha512-${digest('sha512', npmTgz, 'base64')}`;
  if (actualSri !== npmMeta.dist.integrity) throw new Error(`npm SRI mismatch: ${actualSri} != ${npmMeta.dist.integrity}`);
  if (npmSha256 !== githubSha256) throw new Error(`npm/GitHub tarball byte mismatch: ${npmSha256} != ${githubSha256}`);
  const provenance = npmMeta.dist.attestations?.provenance?.predicateType ?? null;
  if (!allowIncomplete && provenance !== slsaV1) throw new Error(`npm SLSA provenance missing or unexpected: ${provenance}`);
  status.npm = { integrity: npmMeta.dist.integrity, tarball: npmMeta.dist.tarball, sha256: npmSha256, provenance };
} catch (error) {
  if (!allowIncomplete || error.status !== 404) throw error;
  status.npm = { missing: true };
}try {
  const token = await json('https://ghcr.io/token?scope=repository:sargon-17-green/pastafarian-calendar-seer:pull');
  const headers = {
    Authorization: `Bearer ${token.token}`,
    Accept: 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json',
  };
  const byVersion = await get(`https://ghcr.io/v2/sargon-17-green/pastafarian-calendar-seer/manifests/${version}`, { headers });
  const versionDigest = byVersion.headers.get('docker-content-digest');
  const raw = await byVersion.json();
  const byVTag = await get(`https://ghcr.io/v2/sargon-17-green/pastafarian-calendar-seer/manifests/v${version}`, { headers });
  const vTagDigest = byVTag.headers.get('docker-content-digest');
  if (!versionDigest || versionDigest !== vTagDigest) throw new Error('GHCR version tags do not resolve to one immutable digest');
  const amd64 = raw.manifests?.find((x) => x.platform?.os === 'linux' && x.platform?.architecture === 'amd64')?.digest ?? null;
  status.container = { image, digest: versionDigest, platforms: amd64 ? { 'linux/amd64': amd64 } : {} };
} catch (error) {
  if (!allowIncomplete || ![401, 403, 404].includes(error.status)) throw error;
  status.container = { missing: true };
}

const manifestAsset = release.assets.find((a) => a.name === 'release-manifest.json');
const sumsAsset = release.assets.find((a) => a.name === 'SHA256SUMS');
const npmSbomName = `pastafarian-calendar-seer-${version}.cdx.json`;
const containerSbomName = `pastafarian-calendar-seer-${version}-container.spdx.json`;
if (!allowIncomplete) {
  for (const expected of [manifestAsset, sumsAsset, release.assets.find((a) => a.name === npmSbomName), release.assets.find((a) => a.name === containerSbomName)]) {
    if (!expected) throw new Error('hardened release asset set is incomplete');
  }
}

if (sumsAsset) {
  const sumsText = new TextDecoder().decode(await bytes(sumsAsset.browser_download_url));
  const sums = new Map();
  for (const line of sumsText.trim().split(/\r?\n/)) {
    const match = line.match(/^([0-9a-f]{64})\s+(.+)$/i);
    if (!match) throw new Error(`invalid SHA256SUMS line: ${line}`);
    sums.set(match[2], match[1].toLowerCase());
  }  const requiredNames = [tgzName, shaName, npmSbomName, containerSbomName, 'release-manifest.json'];
  for (const name of requiredNames) {
    const expected = sums.get(name);
    const asset = release.assets.find((a) => a.name === name);
    if (!expected || !asset) {
      if (allowIncomplete) continue;
      throw new Error(`SHA256SUMS or release asset missing: ${name}`);
    }
    const actual = digest('sha256', await bytes(asset.browser_download_url));
    if (actual !== expected) throw new Error(`release asset SHA-256 mismatch for ${name}: ${actual} != ${expected}`);
  }
  status.github.sha256Manifest = true;
} else if (!allowIncomplete) {
  throw new Error('SHA256SUMS missing');
}

if (manifestAsset) {
  const manifest = JSON.parse(new TextDecoder().decode(await bytes(manifestAsset.browser_download_url)));
  if (manifest.version !== version || manifest.tag !== tag || manifest.commit !== commit) throw new Error('release manifest identity mismatch');
  if (manifest.githubRelease?.tarballSha256 !== githubSha256) throw new Error('release manifest GitHub checksum mismatch');
  if (status.npm?.integrity && manifest.npm?.integrity !== status.npm.integrity) throw new Error('release manifest npm integrity mismatch');
  if (status.container?.digest && manifest.container?.digest !== status.container.digest) throw new Error('release manifest container digest mismatch');
  const recordedAmd64 = manifest.container?.platforms?.['linux/amd64'];
  const actualAmd64 = status.container?.platforms?.['linux/amd64'];
  if (recordedAmd64 && actualAmd64 && recordedAmd64 !== actualAmd64) throw new Error('release manifest linux/amd64 digest mismatch');
  status.manifest = { present: true };
} else if (allowIncomplete) {
  status.manifest = { missing: true };
} else {
  throw new Error('release-manifest.json missing');
}

console.log(JSON.stringify(status, null, 2));
if (!allowIncomplete && (status.npm?.missing || status.container?.missing || status.manifest?.missing)) process.exit(1);
console.log('release verification PASS');
