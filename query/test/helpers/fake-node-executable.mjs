import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function fakeNodeExecutable(dir, name, body) {
  const file = path.join(dir, `${name}.cjs`);
  await writeFile(file, `${body}\n`, 'utf8');
  return file;
}

export function nodeScriptExecFile(binary, args, options) {
  return execFileAsync(process.execPath, [binary, ...args], options);
}
