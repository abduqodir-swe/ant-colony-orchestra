// Builds the office once (baked, lit background + lit prop sprites) and draws it each frame with
// depth-sorted props and ants.

import { canvas, R, P, ellipse, text, textWidth } from './pixel.js';
import { buildGrid, drawFloors, drawWalls, WIDTH, HEIGHT, T, COLS } from './map.js';
import { buildLayout, AGENTS } from './layout.js';
import { buildLightMap, lightCanvas, hexRgb } from './lighting.js';
import { Agent, buildNav } from './agents.js';

const AMBIENT = [0.3, 0.28, 0.33];

// Additive halos around light sources: a few stacked rings, so bloom stays banded like pixel art.
function buildGlow(lights) {
  const { c, g } = canvas(WIDTH, HEIGHT);
  g.globalCompositeOperation = 'lighter';
  for (const l of lights) {
    if (!l.glow) continue;
    const [r, gg, b] = hexRgb(l.color).map((v) => Math.round(v * 255));
    const gy = l.glow.y ?? l.y;
    for (const f of [1, 0.72, 0.48, 0.26]) {
      ellipse(g, l.x, gy, l.glow.r * f, l.glow.r * f * 0.85, `rgba(${r},${gg},${b},${l.glow.k * 0.3})`);
    }
  }
  return c;
}

function buildVignette() {
  const { c, g } = canvas(WIDTH, HEIGHT);
  const img = g.createImageData(WIDTH, HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const dx = (x / WIDTH - 0.5) * 2;
      const dy = (y / HEIGHT - 0.5) * 2;
      const d = Math.max(0, Math.hypot(dx * 0.9, dy) - 0.7) / 0.6;
      const a = Math.round(Math.min(1, d * d) * 8) / 8;
      img.data[(y * WIDTH + x) * 4 + 3] = a * 120;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

function paint(p) {
  const base = canvas(p.w, p.h);
  const emit = canvas(p.w, p.h);
  p.draw(base.g, emit.g);
  return { base, emit };
}

export function createOffice() {
  const grid = buildGrid();
  const { props, seats, spots } = buildLayout();
  const allLights = props.flatMap((p) => p.lights);
  const lightMap = buildLightMap(WIDTH, HEIGHT, allLights, AMBIENT);
  const glow = buildGlow(allLights);
  const vignette = buildVignette();

  // ---- background: floors, rugs, walls, wall pieces, contact shadows; then light it ----
  const bg = canvas(WIDTH, HEIGHT);
  drawFloors(bg.g, grid);
  const later = [];
  const layer = (name) => {
    for (const p of props.filter((q) => q.layer === name)) {
      const { base, emit } = paint(p);
      bg.g.drawImage(base.c, p.x, p.y);
      later.push([emit.c, p.x, p.y]);
    }
  };
  layer('floor');
  drawWalls(bg.g, grid);
  layer('wall');
  for (const p of props) {
    if (p.layer !== 'sorted' || !p.blocks.length) continue;
    for (const [x, y, w, h] of p.blocks) {
      R(bg.g, x + 1, y + h - 1, w, 3, 'rgba(0,0,0,0.32)');
      R(bg.g, x + w, y + 2, 2, h, 'rgba(0,0,0,0.2)');
    }
  }
  lightCanvas(bg.g, WIDTH, HEIGHT, 0, 0, lightMap);
  for (const [c, x, y] of later) bg.g.drawImage(c, x, y);

  // ---- sorted sprites ----
  const sprites = props
    .filter((p) => p.layer === 'sorted')
    .map((p) => {
      const { base, emit } = paint(p);
      lightCanvas(base.g, p.w, p.h, p.x, p.y, lightMap);
      base.g.drawImage(emit.c, 0, 0);
      return { c: base.c, x: p.x, y: p.y, sortY: p.sortY };
    });
  const leds = props.flatMap((p) => p.leds);

  // ---- agents ----
  const walk = buildNav(grid, props, [...Object.values(seats), ...spots]);
  validateLayout(walk, [...Object.entries(seats), ...spots.map((s, i) => [`spot${i}`, s])]);
  const world = { walk, spots };
  const agents = AGENTS.filter((a) => seats[a.id]).map((a) => new Agent(a, seats[a.id], world));

  // dust motes drifting in the warm lamp pools
  const motes = allLights
    .filter((l) => (l.k >= 0.9 && l.color === '#ffb46a') || l.color === '#ffb066')
    .flatMap((l, i) => Array.from({ length: 5 }, (_, k) => ({ x: l.x, y: l.y - 12, r: l.r * 0.35, phase: i * 1.7 + k * 2.3, speed: 0.6 + ((i + k) % 4) * 0.2 })));

  return { bg, sprites, leds, agents, lightMap, glow, vignette, motes };
}

// Flood-fills the walk grid from the first seat and warns about anything left unreachable,
// which almost always means a prop is parked in front of a doorway.
function validateLayout(walk, places) {
  const seen = new Uint8Array(walk.length);
  const tile = ([, p]) => {
    const { x, y } = p.access ?? p;
    return Math.floor(y / T) * COLS + Math.floor(x / T);
  };
  const queue = [tile(places[0])];
  seen[queue[0]] = 1;
  while (queue.length) {
    const i = queue.pop();
    for (const n of [i - 1, i + 1, i - COLS, i + COLS]) {
      if (n >= 0 && n < walk.length && walk[n] && !seen[n]) {
        seen[n] = 1;
        queue.push(n);
      }
    }
  }
  const lost = places.filter((p) => !seen[tile(p)]).map(([id]) => id);
  if (lost.length) console.warn('office: unreachable seats/spots:', lost.join(', '));
}

export function drawOffice(g, office, time, { hover, selected, statusColor = () => '#9fb4cc' } = {}) {
  g.drawImage(office.bg.c, 0, 0);
  const items = [
    ...office.sprites.map((s) => ({ sortY: s.sortY, draw: () => g.drawImage(s.c, s.x, s.y) })),
    ...office.agents.map((a) => ({ sortY: a.sortY + 0.5, draw: () => drawAgent(g, a, office, time, a === selected) })),
  ].sort((a, b) => a.sortY - b.sortY);
  for (const it of items) it.draw();

  for (const l of office.leds) {
    const on = Math.sin(time * l.rate + l.phase) > (l.duty ?? -0.3);
    if (on || !l.blinkOnly) P(g, l.x, l.y, on ? l.color : l.off ?? '#0d1a12');
  }
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.drawImage(office.glow, 0, 0);
  for (const m of office.motes) {
    const t = time * 0.25 * m.speed + m.phase;
    const a = 0.25 + 0.25 * Math.sin(time * 1.3 + m.phase * 3);
    g.fillStyle = `rgba(255, 214, 160, ${a})`;
    g.fillRect(Math.round(m.x + Math.cos(t) * m.r), Math.round(m.y + Math.sin(t * 0.7 + m.phase) * m.r * 0.6), 1, 1);
  }
  g.restore();
  g.drawImage(office.vignette, 0, 0);
  for (const a of office.agents) if (a.bubble && a.bubble.until > time) bubble(g, a, time, a === hover || a === selected);
  for (const a of [hover, selected]) if (a) tag(g, a, time, statusColor(a));
}

// Event pop-ups above an ant's head: a tiny pixel badge with an icon, bobbing as it fades in.
const BUBBLES = {
  check: { bg: '#2f8a44', icon: ['.....#', '....#.', '#..#..', '.##...'] },
  alert: { bg: '#d9822b', icon: ['..#..', '..#..', '..#..', '.....', '..#..'] },
  deny: { bg: '#b8392b', icon: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'] },
  test: { bg: '#2f6fb8', icon: ['.#...', '.##..', '.###.', '.##..', '.#...'] },
  shield: { bg: '#a8862a', icon: ['#####', '#####', '.###.', '..#..'] },
};
function bubble(g, a, time, tagged) {
  const b = BUBBLES[a.bubble.kind];
  if (!b) return;
  const left = a.bubble.until - time;
  const rise = Math.min(1, (2.6 - left) * 6);
  const x = Math.round(a.x) + (tagged ? -5 : 5);
  // sit above the name tag when one is showing
  const y = a.bounds().y - 3 - (tagged ? 13 : 0) - Math.round(rise * 3 + Math.sin(time * 4) * 0.6);
  R(g, x, y, 11, 10, '#0a0d12');
  R(g, x + 1, y - 1, 9, 12, '#0a0d12');
  R(g, x + 1, y, 9, 10, b.bg);
  R(g, x + 1, y, 9, 1, 'rgba(255,255,255,0.25)');
  R(g, x + 1, y + 11, 2, 1, '#0a0d12');
  P(g, x + 1, y + 12, '#0a0d12');
  b.icon.forEach((row, j) => [...row].forEach((c, i) => c === '#' && P(g, x + 3 + i, y + 2 + j + (b.icon.length < 5 ? 1 : 0), '#f4fff6')));
}

function drawAgent(g, a, office, time, isSelected) {
  if (isSelected) {
    // pulsing selection ring at the feet
    const k = 0.5 + 0.5 * Math.sin(time * 5);
    g.fillStyle = `rgba(122, 180, 255, ${0.35 + 0.35 * k})`;
    const x = Math.round(a.x);
    const y = Math.round(a.y);
    for (let i = -9; i <= 9; i++) {
      const dy = Math.round(Math.sqrt(1 - (i / 10) ** 2) * 3);
      g.fillRect(x + i, y - dy, 1, 1);
      g.fillRect(x + i, y + dy, 1, 1);
    }
  }
  a.draw(g, office.lightMap);
}

function tag(g, a, time, dot) {
  const b = a.bounds();
  const label = a.id.toUpperCase().replace(/_/g, ' ');
  const w = textWidth(label, 'small') + 10;
  const x = Math.round(a.x - w / 2);
  const y = b.y - 4 + Math.round(Math.sin(time * 3) * 0.6);
  R(g, x, y, w, 9, '#0a0d12');
  R(g, x + 1, y + 1, w - 2, 7, '#151b26');
  R(g, x + 2, y + 3, 3, 3, dot);
  text(g, x + 7, y + 2, label, '#d8e2f0', 'small');
  R(g, Math.round(a.x) - 1, y + 9, 3, 1, '#0a0d12');
  P(g, Math.round(a.x), y + 10, '#0a0d12');
}
