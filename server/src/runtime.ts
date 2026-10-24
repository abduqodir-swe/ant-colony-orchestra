// The colony runtime: queues tasks for the PM, turns Mastra stream chunks and agent hooks into
// office events (stored in SQLite, pushed over SSE), and pauses runs on approval-gated tools until
// a human decides.

import { randomUUID } from 'node:crypto';
import type { Agent } from '@mastra/core/agent';
import type { AgentHooks, Isolation } from './agents.ts';
import { modelFor, PM_ID, providerOf, ROSTER, type Mode, type Status } from './config.ts';
import type { Approval, ColonyEvent, Run, Store } from './store.ts';
import { approvalTitle, type PlanItem, type TestResult, type ToolSink } from './tools.ts';

export interface LiveAgent {
  id: string;
  role: string;
  title: string;
  model: string;
  provider: string;
  status: Status;
  task: string | null;
  subtask: string | null;
  progress: number;
  lastEvent: string | null;
  startedAt: string | null;
  tokens: number;
  toolCalls: number;
}

export type Outgoing =
  | { kind: 'event'; event: ColonyEvent; state?: LiveAgent }
  | { kind: 'system'; data: Record<string, unknown> };

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Workspace tools are noisy to read with their prefix; tools that report on their own are skipped.
const QUIET_TOOLS = new Set(['update_plan', 'run_tests']);
const shortTool = (t: string) => t.replace(/^mastra_workspace_/, '');
const firstLine = (s: string, n = 120) => {
  const line = s.split('\n').find((l) => l.trim()) ?? '';
  return line.length > n ? `${line.slice(0, n - 1)}…` : line;
};

function describeTool(tool: string, input: unknown): string {
  const a = (input ?? {}) as Record<string, unknown>;
  const name = shortTool(tool);
  const target = a.path ?? a.pattern ?? a.command ?? a.service ?? a.branch;
  return target ? `${name} ${String(target).slice(0, 80)}` : name;
}

function usageTokens(u: unknown): number {
  const x = (u ?? {}) as { totalTokens?: number; inputTokens?: number; outputTokens?: number };
  return x.totalTokens ?? (x.inputTokens ?? 0) + (x.outputTokens ?? 0);
}

export class Colony implements ToolSink, AgentHooks {
  readonly mode: Mode;
  readonly agents = new Map<string, LiveAgent>();
  planItems: PlanItem[] = [];
  isolation: Isolation = 'none';

  private store: Store;
  private pm: Agent | null = null;
  private queue: string[] = [];
  private current: string | null = null;
  private delegated: string | null = null;
  private aborts = new Map<string, AbortController>();
  private listeners = new Set<(m: Outgoing) => void>();
  private tokenLog: Array<[number, number]> = [];
  private toolLabels = new Map<string, string>();

  constructor(store: Store, mode: Mode) {
    this.store = store;
    this.mode = mode;
    for (const spec of ROSTER) {
      const model = modelFor(spec.id);
      this.agents.set(spec.id, {
        id: spec.id,
        role: spec.role,
        title: spec.title,
        model: mode === 'mock' ? `mock (${model})` : model,
        provider: mode === 'mock' ? 'mock' : providerOf(model),
        status: 'idle',
        task: null,
        subtask: null,
        progress: 0,
        lastEvent: null,
        startedAt: null,
        tokens: 0,
        toolCalls: 0,
      });
    }
  }

  attach(pm: Agent, isolation: Isolation) {
    this.pm = pm;
    this.isolation = isolation;
  }

  // ---- fan-out ----

  subscribe(fn: (m: Outgoing) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  broadcast(m: Outgoing) {
    for (const fn of this.listeners) fn(m);
  }

  private emit(type: string, agent: string | null, data: Record<string, unknown> = {}, run = this.current) {
    const event = this.store.addEvent(type, agent, run, data);
    const state = agent ? this.agents.get(agent) : undefined;
    if (state) state.lastEvent = type;
    this.broadcast({ kind: 'event', event, state: state ? { ...state } : undefined });
    return event;
  }

  private patch(id: string, p: Partial<LiveAgent>) {
    const a = this.agents.get(id);
    if (a) Object.assign(a, p);
  }

  private busyStatus(id: string): Status {
    return ROSTER.find((s) => s.id === id)?.busy ?? 'working';
  }

  private addTokens(agent: string, n: number) {
    if (!n) return;
    const a = this.agents.get(agent);
    if (a) a.tokens += n;
    this.tokenLog.push([Date.now(), n]);
  }

  tokensPerMinute(): number {
    const since = Date.now() - 60_000;
    this.tokenLog = this.tokenLog.filter(([t]) => t >= since);
    return this.tokenLog.reduce((s, [, n]) => s + n, 0);
  }

  // ---- tasks ----

  submit(task: string): Run {
    const text = task.trim();
    if (!text) throw new HttpError(400, 'Task text is empty');
    if (text.length > 4000) throw new HttpError(400, 'Task text is too long (4000 characters max)');
    const run = this.store.createRun(randomUUID(), text);
    this.queue.push(run.id);
    this.emit('TASK_QUEUED', PM_ID, { task: text, position: this.queue.length }, run.id);
    void this.pump();
    return run;
  }

  cancel(runId: string) {
    const run = this.store.run(runId);
    if (!run) throw new HttpError(404, 'No such run');
    if (run.status === 'queued') {
      this.queue = this.queue.filter((id) => id !== runId);
      this.store.updateRun(runId, { status: 'cancelled' });
      this.emit('RUN_CANCELLED', PM_ID, {}, runId);
      return;
    }
    if (run.status === 'waiting') {
      for (const a of this.store.pendingApprovals(runId)) this.store.decideApproval(a.id, 'expired', 'run cancelled');
      this.finishRun(runId, 'cancelled', null);
      return;
    }
    if (run.status === 'running') {
      this.aborts.get(runId)?.abort();
      return;
    }
    throw new HttpError(409, `Run is already ${run.status}`);
  }

  private async pump() {
    if (this.current || !this.pm) return;
    const id = this.queue.shift();
    if (!id) return;
    const run = this.store.run(id);
    if (!run) return void this.pump();
    this.current = id;
    this.store.updateRun(id, { status: 'running' });
    this.emit('RUN_STARTED', PM_ID, { task: run.task });
    this.patch(PM_ID, { status: 'planning', task: firstLine(run.task), subtask: 'Планирует', progress: 5, startedAt: new Date().toISOString(), toolCalls: 0 });
    this.emit('AGENT_STATE_CHANGED', PM_ID, { status: 'planning' });
    const abort = new AbortController();
    this.aborts.set(id, abort);
    try {
      const stream = await this.pm.stream(run.task, { memory: { thread: id, resource: 'colony' }, abortSignal: abort.signal });
      this.store.updateRun(id, { mastraRunId: stream.runId });
      await this.consume(id, stream);
    } catch (err) {
      this.failRun(id, err);
    }
  }

  // Reads one PM stream to its end: the run either finishes or stops at an approval.
  private async consume(runId: string, stream: { runId: string; fullStream: AsyncIterable<{ type: string; payload?: unknown }> }) {
    let text = '';
    let waiting = false;
    for await (const chunk of stream.fullStream) {
      const p = (chunk.payload ?? {}) as Record<string, any>;
      switch (chunk.type) {
        case 'text-delta':
          text += p.text ?? '';
          break;
        case 'step-finish':
          this.addTokens(PM_ID, usageTokens(p.output?.usage));
          break;
        case 'tool-call-approval':
          waiting = true;
          this.requestApproval(runId, stream.runId, p.toolCallId, p.toolName, p.args ?? {});
          break;
        case 'error':
          throw p.error instanceof Error ? p.error : new Error(String(p.error ?? 'stream error'));
        case 'abort':
          this.finishRun(runId, 'cancelled', null);
          return;
      }
    }
    if (waiting) {
      this.store.updateRun(runId, { status: 'waiting' });
      this.patch(PM_ID, { subtask: 'Ждёт одобрения' });
      this.emit('AGENT_STATE_CHANGED', PM_ID, { status: 'planning', waiting: true });
      return;
    }
    this.finishRun(runId, 'completed', text.trim());
  }

  private finishRun(runId: string, status: 'completed' | 'cancelled', summary: string | null) {
    this.store.updateRun(runId, { status, summary: summary ?? undefined });
    this.emit(status === 'completed' ? 'RUN_COMPLETED' : 'RUN_CANCELLED', PM_ID, summary ? { summary: summary.slice(0, 2000) } : {}, runId);
    this.settle(runId);
  }

  private failRun(runId: string, err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    this.store.updateRun(runId, { status: 'failed', summary: message.slice(0, 500) });
    this.emit('RUN_FAILED', PM_ID, { error: message.slice(0, 500) }, runId);
    this.settle(runId);
  }

  // Everyone back to idle, then start the next queued task.
  private settle(runId: string) {
    this.aborts.delete(runId);
    for (const a of this.agents.values()) {
      if (a.status !== 'idle') {
        a.status = 'idle';
        a.subtask = null;
        this.emit('AGENT_STATE_CHANGED', a.id, { status: 'idle' }, runId);
      }
    }
    this.patch(PM_ID, { progress: 100 });
    if (this.current === runId) this.current = null;
    this.delegated = null;
    void this.pump();
  }

  // ---- approvals ----

  private requestApproval(runId: string, mastraRunId: string, toolCallId: string, tool: string, args: Record<string, unknown>) {
    const agent = this.delegated ?? PM_ID;
    const approval = this.store.addApproval({
      id: randomUUID(),
      run: runId,
      mastraRunId,
      toolCallId,
      agent,
      tool,
      title: approvalTitle(tool, args),
      args,
    });
    this.patch(agent, { subtask: `Ждёт одобрения: ${approval.title}` });
    this.emit('APPROVAL_REQUESTED', agent, { approval: publicApproval(approval) }, runId);
  }

  async decide(approvalId: string, approve: boolean, reason: string | null) {
    const a = this.store.approval(approvalId);
    if (!a) throw new HttpError(404, 'No such approval');
    if (a.status !== 'pending') throw new HttpError(409, `Approval is already ${a.status}`);
    if (!this.pm) throw new HttpError(503, 'Agents are not ready');
    if (this.current && this.current !== a.run) throw new HttpError(409, 'Another run is active');
    this.store.decideApproval(a.id, approve ? 'approved' : 'denied', reason);
    this.current = a.run;
    this.store.updateRun(a.run, { status: 'running' });
    this.emit(approve ? 'TOOL_APPROVED' : 'TOOL_DENIED', a.agent, { approvalId: a.id, tool: a.tool, title: a.title, reason }, a.run);
    this.patch(PM_ID, { subtask: 'Продолжает работу' });
    const abort = new AbortController();
    this.aborts.set(a.run, abort);
    // Resume in the background; the HTTP request only waits for the decision to be recorded.
    void (async () => {
      try {
        const opts = { runId: a.mastraRunId, toolCallId: a.toolCallId, abortSignal: abort.signal };
        const stream = approve ? await this.pm!.approveToolCall(opts) : await this.pm!.declineToolCall({ ...opts, reason: reason ?? undefined });
        await this.consume(a.run, stream);
      } catch (err) {
        this.failRun(a.run, err);
      }
    })();
  }

  // Called once at startup: runs that were mid-flight when the process died can't be resumed,
  // but runs parked on an approval can (Mastra keeps their snapshot in its storage).
  recover() {
    const plan = this.store.lastOf('PLAN_UPDATED');
    if (plan) this.planItems = plan.data.items as PlanItem[];
    for (const run of this.store.runs(['running', 'queued'], 100)) {
      this.store.updateRun(run.id, { status: 'interrupted' });
      this.store.addEvent('RUN_INTERRUPTED', PM_ID, run.id, { reason: 'server restarted' });
    }
    const waiting = this.store.runs(['waiting'], 10);
    for (const run of waiting.slice(1)) {
      for (const a of this.store.pendingApprovals(run.id)) this.store.decideApproval(a.id, 'expired', 'superseded after restart');
      this.store.updateRun(run.id, { status: 'interrupted' });
    }
    if (waiting[0]) {
      this.current = waiting[0].id;
      this.patch(PM_ID, { status: 'planning', task: firstLine(waiting[0].task), subtask: 'Ждёт одобрения', progress: 50 });
    }
  }

  // ---- hooks from agents.ts / tools.ts ----

  delegationStart(agent: string, prompt: string) {
    const task = firstLine(prompt);
    const a = this.agents.get(agent);
    this.delegated = agent;
    this.patch(PM_ID, { subtask: `Делегирует → ${agent}` });
    // Mastra re-enters the delegation when a suspended run resumes; that is not a new task.
    if (a && a.status !== 'idle' && a.task === task) return;
    this.patch(agent, { status: this.busyStatus(agent), task, subtask: 'Начинает', progress: 5, startedAt: new Date().toISOString(), toolCalls: 0 });
    this.emit('TASK_ASSIGNED', agent, { prompt: prompt.slice(0, 1000) });
  }

  delegationEnd(agent: string, ok: boolean, text: string, usage: unknown, error: unknown) {
    this.addTokens(agent, usageTokens(usage));
    this.patch(agent, { status: 'idle', progress: 100, subtask: ok ? 'Готово' : 'Ошибка' });
    if (ok) this.emit('TASK_COMPLETED', agent, { summary: text.slice(0, 1500) });
    else this.emit('AGENT_ERROR', agent, { error: String((error as Error)?.message ?? error ?? 'delegation failed').slice(0, 500) });
    if (this.delegated === agent) this.delegated = null;
  }

  toolStart(agent: string, tool: string, input: unknown) {
    if (QUIET_TOOLS.has(tool)) return;
    const a = this.agents.get(agent);
    if (!a) return;
    const label = describeTool(tool, input);
    a.toolCalls += 1;
    a.progress = Math.min(90, Math.round(a.progress + (90 - a.progress) * 0.3));
    a.subtask = label;
    this.toolLabels.set(`${agent}:${tool}`, label);
    this.emit('TOOL_CALLED', agent, { tool: shortTool(tool), label });
  }

  toolEnd(agent: string, tool: string, _output: unknown, error: unknown) {
    if (QUIET_TOOLS.has(tool)) return;
    const label = this.toolLabels.get(`${agent}:${tool}`) ?? shortTool(tool);
    if (error) this.emit('TOOL_FAILED', agent, { tool: shortTool(tool), label, error: String((error as Error)?.message ?? error).slice(0, 300) });
    else this.emit('TOOL_COMPLETED', agent, { tool: shortTool(tool), label });
  }

  plan(items: PlanItem[]) {
    this.planItems = items;
    const done = items.filter((i) => i.status === 'done').length;
    this.patch(PM_ID, { progress: Math.max(5, Math.round((100 * done) / items.length)), subtask: 'Обновил план' });
    this.emit('PLAN_UPDATED', PM_ID, { items });
  }

  testStarted(agent: string, command: string) {
    this.patch(agent, { subtask: 'Запускает тесты' });
    this.emit('TEST_STARTED', agent, { command });
  }

  testFinished(agent: string, r: TestResult) {
    this.patch(agent, { subtask: r.passed ? `Тесты: ${r.pass}/${r.tests}` : `Падают тесты: ${r.fail}` });
    this.emit(r.passed ? 'TEST_PASSED' : 'TEST_FAILED', agent, { tests: r.tests, pass: r.pass, fail: r.fail });
  }

  // ---- read side ----

  snapshot() {
    return {
      mode: this.mode,
      isolation: this.isolation,
      agents: [...this.agents.values()],
      plan: this.planItems,
      approvals: this.store.pendingApprovals().map(publicApproval),
      runs: this.store.runs(undefined, 10),
      queue: this.queue.length,
      activeRun: this.current,
      events: this.store.recentEvents(40),
      lastEventId: this.store.lastEventId(),
      errors: this.store.countEvents(['RUN_FAILED', 'AGENT_ERROR', 'TOOL_FAILED']),
    };
  }
}

export function publicApproval(a: Approval) {
  return { id: a.id, run: a.run, agent: a.agent, tool: a.tool, title: a.title, args: a.args, createdAt: a.createdAt };
}
