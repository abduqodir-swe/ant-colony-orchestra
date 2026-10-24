// SQLite persistence for the colony: an append-only event log (what the office replays), runs
// (one per task given to the PM) and approvals (risky tool calls waiting for a human).
// Mastra keeps its own state (memory, suspended-run snapshots) in a separate libsql file.

import { DatabaseSync } from 'node:sqlite';

export interface ColonyEvent {
  id: number;
  at: string;
  type: string;
  agent: string | null;
  run: string | null;
  data: Record<string, unknown>;
}

export type RunStatus = 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled' | 'interrupted';

export interface Run {
  id: string;
  task: string;
  status: RunStatus;
  mastraRunId: string | null;
  createdAt: string;
  finishedAt: string | null;
  summary: string | null;
}

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';

export interface Approval {
  id: string;
  run: string;
  mastraRunId: string;
  toolCallId: string;
  agent: string;
  tool: string;
  title: string;
  args: Record<string, unknown>;
  status: ApprovalStatus;
  createdAt: string;
  decidedAt: string | null;
  reason: string | null;
}

type Row = Record<string, string | number | null>;

const now = () => new Date().toISOString();

export class Store {
  private db: DatabaseSync;

  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL,
        type TEXT NOT NULL,
        agent TEXT,
        run TEXT,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_run ON events(run);
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        task TEXT NOT NULL,
        status TEXT NOT NULL,
        mastra_run_id TEXT,
        created_at TEXT NOT NULL,
        finished_at TEXT,
        summary TEXT
      );
      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        run TEXT NOT NULL,
        mastra_run_id TEXT NOT NULL,
        tool_call_id TEXT NOT NULL,
        agent TEXT NOT NULL,
        tool TEXT NOT NULL,
        title TEXT NOT NULL,
        args TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        decided_at TEXT,
        reason TEXT
      );
    `);
  }

  // ---- events ----

  addEvent(type: string, agent: string | null, run: string | null, data: Record<string, unknown>): ColonyEvent {
    const at = now();
    const res = this.db
      .prepare('INSERT INTO events (at, type, agent, run, data) VALUES (?, ?, ?, ?, ?)')
      .run(at, type, agent, run, JSON.stringify(data));
    return { id: Number(res.lastInsertRowid), at, type, agent, run, data };
  }

  eventsAfter(after: number, limit = 500): ColonyEvent[] {
    const rows = this.db.prepare('SELECT * FROM events WHERE id > ? ORDER BY id LIMIT ?').all(after, limit) as Row[];
    return rows.map(toEvent);
  }

  recentEvents(limit = 40): ColonyEvent[] {
    const rows = this.db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT ?').all(limit) as Row[];
    return rows.map(toEvent);
  }

  lastOf(type: string): ColonyEvent | undefined {
    const row = this.db.prepare('SELECT * FROM events WHERE type = ? ORDER BY id DESC LIMIT 1').get(type) as Row | undefined;
    return row ? toEvent(row) : undefined;
  }

  lastEventId(): number {
    const row = this.db.prepare('SELECT MAX(id) AS id FROM events').get() as Row | undefined;
    return Number(row?.id ?? 0);
  }

  countEvents(types: string[]): number {
    const marks = types.map(() => '?').join(',');
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM events WHERE type IN (${marks})`).get(...types) as Row;
    return Number(row.n);
  }

  // ---- runs ----

  createRun(id: string, task: string): Run {
    const run: Run = { id, task, status: 'queued', mastraRunId: null, createdAt: now(), finishedAt: null, summary: null };
    this.db
      .prepare('INSERT INTO runs (id, task, status, created_at) VALUES (?, ?, ?, ?)')
      .run(run.id, run.task, run.status, run.createdAt);
    return run;
  }

  updateRun(id: string, patch: Partial<Pick<Run, 'status' | 'mastraRunId' | 'summary'>>): void {
    const finished = patch.status && ['completed', 'failed', 'cancelled', 'interrupted'].includes(patch.status);
    this.db
      .prepare(
        `UPDATE runs SET
           status = COALESCE(?, status),
           mastra_run_id = COALESCE(?, mastra_run_id),
           summary = COALESCE(?, summary),
           finished_at = CASE WHEN ? THEN ? ELSE finished_at END
         WHERE id = ?`,
      )
      .run(patch.status ?? null, patch.mastraRunId ?? null, patch.summary ?? null, finished ? 1 : 0, now(), id);
  }

  run(id: string): Run | undefined {
    const row = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as Row | undefined;
    return row ? toRun(row) : undefined;
  }

  runs(statuses?: RunStatus[], limit = 20): Run[] {
    const rows = statuses
      ? (this.db
          .prepare(`SELECT * FROM runs WHERE status IN (${statuses.map(() => '?').join(',')}) ORDER BY created_at LIMIT ?`)
          .all(...statuses, limit) as Row[])
      : (this.db.prepare('SELECT * FROM runs ORDER BY created_at DESC LIMIT ?').all(limit) as Row[]);
    return rows.map(toRun);
  }

  // ---- approvals ----

  addApproval(a: Omit<Approval, 'status' | 'createdAt' | 'decidedAt' | 'reason'>): Approval {
    const full: Approval = { ...a, status: 'pending', createdAt: now(), decidedAt: null, reason: null };
    this.db
      .prepare(
        `INSERT INTO approvals (id, run, mastra_run_id, tool_call_id, agent, tool, title, args, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(full.id, full.run, full.mastraRunId, full.toolCallId, full.agent, full.tool, full.title, JSON.stringify(full.args), full.status, full.createdAt);
    return full;
  }

  decideApproval(id: string, status: Exclude<ApprovalStatus, 'pending'>, reason: string | null): void {
    this.db
      .prepare('UPDATE approvals SET status = ?, decided_at = ?, reason = ? WHERE id = ? AND status = ?')
      .run(status, now(), reason, id, 'pending');
  }

  approval(id: string): Approval | undefined {
    const row = this.db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as Row | undefined;
    return row ? toApproval(row) : undefined;
  }

  pendingApprovals(run?: string): Approval[] {
    const rows = run
      ? (this.db.prepare('SELECT * FROM approvals WHERE status = ? AND run = ? ORDER BY created_at').all('pending', run) as Row[])
      : (this.db.prepare('SELECT * FROM approvals WHERE status = ? ORDER BY created_at').all('pending') as Row[]);
    return rows.map(toApproval);
  }

  close(): void {
    this.db.close();
  }
}

function toEvent(r: Row): ColonyEvent {
  return {
    id: Number(r.id),
    at: String(r.at),
    type: String(r.type),
    agent: r.agent == null ? null : String(r.agent),
    run: r.run == null ? null : String(r.run),
    data: JSON.parse(String(r.data)),
  };
}

function toRun(r: Row): Run {
  return {
    id: String(r.id),
    task: String(r.task),
    status: String(r.status) as RunStatus,
    mastraRunId: r.mastra_run_id == null ? null : String(r.mastra_run_id),
    createdAt: String(r.created_at),
    finishedAt: r.finished_at == null ? null : String(r.finished_at),
    summary: r.summary == null ? null : String(r.summary),
  };
}

function toApproval(r: Row): Approval {
  return {
    id: String(r.id),
    run: String(r.run),
    mastraRunId: String(r.mastra_run_id),
    toolCallId: String(r.tool_call_id),
    agent: String(r.agent),
    tool: String(r.tool),
    title: String(r.title),
    args: JSON.parse(String(r.args)),
    status: String(r.status) as ApprovalStatus,
    createdAt: String(r.created_at),
    decidedAt: r.decided_at == null ? null : String(r.decided_at),
    reason: r.reason == null ? null : String(r.reason),
  };
}
