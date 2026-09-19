import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RegistryIntegrityError,
  RegistryTransientError,
  assertSameDigest,
  extractRequiredPlatformDigests,
  isRetryableNetworkError,
  isTransientStatus,
  retryRegistryOperation,
} from '../../scripts/resolve-release-identities.mjs';

test('transient HTTP classification is deliberately narrow', () => {
  for (const status of [404, 408, 425, 429, 500, 502, 503, 504, 599]) {
    assert.equal(isTransientStatus(status), true, `${status} should retry`);
  }
  for (const status of [400, 401, 403, 405, 409, 410, 422]) {
    assert.equal(isTransientStatus(status), false, `${status} must fail fast`);
  }
});

test('known network failures are retryable while arbitrary errors are not', () => {
  assert.equal(isRetryableNetworkError(Object.assign(new Error('reset'), { code: 'ECONNRESET' })), true);
  assert.equal(
    isRetryableNetworkError(new TypeError('fetch failed', {
      cause: Object.assign(new Error('dns'), { code: 'EAI_AGAIN' }),
    })),
    true,
  );
  assert.equal(isRetryableNetworkError(new Error('bad manifest')), false);
});

test('retry uses bounded exponential backoff and succeeds after transient failures', async () => {
  let calls = 0;
  const delays = [];
  const value = await retryRegistryOperation(
    async () => {
      calls += 1;
      if (calls < 3) throw new RegistryTransientError('not visible yet', { status: 404 });
      return 'visible';
    },
    {
      label: 'test registry',
      maxAttempts: 4,
      baseDelayMs: 10,
      maxDelayMs: 25,
      sleepFn: async (ms) => delays.push(ms),
      onRetry: () => {},
    },
  );
  assert.equal(value, 'visible');
  assert.equal(calls, 3);
  assert.deepEqual(delays, [10, 20]);
});

test('retry never retries an integrity mismatch', async () => {
  let calls = 0;
  await assert.rejects(
    retryRegistryOperation(
      async () => {
        calls += 1;
        throw new RegistryIntegrityError('digest mismatch');
      },
      {
        maxAttempts: 8,
        baseDelayMs: 1,
        maxDelayMs: 2,
        sleepFn: async () => {},
        onRetry: () => {},
      },
    ),
    RegistryIntegrityError,
  );
  assert.equal(calls, 1);
});

test('retry stops at the configured attempt bound', async () => {
  let calls = 0;
  await assert.rejects(
    retryRegistryOperation(
      async () => {
        calls += 1;
        throw new RegistryTransientError('still propagating', { status: 503 });
      },
      {
        maxAttempts: 3,
        baseDelayMs: 1,
        maxDelayMs: 2,
        sleepFn: async () => {},
        onRetry: () => {},
      },
    ),
    RegistryTransientError,
  );
  assert.equal(calls, 3);
});

test('divergent immutable GHCR tags fail immediately', () => {
  const a = `sha256:${'a'.repeat(64)}`;
  const b = `sha256:${'b'.repeat(64)}`;
  assert.throws(
    () => assertSameDigest(a, b, 'version tags'),
    /resolve to different digests/,
  );
});

test('required amd64 and arm64 child digests are extracted exactly once', () => {
  const amd64 = `sha256:${'1'.repeat(64)}`;
  const arm64 = `sha256:${'2'.repeat(64)}`;
  const index = {
    manifests: [
      { digest: amd64, platform: { os: 'linux', architecture: 'amd64' } },
      { digest: arm64, platform: { os: 'linux', architecture: 'arm64' } },
      { digest: `sha256:${'3'.repeat(64)}`, platform: { os: 'unknown', architecture: 'unknown' } },
    ],
  };
  assert.deepEqual(extractRequiredPlatformDigests(index), { amd64, arm64 });
  assert.throws(
    () => extractRequiredPlatformDigests({ manifests: [index.manifests[0]] }),
    /linux\/arm64/,
  );
});
