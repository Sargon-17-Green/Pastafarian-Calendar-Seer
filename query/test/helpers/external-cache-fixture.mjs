import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256EngineInputs } from '../../../precompute/lib/cache-format.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export async function createExternalCacheFixture({ calcJdn = 2461303, targetCount = 3 } = {}) {
  const generatedDir = await mkdtemp(path.join(os.tmpdir(), 'seer-external-cache-fixture-'));
  await mkdir(path.join(generatedDir, 'calc'), { recursive: true });
  const engineFingerprint = await sha256EngineInputs({
    sourceDir: path.join(root, 'prototype', 'src'),
    dataFiles: {
      positiveGates: path.join(root, 'prototype', 'data', 'gates_100k_u16.bin'),
      negativeGates: path.join(root, 'prototype', 'data', 'gates_negative_100k_u16.bin'),
    },
  });
  const records = Array.from({ length: targetCount }, (_, i) => ({
    targetJdn: calcJdn + i,
    year: 5000,
    cutletIndex: 2,
    dayInCutlet: 7 + i,
    monthIndex: 4,
    dayInMonth: 11 + i,
    cutletCount: 9,
    monthCount: 23,
  }));
  const cache = {
    schema: 1,
    calcJdn,
    targetStartJdn: calcJdn,
    targetCount,
    engineFingerprint,
    records,
  };
  const raw = Buffer.from(`${JSON.stringify(cache, null, 2)}\n`);
  const sha256 = createHash('sha256').update(raw).digest('hex');
  await writeFile(path.join(generatedDir, 'calc', `${calcJdn}.json`), raw);
  const index = {
    schema: 1,
    engineFingerprint,
    rollingTargetDaysPerCalculationDay: targetCount,
    caches: [{
      calcJdn,
      path: `calc/${calcJdn}.json`,
      sha256,
      targetStartJdn: calcJdn,
      targetCount,
    }],
  };
  await writeFile(path.join(generatedDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  return { generatedDir, calcJdn, targetStartJdn: calcJdn, targetCount, records, engineFingerprint };
}
