// Colony-specific tools. File and shell access come from the Mastra workspace; these add the PM's
// plan, a test runner that reports results to the office, and the risky actions that must wait for
// a human. The risky ones are simulations for now: they append to .colony/actions.log in the
// workspace instead of touching real infrastructure. Swap their execute() for real integrations.

import { appendFileSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { createTool } from '@mastra/core/tools';
import type { LocalSandbox } from '@mastra/core/workspace';
import { z } from 'zod';
import { WORKSPACE_DIR } from './env.ts';

export type PlanStatus = 'todo' | 'doing' | 'done';
export interface PlanItem {
  title: string;
  owner: string;
  status: PlanStatus;
}

export interface TestResult {
  passed: boolean;
  tests: number;
  pass: number;
  fail: number;
  output: string;
}

// Where tools report things the office should show.
export interface ToolSink {
  plan(items: PlanItem[]): void;
  testStarted(agent: string, command: string): void;
  testFinished(agent: string, result: TestResult): void;
}

export function planTool(sink: ToolSink) {
  return createTool({
    id: 'update_plan',
    description:
      'Publish or update the team plan shown on the office board. Send the full list every time: 2-6 concrete steps, each with the owner agent id and its status.',
    inputSchema: z.object({
      items: z
        .array(
          z.object({
            title: z.string().describe('What gets done, in a few words'),
            owner: z.string().describe('Agent id responsible for the step, e.g. backend_01'),
            status: z.enum(['todo', 'doing', 'done']),
          }),
        )
        .min(1)
        .max(12),
    }),
    execute: async ({ items }) => {
      sink.plan(items);
      return { ok: true, steps: items.length };
    },
  });
}

const tail = (s: string, n = 3000) => (s.length > n ? '…' + s.slice(-n) : s);

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function parseTestSummary(output: string): Pick<TestResult, 'tests' | 'pass' | 'fail'> {
  const pick = (name: string) => {
    const m = output.match(new RegExp(`(?:^|\\n)\\s*(?:#|ℹ)\\s*${name}\\s+(\\d+)`));
    return m ? Number(m[1]) : 0;
  };
  return { tests: pick('tests'), pass: pick('pass'), fail: pick('fail') };
}

export function testTool(agent: string, sandbox: LocalSandbox, sink: ToolSink) {
  return createTool({
    id: 'run_tests',
    description:
      'Run the project tests with the Node test runner (files named *.test.js / *.test.mjs or under test/). Optionally pass paths to run a subset. Returns pass/fail counts and the tail of the output.',
    inputSchema: z.object({
      paths: z.array(z.string()).optional().describe('Test files or folders relative to the workspace root'),
    }),
    execute: async ({ paths }) => {
      const outside = (paths ?? []).find((p) => !resolve(WORKSPACE_DIR, p).startsWith(WORKSPACE_DIR + sep) && resolve(WORKSPACE_DIR, p) !== WORKSPACE_DIR);
      if (outside) return { passed: false, tests: 0, pass: 0, fail: 0, output: `Path is outside the workspace: ${outside}` };
      // node --test takes files or globs, not folders, so expand folders into test globs
      const targets = (paths ?? []).map((p) => (isDir(join(WORKSPACE_DIR, p)) ? `${p.replace(/\/+$/, '')}/**/*.test.?(c|m)js` : p));
      const args = ['--test', '--test-reporter=tap', ...targets];
      sink.testStarted(agent, `node ${args.join(' ')}`);
      let result: TestResult;
      try {
        if (!sandbox.executeCommand) throw new Error('sandbox cannot run commands');
        const r = await sandbox.executeCommand('node', args, { timeout: 120_000 });
        const output = `${r.stdout ?? ''}${r.stderr ? `\n${r.stderr}` : ''}`;
        const counts = parseTestSummary(output);
        result = { passed: r.exitCode === 0 && counts.fail === 0, ...counts, output: tail(output) };
      } catch (err) {
        result = { passed: false, tests: 0, pass: 0, fail: 0, output: `Test run failed to start: ${(err as Error).message}` };
      }
      sink.testFinished(agent, result);
      return result;
    },
  });
}

// ---- risky actions (approval required) ----

function logAction(action: string, agent: string, details: Record<string, unknown>) {
  const dir = join(WORKSPACE_DIR, '.colony');
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'actions.log'), JSON.stringify({ at: new Date().toISOString(), action, agent, ...details }) + '\n');
}

export function deployTool(agent: string) {
  return createTool({
    id: 'deploy_staging',
    description: 'Deploy a service to the staging environment. Pauses until a human approves. Only use after tests pass.',
    inputSchema: z.object({
      service: z.string(),
      version: z.string().optional(),
      notes: z.string().optional(),
    }),
    requireApproval: true,
    execute: async (input) => {
      logAction('deploy_staging', agent, input);
      return { deployed: true, simulated: true, url: `https://staging.local/${encodeURIComponent(input.service)}` };
    },
  });
}

export function mergeTool(agent: string) {
  return createTool({
    id: 'merge_to_main',
    description: 'Merge a finished branch into main. Pauses until a human approves.',
    inputSchema: z.object({ branch: z.string(), summary: z.string() }),
    requireApproval: true,
    execute: async (input) => {
      logAction('merge_to_main', agent, input);
      return { merged: true, simulated: true };
    },
  });
}

export function prodDbTool(agent: string) {
  return createTool({
    id: 'query_production_db',
    description: 'Run a read-only SQL query against the production database replica. Pauses until a human approves. SELECT only.',
    inputSchema: z.object({ sql: z.string(), reason: z.string() }),
    requireApproval: true,
    execute: async (input) => {
      if (!/^\s*select\b/i.test(input.sql)) return { ok: false, error: 'Only SELECT queries are allowed.' };
      logAction('query_production_db', agent, input);
      return { ok: true, simulated: true, rows: [] };
    },
  });
}

export function rotateKeysTool(agent: string) {
  return createTool({
    id: 'rotate_api_keys',
    description: 'Rotate the API keys of a service and revoke the old ones. Pauses until a human approves.',
    inputSchema: z.object({ service: z.string(), reason: z.string() }),
    requireApproval: true,
    execute: async (input) => {
      logAction('rotate_api_keys', agent, input);
      return { rotated: true, simulated: true };
    },
  });
}

// Human-readable title for an approval card.
export function approvalTitle(tool: string, args: Record<string, unknown>): string {
  const s = (k: string) => String(args[k] ?? '').slice(0, 60);
  switch (tool) {
    case 'deploy_staging':
      return `Deploy ${s('service')} to staging`;
    case 'merge_to_main':
      return `Merge ${s('branch')} into main`;
    case 'query_production_db':
      return 'Access production DB';
    case 'rotate_api_keys':
      return `Rotate API keys: ${s('service')}`;
    case 'mastra_workspace_delete':
      return `Delete ${s('path')}`;
    case 'mastra_workspace_execute_command':
      return `Run: ${s('command')}`;
    default:
      return tool;
  }
}
