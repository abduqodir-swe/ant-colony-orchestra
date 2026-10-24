import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Store } from '../src/store.ts';

const fresh = () => new Store(join(mkdtempSync(join(tmpdir(), 'colony-store-')), 'colony.db'));

test('events are append-only and replayable after an id', () => {
  const s = fresh();
  const a = s.addEvent('RUN_STARTED', 'pm_lead', 'r1', { task: 'x' });
  const b = s.addEvent('TASK_ASSIGNED', 'backend_01', 'r1', { prompt: 'y' });
  assert.equal(b.id, a.id + 1);
  assert.deepEqual(s.eventsAfter(a.id).map((e) => e.type), ['TASK_ASSIGNED']);
  assert.deepEqual(s.recentEvents(1)[0].data, { prompt: 'y' });
  assert.equal(s.lastOf('RUN_STARTED')?.data.task, 'x');
  assert.equal(s.countEvents(['RUN_STARTED', 'TASK_ASSIGNED']), 2);
});

test('runs move through statuses and get a finish time', () => {
  const s = fresh();
  s.createRun('r1', 'build it');
  s.updateRun('r1', { status: 'running', mastraRunId: 'm1' });
  assert.equal(s.run('r1')?.finishedAt, null);
  s.updateRun('r1', { status: 'completed', summary: 'done' });
  const r = s.run('r1');
  assert.equal(r?.status, 'completed');
  assert.equal(r?.mastraRunId, 'm1');
  assert.equal(r?.summary, 'done');
  assert.ok(r?.finishedAt);
});

test('an approval can be decided once', () => {
  const s = fresh();
  s.addApproval({ id: 'a1', run: 'r1', mastraRunId: 'm1', toolCallId: 't1', agent: 'devops_01', tool: 'deploy_staging', title: 'Deploy', args: { service: 'x' } });
  assert.equal(s.pendingApprovals().length, 1);
  s.decideApproval('a1', 'approved', null);
  s.decideApproval('a1', 'denied', 'too late');
  assert.equal(s.approval('a1')?.status, 'approved');
  assert.equal(s.pendingApprovals().length, 0);
});
