import assert from 'node:assert/strict';
import { test } from 'node:test';
import { approvalTitle, parseTestSummary } from '../src/tools.ts';

test('reads counts from the TAP reporter', () => {
  const out = 'TAP version 13\nok 1 - a\nnot ok 2 - b\n1..2\n# tests 2\n# suites 0\n# pass 1\n# fail 1\n';
  assert.deepEqual(parseTestSummary(out), { tests: 2, pass: 1, fail: 1 });
});

test('reads counts from the spec reporter', () => {
  const out = '✔ a (0.5ms)\nℹ tests 3\nℹ pass 3\nℹ fail 0\n';
  assert.deepEqual(parseTestSummary(out), { tests: 3, pass: 3, fail: 0 });
});

test('approval titles name the action and its target', () => {
  assert.equal(approvalTitle('deploy_staging', { service: 'health' }), 'Deploy health to staging');
  assert.equal(approvalTitle('merge_to_main', { branch: 'feat/x' }), 'Merge feat/x into main');
  assert.equal(approvalTitle('mastra_workspace_delete', { path: 'app' }), 'Delete app');
});
