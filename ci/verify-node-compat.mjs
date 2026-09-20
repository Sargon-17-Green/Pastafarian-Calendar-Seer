import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

function run(command, args, { capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture) {
      if (result.stdout) process.stderr.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
  return capture ? result.stdout : '';
}

function runNpm(args, options) {
  if (process.platform === 'win32') {
    return run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `npm.cmd ${args.join(' ')}`], options);
  }
  return run('npm', args, options);
}

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
assert.equal(pkg.engines?.node, '>=20', 'compatibility matrix must track package.json engines.node >=20');
const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
assert.ok(Number.isInteger(nodeMajor) && nodeMajor >= 20, `unexpected Node runtime ${process.versions.node}`);

console.log(`Node compatibility verification: ${process.version}; declared engine ${pkg.engines.node}`);

const packJson = runNpm(['pack', '--dry-run', '--json'], { capture: true });
const packPayload = JSON.parse(packJson);
const pack = Array.isArray(packPayload) ? packPayload[0] : packPayload;
const shippedMjs = (pack?.files ?? [])
  .map((entry) => String(entry?.path ?? ''))
  .filter((file) => file.endsWith('.mjs'))
  .sort();

assert.ok(shippedMjs.includes('index.mjs'), 'npm pack must contain index.mjs');
assert.ok(shippedMjs.includes('query/cli.mjs'), 'npm pack must contain query/cli.mjs');
assert.ok(shippedMjs.includes('client/index.mjs'), 'npm pack must contain client/index.mjs');
assert.ok(shippedMjs.includes('http/server.mjs'), 'npm pack must contain http/server.mjs');
assert.ok(shippedMjs.length > 0, 'npm pack must contain JavaScript modules');

for (const file of shippedMjs) run(process.execPath, ['--check', file]);

runNpm(['test']);
const compatibilityTests = [
  'query/test/query.test.mjs',
  'query/test/batch-range.test.mjs',
  'query/test/calculation-year.test.mjs',
  'query/test/gregorian.test.mjs',
  'query/test/contract-index.test.mjs',
  'client/test/client.test.mjs',
  'http/test/http-adapter.test.mjs',
  'deployment/test/package-entrypoints.test.mjs',
];
run(process.execPath, ['--test', ...compatibilityTests]);

const help = run(process.execPath, ['query/cli.mjs', '--help'], { capture: true });
for (const token of ['usage:', 'calculation-day', 'range', 'reverse', 'year', 'batch']) {
  assert.ok(help.includes(token), `CLI --help missing ${token}`);
}

console.log(JSON.stringify({
  ok: true,
  node: process.version,
  declaredEngine: pkg.engines.node,
  shippedModulesSyntaxChecked: shippedMjs.length,
  compatibilityTests,
  checks: [
    'npm-pack-shipped-module-syntax',
    'package-selftest',
    'query-validation',
    'gregorian-helpers',
    'browser-client',
    'http-adapter',
    'openapi-schema-closure',
    'cli-help',
  ],
}, null, 2));
