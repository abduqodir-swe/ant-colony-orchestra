// Entry point: the pixel office scene plus the dashboard panels around it, sharing one selection.

import { createOffice, drawOffice } from './office/scene.js';
import { WIDTH, HEIGHT } from './office/map.js';
import { Colony } from './dashboard/sim.js';
import { LiveColony, probeServer } from './dashboard/live.js';
import { mountDashboard } from './dashboard/ui.js';
import { STATUS } from './dashboard/data.js';

const view = document.getElementById('office');
const wrap = document.getElementById('scene-wrap');
const vg = view.getContext('2d');
const scene = document.createElement('canvas');
scene.width = WIDTH;
scene.height = HEIGHT;
const sg = scene.getContext('2d');
sg.imageSmoothingEnabled = false;

const office = createOffice();
// With the backend running (server/), the office shows real agents; otherwise it plays the demo.
const health = await probeServer();
const colony = health ? new LiveColony(office.agents, health) : new Colony(office.agents);
if (health) colony.connect();
let hover = null;
let selected = office.agents.find((a) => a.id === 'backend_01') || null;

const ui = mountDashboard(colony, {
  getSelected: () => selected,
  select(a) {
    selected = a;
    ui.selectionChanged();
  },
  setHover(a) {
    hover = a;
  },
});

// Fit the scene into its panel. The backing store is an integer multiple of the art so pixels
// stay square; CSS then nudges it to the exact panel size.
function fit() {
  const r = wrap.getBoundingClientRect();
  const cssW = Math.max(1, Math.min(r.width - 16, ((r.height - 16) * WIDTH) / HEIGHT));
  const dpr = window.devicePixelRatio || 1;
  const k = Math.max(1, Math.round((cssW * dpr) / WIDTH));
  view.width = WIDTH * k;
  view.height = HEIGHT * k;
  view.style.width = `${Math.floor(cssW)}px`;
  view.style.height = `${Math.floor((cssW * HEIGHT) / WIDTH)}px`;
  vg.imageSmoothingEnabled = false;
}
new ResizeObserver(fit).observe(wrap);
fit();

function agentAt(e) {
  const r = view.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * WIDTH;
  const y = ((e.clientY - r.top) / r.height) * HEIGHT;
  let best = null;
  for (const a of office.agents) {
    const b = a.bounds();
    if (x >= b.x + 6 && x < b.x + b.w - 6 && y >= b.y + 4 && y < b.y + b.h - 2 && (!best || a.y > best.y)) best = a;
  }
  return best;
}
view.addEventListener('mousemove', (e) => {
  hover = agentAt(e);
  view.style.cursor = hover ? 'pointer' : 'default';
});
view.addEventListener('mouseleave', () => (hover = null));
view.addEventListener('click', (e) => {
  selected = agentAt(e);
  ui.selectionChanged();
});

const statusColor = (a) => STATUS[colony.status(a)].color;

let last = performance.now();
function advance(dt) {
  for (const a of office.agents) a.update(dt);
  colony.update(dt);
}
function draw() {
  drawOffice(sg, office, colony.time, { hover, selected, statusColor });
  vg.drawImage(scene, 0, 0, view.width, view.height);
}
function tick(now) {
  advance(Math.min(0.1, (now - last) / 1000));
  last = now;
  draw();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// debugging / screenshots from the console; step() fast-forwards even when rAF is paused
window.colony = {
  office,
  colony,
  scene,
  step(seconds) {
    for (let t = 0; t < seconds; t += 1 / 30) advance(1 / 30);
    draw();
  },
};
