// Live colony state fed by the backend (server/): a snapshot on every (re)connect, then one SSE
// message per event. Exposes the same surface the dashboard uses for the simulated Colony, plus
// the PM console (submitTask) and real approvals.

const BUBBLE = {
  TASK_COMPLETED: 'check',
  TEST_PASSED: 'check',
  TOOL_APPROVED: 'check',
  RUN_COMPLETED: 'check',
  APPROVAL_REQUESTED: 'alert',
  TOOL_DENIED: 'deny',
  TEST_FAILED: 'deny',
  TOOL_FAILED: 'deny',
  AGENT_ERROR: 'deny',
  RUN_FAILED: 'deny',
  TEST_STARTED: 'test',
};
const ERRORS = new Set(['RUN_FAILED', 'AGENT_ERROR', 'TOOL_FAILED']);
const RUN_END = new Set(['RUN_COMPLETED', 'RUN_FAILED', 'RUN_CANCELLED', 'RUN_INTERRUPTED']);
const HISTORY = 48;

export async function probeServer() {
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(1500) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const toApproval = (a) => ({ ...a, at: new Date(a.createdAt) });

export class LiveColony {
  constructor(agents, health) {
    this.live = true;
    this.health = health;
    this.mode = health.mode;
    this.agents = agents;
    this.byId = new Map(agents.map((a) => [a.id, a]));
    this.time = 0;
    this.listeners = new Set();
    this.events = [];
    this.feedPaused = false;
    this.plan = [];
    this.approvals = [];
    this.system = { cpu: [0], ram: [0], disk: [0], net: [0] };
    this.connection = 'connecting';
    this.errors = 0;
    this.queue = 0;
    this.activeRun = null;
    this.sseClients = 0;
    this.lastId = 0;
    for (const a of agents) {
      Object.assign(a, { model: '—', provider: '—', title: a.role, task: null, subtask: null, progress: 0, startedAt: null, lastEvent: null, liveStatus: 'idle', tokens: 0, toolCalls: 0 });
    }
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify(what) {
    for (const fn of this.listeners) fn(what);
  }

  connect() {
    const es = new EventSource('/api/events');
    es.addEventListener('snapshot', (e) => this.applySnapshot(JSON.parse(e.data)));
    es.addEventListener('system', (e) => this.applySystem(JSON.parse(e.data)));
    es.onmessage = (e) => this.applyEvent(JSON.parse(e.data));
    es.onopen = () => this.setConnection('online');
    // EventSource reconnects on its own; the next snapshot brings the state back in sync.
    es.onerror = () => this.setConnection('offline');
  }

  setConnection(state) {
    if (this.connection === state) return;
    this.connection = state;
    this.notify('connection');
  }

  status(a) {
    const s = a.liveStatus ?? 'idle';
    return s === 'idle' && a.state !== 'work' ? 'break' : s;
  }

  get active() {
    return this.agents.filter((a) => a.liveStatus !== 'idle').length;
  }

  applyAgent(st) {
    const a = this.byId.get(st.id);
    if (!a) return;
    Object.assign(a, {
      model: st.model,
      provider: st.provider,
      title: st.title,
      task: st.task,
      subtask: st.subtask,
      progress: st.progress,
      startedAt: st.startedAt ? new Date(st.startedAt) : null,
      lastEvent: st.lastEvent,
      liveStatus: st.status,
      tokens: st.tokens,
      toolCalls: st.toolCalls,
      status: st.status,
    });
    a.setBusy(st.status !== 'idle');
  }

  applySnapshot(s) {
    this.mode = s.mode;
    for (const st of s.agents) this.applyAgent(st);
    this.plan = s.plan;
    this.approvals = s.approvals.map(toApproval);
    this.events = s.events.map((e) => ({ ...e, at: new Date(e.at), agent: e.agent ?? 'colony' }));
    this.lastId = s.lastEventId;
    this.errors = s.errors;
    this.queue = s.queue;
    this.activeRun = s.activeRun;
    this.setConnection('online');
    this.notify('all');
  }

  applySystem(d) {
    const s = this.system;
    for (const [k, v] of [['cpu', d.cpu], ['ram', d.ram], ['disk', d.disk], ['net', d.tokensPerMin]]) {
      s[k].push(v);
      if (s[k].length > HISTORY) s[k].shift();
    }
    this.sseClients = d.sseClients;
    this.notify('system');
  }

  applyEvent(ev) {
    if (ev.id <= this.lastId) return;
    this.lastId = ev.id;
    if (ev.state) this.applyAgent(ev.state);
    this.events.unshift({ ...ev, at: new Date(ev.at), agent: ev.agent ?? 'colony' });
    this.events.length = Math.min(this.events.length, 80);

    const t = ev.type;
    if (t === 'PLAN_UPDATED') {
      this.plan = ev.data.items;
      this.notify('requirements');
    } else if (t === 'APPROVAL_REQUESTED') {
      this.approvals.push(toApproval(ev.data.approval));
      this.notify('approvals');
    } else if (t === 'TOOL_APPROVED' || t === 'TOOL_DENIED') {
      this.approvals = this.approvals.filter((a) => a.id !== ev.data.approvalId);
      this.notify('approvals');
    } else if (t === 'TASK_QUEUED') {
      this.queue += 1;
    } else if (t === 'RUN_STARTED') {
      this.queue = Math.max(0, this.queue - 1);
      this.activeRun = ev.run;
      this.plan = [];
      this.notify('requirements');
    } else if (RUN_END.has(t) && this.activeRun === ev.run) {
      this.activeRun = null;
    }
    if (RUN_END.has(t) && t !== 'RUN_COMPLETED') this.approvals = this.approvals.filter((a) => a.run !== ev.run);
    if (ERRORS.has(t)) this.errors += 1;

    const a = this.byId.get(ev.agent);
    const kind = t === 'TASK_ASSIGNED' && ev.agent === 'sec_analyst' ? 'shield' : BUBBLE[t];
    if (a && kind) a.bubble = { kind, until: this.time + 2.6 };
    this.notify('events');
    this.notify('agents');
  }

  submitTask(text) {
    return post('/api/tasks', { text });
  }

  decide(id, ok) {
    return post(`/api/approvals/${encodeURIComponent(id)}`, { approve: ok }).catch((err) => {
      this.notify({ error: err.message });
    });
  }

  update(dt) {
    this.time += dt;
  }
}
