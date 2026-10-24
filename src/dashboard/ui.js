// Dashboard panels around the office scene. Plain DOM; each panel re-renders from the Colony
// state when it notifies, and a 1s ticker refreshes clocks, durations and progress.

import { STATUS, EVENTS, TASK_DETAILS, DEFAULT_DETAILS } from './data.js';
import { hhmm } from './sim.js';
import { portraitUrl } from './portrait.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const avatar = (cls = 'avatar') => `<img class="${cls}" src="${portraitUrl()}" alt="" width="36" height="36">`;
const pad = (n) => String(n).padStart(2, '0');

function duration(from) {
  const s = Math.max(0, Math.floor((Date.now() - from) / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

function ago(at) {
  const m = Math.floor((Date.now() - at) / 60000);
  if (m < 1) return 'now';
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
}

// Rebuild a panel only when its markup changes, so buttons under the cursor survive the 1s ticker.
function put(el, html) {
  if (el._html === html) return;
  el._html = html;
  el.innerHTML = html;
}

// Fill the ticking clocks ([data-since] durations, [data-ago] ages) without rebuilding the panel.
function tickClocks(root) {
  for (const el of root.querySelectorAll('[data-since]')) el.textContent = duration(Number(el.dataset.since));
  for (const el of root.querySelectorAll('[data-ago]')) el.textContent = ago(Number(el.dataset.ago));
}

function statusTag(key) {
  const s = STATUS[key];
  return `<span class="status" style="color:${s.color}"><i class="dotc" style="background:${s.color}"></i>${s.label}</span>`;
}

export function mountDashboard(colony, { getSelected, select, setHover }) {
  let role = 'all';

  // ---- top chips ----
  function chips() {
    const a = colony.agents;
    const live = colony.live;
    const tasks = live ? colony.queue + (colony.activeRun ? 1 : 0) : a.filter((x) => x.baseStatus !== 'idle').length;
    const conn = !live
      ? `<span class="chip demo" title="Сервер не запущен: данные симулированы"><i class="dot"></i>Demo</span>`
      : colony.connection === 'online'
        ? `<span class="chip ok" title="${colony.mode === 'mock' ? 'Агенты по сценарию, без API' : 'Агенты на реальных моделях'}"><i class="dot"></i>Online${colony.mode === 'mock' ? ' · mock' : ''}</span>`
        : `<span class="chip off"><i class="dot"></i>Offline</span>`;
    $('chips').innerHTML = [
      `<span class="chip"><b>${a.length}</b> агентов</span>`,
      `<span class="chip"><b>${colony.active}</b> активных</span>`,
      `<span class="chip"><b>${tasks}</b> задач</span>`,
      `<span class="chip"><b>${colony.approvals.length}</b> ожид. одобр.</span>`,
      `<span class="chip bad"><b>${live ? colony.errors : 0}</b> ошибок</span>`,
      conn,
    ].join('');
  }

  // ---- inspector ----
  function inspector() {
    const a = getSelected();
    if (!a) {
      put($('inspector'), `<header class="ph" style="padding:0"><h2>Inspector</h2></header><p class="empty">Выбери муравья в офисе или в списке</p>`);
      return;
    }
    const st = colony.status(a);
    const s = STATUS[st];
    put(
      $('inspector'),
      `
      <header class="ph" style="padding:0"><h2>Inspector</h2><button class="close" type="button" aria-label="Снять выбор">✕</button></header>
      <div class="who">
        ${avatar()}
        <div>
          <strong>Agent: ${esc(a.id)} <i class="dotc" style="background:${s.color}"></i></strong>
          <div class="st" style="color:${s.color}">${s.label}</div>
          <div class="title">${esc(a.title)}</div>
        </div>
      </div>
      <dl class="kv">
        <dt>Model</dt><dd>${esc(a.model)}</dd>
        <dt>Provider</dt><dd>${esc(a.provider)}</dd>
        <dt>Task</dt><dd title="${esc(a.task ?? '')}">${esc(a.task ?? '—')}</dd>
        <dt>Subtask</dt><dd title="${esc(a.subtask ?? '')}">${esc(a.subtask ?? '—')}</dd>
        <dt>Progress</dt><dd class="bar-line"><span class="track"><i style="width:${a.progress.toFixed(0)}%"></i></span><span class="mono">${a.progress.toFixed(0)}%</span></dd>
        <dt>Started</dt><dd class="mono">${a.startedAt ? hhmm(a.startedAt) : '—'}</dd>
        <dt>Last Event</dt><dd class="mono">${esc(a.lastEvent ?? '—')}</dd>
        <dt>Duration</dt><dd class="mono">${a.startedAt ? `<span data-since="${+a.startedAt}"></span>` : '—'}</dd>
        ${colony.live ? `<dt>Tokens</dt><dd class="mono">${a.tokens.toLocaleString('ru-RU')}</dd>` : ''}
      </dl>`,
    );
    tickClocks($('inspector'));
    $('inspector').querySelector('.close').onclick = () => select(null);
  }

  // ---- agent list ----
  const roles = [...new Set(colony.agents.map((a) => a.role))];
  $('role-filter').innerHTML = `<option value="all">Все роли</option>` + roles.map((r) => `<option>${esc(r)}</option>`).join('');
  $('role-filter').onchange = (e) => {
    role = e.target.value;
    list();
  };

  function list() {
    const shown = colony.agents.filter((a) => role === 'all' || a.role === role);
    $('agents-title').textContent = `Agents (${shown.length})`;
    const sel = getSelected();
    put(
      $('agent-list'),
      shown
        .map((a) => `<li data-id="${a.id}" class="${a === sel ? 'sel' : ''}">${avatar()}<span>${esc(a.id)}</span><span class="role">${esc(a.role)}</span>${statusTag(colony.status(a))}</li>`)
        .join(''),
    );
  }
  $('agent-list').addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li) select(colony.agents.find((a) => a.id === li.dataset.id));
  });
  $('agent-list').addEventListener('mouseover', (e) => {
    const li = e.target.closest('li');
    setHover(li ? colony.agents.find((a) => a.id === li.dataset.id) : null);
  });
  $('agent-list').addEventListener('mouseleave', () => setHover(null));

  // ---- event feed ----
  let shownEvents = 0;
  function feedRow(ev, fresh) {
    const d = ev.data ?? {};
    const detail = d.label ?? d.title ?? d.approval?.title ?? d.summary ?? d.error ?? d.task ?? d.prompt ?? '';
    return `<li data-id="${ev.agent}" class="${fresh ? 'fresh' : ''}" title="${esc(detail)}"><i class="dotc" style="background:${EVENTS[ev.type] || '#8d97a8'}"></i><span class="t">${hhmm(ev.at)}</span><span>${ev.type}</span><span class="ag">${esc(ev.agent)}</span></li>`;
  }
  function feed(initial) {
    if (colony.feedPaused && !initial) return;
    const fresh = colony.events.length - shownEvents;
    $('feed').innerHTML = colony.events.slice(0, 40).map((ev, i) => feedRow(ev, !initial && i < fresh)).join('');
    shownEvents = colony.events.length;
  }
  $('feed').addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li) select(colony.agents.find((a) => a.id === li.dataset.id));
  });
  $('feed-pause').onclick = () => {
    colony.feedPaused = !colony.feedPaused;
    $('feed-pause').textContent = colony.feedPaused ? 'Resume' : 'Pause';
    if (!colony.feedPaused) feed();
  };

  // ---- bottom row ----
  function procs() {
    const live = colony.live;
    const online = !live || colony.connection === 'online';
    const rows = live
      ? [
          ['Agent Engine', `${colony.active} running${colony.queue ? ` · ${colony.queue} в очереди` : ''}`, true],
          ['Event Stream', colony.connection === 'online' ? 'connected' : 'reconnecting…', online],
          ['SQLite Event Store', 'ready', online],
          ['SSE Clients', `${colony.sseClients || 1} connected`, online],
          ['Sandbox', colony.health.isolation === 'none' ? 'off · approvals' : colony.health.isolation, colony.health.isolation !== 'none'],
        ]
      : [
          ['Agent Engine', `${colony.active} running`, true],
          ['Event Stream', 'demo', true],
          ['SQLite Event Store', 'demo', true],
          ['SSE Clients', 'demo', true],
        ];
    $('procs').innerHTML = `<h2>Активные процессы</h2><ul class="rows">${rows
      .map(([k, v, ok]) => `<li><i class="dotc" style="background:var(${ok ? '--ok' : '--warn'})"></i><span class="grow">${k}</span><span class="val" style="color:var(${ok ? '--ok' : '--warn'})">${esc(v)}</span></li>`)
      .join('')}</ul>`;
  }

  function reqs() {
    if (colony.live) {
      const items = colony.plan;
      const done = items.filter((i) => i.status === 'done').length;
      $('reqs').innerHTML = `<h2>План PM <span>${items.length ? `${done}/${items.length}` : ''}</span></h2>${
        items.length
          ? `<ul class="rows req">${items
              .map(
                (i) =>
                  `<li><span class="check ${i.status === 'done' ? 'on' : ''}"></span><span class="grow" title="${esc(i.title)}">${esc(i.title)}</span><span class="owner">${esc(i.owner)}</span><span class="pstate ${i.status}">${i.status}</span></li>`,
              )
              .join('')}</ul>`
          : '<p class="empty">Дай PM задачу — здесь появится план</p>'
      }`;
      return;
    }
    $('reqs').innerHTML = `<h2>Требования</h2><ul class="rows req">${colony.requirements
      .map(
        (r) =>
          `<li><span class="check ${r.done === r.total ? 'on' : ''}"></span><span class="grow">${esc(r.name)}</span><span class="track"><i style="width:${(100 * r.done) / r.total}%"></i></span><span class="n">${r.done}/${r.total}</span></li>`,
      )
      .join('')}</ul>`;
  }

  function task() {
    const C = 2 * Math.PI * 30;
    if (colony.live) {
      const a = getSelected() || colony.agents.find((x) => x.liveStatus !== 'idle' && x.id !== 'pm_lead') || colony.agents.find((x) => x.id === 'pm_lead');
      const p = Math.round(a.progress);
      const st = STATUS[colony.status(a)];
      $('task').innerHTML = `
        <h2>Текущая задача <span style="text-transform:none;letter-spacing:0">${esc(a.id)}</span></h2>
        <div class="task">
          <div>
            <h3 title="${esc(a.task ?? '')}">${esc(a.task ?? 'Нет активной задачи')}</h3>
            <p title="${esc(a.subtask ?? '')}">${esc(a.subtask ?? 'Ждёт задачу от PM')}</p>
            <div class="meta">
              <span>Статус<b style="color:${st.color}">${st.label}</b></span>
              <span>Шагов<b>${a.toolCalls}</b></span>
              <span>Токены<b>${a.tokens.toLocaleString('ru-RU')}</b></span>
            </div>
          </div>
          ${ring(p, C)}
        </div>`;
      return;
    }
    const a = getSelected() || colony.agents.find((x) => x.id === 'backend_01');
    const d = TASK_DETAILS[a.task] || DEFAULT_DETAILS;
    const p = Math.round(a.progress);
    $('task').innerHTML = `
      <h2>Текущая задача <span style="text-transform:none;letter-spacing:0">${esc(a.id)}</span></h2>
      <div class="task">
        <div>
          <h3>${esc(a.task)}</h3>
          <p>${esc(d.desc)}</p>
          <div class="meta">
            <span>Приоритет<b class="${d.priority === 'High' ? 'hot' : ''}">${d.priority}</b></span>
            <span>Оценка<b>${d.points} pts</b></span>
            <span>Дедлайн<b>${esc(d.due)}</b></span>
          </div>
        </div>
        ${ring(p, C)}
      </div>`;
  }

  function approvals() {
    const list = colony.approvals;
    put($('approvals'), `<h2>Одобрения (${list.length})</h2>${
      list.length
        ? `<ul class="rows appr">${list
            .map(
              (ap) =>
                `<li>${avatar()}<span class="grow">${esc(ap.title)}<small>${esc(ap.agent)}</small></span><button class="btn yes" data-id="${ap.id}" data-ok="1" type="button">Approve</button><button class="btn no" data-id="${ap.id}" type="button">Deny</button><span class="ago" data-ago="${+ap.at}"></span></li>`,
            )
            .join('')}</ul>`
        : '<p class="empty">Нет запросов</p>'
    }`);
    tickClocks($('approvals'));
  }
  $('approvals').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    b.closest('li').querySelectorAll('button').forEach((x) => (x.disabled = true));
    colony.decide(colony.live ? b.dataset.id : Number(b.dataset.id), b.dataset.ok === '1');
  });

  // ---- PM console ----
  const form = $('pm-form');
  const input = $('pm-input');
  const sendBtn = form.querySelector('button');
  let stateUntil = 0;
  function pmState(text, bad = false) {
    $('pm-state').textContent = text;
    $('pm-state').classList.toggle('bad', bad);
    stateUntil = Date.now() + 6000;
  }
  function pmConsole() {
    if (!colony.live) {
      input.disabled = true;
      sendBtn.disabled = true;
      input.placeholder = 'Демо-режим: запусти сервер (cd server && npm start), чтобы давать задачи PM';
      return;
    }
    input.disabled = false;
    if (Date.now() < stateUntil) return;
    $('pm-state').classList.remove('bad');
    $('pm-state').textContent = colony.connection !== 'online' ? 'Нет связи с сервером' : colony.activeRun ? `PM работает${colony.queue ? ` · в очереди ${colony.queue}` : ''}` : 'PM свободен';
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !colony.live) return;
    sendBtn.disabled = true;
    try {
      await colony.submitTask(text);
      input.value = '';
      pmState(colony.activeRun ? 'Задача встала в очередь' : 'Задача отправлена PM');
    } catch (err) {
      pmState(err.message, true);
    } finally {
      sendBtn.disabled = false;
    }
  });

  const SYS = [
    ['CPU', 'cpu', (v) => `${v.toFixed(0)}%`],
    ['RAM', 'ram', (v) => `${v.toFixed(0)}%`],
    ['Disk', 'disk', (v) => `${v.toFixed(0)}%`],
    colony.live ? ['Tokens', 'net', (v) => `${Math.round(v).toLocaleString('ru-RU')}/мин`] : ['Network', 'net', (v) => `${v.toFixed(0)} KB/s`],
  ];
  $('system').innerHTML = `<h2>Система</h2><ul class="rows sys">${SYS.map(([n, k]) => `<li><span>${n}</span><span class="num" data-k="${k}"></span><canvas data-k="${k}"></canvas></li>`).join('')}</ul>`;
  function system() {
    for (const [, k, fmt] of SYS) {
      const xs = colony.system[k];
      $('system').querySelector(`.num[data-k="${k}"]`).textContent = fmt(xs[xs.length - 1]);
      spark($('system').querySelector(`canvas[data-k="${k}"]`), xs);
    }
  }

  // ---- wiring ----
  function all() {
    pmConsole();
    chips();
    inspector();
    list();
    feed(true);
    procs();
    reqs();
    task();
    approvals();
    system();
  }
  all();
  colony.on((what) => {
    if (what === 'all') all();
    else if (what === 'connection') {
      chips();
      procs();
      pmConsole();
    } else if (what?.error) {
      pmState(what.error, true);
      $('approvals')._html = '';
      approvals();
    }
    else if (what === 'events') {
      feed();
      inspector();
      pmConsole();
    } else if (what === 'agents') {
      list();
      chips();
      procs();
      inspector();
    } else if (what === 'approvals') {
      approvals();
      chips();
    } else if (what === 'requirements') reqs();
    else if (what === 'system') system();
  });
  setInterval(() => {
    inspector();
    task();
    approvals();
    pmConsole();
  }, 1000);

  return {
    selectionChanged() {
      list();
      inspector();
      task();
    },
  };
}

function ring(p, C) {
  return `
    <div class="ring">
      <svg viewBox="0 0 74 74" aria-label="Прогресс ${p}%">
        <circle cx="37" cy="37" r="30" fill="none" stroke="#1e2734" stroke-width="6"/>
        <circle cx="37" cy="37" r="30" fill="none" stroke="var(--ok)" stroke-width="6" stroke-linecap="round"
          stroke-dasharray="${(C * p) / 100} ${C}" transform="rotate(-90 37 37)"/>
        <text x="37" y="42" text-anchor="middle">${p}%</text>
      </svg>
      Прогресс
    </div>`;
}

function spark(c, xs) {
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (!w) return;
  if (c.width !== Math.round(w * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const y = (v) => h - 2 - ((v - lo) / (hi - lo || 1)) * (h - 4);
  g.beginPath();
  xs.forEach((v, i) => g[i ? 'lineTo' : 'moveTo']((i / (xs.length - 1)) * w, y(v)));
  g.strokeStyle = '#4ee07a';
  g.lineWidth = 1.2;
  g.stroke();
  g.lineTo(w, h);
  g.lineTo(0, h);
  g.closePath();
  g.fillStyle = 'rgba(78, 224, 122, 0.12)';
  g.fill();
}
