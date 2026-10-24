// Builds the Mastra side of the colony: one shared project workspace (files + sandboxed shell),
// twelve specialist agents and the PM supervisor that delegates to them.

import { join } from 'node:path';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { LocalFilesystem, LocalSandbox, WORKSPACE_TOOLS, Workspace } from '@mastra/core/workspace';
import { LibSQLStore } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { modelFor, PM, PM_ID, SPECIALISTS, type AgentSpec, type Mode } from './config.ts';
import { DATA_DIR, EFFORT, SANDBOX_NETWORK, WORKSPACE_DIR } from './env.ts';
import { ScriptedModel } from './mock-model.ts';
import { deployTool, mergeTool, planTool, prodDbTool, rotateKeysTool, testTool, type ToolSink } from './tools.ts';

// What the runtime wants to hear about while agents work.
export interface AgentHooks {
  toolStart(agent: string, tool: string, input: unknown): void;
  toolEnd(agent: string, tool: string, output: unknown, error: unknown): void;
  delegationStart(agent: string, prompt: string): void;
  delegationEnd(agent: string, ok: boolean, text: string, usage: unknown, error: unknown): void;
}

export type Isolation = 'none' | 'seatbelt' | 'bwrap';

function specialistInstructions(spec: AgentSpec): string {
  return [
    `You are ${spec.title} (agent id "${spec.id}") on the Ant Colony team. The PM (${PM_ID}) gives you one task at a time.`,
    'Work only inside the shared project workspace with your tools. Keep changes small and focused, and verify them: run the tests when the project has any.',
    spec.focus,
    'Risky actions (deploys, production database access, key rotation, merging to main) go through dedicated tools that pause for human approval. Never try to work around that, and do not retry a declined action.',
    'When you finish, reply with a short report: what you changed (file paths), how you verified it, and anything the PM must know. Use the language of the task.',
  ].join('\n\n');
}

function pmInstructions(): string {
  const team = SPECIALISTS.map((s) => `- ${s.id}: ${s.description}`).join('\n');
  return [
    `You are the PM (agent id "${PM_ID}") of the Ant Colony team. Turn the user's request into a short plan and get it done through your specialists; do not write code yourself.`,
    `Team:\n${team}`,
    [
      'How to work:',
      '1. First call update_plan with 2-6 concrete steps, each with an owner agent id.',
      '2. Delegate the steps one at a time. Each delegation prompt states the goal, the files involved, acceptance criteria, and what earlier steps produced.',
      '3. After each result, call update_plan again with updated statuses (todo / doing / done).',
      '4. If a step fails or an action is declined, decide whether to retry differently, skip it, or stop, and say so.',
      '5. Finish with a short summary for the user: what was built and where, how it was verified, and open risks.',
    ].join('\n'),
    "Reply in the user's language.",
  ].join('\n\n');
}

export function detectIsolation(): Isolation {
  const found = LocalSandbox.detectIsolation();
  return found.available ? (found.backend as Isolation) : 'none';
}

export function buildColony({ mode, sink, hooks }: { mode: Mode; sink: ToolSink; hooks: AgentHooks }) {
  const isolation = detectIsolation();
  const sandbox = new LocalSandbox({
    id: 'colony-sandbox',
    workingDirectory: WORKSPACE_DIR,
    isolation,
    nativeSandbox: { allowNetwork: SANDBOX_NETWORK },
    timeout: 120_000,
  });

  // Deletes always need a human; shell commands too when there is no OS sandbox to contain them.
  const readWrite = new Workspace({
    id: 'colony-workspace',
    filesystem: new LocalFilesystem({ basePath: WORKSPACE_DIR }),
    sandbox,
    tools: {
      [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: { requireApproval: true },
      [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: { requireApproval: isolation === 'none' },
    },
  });
  const readOnly = new Workspace({
    id: 'colony-workspace-readonly',
    filesystem: new LocalFilesystem({ basePath: WORKSPACE_DIR, readOnly: true }),
  });

  const model = (id: string) => (mode === 'mock' ? new ScriptedModel(id) : modelFor(id));
  // One memory for everyone: each delegation gets its own thread, so specialists keep a history
  // of their own tasks while the PM's thread holds the whole run.
  const storage = new LibSQLStore({ id: 'colony-mastra', url: `file:${join(DATA_DIR, 'agents.db')}` });
  const memory = new Memory({ storage });
  // Only Anthropic models read these; Claude Opus defaults to medium effort, so set it explicitly.
  const providerOptions = { anthropic: { effort: EFFORT } };

  const specialists = SPECIALISTS.map((spec) => {
    const caps = new Set(spec.capabilities);
    const tools = {
      ...(caps.has('tests') ? { run_tests: testTool(spec.id, sandbox, sink) } : {}),
      ...(caps.has('deploy') ? { deploy_staging: deployTool(spec.id) } : {}),
      ...(caps.has('merge') ? { merge_to_main: mergeTool(spec.id) } : {}),
      ...(caps.has('prodDb') ? { query_production_db: prodDbTool(spec.id) } : {}),
      ...(caps.has('rotateKeys') ? { rotate_api_keys: rotateKeysTool(spec.id) } : {}),
    };
    return new Agent({
      id: spec.id,
      name: spec.title,
      description: spec.description,
      instructions: specialistInstructions(spec),
      model: model(spec.id),
      workspace: caps.has('workspace') ? readWrite : caps.has('workspaceRead') ? readOnly : undefined,
      tools,
      memory,
      hooks: {
        beforeToolCall: ({ toolName, input }) => hooks.toolStart(spec.id, toolName, input),
        afterToolCall: ({ toolName, output, error }) => hooks.toolEnd(spec.id, toolName, output, error),
      },
      defaultOptions: { maxSteps: 25, providerOptions },
    });
  });

  const pm = new Agent({
    id: PM_ID,
    name: PM.title,
    description: PM.description,
    instructions: pmInstructions(),
    model: model(PM_ID),
    agents: Object.fromEntries(specialists.map((a) => [a.id, a])),
    tools: { update_plan: planTool(sink) },
    memory,
    // Set as defaults rather than per call so resumed runs (after an approval) keep the hooks.
    defaultOptions: {
      maxSteps: 40,
      providerOptions,
      delegation: {
        onDelegationStart: ({ primitiveId, prompt }) => {
          hooks.delegationStart(primitiveId, prompt);
          return { proceed: true };
        },
        onDelegationComplete: ({ primitiveId, success, result, error }) => {
          hooks.delegationEnd(primitiveId, success, result?.text ?? '', result?.usage, error);
        },
      },
    },
  });

  const mastra = new Mastra({
    agents: { [PM_ID]: pm, ...Object.fromEntries(specialists.map((a) => [a.id, a])) },
    storage,
  });

  return { pm, specialists, mastra, sandbox, isolation };
}
