import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('Docker healthcheck is pure liveness with short independent deadlines', async () => {
  const dockerfile = await readFile(path.join(root, 'Dockerfile'), 'utf8');
  const health = dockerfile.split('HEALTHCHECK')[1]?.split('CMD ["node", "node_modules')[0] ?? '';
  assert.match(health, /_health\/live/);
  assert.doesNotMatch(health, /\/v1\/status|\/v1\/date|\/v1\/now/);
  assert.match(health, /--timeout=3s/);
  assert.match(health, /AbortSignal\.timeout\(1500\)/);
});

test('container smoke separates liveness, readiness, public status and exact work', async () => {
  const workflow = await readFile(path.join(root, '.github', 'workflows', 'release-container.yml'), 'utf8');
  assert.match(workflow, /_health\/live/);
  assert.match(workflow, /_health\/ready/);
  assert.match(workflow, /\/v1\/status/);
  assert.match(workflow, /\/v1\/date/);
  const livePos = workflow.indexOf('/_health/live');
  const readyPos = workflow.indexOf('/_health/ready');
  const exactPos = workflow.indexOf('/v1/date', readyPos);
  assert.ok(livePos >= 0 && readyPos > livePos && exactPos > readyPos);
  assert.match(workflow, /status\['status'\] in \('ok', 'degraded'\)/);
});
