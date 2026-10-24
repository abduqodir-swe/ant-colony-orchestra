// Live colony state for the dashboard: decorates the office ants with profile data, advances task
// progress while they work, and produces events, approvals and system metrics.
// Everything here is simulated; a real backend would push the same shapes over SSE.

import { PROFILES, NEXT_SUBTASKS, ROLE_EVENTS, REQUIREMENTS, APPROVAL_POOL } from './data.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
export const hhmm = (d) => d.toTimeString().slice(0, 5);

const BUBBLE = { TOOL_COMPLETED: 'check', TASK_COMPLETED: 'check', TEST_PASSED: 'check', TOOL_APPROVED: 'check', APPROVAL_REQUESTED: 'alert', TOOL_DENIED: 'deny', TEST_STARTED: 'test', SECURITY_REVIEW_STARTED: 'shield' };

export class Colony {
  constructor(agents) {
    this.agents = agents;
    this.time = 0;
    this.listeners = new Set();
    this.events = [];
    this.feedPaused = false;
    this.requirements = REQUIREMENTS.map((r) => ({ ...r }));
    this.approvals = [];
    this.approvalSeq = 0;
    const now = Date.now();
    for (const a of agents) {
      const p = PROFILES[a.id];
      Object.assign(a, {
        model: p.model,
        provider: p.provider,
        title: p.title,
        task: p.task[0],
        subtask: p.task[1],
        progress: p.task[2],
        startedAt: new Date(now - rand(4, 40) * 60000),
        lastEvent: 'TOOL_CALLED',
        baseStatus: a.status,
        rate: rand(0.25, 0.7),
        prevState: a.state,
      });
    }
    for (const t of APPROVAL_POOL.slice(0, 2)) this.addApproval(t, rand(1, 6) * 60000);
    // seed the feed so it isn't empty on load
    const seed = ['TOOL_APPROVED', 'AGENT_STATE_CHANGED', 'SECURITY_REVIEW_STARTED', 'TEST_STARTED', 'TOOL_COMPLETED'];
    seed.forEach((type, i) => this.events.unshift({ at: new Date(now - (seed.length - i) * 45000), type, agent: pick(agents).id }));
    this.system = { cpu: series(18, 6), ram: series(42, 3), disk: series(36, 0.4), net: series(12, 4) };
    this.eventTimer = 2;
    this.approvalTimer = rand(30, 50);
    this.sysTimer = 0;
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify(what) {
    for (const fn of this.listeners) fn(what);
  }

  status(a) {
    return a.state === 'work' ? a.baseStatus : 'break';
  }

  get active() {
    return this.agents.filter((a) => a.state === 'work' && a.baseStatus !== 'idle').length;
  }

  emit(type, agent) {
    const a = typeof agent === 'string' ? this.agents.find((x) => x.id === agent) : agent;
    this.events.unshift({ at: new Date(), type, agent: a.id });
    this.events.length = Math.min(this.events.length, 80);
    a.lastEvent = type;
    if (BUBBLE[type]) a.bubble = { kind: BUBBLE[type], until: this.time + 2.6 };
    this.notify('events');
  }

  addApproval(t, ageMs = 0) {
    this.approvals.push({ id: ++this.approvalSeq, ...t, at: new Date(Date.now() - ageMs) });
  }

  decide(id, ok) {
    const i = this.approvals.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [ap] = this.approvals.splice(i, 1);
    this.emit(ok ? 'TOOL_APPROVED' : 'TOOL_DENIED', ap.agent);
    this.notify('approvals');
  }

  update(dt) {
    this.time += dt;
    for (const a of this.agents) {
      if (a.state !== a.prevState) {
        if (a.prevState === 'work' || a.state === 'work') this.emit('AGENT_STATE_CHANGED', a);
        a.prevState = a.state;
        this.notify('agents');
      }
      if (a.state !== 'work' || a.baseStatus === 'idle') continue;
      a.progress += dt * a.rate;
      if (a.progress >= 100) {
        a.progress = rand(4, 18);
        a.subtask = pick(NEXT_SUBTASKS.filter((s) => s !== a.subtask));
        a.startedAt = new Date();
        const req = pick(this.requirements.filter((r) => r.done < r.total));
        if (req) req.done++;
        this.emit('TOOL_COMPLETED', a);
        this.notify('requirements');
      }
    }

    if ((this.eventTimer -= dt) <= 0) {
      this.eventTimer = rand(2.5, 6);
      const busy = this.agents.filter((a) => a.state === 'work');
      if (busy.length) {
        const a = pick(busy);
        this.emit(pick(ROLE_EVENTS[a.role] || ['TOOL_CALLED']), a);
      }
    }

    if ((this.approvalTimer -= dt) <= 0) {
      this.approvalTimer = rand(40, 70);
      if (this.approvals.length < 3) {
        const pending = new Set(this.approvals.map((x) => x.title));
        const t = pick(APPROVAL_POOL.filter((x) => !pending.has(x.title)));
        this.addApproval(t);
        this.emit('APPROVAL_REQUESTED', t.agent);
        this.notify('approvals');
      }
    }

    if ((this.sysTimer -= dt) <= 0) {
      this.sysTimer = 1;
      const s = this.system;
      step(s.cpu, 4, 6, 85, 10 + this.active * 1.5);
      step(s.ram, 1.2, 20, 90);
      step(s.disk, 0.05, 30, 80);
      step(s.net, 3, 1, 60);
      this.notify('system');
    }
  }
}

function series(v, spread) {
  return Array.from({ length: 48 }, () => Math.max(0, v + rand(-spread, spread)));
}

// random walk with a gentle pull back toward `target`
function step(xs, amp, lo, hi, target) {
  const last = xs[xs.length - 1];
  const pull = target == null ? 0 : (target - last) * 0.1;
  xs.push(Math.min(hi, Math.max(lo, last + rand(-amp, amp) + pull)));
  xs.shift();
}
