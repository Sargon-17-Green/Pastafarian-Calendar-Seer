#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { appendFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_BASE_DELAY_MS = 2_000;
const DEFAULT_MAX_DELAY_MS = 20_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS_CAP = 20;

export class RegistryTransientError extends Error {
  constructor(message, { status = null, retryAfterMs = null, cause = undefined } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'RegistryTransientError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export class RegistryIntegrityError extends Error {
  constructor(message, options = undefined) {
    super(message, options);
    this.name = 'RegistryIntegrityError';
  }
}

export function isTransientStatus(status) {
  return status === 404
    || status === 408
    || status === 425
    || status === 429
    || (status >= 500 && status <= 599);
}

const RETRYABLE_NETWORK_CODES = new Set([
  'EAI_AGAIN',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETDOWN',
  'ENETRESET',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

export function isRetryableNetworkError(error) {
  for (let current = error; current; current = current.cause) {
    if (RETRYABLE_NETWORK_CODES.has(String(current.code ?? '').toUpperCase())) return true;
    if (current.name === 'AbortError' || current.name === 'TimeoutError') return true;
  }
  return error instanceof TypeError && /fetch failed/i.test(error.message);
}

function parseRetryAfter(value) {
  if (!value) return null;
  if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1_000;
  const when = Date.parse(value);
  if (!Number.isFinite(when)) return null;
  return Math.max(0, when - Date.now());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryRegistryOperation(operation, {
  label = 'registry operation',
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
  maxDelayMs = DEFAULT_MAX_DELAY_MS,
  sleepFn = sleep,
  onRetry = ({ attempt, maxAttempts: total, delayMs, error }) => {
    console.error(`${label}: transient failure on attempt ${attempt}/${total}: ${error.message}`);
    console.error(`${label}: retrying after ${delayMs}ms`);
  },
} = {}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_ATTEMPTS_CAP) {
    throw new Error(`maxAttempts must be an integer in [1, ${MAX_ATTEMPTS_CAP}]`);
  }
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) throw new Error('baseDelayMs must be non-negative');
  if (!Number.isFinite(maxDelayMs) || maxDelayMs < baseDelayMs) {
    throw new Error('maxDelayMs must be >= baseDelayMs');
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (!(error instanceof RegistryTransientError) || attempt === maxAttempts) throw error;
      const exponential = Math.min(maxDelayMs, baseDelayMs * (2 ** (attempt - 1)));
      const delayMs = Math.min(maxDelayMs, Math.max(exponential, error.retryAfterMs ?? 0));
      onRetry({ attempt, maxAttempts, delayMs, error });
      await sleepFn(delayMs);
    }
  }
  throw new Error(`${label}: unreachable retry state`);
}

async function requestBytes(url, {
  headers = {},
  label,
  fetchImpl = fetch,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
} = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch (error) {
    if (isRetryableNetworkError(error)) {
      throw new RegistryTransientError(`${label}: network failure`, { cause: error });
    }
    throw error;
  }

  if (!response.ok) {
    let detail = '';
    try {
      detail = (await response.text()).slice(0, 512).replace(/\s+/g, ' ').trim();
    } catch {
      // The status code is enough to classify the failure.
    }
    const message = `${label}: HTTP ${response.status}${detail ? `: ${detail}` : ''}`;
    if (isTransientStatus(response.status)) {
      throw new RegistryTransientError(message, {
        status: response.status,
        retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
      });
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  try {
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      headers: response.headers,
      status: response.status,
    };
  } catch (error) {
    if (isRetryableNetworkError(error)) {
      throw new RegistryTransientError(`${label}: response body network failure`, { cause: error });
    }
    throw error;
  }
}

function decodeJson(bytes, label) {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new RegistryIntegrityError(`${label}: successful response was not valid JSON`, { cause: error });
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha512Integrity(bytes) {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new RegistryIntegrityError(`${label} is missing`);
  }
  return value;
}

function assertSha256Digest(value, label) {
  if (!/^sha256:[0-9a-f]{64}$/.test(value ?? '')) {
    throw new RegistryIntegrityError(`${label} is not a canonical sha256 digest: ${value ?? '<missing>'}`);
  }
  return value;
}

export function assertSameDigest(left, right, label = 'registry tags') {
  assertSha256Digest(left, `${label} left digest`);
  assertSha256Digest(right, `${label} right digest`);
  if (left !== right) {
    throw new RegistryIntegrityError(`${label} resolve to different digests: ${left} != ${right}`);
  }
  return left;
}

export function extractRequiredPlatformDigests(index) {
  if (!Array.isArray(index?.manifests)) {
    throw new RegistryIntegrityError('GHCR version manifest is not a multi-platform index');
  }
  const result = {};
  for (const arch of ['amd64', 'arm64']) {
    const matches = index.manifests.filter(
      (item) => item?.platform?.os === 'linux' && item?.platform?.architecture === arch,
    );
    if (matches.length !== 1) {
      throw new RegistryIntegrityError(
        `GHCR index must contain exactly one linux/${arch} child; found ${matches.length}`,
      );
    }
    result[arch] = assertSha256Digest(matches[0].digest, `linux/${arch} child digest`);
  }
  return result;
}

async function npmIdentityAttempt({
  name,
  version,
  expectedSha256,
  fetchImpl,
  requestTimeoutMs,
}) {
  const metadataUrl = `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
  const metadataResponse = await requestBytes(metadataUrl, {
    label: `npm metadata ${name}@${version}`,
    fetchImpl,
    requestTimeoutMs,
  });
  const metadata = decodeJson(metadataResponse.bytes, `npm metadata ${name}@${version}`);

  if (metadata.name !== name || metadata.version !== version) {
    throw new RegistryIntegrityError(
      `npm metadata identity mismatch: ${metadata.name ?? '<missing>'}@${metadata.version ?? '<missing>'}`,
    );
  }

  const tarball = requireNonEmptyString(metadata.dist?.tarball, 'npm dist.tarball');
  const integrity = requireNonEmptyString(metadata.dist?.integrity, 'npm dist.integrity');
  const tarballUrl = new URL(tarball);
  if (tarballUrl.protocol !== 'https:') {
    throw new RegistryIntegrityError(`npm tarball URL is not HTTPS: ${tarball}`);
  }

  const tarballResponse = await requestBytes(tarball, {
    label: `npm tarball ${name}@${version}`,
    fetchImpl,
    requestTimeoutMs,
  });
  const actualSha256 = sha256(tarballResponse.bytes);
  if (actualSha256 !== expectedSha256) {
    throw new RegistryIntegrityError(
      `npm tarball SHA-256 mismatch: ${actualSha256} != ${expectedSha256}`,
    );
  }

  const actualSri = sha512Integrity(tarballResponse.bytes);
  const advertisedIntegrities = integrity.trim().split(/\s+/);
  if (!advertisedIntegrities.includes(actualSri)) {
    throw new RegistryIntegrityError(`npm SRI mismatch: ${actualSri} not present in ${integrity}`);
  }

  return {
    integrity,
    tarball,
    sha256: actualSha256,
  };
}

export async function resolveNpmIdentity(options) {
  return retryRegistryOperation(
    () => npmIdentityAttempt(options),
    {
      label: `npm visibility ${options.name}@${options.version}`,
      ...options.retry,
    },
  );
}

function parseGhcrImage(image) {
  const prefix = 'ghcr.io/';
  if (!image.startsWith(prefix)) {
    throw new Error(`only ghcr.io images are supported: ${image}`);
  }
  const repository = image.slice(prefix.length);
  if (!repository || repository.includes('@') || repository.includes(':')) {
    throw new Error(`invalid GHCR repository identity: ${image}`);
  }
  return repository;
}

async function ghcrManifest({
  repository,
  reference,
  bearer,
  fetchImpl,
  requestTimeoutMs,
}) {
  const response = await requestBytes(
    `https://ghcr.io/v2/${repository}/manifests/${encodeURIComponent(reference)}`,
    {
      label: `GHCR manifest ${repository}:${reference}`,
      headers: {
        Authorization: `Bearer ${bearer}`,
        Accept: [
          'application/vnd.oci.image.index.v1+json',
          'application/vnd.docker.distribution.manifest.list.v2+json',
          'application/vnd.oci.image.manifest.v1+json',
          'application/vnd.docker.distribution.manifest.v2+json',
        ].join(', '),
      },
      fetchImpl,
      requestTimeoutMs,
    },
  );
  const digest = assertSha256Digest(
    response.headers.get('docker-content-digest'),
    `GHCR Docker-Content-Digest for ${reference}`,
  );
  return {
    digest,
    document: decodeJson(response.bytes, `GHCR manifest ${repository}:${reference}`),
  };
}

async function ghcrIdentityAttempt({
  image,
  version,
  username = process.env.GHCR_USERNAME ?? '',
  token = process.env.GHCR_TOKEN ?? '',
  fetchImpl,
  requestTimeoutMs,
}) {
  const repository = parseGhcrImage(image);
  const params = new URLSearchParams({
    service: 'ghcr.io',
    scope: `repository:${repository}:pull`,
  });
  const tokenHeaders = {};
  if (username && token) {
    tokenHeaders.Authorization = `Basic ${Buffer.from(`${username}:${token}`).toString('base64')}`;
  }

  const tokenResponse = await requestBytes(`https://ghcr.io/token?${params}`, {
    label: `GHCR pull token ${repository}`,
    headers: tokenHeaders,
    fetchImpl,
    requestTimeoutMs,
  });
  const tokenDocument = decodeJson(tokenResponse.bytes, `GHCR token ${repository}`);
  const bearer = requireNonEmptyString(
    tokenDocument.token ?? tokenDocument.access_token,
    'GHCR bearer token',
  );

  const versionManifest = await ghcrManifest({
    repository,
    reference: version,
    bearer,
    fetchImpl,
    requestTimeoutMs,
  });
  const vVersionManifest = await ghcrManifest({
    repository,
    reference: `v${version}`,
    bearer,
    fetchImpl,
    requestTimeoutMs,
  });

  const digest = assertSameDigest(
    versionManifest.digest,
    vVersionManifest.digest,
    `GHCR tags ${version} and v${version}`,
  );
  const platforms = extractRequiredPlatformDigests(versionManifest.document);

  for (const arch of ['amd64', 'arm64']) {
    const child = await ghcrManifest({
      repository,
      reference: platforms[arch],
      bearer,
      fetchImpl,
      requestTimeoutMs,
    });
    if (child.digest !== platforms[arch]) {
      throw new RegistryIntegrityError(
        `linux/${arch} child digest mismatch: ${child.digest} != ${platforms[arch]}`,
      );
    }
  }

  return {
    image,
    digest,
    amd64Digest: platforms.amd64,
    arm64Digest: platforms.arm64,
  };
}

export async function resolveGhcrIdentity(options) {
  return retryRegistryOperation(
    () => ghcrIdentityAttempt(options),
    {
      label: `GHCR visibility ${options.image}:${options.version}`,
      ...options.retry,
    },
  );
}

function parsePositiveInteger(value, label, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be an integer in [${min}, ${max}]`);
  }
  return parsed;
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for --${key}`);
    result[key] = value;
    i += 1;
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const name = requireNonEmptyString(args['npm-name'], '--npm-name');
  const version = requireNonEmptyString(args.version, '--version');
  const image = requireNonEmptyString(args.image, '--image');
  const expectedSha256 = requireNonEmptyString(
    args['expected-npm-sha256'],
    '--expected-npm-sha256',
  ).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expectedSha256)) {
    throw new Error('--expected-npm-sha256 must be 64 lowercase hex characters');
  }

  const maxAttempts = parsePositiveInteger(
    args['max-attempts'] ?? DEFAULT_MAX_ATTEMPTS,
    '--max-attempts',
    { max: MAX_ATTEMPTS_CAP },
  );
  const baseDelayMs = parsePositiveInteger(
    args['base-delay-ms'] ?? DEFAULT_BASE_DELAY_MS,
    '--base-delay-ms',
  );
  const maxDelayMs = parsePositiveInteger(
    args['max-delay-ms'] ?? DEFAULT_MAX_DELAY_MS,
    '--max-delay-ms',
  );
  const requestTimeoutMs = parsePositiveInteger(
    args['request-timeout-ms'] ?? DEFAULT_REQUEST_TIMEOUT_MS,
    '--request-timeout-ms',
  );
  const retry = { maxAttempts, baseDelayMs, maxDelayMs };

  const npm = await resolveNpmIdentity({
    name,
    version,
    expectedSha256,
    requestTimeoutMs,
    retry,
  });
  const container = await resolveGhcrIdentity({
    image,
    version,
    requestTimeoutMs,
    retry,
  });

  const identity = {
    npm,
    container: {
      image: container.image,
      digest: container.digest,
      platforms: {
        'linux/amd64': container.amd64Digest,
        'linux/arm64': container.arm64Digest,
      },
    },
  };

  if (args['output-json']) {
    await writeFile(args['output-json'], `${JSON.stringify(identity, null, 2)}\n`, 'utf8');
  }
  if (args['github-output']) {
    const outputs = {
      npm_integrity: npm.integrity,
      npm_tarball: npm.tarball,
      container_digest: container.digest,
      amd64_digest: container.amd64Digest,
      arm64_digest: container.arm64Digest,
    };
    for (const [key, value] of Object.entries(outputs)) {
      if (/[\r\n]/.test(value)) throw new Error(`unsafe newline in output ${key}`);
      await appendFile(args['github-output'], `${key}=${value}\n`, 'utf8');
    }
  }

  console.log(JSON.stringify(identity, null, 2));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error(`${error.name}: ${error.message}`);
    process.exitCode = 1;
  });
}
