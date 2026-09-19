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
  ['precompute-seer-cache.yml', new Set(['contents'])],
]);
let useCount = 0;
let qemuUses = 0;
let qemuDigestPins = 0;
let buildxUses = 0;
let buildxVersionPins = 0;
let sbomUses = 0;
let syftVersionPins = 0;
let trivyUses = 0;
let trivyVersionPins = 0;
let trivyReusePins = 0;

for (const name of names) {
  const text = await readFile(path.join(workflowDir, name), 'utf8');
  if (!/^permissions:\s*$/m.test(text)) missingPermissions.push(name);
  if (/\bwrite-all\b/.test(text)) broad.push(`${name}: write-all`);
  qemuUses += (text.match(/docker\/setup-qemu-action@/g) ?? []).length;
  qemuDigestPins += (text.match(/image:\s*docker\.io\/tonistiigi\/binfmt:[^\s]+@sha256:[0-9a-f]{64}\b/g) ?? []).length;
  buildxUses += (text.match(/docker\/setup-buildx-action@/g) ?? []).length;
  buildxVersionPins += (text.match(/^\s+version:\s*v0\.37\.1\s*$/gm) ?? []).length;
  sbomUses += (text.match(/anchore\/sbom-action@/g) ?? []).length;
  syftVersionPins += (text.match(/^\s+syft-version:\s*v\d+\.\d+\.\d+\s*$/gm) ?? []).length;
  trivyUses += (text.match(/aquasecurity\/trivy-action@/g) ?? []).length;
  trivyVersionPins += (text.match(/^\s+version:\s*v0\.70\.0\s*$/gm) ?? []).length;
  trivyReusePins += (text.match(/^\s+skip-setup-trivy:\s*true\s*$/gm) ?? []).length;
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

const forbiddenSecret = [...secretRefs];
const docker = await readFile(path.join(root, 'Dockerfile'), 'utf8');
const fromLines = docker.split(/\r?\n/).filter((line) => /^FROM\s+/i.test(line));
const mutableBase = fromLines.filter((line) => !/@sha256:[0-9a-f]{64}\b/.test(line));
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
const handoff = tracked.filter((name) => path.basename(name).startsWith('HANDOFF_'));
const trackedRollingData = tracked.filter((name) => name === 'generated' || name.startsWith('generated/'));
const cacheWorkflowText = await readFile(path.join(workflowDir, 'precompute-seer-cache.yml'), 'utf8');
const cacheWorkflowProblems = [];
if (/SEER_AUTOMATION_TOKEN|\[skip ci\]/i.test(cacheWorkflowText)) cacheWorkflowProblems.push('legacy cache credential or skip-ci marker remains');
if (/BEGIN GENERATED VENUS BOUNDARIES|rewriteGeneratedSchedule/.test(cacheWorkflowText)) cacheWorkflowProblems.push('self-modifying cache schedule remains');
if (/git\s+push[^\r\n]*(?:main|DEFAULT_BRANCH)/i.test(cacheWorkflowText)) cacheWorkflowProblems.push('cache workflow pushes source/default branch');

const runtimeToolProblems = [];
if (qemuDigestPins !== qemuUses) runtimeToolProblems.push(`QEMU binfmt digest pins ${qemuDigestPins}/${qemuUses}`);
if (buildxVersionPins < buildxUses) runtimeToolProblems.push(`Buildx version pins ${buildxVersionPins}/${buildxUses}`);
if (syftVersionPins !== sbomUses) runtimeToolProblems.push(`Syft version pins ${syftVersionPins}/${sbomUses}`);
if (trivyVersionPins + trivyReusePins !== trivyUses) runtimeToolProblems.push(`Trivy setup/reuse pins ${trivyVersionPins}+${trivyReusePins}/${trivyUses}`);

const problems = [
  ...mutable.map((x) => `mutable action reference: ${x}`),
  ...missingPermissions.map((x) => `missing explicit permissions: ${x}`),
  ...broad.map((x) => `broad permission: ${x}`),
  ...forbiddenSecret.map((x) => `unexpected secret reference: ${x}`),
  ...mutableBase.map((x) => `mutable Docker base: ${x}`),
  ...runtimeToolProblems.map((x) => `mutable runtime tool dependency: ${x}`),
  ...handoff.map((x) => `tracked HANDOFF file: ${x}`),
  ...trackedRollingData.map((x) => `tracked rolling cache data: ${x}`),
  ...cacheWorkflowProblems.map((x) => `cache architecture violation: ${x}`),
];

console.log(JSON.stringify({ workflows: names.length, actionUses: useCount, secretRefs, dockerBases: fromLines, runtimeTools: { qemuUses, qemuDigestPins, buildxUses, buildxVersionPins, sbomUses, syftVersionPins, trivyUses, trivyVersionPins, trivyReusePins } }, null, 2));
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('supply-chain static audit PASS');