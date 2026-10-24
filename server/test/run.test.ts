// End-to-end in mock mode: the scripted PM plans, delegates, the backend agent writes real files
// and runs real tests in the sandbox, and the deploy waits for a human decision.

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const dir = mkdtempSync(join(tmpdir(), 'colony-run-'));
process.env.ANT_DATA_DIR = join(dir, 'data');
process.env.ANT_WORKSPACE = join(dir, 'ws');
process.env.ANT_MOCK_DELAY_MS = '0';

const { Store } = await import('../src/store.ts');
const { Colony } = await import('../src/runtime.ts');
const { buildColony } = await import('../src/agents.ts');

const store = new Store(join(dir, 'data', 'colony.db'));
const colony = new Colony(store, 'mock');
const { pm, isolation } = buildColony({ mode: 'mock', sink: colony, hooks: colony });
colony.attach(pm, isolation);
const seen: Array<{ type: string; agent: string | null }> = [];
colony.subscribe((m) => {
  if (m.kind === 'event') seen.push({ type: m.event.type, agent: m.event.agent });
});

async function until(check: () => boolean, ms = 30_000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out waiting for the run');
    await new Promise((r) => setTimeout(r, 50));
  }
}

const deploys = () => {
  const log = join(dir, 'ws', '.colony', 'actions.log');
  return existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').length : 0;
};

test('a run stops at the deploy approval and finishes once approved', async () => {
  const run = colony.submit('Сделай health-эндпоинт');
  await until(() => store.pendingApprovals().length === 1);

  const approval = store.pendingApprovals()[0];
  assert.equal(approval.tool, 'deploy_staging');
  assert.equal(approval.agent, 'devops_01');
  assert.equal(store.run(run.id)?.status, 'waiting');
  assert.ok(seen.some((e) => e.type === 'TASK_ASSIGNED' && e.agent === 'backend_01'));
  assert.ok(seen.some((e) => e.type === 'TEST_PASSED'), 'the generated tests should pass in the sandbox');
  assert.ok(existsSync(join(dir, 'ws', 'app', 'health.js')));
  assert.equal(deploys(), 0, 'nothing is deployed before approval');

  await colony.decide(approval.id, true, null);
  await until(() => store.run(run.id)?.status === 'completed');
  assert.equal(deploys(), 1);
  assert.ok(seen.some((e) => e.type === 'TOOL_APPROVED'));
  assert.ok(colony.snapshot().plan.every((i) => i.status === 'done'));
  assert.ok([...colony.agents.values()].every((a) => a.status === 'idle'));
});

test('a declined deploy never runs and the run still completes', async () => {
  const run = colony.submit('Ещё раз, но деплой отклоню');
  await until(() => store.pendingApprovals().length === 1);
  await colony.decide(store.pendingApprovals()[0].id, false, 'not today');
  await until(() => store.run(run.id)?.status === 'completed');
  assert.equal(deploys(), 1, 'the declined deploy must not reach the log');
  assert.ok(seen.some((e) => e.type === 'TOOL_DENIED'));
});

test('a decision on an already decided approval is refused', async () => {
  const decided = store.runs(undefined, 1)[0];
  const old = store.eventsAfter(0).find((e) => e.type === 'TOOL_DENIED' && e.run === decided.id);
  await assert.rejects(() => colony.decide(String(old?.data.approvalId), true, null), /already denied/);
});
