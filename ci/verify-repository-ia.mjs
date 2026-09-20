import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const failures = [];

const forbiddenRoot = new Set([
  'APPLY_AND_RUN.md',
  'AVX2_MULSMALL_AB_README.md',
  'AVX2_MULSMALL_AB_SHA256SUMS.txt',
  'DELTA_MANIFEST.json',
  'DELTA_README.md',
  'FRACDOUBLE_AB_FIX_README.md',
  'FRACDOUBLE_AB_README.md',
  'HISTORICAL_ROOT_SHA256SUMS_PRE_SAVED_SUM.txt',
  'HISTORICAL_VALIDATION_NOTICE.md',
  'INTERLEAVED_BENCHMARK_README.md',
  'PASCAL_ADAPTIVE_AB_README.md',
  'PASCAL_ADAPTIVE_AB_SHA256SUMS.txt',
  'PASCAL_ADAPTIVE_ADOPTION_README.md',
  'PASCAL_LADDER_AB_README.md',
  'PASCAL_LADDER_AB_SHA256SUMS.txt',
  'README_STAGE2.md',
  'README_STAGE3.md',
  'README_STAGE4.md',
  'README_STAGE5.md',
  'README_STAGE6.md',
  'REPLAY_CACHE_AB_README.md',
  'REPLAY_CACHE_AB_SHA256SUMS.txt',
  'SAUCE_V12_README.md',
  'SHA256SUMS.txt',
  'V12_ADOPTION_README.md',
  'V12_ADOPTION_SHA256SUMS.txt',
  'VALIDATION_STATUS.md',
]);

async function walk(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    if (ent.name === '.git' || ent.name === 'node_modules' || ent.name === 'prototype/build') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

for (const name of await readdir(root)) {
  if (forbiddenRoot.has(name)) failures.push(`historical artifact returned to repository root: ${name}`);
}

const files = await walk(root);
for (const file of files) {
  if (path.basename(file).startsWith('HANDOFF_')) {
    failures.push(`HANDOFF artifact must not be committed: ${path.relative(root, file)}`);
  }
}

const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
for (const entry of pkg.files ?? []) {
  if (entry.startsWith('research/') || entry.startsWith('docs/history/')) {
    failures.push(`non-production tree leaked into package files: ${entry}`);
  }
}

for (const file of files.filter((p) => /\.md$/i.test(p))) {
  const rel = path.relative(root, file).replaceAll('\\', '/');
  if (rel.startsWith('docs/history/')) continue;
  const text = await readFile(file, 'utf8');
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const m of text.matchAll(re)) {
    const target = m[1].trim().split('#')[0];
    if (!target || /^(?:https?:|mailto:|#)/i.test(target)) continue;
    const decoded = decodeURIComponent(target);
    const resolved = path.resolve(path.dirname(file), decoded);
    try {
      await stat(resolved);
    } catch {
      failures.push(`${rel}: broken relative link: ${m[1]}`);
    }
  }
}

const workflowDir = path.join(root, '.github', 'workflows');
for (const name of await readdir(workflowDir)) {
  if (/^hosted-(?:benchmark|check)-.*\.ya?ml$/i.test(name) || /^hosted-benchmark\.ya?ml$/i.test(name)) {
    failures.push(`legacy research workflow filename returned: ${name}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('repository information architecture PASS');
