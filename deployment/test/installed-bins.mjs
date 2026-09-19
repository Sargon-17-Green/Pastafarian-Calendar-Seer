import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

const consumer = path.resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('usage: node deployment/test/installed-bins.mjs CONSUMER_DIR');
const binDir = path.join(consumer, 'node_modules', '.bin');
const isWindows = process.platform === 'win32';
const binPath = (name) => path.join(binDir, `${name}${isWindows ? '.cmd' : ''}`);

function runBin(name, args = [], options = {}) {
  const executable = binPath(name);
  if (isWindows) {
    return spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'call', executable, ...args], {
      cwd: consumer, windowsHide: true, ...options,
    });
  }
  return spawn(executable, args, { cwd: consumer, windowsHide: true, ...options });
}

async function collect(child) {
  let stdout = '', stderr = '';
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (chunk) => { stdout += chunk; });
  child.stderr?.on('data', (chunk) => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  return { code, stdout, stderr };
}

async function stopTree(child) {
  if (child.exitCode !== null) return;
  if (isWindows) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  } else {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('close', resolve));
  }
}

const cli = await collect(runBin('pastafarian-seer', ['--help']));
assert.equal(cli.code, 0, cli.stderr || cli.stdout);
assert.match(cli.stdout, /^usage:/m);

const http = runBin('pastafarian-seer-http', [], {
  env: { ...process.env, HOST: '127.0.0.1', PORT: '0' },
});
let httpStdout = '', httpStderr = '';
http.stdout?.setEncoding('utf8');
http.stderr?.setEncoding('utf8');
http.stdout?.on('data', (chunk) => { httpStdout += chunk; });
http.stderr?.on('data', (chunk) => { httpStderr += chunk; });
try {
  const port = await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error(`HTTP bin did not announce a port: ${httpStdout} ${httpStderr}`)), 15000);
    const inspect = () => {
      const match = /listening on http:\/\/127\.0\.0\.1:(\d+)/.exec(httpStdout);
      if (!match) return;
      clearTimeout(deadline);
      resolve(Number(match[1]));
    };
    http.stdout?.on('data', inspect);
    http.once('error', (error) => { clearTimeout(deadline); reject(error); });
    http.once('close', (code) => {
      if (!/listening on /.test(httpStdout)) {
        clearTimeout(deadline);
        reject(new Error(`HTTP bin exited early (${code}): ${httpStdout} ${httpStderr}`));
      }
    });
    inspect();
  });
  const response = await fetch(`http://127.0.0.1:${port}/openapi.json`);
  const text = await response.text();
  assert.equal(response.status, 200, text);
  const body = JSON.parse(text);
  assert.equal(body.openapi, '3.1.0');
} finally {
  await stopTree(http);
}

console.log(JSON.stringify({
  ok: true,
  bins: ['pastafarian-seer', 'pastafarian-seer-http'],
  checks: ['cli-help', 'http-openapi'],
}));
