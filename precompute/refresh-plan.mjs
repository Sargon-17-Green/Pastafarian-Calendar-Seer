import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessCacheRefresh } from './lib/cache-refresh.mjs';
import { sha256EngineInputs, sha256Tree } from './lib/cache-format.mjs';
import { KISURRA_OBSERVER } from './vendor/pastafari-calendar-1.4.1/observer-location.js';
import { currentDayAt } from './vendor/pastafari-calendar-1.4.1/venus-day-boundary.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
function option(name) {
  const prefix = `${name}=`;
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}
const nowText = option('--now');
const now = nowText === undefined ? new Date() : new Date(nowText);
if (!Number.isFinite(now.getTime())) throw new RangeError('invalid --now instant');
const cacheDir = path.resolve(option('--cache-dir') || process.env.SEER_CACHE_DIR || path.join(root, '.cache-build', 'rolling'));

const activeCalcJdn = Number(currentDayAt(now, KISURRA_OBSERVER).jdn);
const engineFingerprint = await sha256EngineInputs({
  sourceDir: path.join(root, 'prototype', 'src'),
  dataFiles: {
    positiveGates: path.join(root, 'prototype', 'data', 'gates_100k_u16.bin'),
    negativeGates: path.join(root, 'prototype', 'data', 'gates_negative_100k_u16.bin'),
  },
});
const astronomyFingerprint = await sha256Tree(path.join(root, 'precompute', 'vendor', 'pastafari-calendar-1.4.1'));
const plan = await assessCacheRefresh({ cacheDir, activeCalcJdn, engineFingerprint, astronomyFingerprint });
process.stdout.write(`${JSON.stringify({
  ...plan,
  cacheDir,
  generatedForInstantUtc: now.toISOString(),
  activeCalcJdn,
  engineFingerprint,
  astronomyFingerprint,
}, null, 2)}\n`);
