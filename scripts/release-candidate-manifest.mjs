import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
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
const planB64 = value('--plan-b64', process.env.PLAN_B64);
const resultsRaw = value('--results-json', process.env.GATE_RESULTS_JSON ?? '{}');
const output = value('--output', authority.manifestFilename);
if (!/^[0-9a-f]{40}$/i.test(sha ?? '')) throw new Error(`invalid candidate SHA: ${sha ?? '<missing>'}`);
if (!planB64) throw new Error('missing release-candidate plan');
const plan = JSON.parse(Buffer.from(planB64, 'base64').toString('utf8'));
if (plan.candidateSha !== sha) throw new Error(`plan SHA ${plan.candidateSha} != candidate SHA ${sha}`);
const results = JSON.parse(resultsRaw);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pollMs = Number(process.env.SEER_RC_REUSE_POLL_MS ?? 20000);
const maxSeconds = Number(process.env.SEER_RC_REUSE_WAIT_SECONDS ?? 18000);

function viewRun(runId) {
  const raw = execFileSync('gh', [
    'run', 'view', String(runId),
    '--json', 'databaseId,headSha,status,conclusion,event,workflowName,url',
  ], { cwd: root, encoding: 'utf8' });
  return JSON.parse(raw);
}

const manifestGates = [];
for (const gate of authority.gates) {
  const planned = plan.gates.find((item) => item.id === gate.id);
  if (!planned) throw new Error(`plan omitted gate ${gate.id}`);
  let status = 'failure';
  let evidence;
  let detail = null;

  if (planned.mode === 'reuse') {
    if (!process.env.GH_TOKEN) throw new Error('GH_TOKEN is required to validate reused exact-head runs');
    const deadline = Date.now() + maxSeconds * 1000;
    let run;
    for (;;) {
      run = viewRun(planned.runId);
      if (run.headSha !== sha) throw new Error(`reused ${gate.id} run ${run.databaseId} has SHA ${run.headSha}, expected ${sha}`);
      if (run.status === 'completed') break;
      if (Date.now() >= deadline) throw new Error(`timed out waiting for reused ${gate.id} run ${run.databaseId}`);
      await sleep(pollMs);
    }
    status = run.conclusion === 'success' ? 'success' : 'failure';
    detail = status === 'success' ? null : `reused run concluded ${run.conclusion ?? '<none>'}`;
    evidence = {
      kind: 'existing-exact-head-workflow-run',
      runId: run.databaseId,
      workflowName: run.workflowName ?? null,
      event: run.event ?? null,
      url: run.url ?? null,
    };
  } else if (planned.mode === 'execute') {
    const result = results[gate.job]?.result ?? null;
    status = result === 'success' ? 'success' : 'failure';
    detail = status === 'success' ? null : `orchestrated reusable workflow result: ${result ?? '<missing>'}`;
    evidence = {
      kind: 'orchestrated-reusable-workflow',
      orchestratorRunId: process.env.GITHUB_RUN_ID ?? null,
      job: gate.job,
    };
  } else {
    throw new Error(`unsupported plan mode ${planned.mode} for ${gate.id}`);
  }

  manifestGates.push({
    ...gate,
    status,
    evidence,
    ...(detail ? { detail } : {}),
  });
}

const allPassed = manifestGates.every((gate) => gate.status === 'success');
const manifest = {
  schemaVersion: 1,
  repository: process.env.GITHUB_REPOSITORY ?? plan.repository ?? null,
  candidateSha: sha,
  ref: process.env.GITHUB_REF ?? null,
  generatedAt: new Date().toISOString(),
  orchestrator: {
    workflow: authority.orchestratorWorkflow,
    runId: process.env.GITHUB_RUN_ID ?? null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
  },
  authority: {
    path: '.github/release-gates.json',
    sha256: authoritySha256,
  },
  allPassed,
  gates: manifestGates,
};

await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({
  candidateSha: manifest.candidateSha,
  authoritySha256,
  allPassed,
  gates: manifestGates.map(({ id, status }) => ({ id, status })),
}, null, 2));
