import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(root, 'query', 'cli.mjs');
const index = JSON.parse(await readFile(path.join(root, 'generated', 'index.json'), 'utf8'));
const cache = index.caches[0];
const targetJdn = cache.targetStartJdn + Math.min(2, cache.targetCount - 1);

async function run(args) {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [cli, ...args],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(stderr, '');
  return JSON.parse(stdout);
}

test('CLI date accepts --locale and returns localized full presentation', async () => {
  const body = await run([
    'date',
    '--calculation-jdn', String(cache.calcJdn),
    '--target-jdn', String(targetJdn),
    '--locale', 'he',
  ]);
  assert.equal(body.locale, 'he');
  assert.match(body.formatted, /^שנה /);
  assert.equal(body.targetDay.jdn, String(targetJdn));
});

test('CLI canonical mode keeps locale semantically irrelevant', async () => {
  const body = await run([
    'date',
    '--calculation-jdn', String(cache.calcJdn),
    '--target-jdn', String(targetJdn),
    '--locale', '../../not-a-locale',
    '--canonical',
  ]);
  assert.equal(body.locale, undefined);
  assert.equal(body.formatted, undefined);
  assert.equal(body.pastafarianDate.cutlet.name, undefined);
  assert.equal(body.targetDay.jdn, String(targetJdn));
});

test('CLI reports malformed full-presentation locale with the query error code', async () => {
  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        cli, 'date',
        '--calculation-jdn', String(cache.calcJdn),
        '--target-jdn', String(targetJdn),
        '--locale', 'en_us',
      ],
      { cwd: root, encoding: 'utf8' },
    ),
    (error) => {
      assert.equal(error.code, 2);
      const body = JSON.parse(error.stderr.trim());
      assert.equal(body.error.code, 'INVALID_LOCALE');
      assert.equal(body.error.field, 'locale');
      return true;
    },
  );
});
