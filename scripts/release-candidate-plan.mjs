import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const authorityPath = path.join(root, '.github', 'release-gates.json');
const authority = JSON.parse(await readFile(authorityPath, 'utf8'));

const args = process.argv.slice(2);
function value(flag, fallback = null) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : fallback;
}
const sha = value('--sha', process.env.GITHUB_SHA);
const output = value('--output', path.join(process.cwd(), 'release-candidate-plan.json'));
const forceAll = args.includes('--force-all') || process.env.FORCE_ALL === 'true';

if (!/^[0-9a-f]{40}$/i.test(sha ?? '')) throw new Error(`invalid candidate SHA: ${sha ?? '<missing>'}`);
if (!process.env.GH_TOKEN && !forceAll) throw new Error('GH_TOKEN is required to discover reusable exact-head runs');

const activeStatuses = new Set(['queued', 'in_progress', 'waiting', 'pending', 'requested']);
const plan = {
  schemaVersion: 1,
  repository: process.env.GITHUB_REPOSITORY ?? null,
  candidateSha: sha,
  forceAll,
  gates: [],
};

for (const gate of authority.gates) {
  let selection = null;
  if (!forceAll) {
    const raw = execFileSync('gh', [
      'run', 'list',
      '--workflow', gate.workflow,
      '--commit', sha,
      '--limit', '100',
      '--json', 'databaseId,headSha,status,conclusion,event,createdAt,workflowName',
    ], { cwd: root, encoding: 'utf8' });
    const runs = JSON.parse(raw).filter((run) => run.headSha === sha);
    const successful = runs.find((run) => run.status === 'completed' && run.conclusion === 'success');
    const active = runs.find((run) => activeStatuses.has(run.status));
    const run = successful ?? active;
    if (run) {
      selection = {
        mode: 'reuse',
        runId: run.databaseId,
        statusAtPlan: run.status,
        conclusionAtPlan: run.conclusion ?? null,
        event: run.event ?? null,
        createdAt: run.createdAt ?? null,
        workflowName: run.workflowName ?? null,
      };
    }
  }
  plan.gates.push({
    id: gate.id,
    workflow: gate.workflow,
    job: gate.job,
    mode: selection ? 'reuse' : 'execute',
    ...(selection ?? {}),
  });
}

await writeFile(output, `${JSON.stringify(plan, null, 2)}\n`);
const outputLines = [];
for (const item of plan.gates) outputLines.push(`${item.id}_reuse=${item.mode === 'reuse'}`);
outputLines.push(`plan_b64=${Buffer.from(JSON.stringify(plan), 'utf8').toString('base64')}`);
if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `${outputLines.join('\n')}\n`, { flag: 'a' });

for (const item of plan.gates) {
  console.log(`${item.mode === 'reuse' ? 'REUSE' : 'EXECUTE'} ${item.id}${item.runId ? ` run=${item.runId}` : ''}`);
}
console.log(`release-candidate plan written to ${output}`);
