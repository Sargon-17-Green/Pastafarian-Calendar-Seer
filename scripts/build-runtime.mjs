#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const nativeSupported =
  (process.platform === 'linux' && (process.arch === 'x64' || process.arch === 'arm64'))
  || (process.platform === 'win32' && process.arch === 'x64');
if (!nativeSupported) {
  console.error('The exact native runtime is currently supported on x64/ARM64 Linux and x64 Windows.');
  console.error('The browser HTTP client and bundled-cache JavaScript API do not require build:native.');
  process.exit(1);
}
const isWindows = process.platform === 'win32';
const command = isWindows
  ? (process.env.SEER_POWERSHELL || 'powershell.exe')
  : (process.env.SEER_BASH || 'bash');
const script = path.join(here, isWindows ? 'build-runtime.ps1' : 'build-runtime.sh');
const args = isWindows
  ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script]
  : [script];

const child = spawn(command, args, {
  cwd: path.resolve(here, '..'),
  stdio: 'inherit',
  windowsHide: true,
  env: process.env,
});

child.on('error', (error) => {
  console.error(`Unable to start native runtime build: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  if (signal) console.error(`Native runtime build terminated by ${signal}.`);
  process.exitCode = code ?? 1;
});
