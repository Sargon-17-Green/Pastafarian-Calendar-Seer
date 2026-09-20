import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const workflowDir = path.join(root, '.github', 'workflows');
const actionDir = path.join(root, '.github', 'actions');
const sha40 = /^[0-9a-f]{40}$/;
const sha256 = /^sha256:[0-9a-f]{64}$/;
const failures = [];
const actionRefs = new Map();

async function yamlFiles(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...await yamlFiles(full));
    else if (/\.ya?ml$/i.test(ent.name)) out.push(full);
  }
  return out.sort();
}

function checkStepShape(label, text) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const start = lines[i].match(/^(\s*)-\s+(?:name|uses|run):/);
    if (!start) continue;
    const indent = start[1].length;
    const block = [lines[i]];
    let j = i + 1;
    while (j < lines.length) {
      const line = lines[j];
      const leading = line.match(/^(\s*)/)[1].length;
      const nextStep = line.match(/^(\s*)-\s+[A-Za-z0-9_-]+:/);
      if (line.trim() && leading <= indent) break;
      if (nextStep && nextStep[1].length === indent) break;
      block.push(line);
      j += 1;
    }
    const joined = block.join('\n');
    const hasUses = /^\s*uses:/m.test(joined) || /^\s*-\s*uses:/m.test(joined);
    if (hasUses && /^\s*shell:/m.test(joined)) failures.push(`${label}:${i + 1}: uses step must not declare shell`);
    if (hasUses && /^\s*run:/m.test(joined)) failures.push(`${label}:${i + 1}: step cannot declare both uses and run`);
    i = j - 1;
  }
}

function checkUses(label, text) {
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const m = line.match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)\s*(?:#.*)?$/);
    if (!m) continue;
    const value = m[1];
    if (value.startsWith('./')) continue;
    if (value.startsWith('docker://')) {
      const ref = value.split('@')[1] ?? '';
      if (!sha256.test(ref)) failures.push(`${label}:${index + 1}: mutable docker uses: ${value}`);
      continue;
    }
    const at = value.lastIndexOf('@');
    const ref = at >= 0 ? value.slice(at + 1) : '';
    if (at < 1 || !sha40.test(ref)) {
      failures.push(`${label}:${index + 1}: action is not SHA-pinned: ${value}`);
    } else {
      const action = value.slice(0, at);
      const refs = actionRefs.get(action) ?? new Set();
      refs.add(ref);
      actionRefs.set(action, refs);
    }
  }
}

const workflowFiles = (await yamlFiles(workflowDir)).filter((p) => !p.endsWith('README.yml'));
const actionFiles = await yamlFiles(actionDir);
const classes = { productionVerification: [], release: [], researchManualBenchmark: [], reusable: [], other: [] };

for (const file of workflowFiles) {
  const name = path.basename(file);
  const text = await readFile(file, 'utf8');
  checkUses(path.relative(root, file), text);
  checkStepShape(path.relative(root, file), text);

  if (/^release-/.test(name)) classes.release.push(name);
  else if (/^research-(?:benchmark|check)-/.test(name)) classes.researchManualBenchmark.push(name);
  else if (/^_reusable-/.test(name)) classes.reusable.push(name);
  else if (/^(verify-|codeql|dependency-review|generate-|precompute-)/.test(name)) classes.productionVerification.push(name);
  else classes.other.push(name);

  if (text.includes('actions/setup-node@')) failures.push(`${name}: setup-node must be owned by .github/actions/node-setup`);
  if (text.includes('sudo apt-get update')) failures.push(`${name}: apt update must be owned by .github/actions/native-deps`);

  if (/^research-(?:benchmark|check)-/.test(name)) {
    if (!/^\s*workflow_dispatch:\s*$/m.test(text)) failures.push(`${name}: research benchmark must remain manually dispatchable`);
    if (/^\s*pull_request:\s*$/m.test(text) || /^\s*push:\s*$/m.test(text)) {
      failures.push(`${name}: research/manual benchmark must not become automatic production verification`);
    }
  }
}

for (const file of actionFiles) {
  const text = await readFile(file, 'utf8');
  checkUses(path.relative(root, file), text);
  checkStepShape(path.relative(root, file), text);
}

for (const [action, refs] of actionRefs) {
  if (refs.size > 1) failures.push(`action-version drift: ${action} uses ${[...refs].join(', ')}`);
}

const lock = await readFile(path.join(root, 'ci', 'requirements-contract.txt'), 'utf8');
for (const [index, raw] of lock.split(/\r?\n/).entries()) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  if (!/^[A-Za-z0-9_.-]+==[^=\s]+$/.test(line)) failures.push(`ci/requirements-contract.txt:${index + 1}: dependency is not exactly pinned: ${line}`);
}

console.log(JSON.stringify({
  workflows: workflowFiles.length,
  compositeActions: actionFiles.map((p) => path.relative(root, p)),
  classes,
  actionRefs: Object.fromEntries([...actionRefs].map(([name, refs]) => [name, [...refs]])),
}, null, 2));

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('workflow maintenance policy PASS');
