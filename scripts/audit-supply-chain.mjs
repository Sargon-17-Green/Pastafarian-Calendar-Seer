import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const workflowDir = path.join(root, '.github', 'workflows');
const names = (await readdir(workflowDir)).filter((name) => /\.ya?ml$/i.test(name)).sort();
const shaRef = /^[0-9a-f]{40}$/;
const mutable = [];
const missingPermissions = [];
const broad = [];
const secretRefs = [];
const allowedWrites = new Map([
  ['release-container.yml', new Set(['packages', 'id-token', 'attestations'])],
  ['release-github-package.yml', new Set(['contents', 'packages', 'id-token', 'attestations'])],
  ['release-npm.yml', new Set(['id-token'])],
]);
let useCount = 0;

for (const name of names) {
  const text = await readFile(path.join(workflowDir, name), 'utf8');
  if (!/^permissions:\s*$/m.test(text)) missingPermissions.push(name);
  if (/\bwrite-all\b/.test(text)) broad.push(`${name}: write-all`);
  for (const line of text.split(/\r?\n/)) {
    const writePermission = line.match(/^\s+(contents|actions|packages|id-token|attestations|checks|issues|pull-requests):\s*write\s*$/);
    if (writePermission && !allowedWrites.get(name)?.has(writePermission[1])) {
      broad.push(`${name}: unexpected ${writePermission[1]}: write`);
    }
    const use = line.match(/\buses:\s*([^\s#]+)@([^\s#]+)/);
    if (use) {
      useCount += 1;
      if (!shaRef.test(use[2])) mutable.push(`${name}: ${use[1]}@${use[2]}`);
    }
    for (const match of line.matchAll(/secrets\.([A-Za-z0-9_]+)/g)) secretRefs.push(`${name}: ${match[1]}`);
  }
}

const forbiddenSecret = secretRefs.filter((x) => !x.endsWith(': SEER_AUTOMATION_TOKEN'));
const docker = await readFile(path.join(root, 'Dockerfile'), 'utf8');
const fromLines = docker.split(/\r?\n/).filter((line) => /^FROM\s+/i.test(line));
const mutableBase = fromLines.filter((line) => !/@sha256:[0-9a-f]{64}\b/.test(line));
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
const handoff = tracked.filter((name) => path.basename(name).startsWith('HANDOFF_'));

const problems = [
  ...mutable.map((x) => `mutable action reference: ${x}`),
  ...missingPermissions.map((x) => `missing explicit permissions: ${x}`),
  ...broad.map((x) => `broad permission: ${x}`),
  ...forbiddenSecret.map((x) => `unexpected secret reference: ${x}`),
  ...mutableBase.map((x) => `mutable Docker base: ${x}`),
  ...handoff.map((x) => `tracked HANDOFF file: ${x}`),
];

console.log(JSON.stringify({ workflows: names.length, actionUses: useCount, secretRefs, dockerBases: fromLines }, null, 2));
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('supply-chain static audit PASS');