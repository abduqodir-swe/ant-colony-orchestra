// Furniture and wall pieces, drawn procedurally into small sprites.
// Each factory returns { x, y, w, h, sortY, layer, draw(base, emissive), blocks, lights, leds }:
// x/y/w/h is the sprite rect in world pixels, `base` is lit by the room light map, `emissive`
// (screens, lamps, signs) is composited on top unlit. layer: 'floor' | 'wall' | 'sorted'.

import { R, P, box, blob, ellipse, rng, text, textWidth } from './pixel.js';

const OUT = '#140e0c';
const WOOD = { top: '#8c5f3e', topHi: '#a67450', edge: '#6e4a30', front: '#5a3a26', frontLo: '#472d1d', knob: '#a8845c' };
const METAL = ['#191b20', '#24272e', '#30343c', '#434852', '#5a606c'];
const LEAF = ['#1e3a20', '#2c5a2b', '#3f7a35', '#5f9e46'];

const prop = (o) => ({ layer: 'sorted', blocks: [], lights: [], leds: [], ...o });

// ---- screens ----------------------------------------------------------------------------------

function screenContent(g, x, y, w, h, kind, seed) {
  const rnd = rng(seed);
  R(g, x, y, w, h, '#0b1626');
  R(g, x, y, w, 1, '#16304a');
  if (kind === 'code') {
    const cols = ['#5fd0f5', '#7ee07a', '#f29ad8', '#f2c14e', '#9fb4cc'];
    for (let ly = y + 1; ly < y + h - 1; ly += 2) {
      let lx = x + 1 + Math.floor(rnd() * 3);
      const end = x + w - 1 - Math.floor(rnd() * (w / 2));
      while (lx < end) {
        const len = 1 + Math.floor(rnd() * 4);
        R(g, lx, ly, Math.min(len, end - lx), 1, cols[Math.floor(rnd() * cols.length)]);
        lx += len + 1;
      }
    }
  } else if (kind === 'chart') {
    const n = Math.floor((w - 2) / 3);
    for (let i = 0; i < n; i++) {
      const bh = 1 + Math.floor(rnd() * (h - 3));
      R(g, x + 1 + i * 3, y + h - 1 - bh, 2, bh, i % 3 === 2 ? '#f2c14e' : '#5fd0f5');
    }
  } else if (kind === 'line') {
    let ly = y + h - 3;
    for (let lx = x + 1; lx < x + w - 1; lx++) {
      ly = Math.max(y + 2, Math.min(y + h - 2, ly + Math.round(rnd() * 2 - 1.1)));
      P(g, lx, ly, '#7ee07a');
      P(g, lx, ly + 1, '#1f5a3a');
    }
    R(g, x + 1, y + h - 1, w - 2, 1, '#1d3550');
  } else if (kind === 'pie') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) / 2 - 1.5;
    for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
      const dx = px + 0.5 - cx;
      const dy = py + 0.5 - cy;
      if (dx * dx + dy * dy > r * r) continue;
      const a = Math.atan2(dy, dx);
      P(g, px, py, a < -1 ? '#f2c14e' : a < 1.4 ? '#5fd0f5' : '#f29ad8');
    }
  } else if (kind === 'dash') {
    R(g, x + 1, y + 1, Math.floor(w / 2) - 1, 2, '#5fd0f5');
    R(g, x + 1, y + 4, w - 2, 1, '#1d3550');
    for (let i = 0; i < 3; i++) R(g, x + 1 + i * Math.floor(w / 3), y + 6, Math.floor(w / 3) - 1, h - 7, ['#123a2a', '#3a2a12', '#12304a'][i]);
    for (let i = 0; i < 3; i++) R(g, x + 2 + i * Math.floor(w / 3), y + h - 3, 2, 1, ['#7ee07a', '#f2c14e', '#5fd0f5'][i]);
  } else if (kind === 'design') {
    R(g, x + 1, y + 1, w - 2, 2, '#f29ad8');
    R(g, x + 1, y + 4, Math.floor(w / 2) - 1, h - 5, '#2a2440');
    R(g, x + Math.floor(w / 2) + 1, y + 4, Math.floor(w / 2) - 2, 3, '#f2c14e');
    R(g, x + Math.floor(w / 2) + 1, y + 8, Math.floor(w / 2) - 2, h - 9, '#5fd0f5');
  }
}

function monitor(gb, ge, x, y, kind, seed, w = 16, h = 12) {
  box(gb, x, y, w, h, METAL[1], { hi: METAL[3] });
  screenContent(ge, x + 2, y + 2, w - 4, h - 4, kind, seed);
  R(gb, x + w / 2 - 1, y + h, 2, 2, METAL[0]);
  R(gb, x + w / 2 - 3, y + h + 1, 6, 1, METAL[2]);
}

// ---- desks & seating --------------------------------------------------------------------------

// Desk seen from the front-ish top: monitors stand at the back edge, screens face the viewer.
export function desk(x, y, { w = 32, screens = ['code'], seed = 1, lamp = false, plant: deskPlant = false } = {}) {
  const top = 18;
  const n = screens.length;
  const lights = screens.map((_, i) => ({ x: x + ((i + 0.5) * w) / n, y: y - 6, r: 40, k: 0.36, color: '#4fb0ff', glow: { r: 13, k: 0.16 } }));
  if (lamp) lights.push({ x: x + 3, y: y + 2, r: 44, k: 0.6, color: '#ffb866', glow: { r: 8, k: 0.5, y: y - 3 } });
  const leds = screens.flatMap((k, i) => (k === 'code' ? [{ x: Math.round(x + ((i + 0.5) * w) / n) - 3, y: y - 5, color: '#e8f0ff', rate: 7, phase: seed, blinkOnly: true, duty: 0 }] : []));
  return prop({
    x, y: y - top, w, h: top + 22, sortY: y + 20,
    blocks: [[x, y, w, 20]],
    lights,
    leds,
    draw(gb, ge) {
      const rnd = rng(seed);
      const oy = top;
      R(gb, 0, oy, w, 21, OUT);
      R(gb, 1, oy + 1, w - 2, 8, WOOD.top);
      R(gb, 1, oy + 1, w - 2, 1, WOOD.topHi);
      R(gb, 1, oy + 9, w - 2, 1, WOOD.edge);
      R(gb, 1, oy + 10, w - 2, 10, WOOD.front);
      R(gb, 1, oy + 18, w - 2, 2, WOOD.frontLo);
      R(gb, Math.floor(w / 2), oy + 11, 1, 7, WOOD.frontLo);
      R(gb, Math.floor(w / 4), oy + 13, 3, 1, WOOD.knob);
      R(gb, Math.floor((3 * w) / 4) - 2, oy + 13, 3, 1, WOOD.knob);
      // keyboard, papers, mug
      R(gb, w / 2 - 6, oy + 5, 12, 3, OUT);
      R(gb, w / 2 - 5, oy + 5, 10, 2, '#3a3d45');
      for (let i = 0; i < 5; i++) P(gb, w / 2 - 4 + i * 2, oy + 5, '#5d616c');
      if (rnd() > 0.3) R(gb, 2, oy + 3, 5, 4, '#d8d0bf'), R(gb, 2, oy + 6, 5, 1, '#b3aa97');
      if (rnd() > 0.4) {
        const mx = w - 6;
        R(gb, mx, oy + 1, 4, 5, OUT);
        R(gb, mx + 1, oy + 2, 2, 3, ['#c9573f', '#e8e0d0', '#3f6fa8'][Math.floor(rnd() * 3)]);
        P(gb, mx + 4, oy + 3, OUT);
      }
      screens.forEach((kind, i) => {
        const cx = ((i + 0.5) * w) / n;
        monitor(gb, ge, Math.round(cx - 8), oy - 12, kind, seed * 7 + i);
        if (rnd() > 0.6) R(gb, Math.round(cx + 5), oy - 11, 2, 2, '#f2d060');
      });
      if (lamp) {
        R(gb, 1, oy - 7, 6, 4, OUT);
        R(ge, 2, oy - 6, 4, 2, '#ffcf7a');
        R(gb, 3, oy - 3, 1, 5, OUT);
        R(gb, 1, oy + 1, 5, 2, OUT);
      }
      if (deskPlant) {
        R(gb, w - 7, oy + 3, 5, 4, OUT);
        R(gb, w - 6, oy + 4, 3, 2, '#6b4230');
        blob(gb, w - 4.5, oy + 1, 2.4, 2, LEAF);
      }
    },
  });
}

// Office chair seen from behind; the seated ant is drawn first so the backrest hides its legs.
export function chair(x, y, { color = '#2d2f37' } = {}) {
  return prop({
    x: x - 7, y: y - 18, w: 14, h: 22, sortY: y + 3,
    draw(gb) {
      R(gb, 2, 0, 10, 1, OUT);
      R(gb, 1, 1, 12, 13, OUT);
      R(gb, 2, 1, 10, 12, color);
      R(gb, 2, 1, 10, 1, '#4a4d58');
      R(gb, 2, 2, 1, 10, '#3d404a');
      R(gb, 11, 2, 1, 11, '#1d1e24');
      R(gb, 4, 4, 6, 1, '#383b45');
      R(gb, 2, 14, 10, 2, OUT);
      R(gb, 3, 14, 8, 1, '#1d1e24');
      R(gb, 6, 16, 2, 3, METAL[0]);
      R(gb, 2, 19, 10, 1, METAL[2]);
      P(gb, 1, 20, OUT), P(gb, 6, 20, OUT), P(gb, 12, 20, OUT);
    },
  });
}

// Chair seen from the front, standing behind a table: drawn before the seated ant.
export function chairBack(x, y, { color = '#2d2f37' } = {}) {
  return prop({
    x: x - 7, y: y - 26, w: 14, h: 14, sortY: y - 1,
    draw(gb) {
      R(gb, 1, 0, 12, 12, OUT);
      R(gb, 2, 1, 10, 10, color);
      R(gb, 2, 1, 10, 1, '#4a4d58');
      R(gb, 6, 12, 2, 2, METAL[0]);
    },
  });
}

export function holoTable(x, y, { w = 64 } = {}) {
  const top = 20;
  return prop({
    x, y: y - top, w, h: top + 22, sortY: y + 21,
    blocks: [[x, y, w, 20]],
    lights: [{ x: x + w / 2, y: y + 2, r: 96, k: 0.85, color: '#3fb8f0', glow: { r: 46, k: 0.2 } }],
    draw(gb, ge) {
      const oy = top;
      R(gb, 0, oy, w, 21, OUT);
      R(gb, 1, oy + 1, w - 2, 10, '#14202a');
      R(gb, 1, oy + 11, w - 2, 9, METAL[1]);
      R(gb, 1, oy + 11, w - 2, 1, METAL[3]);
      R(gb, 1, oy + 18, w - 2, 2, METAL[0]);
      // glowing surface grid + front light strip
      for (let i = 2; i < w - 2; i++) for (let j = 2; j < 10; j++) {
        if (i % 4 === 0 || j % 3 === 0) P(ge, i, oy + j, (i + j) % 7 === 0 ? '#bff2ff' : '#2a8fc4');
        else P(ge, i, oy + j, '#123a54');
      }
      R(ge, 4, oy + 14, w - 8, 1, '#5fd0f5');
      // floating hologram bits at both ends, leaving the middle clear for the presenter
      for (const cx of [10, w - 11]) {
        for (let k = 0; k < 4; k++) R(ge, cx - 4 + k, oy - 3 - k * 3, 9 - k * 2, 1, k % 2 ? '#7fe6ff' : '#3fb0e0');
        P(ge, cx, oy - 15, '#bff2ff');
      }
      for (let i = 0; i < 8; i++) P(ge, 18 + i * ((w - 36) / 7), oy - 1 - (i % 3), '#7fe6ff');
    },
  });
}

export function meetingTable(x, y, { w = 88, h = 18, seed = 3 } = {}) {
  return prop({
    x, y, w, h: h + 9, sortY: y + h + 8,
    blocks: [[x, y, w, h + 6]],
    draw(gb, ge) {
      const rnd = rng(seed);
      R(gb, 0, 0, w, h + 9, OUT);
      R(gb, 1, 1, w - 2, h - 1, WOOD.top);
      R(gb, 1, 1, w - 2, 1, WOOD.topHi);
      for (let i = 4; i < w - 4; i += 9) R(gb, i, 2, 6, h - 3, '#94664a');
      R(gb, 1, h, w - 2, 1, WOOD.edge);
      R(gb, 1, h + 1, w - 2, 7, WOOD.front);
      R(gb, 1, h + 6, w - 2, 2, WOOD.frontLo);
      // papers, laptops, cups
      for (let i = 0; i < 5; i++) {
        const px = 6 + Math.floor((i * (w - 16)) / 4);
        const py = 3 + Math.floor(rnd() * (h - 9));
        if (i % 2) {
          R(gb, px, py, 9, 6, OUT);
          R(gb, px + 1, py + 1, 7, 4, METAL[2]);
          screenContent(ge, px + 2, py + 1, 5, 3, 'code', seed + i);
        } else {
          R(gb, px, py, 6, 5, '#ddd5c4');
          R(gb, px + 1, py + 1, 4, 1, '#9a917f');
          R(gb, px + 1, py + 3, 3, 1, '#9a917f');
        }
      }
    },
  });
}

export function sofa(x, y, { w = 56 } = {}) {
  const C = ['#4a1a17', '#6b2620', '#8a3428', '#a8483a'];
  return prop({
    x, y, w, h: 27, sortY: y + 18,
    blocks: [[x, y + 4, w, 22]],
    draw(gb) {
      R(gb, 0, 0, w, 27, OUT);
      R(gb, 1, 1, w - 2, 10, C[1]);
      R(gb, 1, 1, w - 2, 2, C[3]);
      R(gb, 1, 3, w - 2, 1, C[2]);
      for (let i = 10; i < w - 8; i += 10) P(gb, i, 6, C[0]);
      // arms
      for (const ax of [1, w - 9]) {
        R(gb, ax, 5, 8, 20, C[1]);
        R(gb, ax, 5, 8, 2, C[3]);
        R(gb, ax + (ax === 1 ? 7 : 0), 7, 1, 18, C[0]);
      }
      // cushions
      const cw = Math.floor((w - 18) / 2);
      for (let i = 0; i < 2; i++) {
        const cx = 9 + i * cw;
        R(gb, cx, 11, cw - 1, 8, C[2]);
        R(gb, cx, 11, cw - 1, 1, C[3]);
        R(gb, cx + cw - 1, 11, 1, 8, C[0]);
      }
      R(gb, 9, 19, w - 18, 6, C[1]);
      R(gb, 9, 23, w - 18, 2, C[0]);
    },
  });
}

export function armchair(x, y, { facing = 'front' } = {}) {
  const s = sofa(x, y, { w: 24 });
  const C = ['#4a1a17', '#6b2620', '#8a3428', '#a8483a'];
  if (facing === 'back') {
    // seen from behind: seat cushion at the top, tall backrest toward the viewer
    return { ...s, sortY: y + 26, draw(gb) {
      R(gb, 0, 0, 24, 27, OUT);
      R(gb, 1, 1, 6, 25, C[1]);
      R(gb, 17, 1, 6, 25, C[1]);
      R(gb, 1, 1, 6, 1, C[3]);
      R(gb, 17, 1, 6, 1, C[3]);
      R(gb, 7, 1, 10, 9, C[2]);
      R(gb, 7, 1, 10, 1, C[3]);
      R(gb, 1, 10, 22, 16, OUT);
      R(gb, 2, 11, 20, 14, C[1]);
      R(gb, 2, 11, 20, 2, C[3]);
      R(gb, 2, 13, 20, 1, C[2]);
      for (const tx of [7, 12, 17]) P(gb, tx, 17, C[0]);
      R(gb, 2, 23, 20, 2, C[0]);
    } };
  }
  return { ...s, draw(gb) {
    R(gb, 0, 0, 24, 27, OUT);
    R(gb, 1, 1, 22, 10, C[1]);
    R(gb, 1, 1, 22, 2, C[3]);
    R(gb, 1, 5, 6, 20, C[1]);
    R(gb, 17, 5, 6, 20, C[1]);
    R(gb, 1, 5, 6, 2, C[3]);
    R(gb, 17, 5, 6, 2, C[3]);
    R(gb, 7, 11, 10, 8, C[2]);
    R(gb, 7, 11, 10, 1, C[3]);
    R(gb, 7, 19, 10, 6, C[1]);
    R(gb, 7, 23, 10, 2, C[0]);
  } };
}

export function coffeeTable(x, y) {
  return prop({
    x, y, w: 30, h: 15, sortY: y + 14,
    blocks: [[x, y, 30, 14]],
    draw(gb) {
      R(gb, 0, 0, 30, 15, OUT);
      R(gb, 1, 1, 28, 8, WOOD.top);
      R(gb, 1, 1, 28, 1, WOOD.topHi);
      R(gb, 1, 9, 28, 5, WOOD.front);
      R(gb, 4, 3, 4, 4, OUT), R(gb, 5, 4, 2, 2, '#e8e0d0');
      R(gb, 13, 3, 9, 4, '#3f6fa8'), R(gb, 13, 3, 9, 1, '#5f8fc8');
      R(gb, 23, 4, 4, 3, OUT), R(gb, 24, 4, 2, 2, '#c9573f');
    },
  });
}

// ---- storage & equipment ----------------------------------------------------------------------

export function bookshelf(x, y, { w = 30, h = 40, seed = 5 } = {}) {
  const spines = ['#7a3b33', '#3b5a7a', '#6b7a3b', '#8a6b3b', '#5a3b6b', '#a08a5a', '#2f6a6a', '#9a5a3a'];
  return prop({
    x, y, w, h, sortY: y + h,
    blocks: [[x, y + h - 12, w, 12]],
    draw(gb) {
      const rnd = rng(seed);
      R(gb, 0, 0, w, h, OUT);
      R(gb, 1, 1, w - 2, h - 2, '#4a3020');
      R(gb, 1, 1, w - 2, 1, '#6b4a30');
      R(gb, 3, 3, w - 6, h - 6, '#1e140d');
      const shelves = 4;
      const sh = Math.floor((h - 6) / shelves);
      for (let s = 0; s < shelves; s++) {
        const by = 3 + (s + 1) * sh;
        R(gb, 2, by - 1, w - 4, 2, '#6b4a30');
        let bx = 3;
        while (bx < w - 4) {
          if (rnd() > 0.88) {
            bx += 3;
            continue;
          }
          const bw = 2 + Math.floor(rnd() * 2);
          const bh = sh - 3 - Math.floor(rnd() * 3);
          const c = spines[Math.floor(rnd() * spines.length)];
          R(gb, bx, by - 1 - bh, Math.min(bw, w - 4 - bx), bh, c);
          P(gb, bx, by - 1 - bh, '#d8c8a8');
          bx += bw;
        }
      }
    },
  });
}

export function serverRack(x, y, { seed = 9 } = {}) {
  const w = 16;
  const h = 44;
  const leds = [];
  const rnd = rng(seed);
  for (let i = 0; i < 7; i++) {
    leds.push({ x: x + 11, y: y + 6 + i * 5, color: ['#4ee07a', '#5fd0f5', '#f2a43a'][Math.floor(rnd() * 3)], rate: 0.6 + rnd() * 3, phase: rnd() * 10 });
    leds.push({ x: x + 13, y: y + 6 + i * 5, color: '#4ee07a', rate: 2 + rnd() * 5, phase: rnd() * 10 });
  }
  return prop({
    x, y, w, h, sortY: y + h,
    blocks: [[x, y + h - 14, w, 14]],
    leds,
    lights: [{ x: x + 8, y: y + h - 6, r: 30, k: 0.3, color: '#4ee0a0' }],
    draw(gb) {
      R(gb, 0, 0, w, h, OUT);
      R(gb, 1, 1, w - 2, 3, METAL[3]);
      R(gb, 1, 4, w - 2, h - 5, METAL[1]);
      for (let i = 0; i < 7; i++) {
        const sy = 5 + i * 5;
        R(gb, 2, sy, w - 4, 4, METAL[0]);
        for (let vx = 3; vx < 10; vx += 2) P(gb, vx, sy + 1, METAL[2]), P(gb, vx, sy + 2, METAL[2]);
      }
      R(gb, 1, h - 3, w - 2, 2, METAL[0]);
    },
  });
}

export function plant(x, y, { size = 'big', seed = 2, style = 'bush' } = {}) {
  if (style === 'snake') return snakePlant(x, y, seed);
  const big = size === 'big';
  const w = big ? 26 : 16;
  const h = big ? 34 : 20;
  return prop({
    x: x - w / 2, y: y - h, w, h, sortY: y,
    blocks: [[x - 6, y - 8, 12, 8]],
    draw(gb) {
      const rnd = rng(seed);
      const cx = w / 2;
      const pw = big ? 12 : 8;
      const ph = big ? 9 : 6;
      // leaves: fronds of shaded blobs fanning up from the pot
      const n = big ? 14 : 7;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (rnd() - 0.5) * 2.6;
        const d = (big ? 3 : 1.5) + rnd() * (big ? 11 : 6);
        const lx = cx + Math.cos(a) * d * 1.1;
        const ly = h - ph - (big ? 3 : 2) + Math.sin(a) * d;
        blob(gb, lx, ly, big ? 3.2 + rnd() * 1.6 : 2.2 + rnd(), big ? 2.4 + rnd() : 1.8, LEAF);
      }
      blob(gb, cx, h - ph - (big ? 5 : 3), big ? 4 : 2.6, big ? 3 : 2, LEAF);
      // pot
      const px = cx - pw / 2;
      const py = h - ph;
      R(gb, px, py, pw, ph, OUT);
      R(gb, px + 1, py + 1, pw - 2, ph - 2, '#6b4230');
      R(gb, px + 1, py + 1, pw - 2, 2, '#8a5a3e');
      R(gb, px + 1, py + 1, 2, ph - 2, '#7a4c36');
      R(gb, px + pw - 3, py + 3, 2, ph - 4, '#4a2e22');
    },
  });
}

export function floorLamp(x, y) {
  return prop({
    x: x - 6, y: y - 32, w: 12, h: 33, sortY: y,
    blocks: [[x - 4, y - 4, 8, 4]],
    lights: [{ x, y: y - 20, r: 110, k: 1, color: '#ffb066', glow: { r: 18, k: 0.4, y: y - 27 } }],
    draw(gb, ge) {
      R(gb, 5, 8, 2, 22, OUT);
      R(gb, 5, 8, 1, 22, '#5a4a3a');
      R(gb, 2, 29, 8, 3, OUT);
      R(gb, 3, 30, 6, 1, '#6b5a48');
      R(gb, 1, 0, 10, 9, OUT);
      R(ge, 2, 1, 8, 7, '#f4b862');
      R(ge, 3, 1, 6, 1, '#ffe2a8');
      R(ge, 2, 7, 8, 1, '#ffe8b8');
      R(ge, 4, 8, 4, 1, '#fff2d0');
    },
  });
}

export function vending(x, y) {
  return prop({
    x, y, w: 22, h: 38, sortY: y + 38,
    blocks: [[x, y + 24, 22, 14]],
    lights: [{ x: x + 11, y: y + 30, r: 44, k: 0.5, color: '#7ab8ff', glow: { r: 18, k: 0.18, y: y + 16 } }],
    draw(gb, ge) {
      R(gb, 0, 0, 22, 38, OUT);
      R(gb, 1, 1, 20, 36, '#2a3550');
      R(gb, 1, 1, 20, 1, '#45547a');
      R(ge, 3, 4, 12, 24, '#0e1a2c');
      const cols = ['#e0503c', '#f2c14e', '#5fd0f5', '#7ee07a', '#f29ad8'];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) R(ge, 4 + c * 3, 5 + r * 5, 2, 3, cols[(r + c) % cols.length]);
      R(ge, 16, 5, 3, 2, '#7ee07a');
      R(gb, 16, 9, 3, 6, METAL[2]);
      R(gb, 3, 30, 12, 4, METAL[0]);
    },
  });
}

export function waterCooler(x, y) {
  return prop({
    x, y, w: 12, h: 26, sortY: y + 26,
    blocks: [[x, y + 14, 12, 12]],
    draw(gb, ge) {
      R(gb, 2, 0, 8, 10, OUT);
      R(ge, 3, 1, 6, 8, '#5aa8d8');
      R(ge, 3, 1, 2, 8, '#8fd0f0');
      R(gb, 0, 9, 12, 17, OUT);
      R(gb, 1, 10, 10, 15, '#d8d4cc');
      R(gb, 1, 10, 10, 1, '#f0ece4');
      R(gb, 2, 16, 8, 3, '#9a968e');
      P(gb, 4, 17, '#3a6aa8');
      P(gb, 7, 17, '#c9573f');
      R(gb, 3, 21, 6, 1, '#b8b4ac');
    },
  });
}

export function cabinet(x, y) {
  return prop({
    x, y, w: 18, h: 24, sortY: y + 24,
    blocks: [[x, y + 10, 18, 14]],
    draw(gb, ge) {
      R(gb, 0, 0, 18, 24, OUT);
      R(gb, 1, 1, 16, 22, METAL[2]);
      R(gb, 1, 1, 16, 1, METAL[4]);
      R(gb, 2, 4, 14, 18, METAL[1]);
      ellipse(gb, 9, 12, 3.5, 3.5, METAL[3]);
      ellipse(gb, 9, 12, 2, 2, METAL[0]);
      P(ge, 14, 6, '#4ee07a');
    },
  });
}

export function specimenTank(x, y) {
  return prop({
    x, y, w: 16, h: 32, sortY: y + 32,
    blocks: [[x, y + 20, 16, 12]],
    lights: [{ x: x + 8, y: y + 18, r: 60, k: 0.75, color: '#4ee07a', glow: { r: 22, k: 0.3, y: y + 14 } }],
    draw(gb, ge) {
      R(gb, 1, 0, 14, 4, OUT);
      R(gb, 2, 1, 12, 2, METAL[3]);
      R(gb, 1, 4, 14, 22, OUT);
      R(ge, 2, 4, 12, 22, '#1a5a2e');
      R(ge, 3, 9, 10, 17, '#2fa84e');
      R(ge, 3, 9, 10, 1, '#8ff0a8');
      R(ge, 3, 4, 2, 22, '#5fd080');
      for (const [bx, by] of [[6, 20], [9, 15], [7, 12], [10, 22]]) P(ge, bx, by, '#c8ffd8');
      R(gb, 0, 26, 16, 6, OUT);
      R(gb, 1, 27, 14, 4, METAL[2]);
      P(ge, 4, 29, '#4ee07a');
    },
  });
}

// QA test-results board on an easel
export function testBoard(x, y) {
  return prop({
    x, y, w: 46, h: 36, sortY: y + 36,
    blocks: [[x + 2, y + 28, 42, 8]],
    draw(gb) {
      R(gb, 6, 28, 2, 8, OUT), R(gb, 38, 28, 2, 8, OUT);
      R(gb, 0, 0, 46, 29, OUT);
      R(gb, 1, 1, 44, 27, '#e6dfcf');
      R(gb, 1, 1, 44, 1, '#f6f0e2');
      R(gb, 1, 26, 44, 2, '#bdb4a0');
      text(gb, 3, 3, 'TESTS', '#2a2a30', 'small');
      R(gb, 26, 3, 3, 1, '#2fa84e'), P(gb, 25, 2, '#2fa84e'), P(gb, 29, 2, '#2fa84e');
      text(gb, 3, 10, '55 PASSED', '#2f8a44', 'small');
      text(gb, 3, 16, '3 FAILED', '#c0392b', 'small');
      text(gb, 3, 22, 'COV', '#2a2a30', 'small');
      R(gb, 16, 22, 20, 4, '#c8c0ae');
      R(gb, 16, 22, 17, 4, '#2fa84e');
      text(gb, 37, 22, '87', '#2a2a30', 'small');
    },
  });
}

export function sketchEasel(x, y) {
  return prop({
    x, y, w: 32, h: 36, sortY: y + 36,
    blocks: [[x + 2, y + 28, 28, 8]],
    draw(gb) {
      R(gb, 5, 28, 2, 8, OUT), R(gb, 25, 28, 2, 8, OUT);
      R(gb, 0, 0, 32, 29, OUT);
      R(gb, 1, 1, 30, 27, '#efe8da');
      box(gb, 3, 3, 12, 10, '#f6c8e6', { outline: '#7a5a72' });
      box(gb, 17, 3, 12, 10, '#c8e6f6', { outline: '#5a6a7a' });
      box(gb, 3, 15, 26, 10, '#f6e6c0', { outline: '#7a6a4a' });
      R(gb, 5, 17, 10, 1, '#7a6a4a'), R(gb, 5, 19, 16, 1, '#b8a888'), R(gb, 5, 21, 12, 1, '#b8a888');
    },
  });
}

export function rug(x, y, w, h, { field = '#6e2a26', border = '#a8553f', motif = '#8a3a30' } = {}) {
  return prop({
    x, y, w, h, sortY: 0, layer: 'floor',
    draw(gb) {
      R(gb, 0, 0, w, h, '#2a120e');
      R(gb, 1, 1, w - 2, h - 2, border);
      R(gb, 3, 3, w - 6, h - 6, field);
      for (let yy = 5; yy < h - 5; yy++) for (let xx = 5; xx < w - 5; xx++) {
        if ((xx + yy) % 8 === 0 || (xx - yy + 1000) % 8 === 0) P(gb, xx, yy, motif);
      }
      R(gb, 3, 3, w - 6, 1, motif);
      R(gb, 3, h - 4, w - 6, 1, motif);
    },
  });
}

// ---- wall pieces (drawn into the background, on brick faces) ----------------------------------

export function sign(cx, y, label, color) {
  const tw = textWidth(label);
  const w = tw + 10;
  const x = Math.round(cx - w / 2);
  return prop({
    x, y, w, h: 12, layer: 'wall',
    lights: [{ x: cx, y: y + 8, r: w * 0.6, k: 0.4, color, glow: { r: w * 0.5, k: 0.12, y: y + 6 } }],
    draw(gb, ge) {
      R(ge, 0, 0, w, 12, OUT);
      R(ge, 1, 1, w - 2, 10, '#121a26');
      R(ge, 1, 1, w - 2, 1, '#1d2a3c');
      R(ge, 2, 2, w - 4, 8, '#0e1520');
      text(ge, 5, 3, label, color);
      // thin accent frame in the room colour
      R(ge, 1, 11, w - 2, 1, color);
    },
  });
}

export function pendant(x, y) {
  return prop({
    x: x - 5, y, w: 10, h: 10, layer: 'wall',
    lights: [
      { x, y: y + 44, r: 124, k: 0.95, color: '#ffb46a', squash: 0.72 },
      { x, y: y + 12, r: 30, k: 0.8, color: '#ffc480', glow: { r: 14, k: 0.45, y: y + 8 } },
    ],
    draw(gb, ge) {
      R(gb, 4, 0, 1, 4, OUT);
      R(gb, 1, 4, 8, 4, OUT);
      R(gb, 2, 4, 6, 2, '#a8783a');
      R(gb, 2, 4, 6, 1, '#d8a85a');
      R(ge, 2, 6, 6, 2, '#ffd890');
      R(ge, 3, 8, 4, 1, '#fff0c8');
    },
  });
}

export function wallScreen(x, y, w, h, kind, { seed = 4, title } = {}) {
  return prop({
    x, y, w, h, layer: 'wall',
    lights: [{ x: x + w / 2, y: y + h + 8, r: Math.max(34, w), k: 0.34, color: kind === 'checklist' || kind === 'secscan' ? '#4ee08a' : kind === 'shield' ? '#f2c14e' : '#4fb0ff', glow: { r: Math.max(12, w * 0.55), k: 0.14, y: y + h / 2 } }],
    draw(gb, ge) {
      box(gb, 0, 0, w, h, METAL[1], { hi: METAL[3] });
      if (kind === 'checklist') {
        R(ge, 2, 2, w - 4, h - 4, '#0c1f1a');
        ['PLAN', 'REVIEW', 'DECIDE'].forEach((t, i) => {
          R(ge, 4, 4 + i * 6, 3, 3, '#2f8a44');
          P(ge, 5, 5 + i * 6, '#bff0c8');
          text(ge, 9, 3 + i * 6, t, '#9ff0b0', 'small');
        });
      } else if (kind === 'codeicon') {
        R(ge, 2, 2, w - 4, h - 4, '#0d1830');
        text(ge, Math.round(w / 2 - 8), Math.round(h / 2 - 3), '</>', '#6fa8ff');
      } else if (kind === 'secscan') {
        R(ge, 2, 2, w - 4, h - 4, '#0c1f16');
        const wide = w >= 60;
        text(ge, 4, 3, wide ? 'SECURITY SCAN' : 'SCAN', '#7ee07a', 'small');
        text(ge, 4, 9, 'NO ISSUES', '#4fae5a', 'small');
        const ix = wide ? w - 9 : w - 15;
        const iy = wide ? 8 : 2;
        R(ge, ix, iy, 5, 5, '#2f8a44'), P(ge, ix + 1, iy + 2, '#bff0c8'), P(ge, ix + 2, iy + 3, '#bff0c8'), P(ge, ix + 3, iy + 1, '#bff0c8');
      } else if (kind === 'shield') {
        R(ge, 2, 2, w - 4, h - 4, '#1a1608');
        const cx = w / 2;
        for (let j = 0; j < h - 6; j++) {
          const hw = j < (h - 6) / 2 ? 5 : Math.max(0, 5 - (j - (h - 6) / 2) * 1.2);
          R(ge, Math.round(cx - hw), 3 + j, Math.round(hw * 2), 1, j < 2 ? '#ffe08a' : '#f2c14e');
        }
        R(ge, Math.round(cx - 1), 6, 2, h - 12, '#8a6a1a');
      } else if (kind === 'cctv') {
        const cw = Math.floor((w - 4) / 3);
        const ch = Math.floor((h - 4) / 2);
        const rnd = rng(seed);
        for (let i = 0; i < 6; i++) {
          const fx = 2 + (i % 3) * cw;
          const fy = 2 + Math.floor(i / 3) * ch;
          R(ge, fx, fy, cw - 1, ch - 1, '#1c2a30');
          for (let k = 0; k < 4; k++) P(ge, fx + Math.floor(rnd() * (cw - 1)), fy + Math.floor(rnd() * (ch - 1)), '#5a7a80');
          R(ge, fx, fy + ch - 3, cw - 1, 1, '#33464c');
        }
        P(ge, w - 4, 3, '#e0503c');
      } else if (kind === 'tv') {
        R(ge, 2, 2, w - 4, h - 4, '#0b1626');
        // world map dots with live markers
        const rnd = rng(seed);
        for (let i = 0; i < (w * h) / 6; i++) {
          const px = 3 + Math.floor(rnd() * (w - 6));
          const py = 3 + Math.floor(rnd() * (h - 6));
          if (Math.sin(px * 0.35) + Math.cos(py * 0.6 + px * 0.1) > 0.4) P(ge, px, py, '#1f4a6a');
        }
        for (let i = 0; i < 4; i++) P(ge, 4 + Math.floor(rnd() * (w - 8)), 4 + Math.floor(rnd() * (h - 8)), ['#f2a43a', '#4ee07a', '#5fd0f5'][i % 3]);
      } else {
        screenContent(ge, 2, 2, w - 4, h - 4, kind, seed);
      }
      if (title) text(ge, 3, 3, title, '#9fb4cc', 'small');
    },
  });
}

export function whiteboard(x, y, w, h, kind = 'flow') {
  return prop({
    x, y, w, h, layer: 'wall',
    draw(gb) {
      R(gb, 0, 0, w, h, OUT);
      R(gb, 1, 1, w - 2, h - 2, '#9a9488');
      R(gb, 2, 2, w - 4, h - 4, kind === 'cork' ? '#a8784a' : '#e8e2d4');
      if (kind === 'flow') {
        const nodes = [[5, 4], [w / 2 - 4, 3], [w - 14, 5], [w / 2 - 10, h - 9], [w / 2 + 4, h - 9]];
        nodes.forEach(([nx, ny], i) => box(gb, nx, ny, 9, 5, ['#f6d8a0', '#c8e6f6', '#d8f0c8', '#f6c8d8', '#e0d0f0'][i], { outline: '#5a5448' }));
        R(gb, 14, 6, w / 2 - 18, 1, '#5a5448');
        R(gb, w / 2 + 5, 6, w / 2 - 19, 1, '#5a5448');
        R(gb, w / 2, 8, 1, h - 17, '#5a5448');
      } else if (kind === 'kanban') {
        text(gb, Math.round(w / 2 - textWidth('BACKLOG', 'small') / 2), 3, 'BACKLOG', '#2a2a30', 'small');
        const cw = Math.floor((w - 6) / 3);
        ['TODO', 'DOING', 'DONE'].forEach((t, i) => {
          const cx = 3 + i * cw;
          R(gb, cx, 9, cw - 1, h - 11, '#d8d2c2');
          text(gb, cx + 1, 10, t, '#4a4a50', 'small');
          const notes = [['#f2d060', '#f2a0c0', '#90c8f0'], ['#90e0a0', '#f2d060'], ['#90c8f0', '#90e0a0', '#f2a0c0']][i];
          notes.forEach((c, k) => R(gb, cx + 1 + (k % 2) * 5, 16 + Math.floor(k / 2) * 4, 4, 3, c));
        });
      } else if (kind === 'cork') {
        const cards = ['#f6c8e6', '#c8e6f6', '#f6e6c0', '#d8f0c8', '#e0d0f0', '#f2a0a0'];
        for (let i = 0; i < 6; i++) {
          const cx = 4 + (i % 3) * Math.floor((w - 8) / 3);
          const cy = 3 + Math.floor(i / 3) * Math.floor((h - 6) / 2);
          box(gb, cx, cy, Math.floor((w - 8) / 3) - 2, Math.floor((h - 6) / 2) - 1, cards[i], { outline: '#6a5a4a' });
          P(gb, cx + 3, cy, '#c0392b');
        }
      }
    },
  });
}

export function frame(x, y, w, h, { seed = 8 } = {}) {
  return prop({
    x, y, w, h, layer: 'wall',
    draw(gb) {
      const rnd = rng(seed);
      R(gb, 0, 0, w, h, OUT);
      R(gb, 1, 1, w - 2, h - 2, '#a8783a');
      R(gb, 2, 2, w - 4, h - 4, '#2a3a4a');
      R(gb, 2, h - 6, w - 4, 4, '#3a5a3a');
      for (let i = 0; i < 3; i++) R(gb, 3 + Math.floor(rnd() * (w - 8)), 3 + Math.floor(rnd() * 3), 2, 2, '#f2d090');
    },
  });
}

export function bench(x, y, { w = 30 } = {}) {
  return prop({
    x, y, w, h: 12, sortY: y + 11,
    blocks: [[x, y + 2, w, 9]],
    draw(gb) {
      R(gb, 0, 0, w, 8, OUT);
      R(gb, 1, 1, w - 2, 3, WOOD.topHi);
      R(gb, 1, 4, w - 2, 3, WOOD.top);
      R(gb, 1, 4, w - 2, 1, WOOD.edge);
      for (const lx of [2, w - 5]) R(gb, lx, 8, 3, 4, OUT), R(gb, lx + 1, 8, 1, 3, METAL[2]);
    },
  });
}

// Inlaid floor emblem: bronze ring with a stylised ant mark, for the hall.
export function mosaic(cx, cy, r = 26) {
  return prop({
    x: cx - r - 1, y: cy - r * 0.62 - 1, w: r * 2 + 2, h: Math.ceil(r * 1.24) + 2, sortY: 0, layer: 'floor',
    draw(gb) {
      const ox = r + 1;
      const oy = r * 0.62 + 1;
      ellipse(gb, ox, oy, r, r * 0.62, '#3e332b');
      ellipse(gb, ox, oy, r - 2, r * 0.62 - 2, '#8a5a36');
      ellipse(gb, ox, oy, r - 3, r * 0.62 - 3, '#4a3d33');
      ellipse(gb, ox, oy, r - 8, r * 0.62 - 6, '#54463a');
      // ant mark: three body segments + antennae
      ellipse(gb, ox, oy - 5, 3, 2.4, '#b07a48');
      ellipse(gb, ox, oy, 2, 1.8, '#b07a48');
      ellipse(gb, ox, oy + 5, 4, 3, '#b07a48');
      R(gb, ox - 4, oy - 9, 1, 2, '#b07a48'), R(gb, ox + 3, oy - 9, 1, 2, '#b07a48');
      for (const s of [-1, 1]) for (const dy of [-1, 1, 3]) R(gb, s > 0 ? ox + 2 : ox - 6, oy + dy, 4, 1, '#8a5a36');
    },
  });
}

// ---- density pass: small furniture and wall details ------------------------------------------

// Lantern sitting on a wall ledge (door posts, wall ends).
export function lantern(x, y) {
  return prop({
    x: x - 2, y, w: 5, h: 7, layer: 'wall',
    lights: [{ x, y: y + 6, r: 46, k: 0.55, color: '#ffb866', glow: { r: 11, k: 0.6, y: y + 3 } }],
    draw(gb, ge) {
      R(gb, 0, 5, 5, 2, OUT);
      R(gb, 1, 5, 3, 1, '#6b5a48');
      R(gb, 0, 0, 5, 5, OUT);
      R(ge, 1, 1, 3, 3, '#ffcf7a');
      P(ge, 2, 1, '#fff0c8');
    },
  });
}

export function clock(x, y) {
  return prop({
    x, y, w: 9, h: 9, layer: 'wall',
    draw(gb) {
      ellipse(gb, 4.5, 4.5, 4.5, 4.5, OUT);
      ellipse(gb, 4.5, 4.5, 3.5, 3.5, '#e6dfcf');
      R(gb, 4, 2, 1, 3, OUT);
      R(gb, 4, 4, 2, 1, OUT);
      P(gb, 4, 1, '#8a7a62'), P(gb, 4, 7, '#8a7a62'), P(gb, 1, 4, '#8a7a62'), P(gb, 7, 4, '#8a7a62');
    },
  });
}

export function poster(x, y, w, h, { kind = 'ant', seed = 1 } = {}) {
  return prop({
    x, y, w, h, layer: 'wall',
    draw(gb) {
      const rnd = rng(seed);
      R(gb, 0, 0, w, h, OUT);
      R(gb, 1, 1, w - 2, h - 2, '#6b4a30');
      const bg = ['#24324a', '#3a2440', '#1f3a34', '#4a3324'][Math.floor(rnd() * 4)];
      R(gb, 2, 2, w - 4, h - 4, bg);
      const cx = Math.floor(w / 2);
      if (kind === 'ant') {
        ellipse(gb, cx, 5, 2.4, 2, '#f2c14e');
        ellipse(gb, cx, h - 5, 2.8, 2.4, '#f2c14e');
        R(gb, cx - 1, 7, 2, 2, '#f2c14e');
        P(gb, cx - 2, 3, '#f2c14e'), P(gb, cx + 2, 3, '#f2c14e');
      } else if (kind === 'bug') {
        ellipse(gb, cx, h / 2, 3, 3.5, '#e0503c');
        R(gb, cx, 3, 1, h - 6, OUT);
        for (const dy of [-2, 0, 2]) R(gb, cx - 5, h / 2 + dy, 2, 1, '#e0503c'), R(gb, cx + 4, h / 2 + dy, 2, 1, '#e0503c');
      } else {
        // mountains
        for (let i = 0; i < w - 4; i++) {
          const hh = Math.abs(((i * 3) % 14) - 7) + 2;
          R(gb, 2 + i, h - 2 - hh, 1, hh, i % 7 < 4 ? '#5a7a8a' : '#46606e');
        }
        P(gb, w - 5, 4, '#f2d090');
      }
    },
  });
}

export function wallShelf(x, y, w, { seed = 1 } = {}) {
  return prop({
    x, y, w, h: 12, layer: 'wall',
    draw(gb) {
      const rnd = rng(seed);
      R(gb, 0, 9, w, 3, OUT);
      R(gb, 1, 9, w - 2, 1, '#8a6040');
      R(gb, 1, 10, w - 2, 1, '#5a3a26');
      let px = 2;
      while (px < w - 4) {
        const r = rnd();
        if (r < 0.35) {
          // books
          const n = 2 + Math.floor(rnd() * 3);
          for (let i = 0; i < n && px < w - 3; i++, px += 2) R(gb, px, 3 + Math.floor(rnd() * 2), 2, 6, ['#7a3b33', '#3b5a7a', '#6b7a3b', '#a08a5a'][Math.floor(rnd() * 4)]);
        } else if (r < 0.65) {
          // tiny plant
          R(gb, px, 6, 4, 3, '#6b4230');
          blob(gb, px + 2, 4, 2, 1.6, LEAF);
          px += 5;
        } else if (r < 0.8) {
          // trophy / jar
          R(gb, px, 4, 3, 5, OUT);
          R(gb, px + 1, 4, 1, 4, '#d8a85a');
          px += 4;
        } else px += 3;
        px += 1;
      }
    },
  });
}

export function filingCabinet(x, y) {
  return prop({
    x, y, w: 14, h: 24, sortY: y + 24,
    blocks: [[x, y + 12, 14, 12]],
    draw(gb) {
      R(gb, 0, 0, 14, 24, OUT);
      R(gb, 1, 1, 12, 2, METAL[4]);
      R(gb, 1, 3, 12, 20, METAL[2]);
      for (let i = 0; i < 3; i++) {
        R(gb, 2, 4 + i * 6, 10, 5, METAL[3]);
        R(gb, 2, 8 + i * 6, 10, 1, METAL[1]);
        R(gb, 5, 6 + i * 6, 4, 1, METAL[0]);
      }
    },
  });
}

export function trash(x, y) {
  return prop({
    x: x - 4, y: y - 9, w: 8, h: 9, sortY: y,
    draw(gb) {
      R(gb, 0, 0, 8, 9, OUT);
      R(gb, 1, 1, 6, 7, METAL[2]);
      R(gb, 1, 1, 6, 1, METAL[4]);
      R(gb, 2, 1, 4, 1, '#1a1b1f');
      P(gb, 3, 0, '#e8e0d0');
      R(gb, 2, 3, 1, 4, METAL[3]);
    },
  });
}

export function boxes(x, y, { seed = 1 } = {}) {
  return prop({
    x, y, w: 18, h: 18, sortY: y + 18,
    blocks: [[x, y + 8, 18, 10]],
    draw(gb) {
      const card = (bx, by, bw, bh) => {
        R(gb, bx, by, bw, bh, OUT);
        R(gb, bx + 1, by + 1, bw - 2, 2, '#c09a68');
        R(gb, bx + 1, by + 3, bw - 2, bh - 4, '#9a7448');
        R(gb, bx + Math.floor(bw / 2), by + 1, 1, 3, '#d8c8a0');
      };
      card(0, 7, 18, 11);
      card(3, 0, 12, 8);
    },
  });
}

export function lockers(x, y, n = 3) {
  const w = n * 10 + 1;
  return prop({
    x, y, w, h: 32, sortY: y + 32,
    blocks: [[x, y + 20, w, 12]],
    draw(gb) {
      R(gb, 0, 0, w, 32, OUT);
      for (let i = 0; i < n; i++) {
        const lx = 1 + i * 10;
        R(gb, lx, 1, 9, 30, ['#3a4a5a', '#34444f', '#3e4e5e'][i % 3]);
        R(gb, lx, 1, 9, 1, '#5a6a7a');
        for (let v = 0; v < 3; v++) R(gb, lx + 2, 4 + v * 2, 5, 1, '#26323e');
        R(gb, lx + 7, 15, 1, 3, '#a8b0b8');
      }
    },
  });
}

export function beanBag(x, y, color = ['#2a3a5a', '#3a4e7a', '#5068a0', '#6a86c0']) {
  return prop({
    x: x - 10, y: y - 12, w: 20, h: 13, sortY: y,
    blocks: [[x - 8, y - 6, 16, 6]],
    draw(gb) {
      blob(gb, 10, 7, 9, 5, color);
      blob(gb, 10, 4, 6, 3, color);
    },
  });
}

export function extinguisher(x, y) {
  return prop({
    x: x - 3, y: y - 14, w: 7, h: 14, sortY: y,
    draw(gb) {
      R(gb, 2, 0, 3, 3, OUT);
      R(gb, 3, 1, 2, 1, '#2a2a2a');
      R(gb, 0, 3, 7, 11, OUT);
      R(gb, 1, 4, 5, 9, '#c0392b');
      R(gb, 1, 4, 1, 9, '#e05a48');
      R(gb, 1, 7, 5, 2, '#e8e0d0');
    },
  });
}

// Low cabinet with something on top: a coffee machine, a printer or plants.
export function credenza(x, y, { w = 32, top = 'coffee', seed = 2 } = {}) {
  const lights = top === 'coffee' ? [{ x: x + 8, y: y + 4, r: 18, k: 0.3, color: '#ff6a4a', glow: { r: 5, k: 0.3 } }] : [];
  return prop({
    x, y: y - 12, w, h: 28, sortY: y + 16,
    blocks: [[x, y + 2, w, 14]],
    lights,
    draw(gb, ge) {
      const oy = 12;
      R(gb, 0, oy, w, 16, OUT);
      R(gb, 1, oy + 1, w - 2, 3, WOOD.top);
      R(gb, 1, oy + 1, w - 2, 1, WOOD.topHi);
      R(gb, 1, oy + 4, w - 2, 11, WOOD.front);
      for (let i = 1; i < 3; i++) R(gb, Math.floor((i * w) / 3), oy + 5, 1, 9, WOOD.frontLo);
      R(gb, 3, oy + 8, 2, 1, WOOD.knob), R(gb, w - 5, oy + 8, 2, 1, WOOD.knob);
      if (top === 'coffee') {
        R(gb, 3, 0, 11, 13, OUT);
        R(gb, 4, 1, 9, 11, METAL[1]);
        R(gb, 4, 1, 9, 1, METAL[3]);
        R(gb, 6, 6, 5, 4, METAL[0]);
        P(ge, 6, 3, '#ff6a4a'), P(ge, 8, 3, '#7ee07a');
        R(gb, 17, 8, 3, 4, OUT), R(gb, 18, 9, 1, 2, '#e8e0d0');
        R(gb, 22, 8, 3, 4, OUT), R(gb, 23, 9, 1, 2, '#c9573f');
      } else if (top === 'printer') {
        R(gb, 4, 4, 18, 9, OUT);
        R(gb, 5, 5, 16, 7, '#c8c4bc');
        R(gb, 5, 5, 16, 1, '#e8e4dc');
        R(gb, 7, 2, 12, 3, '#f0ece4');
        P(ge, 19, 7, '#4ee07a');
      } else {
        blob(gb, 7, 7, 4, 3.5, LEAF);
        R(gb, 4, 9, 6, 4, '#6b4230');
        blob(gb, w - 8, 6, 3, 4, LEAF);
        R(gb, w - 10, 9, 5, 4, '#e8e0d0');
      }
    },
  });
}

function snakePlant(x, y, seed) {
  const SNAKE = ['#1e3a24', '#2e5a32', '#4a7a3a', '#8aa848'];
  return prop({
    x: x - 8, y: y - 30, w: 16, h: 30, sortY: y,
    blocks: [[x - 5, y - 7, 10, 7]],
    draw(gb) {
      const rnd = rng(seed);
      for (let i = 0; i < 6; i++) {
        const bx = 3 + i * 2 + Math.floor(rnd() * 2);
        const top = 2 + Math.floor(rnd() * 8);
        R(gb, bx - 1, top - 1, 4, 24 - top, OUT);
        R(gb, bx, top, 2, 23 - top, SNAKE[1]);
        R(gb, bx, top, 1, 23 - top, SNAKE[2]);
        for (let k = top + 2; k < 22; k += 4) P(gb, bx + 1, k, SNAKE[3]);
        P(gb, bx, top, SNAKE[3]);
      }
      R(gb, 3, 22, 10, 8, OUT);
      R(gb, 4, 23, 8, 6, '#3a3f48');
      R(gb, 4, 23, 8, 1, '#5a606c');
    },
  });
}
