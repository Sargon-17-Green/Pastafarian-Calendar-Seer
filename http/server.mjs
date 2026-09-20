#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createSeerHttpHandler } from './app.mjs';
import { createPublicIdentityProvider } from './public-identity.mjs';

function publicIdentityProviderFor(options) {
  const queryOptions = options.queryOptions ?? {};
  return options.publicIdentityProvider ?? createPublicIdentityProvider({
    generatedDir: queryOptions.generatedDir ?? process.env.SEER_CACHE_DIR,
    releaseIdentity: options.releaseIdentity,
    requireReleaseIdentity: options.requireReleaseIdentity,
    artifactMode: options.artifactMode,
  });
}

export function createSeerHttpServer(options = {}) {
  const envWebRoot = String(process.env.SEER_WEB_ROOT ?? '').trim();
  const publicIdentityProvider = publicIdentityProviderFor(options);
  const handlerOptions = options.webRoot === undefined && envWebRoot
    ? { ...options, webRoot: envWebRoot, publicIdentityProvider }
    : { ...options, publicIdentityProvider };
  return http.createServer(createSeerHttpHandler(handlerOptions));
}

export async function listen(options = {}) {
  const host = options.host ?? process.env.HOST ?? '127.0.0.1';
  const rawPort = options.port ?? process.env.PORT ?? '8080';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError(`Invalid port: ${rawPort}`);
  const publicIdentityProvider = publicIdentityProviderFor(options);
  const requireReleaseIdentity = options.requireReleaseIdentity ??
    String(process.env.SEER_REQUIRE_RELEASE_IDENTITY ?? '') === '1';
  if (requireReleaseIdentity) await publicIdentityProvider.snapshot();
  const server = createSeerHttpServer({ ...options, publicIdentityProvider });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server;
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const server = await listen();
  const address = server.address();
  const host = typeof address === 'object' && address ? address.address : process.env.HOST ?? '127.0.0.1';
  const port = typeof address === 'object' && address ? address.port : process.env.PORT ?? '8080';
  console.log(`Pastafarian Calendar Seer HTTP v1 listening on http://${host}:${port}`);
  const stop = () => server.close(() => process.exit(0));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
