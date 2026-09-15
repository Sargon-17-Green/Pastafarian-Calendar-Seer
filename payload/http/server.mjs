import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createSeerHttpHandler } from './app.mjs';

export function createSeerHttpServer(options = {}) {
  return http.createServer(createSeerHttpHandler(options));
}

export async function listen(options = {}) {
  const host = options.host ?? process.env.HOST ?? '127.0.0.1';
  const rawPort = options.port ?? process.env.PORT ?? '8080';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError(`Invalid port: ${rawPort}`);
  const server = createSeerHttpServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const server = await listen();
  const address = server.address();
  const host = typeof address === 'object' && address ? address.address : process.env.HOST ?? '127.0.0.1';
  const port = typeof address === 'object' && address ? address.port : process.env.PORT ?? '8080';
  console.log(`Pastafarian Calendar Seer HTTP v1 listening on http://${host}:${port}`);
  const stop = () => server.close(() => process.exit(0));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
