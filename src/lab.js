import { render, blit } from './ant/renderer.js';
import { buildAnt, W, H } from './ant/model.js';
import { ANIMS } from './ant/animations.js';

// sprite height label -> design-to-pixel scale (ant body is ~58 design units tall)
const RES = { 64: 1, 48: 0.82, 32: 0.56 };
const VIEWS = { front: 'Front', side: 'Side', back: 'Back' };

const state = {
  anim: 'idle',
  view: 'front',
  facing: 'right',
  res: 64,
  speed: 1,
  bg: 'dark',
  grid: false,
  smooth: false,
};

function frameOf(anim, time, smooth) {
  const A = ANIMS[anim];
  const f = time * A.fps;
  const frame = Math.floor(f) % A.frames;
  return { frame, t: smooth ? (f % A.frames) / A.frames : frame / A.frames };
}

function drawAnt(g, { anim, view, facing = 'right', s, time, smooth = false, x, y, scale }) {
  const { frame, t } = frameOf(anim, time, smooth);
  const { parts, fx, lights } = buildAnt(view, ANIMS[anim].pose(t, view, frame, time));
  const w = Math.round(W * s);
  const h = Math.round(H * s);
  blit(g, render(parts, { w, h, s, lights, time, fx }), w, h, x, y, scale, facing === 'left');
  return { w, h, frame };
}

// ---- backgrounds ------------------------------------------------------------------------------

const hash = (x, y) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

function drawFloor(g, w, h, px, tile = 14) {
  const tones = ['#4f3726', '#563b29', '#5c402c', '#523927'];
  const T = tile * px;
  for (let ty = 0; ty * T < h; ty++) {
    const off = ty % 2 ? T / 2 : 0;
    for (let tx = -1; tx * T < w; tx++) {
      const x0 = tx * T + off;
      const y0 = ty * T;
      g.fillStyle = tones[Math.floor(hash(tx, ty) * tones.length)];
      g.fillRect(x0, y0, T, T);
      g.fillStyle = '#3b281b';
      g.fillRect(x0, y0, T, px);
      g.fillRect(x0, y0, px, T);
      g.fillStyle = '#6a4a33';
      g.fillRect(x0 + px, y0 + px, T - px, px);
    }
  }
  // warm lamp pools, quantized into a few bands to keep the pixel look
  for (const [cx, cy, r] of [[w * 0.3, h * 0.35, h * 0.9], [w * 0.75, h * 0.4, h * 0.8]]) {
    for (let b = 3; b >= 1; b--) {
      g.fillStyle = `rgba(255, 190, 120, ${0.035 * (4 - b)})`;
      g.beginPath();
      g.ellipse(cx, cy, (r * b) / 3, (r * b) / 4.2, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function drawGrid(g, x, y, w, h, scale) {
  g.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i <= w; i++) g.fillRect(x + i * scale, y, 1, h * scale);
  for (let j = 0; j <= h; j++) g.fillRect(x, y + j * scale, w * scale, 1);
}

// ---- controls ---------------------------------------------------------------------------------

function segmented(id, options, key, onChange) {
  const el = document.getElementById(id);
  el.innerHTML = '';
  for (const [value, label] of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.dataset.value = value;
    b.addEventListener('click', () => {
      state[key] = typeof state[key] === 'number' ? Number(value) : value;
      onChange?.();
      sync();
    });
    el.appendChild(b);
  }
}

function sync() {
  const A = ANIMS[state.anim];
  if (!A.views.includes(state.view)) state.view = A.views[0];
  const mark = (id, val, disabled = () => false) => {
    for (const b of document.getElementById(id).children) {
      b.setAttribute('aria-pressed', String(b.dataset.value === String(val)));
      b.disabled = disabled(b.dataset.value);
    }
  };
  mark('anim', state.anim);
  mark('view', state.view, (v) => !A.views.includes(v));
  mark('facing', state.facing, () => state.view !== 'side');
  mark('res', state.res);
  mark('speed', state.speed);
  mark('bg', state.bg);
  document.getElementById('grid').checked = state.grid;
  document.getElementById('smooth').checked = state.smooth;
}

segmented('anim', Object.entries(ANIMS).map(([k, a]) => [k, a.label]), 'anim');
segmented('view', Object.entries(VIEWS), 'view');
segmented('facing', [['left', '←'], ['right', '→']], 'facing');
segmented('res', [['64', '64 px'], ['48', '48 px'], ['32', '32 px']], 'res');
segmented('speed', [['0.5', '0.5×'], ['1', '1×'], ['2', '2×']], 'speed');
segmented('bg', [['dark', 'Тёмный'], ['floor', 'Пол офиса']], 'bg');
document.getElementById('grid').addEventListener('change', (e) => (state.grid = e.target.checked));
document.getElementById('smooth').addEventListener('change', (e) => (state.smooth = e.target.checked));
sync();

document.getElementById('palette').innerHTML = [
  ['#211b1c', 'Charcoal'],
  ['#352c2c', 'Dark Gray'],
  ['#4a6286', 'Eye Blue-Gray'],
  ['#b4784b', 'Bronze'],
  ['#ebbd8a', 'Warm Light'],
]
  .map(([c, n]) => `<span><i style="background:${c}"></i>${n}</span>`)
  .join('');

// ---- stage ------------------------------------------------------------------------------------

const stage = document.getElementById('stage');
const sg = stage.getContext('2d');
const meta = document.getElementById('stage-meta');

function drawStage(time) {
  const s = RES[state.res];
  const w = Math.round(W * s);
  const h = Math.round(H * s);
  const scale = Math.max(2, Math.floor(460 / h));
  const pad = scale * 4;
  if (stage.width !== w * scale + pad * 2) {
    stage.width = w * scale + pad * 2;
    stage.height = h * scale + pad * 2;
  }
  sg.clearRect(0, 0, stage.width, stage.height);
  if (state.bg === 'floor') drawFloor(sg, stage.width, stage.height, scale);
  const r = drawAnt(sg, { ...state, s, time, x: pad, y: pad, scale });
  if (state.grid) drawGrid(sg, pad, pad, w, h, scale);
  meta.textContent = `${ANIMS[state.anim].label} · ${VIEWS[state.view]} · кадр ${r.frame + 1}/${ANIMS[state.anim].frames} · ${ANIMS[state.anim].fps} fps · буфер ${w}×${h}`;
}

// ---- sheet ------------------------------------------------------------------------------------

const SHEET = [
  ['idle', 'front'],
  ['idle', 'side'],
  ['idle', 'back'],
  ['walk', 'side'],
  ['walk', 'front'],
  ['walk', 'back'],
  ['work', 'side'],
  ['happy', 'front'],
];
const sheetCells = SHEET.map(([anim, view]) => {
  const cell = document.createElement('div');
  cell.className = 'cell';
  const c = document.createElement('canvas');
  c.width = W * 2;
  c.height = H * 2;
  const label = document.createElement('span');
  label.textContent = `${ANIMS[anim].label.toUpperCase()} · ${VIEWS[view].toUpperCase()}`;
  cell.append(c, label);
  cell.addEventListener('click', () => {
    state.anim = anim;
    state.view = view;
    sync();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.getElementById('sheet').appendChild(cell);
  return { anim, view, g: c.getContext('2d'), c };
});

function drawSheet(time) {
  for (const { anim, view, g, c } of sheetCells) {
    g.clearRect(0, 0, c.width, c.height);
    drawAnt(g, { anim, view, s: 1, time, x: 0, y: 0, scale: 2 });
  }
}

// ---- in-game floor ----------------------------------------------------------------------------

const floor = document.getElementById('floor');
const fg = floor.getContext('2d');
const GAME_S = RES[32];
const GAME_SCALE = 2;
// walk cycle moves the body 4 * stride (3.6) design units per cycle
const WALK_SPEED = ((4 * 3.6) / (ANIMS.walk.frames / ANIMS.walk.fps)) * GAME_S * GAME_SCALE;
const walker = { x: 0.3, dir: 1, pause: 0, state: 'walk' };

function drawFloorScene(time, dt) {
  const cw = floor.clientWidth;
  const ch = 220;
  if (floor.width !== cw) {
    floor.width = cw;
    floor.height = ch;
  }
  drawFloor(fg, floor.width, floor.height, GAME_SCALE);
  const sw = Math.round(W * GAME_S) * GAME_SCALE;
  const sh = Math.round(H * GAME_S) * GAME_SCALE;
  const baseY = ch / 2 - sh / 2 + 10;
  const at = (fx) => Math.round((fx * cw - sw / 2) / GAME_SCALE) * GAME_SCALE;

  // walker patrols between 25% and 62%, idling at each end
  const lo = 0.25;
  const hi = 0.62;
  if (walker.state === 'walk') {
    walker.x += (walker.dir * WALK_SPEED * dt) / cw;
    if (walker.x > hi || walker.x < lo) {
      walker.x = Math.min(hi, Math.max(lo, walker.x));
      walker.state = 'idle';
      walker.pause = 2.2;
    }
  } else if ((walker.pause -= dt) <= 0) {
    walker.state = 'walk';
    walker.dir *= -1;
  }

  const actors = [
    { anim: 'idle', view: 'front', fx: 0.1 },
    { anim: walker.state, view: walker.state === 'walk' ? 'side' : 'front', fx: walker.x, facing: walker.dir > 0 ? 'right' : 'left' },
    { anim: 'work', view: 'side', fx: 0.74 },
    { anim: 'happy', view: 'front', fx: 0.9 },
  ];
  for (const a of actors) drawAnt(fg, { ...a, s: GAME_S, time, x: at(a.fx), y: baseY, scale: GAME_SCALE });
}

// ---- loop -------------------------------------------------------------------------------------

let last = performance.now();
let time = 0;
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  time += dt * state.speed;
  drawStage(time);
  drawSheet(time);
  drawFloorScene(time, dt * state.speed);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
