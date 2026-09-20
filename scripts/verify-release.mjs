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
function digest(algorithm, data, encoding = 'hex') {
  return createHash(algorithm).update(data).digest(encoding);
}

let commit = null;
let tagPresent = true;
try {
  const ref = await json(`https://api.github.com/repos/${owner}/${repo}/git/ref/tags/${encodeURIComponent(tag)}`);
  commit = ref.object.sha;
  if (ref.object.type === 'tag') {
    commit = (await json(`https://api.github.com/repos/${owner}/${repo}/git/tags/${commit}`)).object.sha;
  }
} catch (error) {
  if (!allowIncomplete || ![404, 422].includes(error.status)) throw error;
  tagPresent = false;
}

let release = null;
try {
  release = await json(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`);
} catch (error) {
  if (!allowIncomplete || error.status !== 404) throw error;
}

const tgzName = `pastafarian-calendar-seer-${version}.tgz`;
const shaName = `${tgzName}.sha256`;
const npmSbomName = `pastafarian-calendar-seer-${version}.cdx.json`;
const amd64SbomName = `pastafarian-calendar-seer-${version}-container-amd64.spdx.json`;
const arm64SbomName = `pastafarian-calendar-seer-${version}-container-arm64.spdx.json`;

const status = {
  version,
  tag,
  tagPresent,
  commit,
  github: release ? { immutable: release.immutable === true } : { missing: true },
  npm: null,
  container: null,
  manifest: null,
};

let githubSha256 = null;
if (release) {
  if (release.tag_name !== tag) throw new Error(`GitHub release tag mismatch: ${release.tag_name} != ${tag}`);
  if (!allowIncomplete && release.immutable !== true) throw new Error('GitHub release is not immutable');

  const tgzAsset = release.assets.find((asset) => asset.name === tgzName);
  const shaAsset = release.assets.find((asset) => asset.name === shaName);
  if (!tgzAsset || !shaAsset) {
    if (!allowIncomplete) throw new Error('GitHub release tarball/checksum assets missing');
    status.github.assetsIncomplete = true;
  } else {
    const tgz = await bytes(tgzAsset.browser_download_url);
    const shaText = new TextDecoder().decode(await bytes(shaAsset.browser_download_url)).trim();
    githubSha256 = digest('sha256', tgz);
    const shaMatch = shaText.match(/^([0-9a-f]{64})\s+(.+)$/i);
    if (!shaMatch || shaMatch[1].toLowerCase() !== githubSha256 || shaMatch[2] !== tgzName) {
      throw new Error('GitHub release SHA-256 file does not exactly match the tarball');
    }
    status.github.sha256 = githubSha256;
  }
} else if (!allowIncomplete) {
  throw new Error('GitHub release missing');
}

try {
  const npmMeta = await json(`https://registry.npmjs.org/${source.name}/${version}`);
  const npmTgz = await bytes(npmMeta.dist.tarball);
  const npmSha256 = digest('sha256', npmTgz);
  const actualSri = `sha512-${digest('sha512', npmTgz, 'base64')}`;
  if (actualSri !== npmMeta.dist.integrity) {
    throw new Error(`npm SRI mismatch: ${actualSri} != ${npmMeta.dist.integrity}`);
  }
  if (githubSha256 && npmSha256 !== githubSha256) {
    throw new Error(`npm/GitHub tarball byte mismatch: ${npmSha256} != ${githubSha256}`);
  }
  const provenance = npmMeta.dist.attestations?.provenance?.predicateType ?? null;
  if (!allowIncomplete && provenance !== slsaV1) {
    throw new Error(`npm SLSA provenance missing or unexpected: ${provenance}`);
  }

  let provenanceCommit = null;
  let provenanceRef = null;
  const attestationUrl = npmMeta.dist.attestations?.url ?? null;
  if (attestationUrl && provenance === slsaV1) {
    const attestationDoc = await json(attestationUrl);
    const slsaAttestation = attestationDoc.attestations?.find((item) => item.predicateType === slsaV1);
    if (!slsaAttestation?.bundle?.dsseEnvelope?.payload) {
      throw new Error('npm SLSA attestation payload missing');
    }
    const statement = JSON.parse(Buffer.from(slsaAttestation.bundle.dsseEnvelope.payload, 'base64').toString('utf8'));
    const workflow = statement.predicate?.buildDefinition?.externalParameters?.workflow;
    const dependency = statement.predicate?.buildDefinition?.resolvedDependencies?.find((item) => item.digest?.gitCommit);
    provenanceCommit = dependency?.digest?.gitCommit ?? null;
    provenanceRef = workflow?.ref ?? null;

    const expectedRepository = `https://github.com/${owner}/${repo}`;
    const expectedRef = `refs/tags/${tag}`;
    if (workflow?.repository !== expectedRepository) {
      throw new Error(`npm provenance repository mismatch: ${workflow?.repository ?? '<missing>'}`);
    }
    if (workflow?.path !== '.github/workflows/release-npm.yml') {
      throw new Error(`npm provenance workflow mismatch: ${workflow?.path ?? '<missing>'}`);
    }
    if (provenanceRef !== expectedRef) {
      throw new Error(`npm provenance ref mismatch: ${provenanceRef ?? '<missing>'} != ${expectedRef}`);
    }
    if (!provenanceCommit) throw new Error('npm provenance git commit missing');
    if (commit && provenanceCommit !== commit) {
      throw new Error(`npm provenance commit mismatch: ${provenanceCommit} != ${commit}`);
    }
    if (!commit) commit = provenanceCommit;
  }

  status.commit = commit;
  status.npm = {
    integrity: npmMeta.dist.integrity,
    tarball: npmMeta.dist.tarball,
    sha256: npmSha256,
    provenance,
    provenanceRef,
    provenanceCommit,
  };
} catch (error) {
  if (!allowIncomplete || error.status !== 404) throw error;
  status.npm = { missing: true };
}

try {
  const token = await json('https://ghcr.io/token?scope=repository:sargon-17-green/pastafarian-calendar-seer:pull');
  const headers = {
    Authorization: `Bearer ${token.token}`,
    Accept: [
      'application/vnd.oci.image.index.v1+json',
      'application/vnd.docker.distribution.manifest.list.v2+json',
      'application/vnd.oci.image.manifest.v1+json',
    ].join(', '),
  };
  const byVersion = await get(
    `https://ghcr.io/v2/sargon-17-green/pastafarian-calendar-seer/manifests/${version}`,
    { headers },
  );
  const versionDigest = byVersion.headers.get('docker-content-digest');
  const raw = await byVersion.json();
  const byVTag = await get(
    `https://ghcr.io/v2/sargon-17-green/pastafarian-calendar-seer/manifests/v${version}`,
    { headers },
  );
  const vTagDigest = byVTag.headers.get('docker-content-digest');
  if (!versionDigest || versionDigest !== vTagDigest) {
    throw new Error('GHCR version tags do not resolve to one immutable digest');
  }

  const platforms = {};
  for (const arch of ['amd64', 'arm64']) {
    const child = raw.manifests?.find(
      (item) => item.platform?.os === 'linux' && item.platform?.architecture === arch,
    );
    if (child?.digest) platforms[`linux/${arch}`] = child.digest;
  }
  if (!allowIncomplete && (!platforms['linux/amd64'] || !platforms['linux/arm64'])) {
    throw new Error('GHCR multi-architecture manifest is missing linux/amd64 or linux/arm64');
  }
  status.container = { image, digest: versionDigest, platforms };
} catch (error) {
  if (!allowIncomplete || ![401, 403, 404].includes(error.status)) throw error;
  status.container = { missing: true };
}

const assets = release?.assets ?? [];
const manifestAsset = assets.find((asset) => asset.name === 'release-manifest.json');
const sumsAsset = assets.find((asset) => asset.name === 'SHA256SUMS');

if (!allowIncomplete) {
  const requiredAssets = [
    manifestAsset,
    sumsAsset,
    assets.find((asset) => asset.name === npmSbomName),
    assets.find((asset) => asset.name === amd64SbomName),
    assets.find((asset) => asset.name === arm64SbomName),
  ];
  if (requiredAssets.some((asset) => !asset)) throw new Error('hardened release asset set is incomplete');
}

if (sumsAsset) {
  const sumsText = new TextDecoder().decode(await bytes(sumsAsset.browser_download_url));
  const sums = new Map();
  for (const line of sumsText.trim().split(/\r?\n/)) {
    const match = line.match(/^([0-9a-f]{64})\s+(.+)$/i);
    if (!match) throw new Error(`invalid SHA256SUMS line: ${line}`);
    sums.set(match[2], match[1].toLowerCase());
  }
  for (const name of [tgzName, shaName, npmSbomName, amd64SbomName, arm64SbomName, 'release-manifest.json']) {
    const expected = sums.get(name);
    const asset = assets.find((item) => item.name === name);
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
  if (manifest.version !== version || manifest.tag !== tag || manifest.commit !== commit) {
    throw new Error('release manifest identity mismatch');
  }
  if (manifest.runtimeIdentity?.packageVersion !== version ||
      manifest.runtimeIdentity?.releaseTag !== tag ||
      manifest.runtimeIdentity?.commit !== commit) {
    throw new Error('release manifest runtime identity mismatch');
  }
  if (githubSha256 && manifest.githubRelease?.tarballSha256 !== githubSha256) {
    throw new Error('release manifest GitHub checksum mismatch');
  }
  if (status.npm?.integrity && manifest.npm?.integrity !== status.npm.integrity) {
    throw new Error('release manifest npm integrity mismatch');
  }
  if (status.container?.digest && manifest.container?.digest !== status.container.digest) {
    throw new Error('release manifest container digest mismatch');
  }
  for (const platform of ['linux/amd64', 'linux/arm64']) {
    const recorded = manifest.container?.platforms?.[platform];
    const actual = status.container?.platforms?.[platform];
    if (!allowIncomplete && (!recorded || !actual)) throw new Error(`release manifest platform missing: ${platform}`);
    if (recorded && actual && recorded !== actual) throw new Error(`release manifest ${platform} digest mismatch`);
  }
  if (!allowIncomplete) {
    if (manifest.npm?.sbom !== npmSbomName) throw new Error('release manifest npm SBOM name mismatch');
    if (manifest.container?.sboms?.['linux/amd64'] !== amd64SbomName) throw new Error('release manifest amd64 SBOM name mismatch');
    if (manifest.container?.sboms?.['linux/arm64'] !== arm64SbomName) throw new Error('release manifest arm64 SBOM name mismatch');
  }
  status.manifest = { present: true };
} else {
  status.manifest = { missing: true };
  if (!allowIncomplete) throw new Error('release-manifest.json missing');
}

console.log(JSON.stringify(status, null, 2));
if (!allowIncomplete && (status.github?.missing || status.npm?.missing || status.container?.missing || status.manifest?.missing)) {
  process.exit(1);
}
console.log(allowIncomplete ? 'partial release verification PASS' : 'release verification PASS');
