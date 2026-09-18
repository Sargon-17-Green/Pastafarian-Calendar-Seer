import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ENGINE_SOURCE_FILES, sha256EngineInputs } from '../lib/cache-format.mjs';


test('runtime fingerprint closure includes both selectable RNS backends', () => {
  assert.ok(ENGINE_SOURCE_FILES.includes('rns_micro8_avx2_32x8.cpp'));
  assert.ok(ENGINE_SOURCE_FILES.includes('rns_micro8_portable.cpp'));
  assert.ok(ENGINE_SOURCE_FILES.includes('rns_primes32.hpp'));
  assert.ok(ENGINE_SOURCE_FILES.includes('rns_primes.hpp'));
});

test('engine fingerprint includes both gate corpora deterministically', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'seer-engine-fp-'));
  const src = path.join(tmp, 'src');
  await mkdir(src);
  const positive = path.join(tmp, 'positive.bin');
  const negative = path.join(tmp, 'negative.bin');
  await writeFile(path.join(src, 'engine.cpp'), 'engine-v1\n');
  await writeFile(positive, Buffer.from([1, 2, 3]));
  await writeFile(negative, Buffer.from([4, 5, 6]));
  try {
    const opts = { sourceDir: src, sourceFiles: ['engine.cpp'], dataFiles: { positiveGates: positive, negativeGates: negative } };
    const a = await sha256EngineInputs(opts);
    const b = await sha256EngineInputs({ sourceDir: src, sourceFiles: ['engine.cpp'], dataFiles: { negativeGates: negative, positiveGates: positive } });
    assert.equal(a, b);

    await writeFile(path.join(src, 'engine.cpp'), 'int main() {\r\n  return 0;\r\n}\r\n');
    const crlf = await sha256EngineInputs(opts);
    await writeFile(path.join(src, 'engine.cpp'), 'int main() {\n  return 0;\n}\n');
    const lf = await sha256EngineInputs(opts);
    assert.equal(crlf, lf, 'engine source fingerprint must be line-ending neutral');
    await writeFile(path.join(src, 'engine.cpp'), 'engine-v1\n');
    await writeFile(negative, Buffer.from([4, 5, 7]));
    const c = await sha256EngineInputs(opts);
    assert.notEqual(c, a);

    await writeFile(negative, Buffer.from([4, 5, 6]));
    await writeFile(positive, Buffer.from([1, 2, 4]));
    const d = await sha256EngineInputs(opts);
    assert.notEqual(d, a);

    await writeFile(path.join(src, 'research-only.cpp'), 'not-runtime\n');
    await writeFile(positive, Buffer.from([1, 2, 3]));
    const e = await sha256EngineInputs(opts);
    assert.equal(e, a, 'files outside the runtime source closure must not change the engine fingerprint');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
