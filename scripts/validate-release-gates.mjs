import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const authorityPath = path.join(root, '.github', 'release-gates.json');
const authority = JSON.parse(await readFile(authorityPath, 'utf8'));
const problems = [];

const requiredCategories = new Set([
  'package/cache',
  'semantic/full domain',
  'reverse',
  'exact errors',
  'difficult weave',
  'persistent service',
  'portable fallback',
  'ARM64 parity',
  'Stage 5/6',
  'web',
  'container',
  'supply chain',
  'release preflight',
]);

if (authority.schemaVersion !== 1) problems.push(`unsupported authority schema ${authority.schemaVersion}`);
if (authority.requiredCheckContext !== 'Release verification policy') problems.push('required check context drift');
if (!Array.isArray(authority.gates) || authority.gates.length === 0) problems.push('authority has no gates');

const unique = (field) => new Set(authority.gates.map((gate) => gate[field]));
if (unique('id').size !== authority.gates.length) problems.push('duplicate gate id');
if (unique('job').size !== authority.gates.length) problems.push('duplicate orchestrator job');
for (const category of requiredCategories) {
  if (!authority.gates.some((gate) => gate.category === category)) problems.push(`missing category ${category}`);
}
for (const gate of authority.gates) {
  if (gate.required !== true) problems.push(`${gate.id} is not required`);
  const workflowPath = path.join(root, '.github', 'workflows', gate.workflow);
  try { await access(workflowPath); } catch { problems.push(`${gate.id}: workflow ${gate.workflow} missing`); continue; }
  const text = await readFile(workflowPath, 'utf8');
  if (!/^\s{2}workflow_call:\s*$/m.test(text)) problems.push(`${gate.workflow}: workflow_call missing`);
  if (!/^\s{2}workflow_dispatch:\s*$/m.test(text)) problems.push(`${gate.workflow}: workflow_dispatch missing`);
  if (/^\s{2}push:\s*$/m.test(text) && !/^\s{4}branches:\s*(?:\[main\]|$)/m.test(text)) {
    problems.push(`${gate.workflow}: push trigger is not restricted to main`);
  }
}

const orchestratorPath = path.join(root, authority.orchestratorWorkflow);
const orchestrator = await readFile(orchestratorPath, 'utf8');
for (const gate of authority.gates) {
  if (!orchestrator.includes(`  ${gate.job}:`)) problems.push(`orchestrator missing job ${gate.job}`);
  if (!orchestrator.includes(`uses: ./.github/workflows/${gate.workflow}`)) problems.push(`orchestrator missing use of ${gate.workflow}`);
  if (!orchestrator.includes(`${gate.id}_reuse`)) problems.push(`orchestrator missing reuse output for ${gate.id}`);
}

for (const name of ['release-native-npm.yml', 'release-npm.yml', 'release-container.yml', 'release-github-package.yml']) {
  const text = await readFile(path.join(root, '.github', 'workflows', name), 'utf8');
  if (!text.includes('scripts/verify-release-candidate-manifest.mjs')) problems.push(`${name}: unified manifest verifier missing`);
  if (/for WORKFLOW in verify-/.test(text)) problems.push(`${name}: legacy hard-coded verification workflow list remains`);
}

for (const name of ['docs/RELEASING.md', 'docs/RELEASE_CANDIDATE_VERIFICATION.md']) {
  const text = await readFile(path.join(root, name), 'utf8');
  if (!text.includes('.github/release-gates.json')) problems.push(`${name}: authority reference missing`);
}

console.log(JSON.stringify({
  authority: '.github/release-gates.json',
  requiredCheckContext: authority.requiredCheckContext,
  gates: authority.gates.length,
  categories: [...new Set(authority.gates.map((gate) => gate.category))],
}, null, 2));
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('release-gate authority/wiring audit PASS');
