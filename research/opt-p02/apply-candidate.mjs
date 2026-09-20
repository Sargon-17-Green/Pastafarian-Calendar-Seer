#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const partsDir = path.join(repo, 'research', 'opt-p02', 'core-patch-parts');
const scratch = path.join(repo, '.opt-p02-validation');
const rawPatchSha256 = 'b1b3fdd5343224b313893880651fbfa4022918e2cd1ad940f43b690220729d7d';
const overlaySha256 = new Map(Object.entries({
  'bench/product/opt-p02-concurrency.mjs': '3e77538f28bc3368543b1d1aed6e2cdaf0eadaec583948109a7632f781f5e540',
  'docs/OPT_P02_PERSISTENT_EXACT_SERVICE_CONCURRENCY.md': 'f1bd4e5aa9bcbeac34957392aeaa14c1e0c10b387f396bcf3d680280a8b9d560',
  'http/app.mjs': '28b6466d7594169bab6be03024ab89ae7508c07d013f0355d52f99f9ed5f74b8',
  'query/concurrency.mjs': 'a2944b336687eab9a2d0ad23ec577c53075509466c159eab2322a39eab660793',
  'query/exact-engine.mjs': 'f8a70d5e5ff4424182adef4dd23627d68bab7c1354590b05fca839cc4802d881',
  'query/index.mjs': '91c87ca2815aad969f0ac051be7ff53b213d3c9d617889fa63a1b52a45e84a28',
  'query/performance.mjs': '66ff19d13e3e3706331572e3a61833786f4f68f899b29adf0e54a44c6a7e72c1',
  'query/provider-precomputed.mjs': '0bf46cfdb7d3996b38c6bdd65e21ba0b8ddb9e3f9355e6f45ae87ca9e1de719b',
  'query/test/fixtures/opt-p02-fake-engine-service.mjs': 'b7bee1b773e1f772cf0fe66203bb6270541a42055cf0d56ee89010fc2f49ad0e',
  'query/test/opt-p02-concurrency.test.mjs': '2fff822b8751daae0470b6f0b3f188cb340b49e0fe757297f98e25ef5def1875',
}));

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function replaceOnce(file, oldText, newText) {
  const full = path.join(repo, file);
  const text = readFileSync(full, 'utf8');
  const first = text.indexOf(oldText);
  if (first < 0 || text.indexOf(oldText, first + 1) >= 0) throw new Error(`${file}: expected exactly one replacement target`);
  writeFileSync(full, text.slice(0, first) + newText + text.slice(first + oldText.length), 'utf8');
}

const partNames = readdirSync(partsDir).filter((name) => /^part-\d+$/.test(name)).sort();
if (partNames.length !== 7) throw new Error(`expected 7 core patch parts, found ${partNames.length}`);
const gzipBytes = Buffer.concat(partNames.map((name) => readFileSync(path.join(partsDir, name))));
const patchBytes = gunzipSync(gzipBytes);
if (sha256(patchBytes) !== rawPatchSha256) throw new Error('OPT-P02 core patch SHA-256 mismatch');
mkdirSync(scratch, { recursive: true });
const patchPath = path.join(scratch, 'OPT_P02_CORE.patch');
writeFileSync(patchPath, patchBytes);
execFileSync('git', ['apply', '--check', patchPath], { cwd: repo, stdio: 'inherit' });
execFileSync('git', ['apply', patchPath], { cwd: repo, stdio: 'inherit' });

for (const [file, expected] of overlaySha256) {
  const actual = sha256(readFileSync(path.join(repo, file)));
  if (actual !== expected) throw new Error(`${file}: overlay SHA-256 mismatch: ${actual}`);
}

replaceOnce('bench/product/run.mjs',
  "async function concurrencyLevel(baseUrl, level, index, requestCountOverride = null) {\n  const requestCount = requestCountOverride ?? Math.max(100, level);",
  "async function concurrencyLevel(baseUrl, level, _index, requestCountOverride = null) {\n  const requestCount = requestCountOverride ?? 300;");
replaceOnce('bench/product/run.mjs',
  "      const target = FAR_FUTURE_CALC_JDN + 1n + BigInt(index * 4096 + i * 17);",
  "      const target = FAR_FUTURE_CALC_JDN + 1n + BigInt(i);");
replaceOnce('bench/product/run.mjs',
  "  const errors = new Map();\n  const treeBefore = await snapshotProcessTree();",
  "  const errors = new Map();\n  const fetchErrorCauses = new Map();\n  const treeBefore = await snapshotProcessTree();");
replaceOnce('bench/product/run.mjs',
  "      } catch (error) {\n        latencies[i] = Number(process.hrtime.bigint() - t0) / 1e6;\n        errors.set('FETCH_ERROR', (errors.get('FETCH_ERROR') ?? 0) + 1);\n        continue;\n      }",
  "      } catch (error) {\n        latencies[i] = Number(process.hrtime.bigint() - t0) / 1e6;\n        errors.set('FETCH_ERROR', (errors.get('FETCH_ERROR') ?? 0) + 1);\n        const cause = [error?.name, error?.cause?.name, error?.cause?.code, error?.cause?.errno, error?.cause?.syscall]\n          .filter((value) => value !== undefined && value !== null && String(value) !== '')\n          .map(String)\n          .join(':') || 'unknown';\n        fetchErrorCauses.set(cause, (fetchErrorCauses.get(cause) ?? 0) + 1);\n        continue;\n      }");
replaceOnce('bench/product/run.mjs',
  "    errors: Object.fromEntries(errors),\n    wallMs,",
  "    errors: Object.fromEntries(errors),\n    fetchErrorCauses: Object.fromEntries(fetchErrorCauses),\n    wallMs,");
replaceOnce('bench/product/run.mjs',
  "  const warmUrl = `${baseUrl}/v1/date?calculationJdn=${FAR_FUTURE_CALC_JDN}&targetJdn=${FAR_FUTURE_CALC_JDN + 1n}&presentation=canonical`;",
  "  const warmUrl = `${baseUrl}/v1/date?calculationJdn=${FAR_FUTURE_CALC_JDN}&targetJdn=${FAR_FUTURE_CALC_JDN + 300n}&presentation=canonical`;");
replaceOnce('bench/product/README.md',
  'The concurrency series keeps one far-future calculation day warm and varies non-contiguous exact target days. This exercises HTTP/admission/service queue behavior without accidentally turning the concurrency benchmark into hundreds of unrelated cold year-chain constructions. The separate same-as-target range remains the deliberate calculation-day fan-out case.',
  'The full concurrency series keeps one far-future calculation day warm, prewarms coverage through target +300, and reuses the same 300 unique consecutive exact target days at every concurrency level. This isolates HTTP/admission/service queue behavior from target-region and year-chain-work differences. Smoke mode keeps the same formula with a smaller request count. The separate same-as-target range remains the deliberate calculation-day fan-out case.');

const exactEngine = readFileSync(path.join(repo, 'query', 'exact-engine.mjs'), 'utf8');
if (!exactEngine.includes('const DEFAULT_SERVICE_WORKERS = 1;')) throw new Error('candidate no longer defaults to one service worker');
execFileSync('git', ['diff', '--check'], { cwd: repo, stdio: 'inherit' });
rmSync(scratch, { recursive: true, force: true });
console.log('OPT-P02 candidate applied and verified; production default remains one service worker.');
