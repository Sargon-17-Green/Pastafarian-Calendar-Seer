import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { queryReverse } from '../../index.mjs';
import { listen } from '../../http/index.mjs';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function reverseFixture() {
  const index = JSON.parse(await readFile(path.join(root, 'generated', 'index.json'), 'utf8'));
  const descriptor = index.caches[0];
  const cache = JSON.parse(await readFile(path.join(root, 'generated', descriptor.path), 'utf8'));
  const record = cache.records[Math.min(2, cache.records.length - 1)];
  const request = {
    calculation: { jdn: String(descriptor.calcJdn) },
    pastafarianDate: {
      year: String(record.year),
      cutlet: { canonicalIndex: record.cutletIndex + 1, day: record.dayInCutlet },
      month: { canonicalIndex: record.monthIndex + 1, day: record.dayInMonth },
    },
    presentation: 'canonical',
  };
  return { descriptor, record, request };
}

test('native reverse conversion agrees across library, CLI and HTTP', async (t) => {
  const { record, request } = await reverseFixture();

  const direct = await queryReverse(request);
  assert.equal(direct.targetDay.jdn, String(record.targetJdn));

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
  assert.equal(cli.targetDay.jdn, String(record.targetJdn));

  const server = await listen({ host: '127.0.0.1', port: 0 });
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/reverse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  const text = await response.text();
  assert.equal(response.status, 200, text);
  assert.equal(JSON.parse(text).targetDay.jdn, String(record.targetJdn));
});
