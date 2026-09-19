import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const authorityPath = path.join(root, '.github', 'release-gates.json');
const authorityRaw = await readFile(authorityPath);
const authority = JSON.parse(authorityRaw.toString('utf8'));
const authoritySha256 = createHash('sha256').update(authorityRaw).digest('hex');
const args = process.argv.slice(2);

function value(flag, fallback = null) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : fallback;
}
const sha = value('--sha', process.env.GITHUB_SHA);
const explicitManifest = value('--manifest');
const requestedDir = value('--download-dir');
if (!/^[0-9a-f]{40}$/i.test(sha ?? '')) throw new Error(`invalid candidate SHA: ${sha ?? '<missing>'}`);

function validate(manifest, expectedRunId = null) {
  const problems = [];
  if (manifest.schemaVersion !== 1) problems.push(`unsupported manifest schema ${manifest.schemaVersion}`);
  if (manifest.candidateSha !== sha) problems.push(`manifest SHA ${manifest.candidateSha} != ${sha}`);
  if (process.env.GITHUB_REPOSITORY && manifest.repository !== process.env.GITHUB_REPOSITORY) {
    problems.push(`repository ${manifest.repository} != ${process.env.GITHUB_REPOSITORY}`);
  }
  if (manifest.authority?.path !== '.github/release-gates.json') problems.push('authority path mismatch');
  if (manifest.authority?.sha256 !== authoritySha256) problems.push('authority digest mismatch');
  if (manifest.allPassed !== true) problems.push('manifest allPassed is not true');
  if (expectedRunId !== null && String(manifest.orchestrator?.runId) !== String(expectedRunId)) {
    problems.push(`orchestrator run ${manifest.orchestrator?.runId} != downloaded run ${expectedRunId}`);
  }

  const expected = new Map(authority.gates.map((gate) => [gate.id, gate]));
  const actual = new Map((manifest.gates ?? []).map((gate) => [gate.id, gate]));
  if (actual.size !== expected.size) problems.push(`gate count ${actual.size} != ${expected.size}`);
  for (const [id, gate] of expected) {
    const item = actual.get(id);
    if (!item) { problems.push(`missing gate ${id}`); continue; }
    for (const key of ['category', 'workflow', 'job', 'name', 'required']) {
      if (item[key] !== gate[key]) problems.push(`${id}.${key} does not match authority`);
    }
    if (item.status !== 'success') problems.push(`${id} status ${item.status ?? '<missing>'} != success`);
  }
  for (const id of actual.keys()) if (!expected.has(id)) problems.push(`unexpected gate ${id}`);
  if (problems.length) throw new Error(problems.join('\n'));
}

async function findManifest(dir) {
  const wanted = authority.manifestFilename;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === wanted) return full;
    }
  }
  throw new Error(`${wanted} not found under ${dir}`);
}

if (explicitManifest) {
  const manifest = JSON.parse(await readFile(explicitManifest, 'utf8'));
  validate(manifest);
  console.log(`release-candidate manifest PASS for ${sha}`);
  process.exit(0);
}
if (!process.env.GH_TOKEN) throw new Error('GH_TOKEN is required to retrieve the release-candidate manifest');

const workflow = path.basename(authority.orchestratorWorkflow);
const raw = execFileSync('gh', [
  'run', 'list',
  '--workflow', workflow,
  '--commit', sha,
  '--limit', '100',
  '--json', 'databaseId,headSha,status,conclusion,event,createdAt,url',
], { cwd: root, encoding: 'utf8' });
const runs = JSON.parse(raw).filter((run) =>
  run.headSha === sha &&
  run.status === 'completed' &&
  run.conclusion === 'success' &&
  ['workflow_dispatch', 'workflow_call'].includes(run.event)
);
if (!runs.length) throw new Error(`no successful unified release-candidate run for exact SHA ${sha}`);

const baseDir = requestedDir ?? await mkdtemp(path.join(os.tmpdir(), 'seer-rc-'));
let lastError = null;
for (const run of runs) {
  const runDir = path.join(baseDir, String(run.databaseId));
  try {
    execFileSync('gh', [
      'run', 'download', String(run.databaseId),
      '--name', `${authority.artifactNamePrefix}${sha}`,
      '--dir', runDir,
    ], { cwd: root, stdio: 'inherit' });
    const manifestPath = await findManifest(runDir);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    validate(manifest, run.databaseId);
    console.log(`release-candidate manifest PASS for ${sha}; run ${run.databaseId}`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.error(`candidate run ${run.databaseId} rejected: ${error.message}`);
  }
}
if (!requestedDir) await rm(baseDir, { recursive: true, force: true });
throw new Error(`no valid unified release-candidate manifest for exact SHA ${sha}: ${lastError?.message ?? 'unknown error'}`);
