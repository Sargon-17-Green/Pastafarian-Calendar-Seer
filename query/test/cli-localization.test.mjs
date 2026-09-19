import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExternalCacheFixture } from './helpers/external-cache-fixture.mjs';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(root, 'query', 'cli.mjs');
const fixture = await createExternalCacheFixture();
const targetJdn = fixture.targetStartJdn + Math.min(2, fixture.targetCount - 1);

async function run(args) {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [cli, ...args],
    { cwd: root, encoding: 'utf8', env: { ...process.env, SEER_CACHE_DIR: fixture.generatedDir } },
  );
  assert.equal(stderr, '');
  return JSON.parse(stdout);
}

test('CLI date accepts --locale and returns localized full presentation', async () => {
  const body = await run([
    'date',
    '--calculation-jdn', String(fixture.calcJdn),
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
    '--calculation-jdn', String(fixture.calcJdn),
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
        '--calculation-jdn', String(fixture.calcJdn),
        '--target-jdn', String(targetJdn),
        '--locale', 'en_us',
      ],
      { cwd: root, encoding: 'utf8', env: { ...process.env, SEER_CACHE_DIR: fixture.generatedDir } },
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

test('CLI --help exits zero and prints usage to stdout', async () => {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [cli, '--help'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.match(stdout, /^usage:/);
  assert.equal(stderr, '');
});
