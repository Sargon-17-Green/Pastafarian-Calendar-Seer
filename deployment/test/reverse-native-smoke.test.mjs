import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { queryDate, queryReverse } from '../../index.mjs';
import { listen } from '../../http/index.mjs';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function nativeAvailable() {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  try {
    await Promise.all([
      access(path.join(root, 'prototype', 'build', `seer_year_batch${suffix}`)),
      access(path.join(root, 'prototype', 'build', `seer_year_structure${suffix}`)),
    ]);
    return true;
  } catch {
    return false;
  }
}

test('native reverse conversion agrees across library, CLI and HTTP', async (t) => {
  if (!(await nativeAvailable())) return t.skip('native exact runtime is not built');
  const calculationJdn = 2461303;
  const targetJdn = calculationJdn + 30;
  const forward = await queryDate({
    calculation: { jdn: String(calculationJdn) },
    target: { jdn: String(targetJdn) },
    presentation: 'canonical',
  });
  const date = forward.pastafarianDate;
  const request = {
    calculation: { jdn: String(calculationJdn) },
    pastafarianDate: {
      year: date.year,
      cutlet: { canonicalIndex: date.cutlet.canonicalIndex, day: date.cutlet.day },
      month: { canonicalIndex: date.month.canonicalIndex, day: date.month.day },
    },
    presentation: 'canonical',
  };

  const direct = await queryReverse(request);
  assert.equal(direct.targetDay.jdn, String(targetJdn));

  const cliArgs = [
    path.join(root, 'query', 'cli.mjs'), 'reverse',
    '--calculation-jdn', request.calculation.jdn,
    '--year', request.pastafarianDate.year,
    '--cutlet', String(request.pastafarianDate.cutlet.canonicalIndex),
    '--day-in-cutlet', String(request.pastafarianDate.cutlet.day),
    '--month', String(request.pastafarianDate.month.canonicalIndex),
    '--day-in-month', String(request.pastafarianDate.month.day),
    '--canonical',
  ];
  const cli = JSON.parse((await execFileAsync(process.execPath, cliArgs, {
    cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  })).stdout);
  assert.equal(cli.targetDay.jdn, String(targetJdn));

  const server = await listen({ host: '127.0.0.1', port: 0 });
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/reverse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  const text = await response.text();
  assert.equal(response.status, 200, text);
  assert.equal(JSON.parse(text).targetDay.jdn, String(targetJdn));
});
