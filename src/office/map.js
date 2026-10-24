// Office floor plan on a 16px tile grid, drawn in a top-down oblique view: horizontal walls are
// two tiles thick (cap + brick face facing the viewer), vertical walls show only their cap.

import { R, rng } from './pixel.js';

export const T = 16;
export const COLS = 40;
export const ROWS = 28;
export const WIDTH = COLS * T;
export const HEIGHT = ROWS * T;

// rect = [x0, y0, x1, y1] interior tiles, inclusive
export const ROOMS = [
  { id: 'command', name: 'COMMAND CENTER', color: '#5fd0f5', rect: [1, 2, 13, 8], floor: 'wood' },
  { id: 'meeting', name: 'MEETING ROOM', color: '#f0dcb0', rect: [15, 2, 23, 8], floor: 'wood' },
  { id: 'devops', name: 'DEVOPS / OPERATIONS', color: '#ff9a4a', rect: [25, 2, 38, 8], floor: 'slate' },
  { id: 'dev', name: 'DEVELOPMENT', color: '#6fa8ff', rect: [1, 11, 12, 17], floor: 'wood' },
  { id: 'hall', name: null, rect: [14, 11, 22, 17], floor: 'stone' },
  { id: 'qa', name: 'QA LAB', color: '#7ee07a', rect: [24, 11, 30, 17], floor: 'slate' },
  { id: 'security', name: 'SECURITY', color: '#f2c14e', rect: [32, 11, 38, 17], floor: 'slate' },
  { id: 'analytics', name: 'ANALYTICS', color: '#7ee0a0', rect: [1, 20, 12, 26], floor: 'wood' },
  { id: 'lounge', name: 'LOUNGE', color: '#f2c14e', rect: [14, 20, 22, 26], floor: 'warm' },
  { id: 'design', name: 'DESIGN', color: '#f29ad8', rect: [24, 20, 38, 26], floor: 'wood' },
];

export const DOORS = [
  [14, 5, 14, 6], [24, 5, 24, 6],
  [6, 9, 7, 10], [21, 9, 22, 10], [37, 9, 38, 10],
  [13, 14, 13, 15], [23, 14, 23, 15], [31, 14, 31, 15],
  [6, 18, 7, 19], [18, 18, 19, 19], [27, 18, 28, 19],
  [13, 23, 13, 24], [23, 23, 23, 24],
];

export function buildGrid() {
  const floor = new Array(COLS * ROWS).fill(null);
  const room = new Int8Array(COLS * ROWS).fill(-1);
  ROOMS.forEach((r, i) => {
    const [x0, y0, x1, y1] = r.rect;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      floor[y * COLS + x] = r.floor;
      room[y * COLS + x] = i;
    }
  });
  for (const [x0, y0, x1, y1] of DOORS) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) floor[y * COLS + x] = 'door';
  }
  const isWall = (x, y) => x < 0 || y < 0 || x >= COLS || y >= ROWS || !floor[y * COLS + x];
  return { floor, room, isWall, doors: DOORS };
}

// ---- floors -----------------------------------------------------------------------------------

const hash = (a, b = 0) => {
  const n = Math.sin(a * 127.1 + b * 311.7 + 17.3) * 43758.5453;
  return n - Math.floor(n);
};

const FLOORS = {
  wood: { tones: ['#5c412d', '#634631', '#573d2a', '#684b35'], seam: '#30211a', hi: '#735239', lo: '#4c3525' },
  warm: { tones: ['#603c2b', '#674130', '#5a3828', '#6d4633'], seam: '#331f17', hi: '#7a4e39', lo: '#4f3022' },
  stone: { tones: ['#5d544c', '#575049', '#625850', '#524a43'], seam: '#2f2925', hi: '#6e645a', lo: '#4a423c' },
  slate: { tones: ['#3a3b40', '#36373c', '#3e3f45', '#333439'], seam: '#212226', hi: '#47484f', lo: '#2e2f33' },
  door: { tones: ['#3f362f', '#3b322c'], seam: '#261f1a', hi: '#4c4138', lo: '#332b25' },
};

function drawPlanks(g, tx, ty, f) {
  for (let row = 0; row < 2; row++) {
    const y = ty * T + row * 8;
    const r = ty * 2 + row;
    const off = Math.floor(hash(r) * 40);
    for (let x = tx * T; x < tx * T + T; x++) {
      const seg = Math.floor((x + off) / 36);
      const inSeg = (x + off) % 36;
      const tone = f.tones[Math.floor(hash(r, seg) * f.tones.length)];
      R(g, x, y, 1, 8, tone);
      R(g, x, y, 1, 1, f.hi);
      R(g, x, y + 7, 1, 1, f.seam);
      if (inSeg === 0) R(g, x, y, 1, 7, f.seam);
      // grain flecks
      const n = hash(x * 3.1, r * 7.7);
      if (n > 0.93) R(g, x, y + 2 + Math.floor(n * 40) % 4, 1, 1, f.lo);
    }
  }
}

function drawSlabs(g, tx, ty, f) {
  const x = tx * T;
  const y = ty * T;
  R(g, x, y, T, T, f.tones[Math.floor(hash(tx, ty) * f.tones.length)]);
  R(g, x, y, T, 1, f.seam);
  R(g, x, y, 1, T, f.seam);
  R(g, x + 1, y + 1, T - 1, 1, f.hi);
  R(g, x + 1, y + 1, 1, T - 1, f.hi);
  R(g, x + 1, y + T - 1, T - 1, 1, f.lo);
  R(g, x + T - 1, y + 1, 1, T - 1, f.lo);
  const rnd = rng(tx * 991 + ty * 31);
  for (let i = 0; i < 4; i++) R(g, x + 2 + Math.floor(rnd() * 12), y + 2 + Math.floor(rnd() * 12), 1, 1, rnd() > 0.5 ? f.lo : f.hi);
  if (rnd() > 0.82) {
    // hairline crack
    let cx = x + 3 + Math.floor(rnd() * 8);
    let cy = y + 3;
    for (let i = 0; i < 7; i++) {
      R(g, cx, cy, 1, 1, f.lo);
      cy += 1;
      cx += rnd() > 0.5 ? 1 : 0;
    }
  }
}

// ---- walls ------------------------------------------------------------------------------------

// dark stone-brick faces under a pale stone ledge, like the mockup's thick raised walls
const WALL = {
  bricks: ['#3d322b', '#43372f', '#393029', '#483b32', '#40352d'],
  mortar: '#211a16',
  cap: '#4e4339',
  capHi: '#61544a',
  capLo: '#3c332c',
  capEdge: '#86745f',
  out: '#100b09',
  base: '#1d1611',
  baseHi: '#3a2e25',
};
const CAP_H = 7;

function bricks(g, x, y, w, h) {
  R(g, x, y, w, h, WALL.mortar);
  for (let py = y; py < y + h; py++) {
    const row = Math.floor(py / 5);
    if (py % 5 === 4) continue;
    for (let px = x; px < x + w; px++) {
      const off = row % 2 ? 5 : 0;
      if ((px + off) % 10 === 9) continue;
      const b = Math.floor((px + off) / 10);
      let c = WALL.bricks[Math.floor(hash(b, row) * WALL.bricks.length)];
      if (py % 5 === 0) c = shade(c, 12);
      R(g, px, py, 1, 1, c);
    }
  }
}

function shade(hex, d) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, v + d)).toString(16).padStart(2, '0');
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

function capTop(g, x, y, w, h) {
  R(g, x, y, w, h, WALL.cap);
  const rnd = rng(x * 13 + y * 7);
  for (let i = 0; i < (w * h) / 14; i++) R(g, x + Math.floor(rnd() * w), y + Math.floor(rnd() * h), 1, 1, rnd() > 0.5 ? WALL.capHi : WALL.capLo);
  // slab joints every 16px along the ledge
  for (let px = x; px < x + w; px++) if (px % 16 === 0) R(g, px, y, 1, h, WALL.capLo);
}

export function drawWalls(g, grid) {
  const { isWall } = grid;
  const faceLower = (x, y) => isWall(x, y) && !isWall(x, y + 1);
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      if (!isWall(tx, ty)) continue;
      const x = tx * T;
      const y = ty * T;
      if (faceLower(tx, ty) && ty < ROWS - 1) {
        // lower face row: bricks + baseboard
        bricks(g, x, y, T, T);
        R(g, x, y + T - 3, T, 2, WALL.base);
        R(g, x, y + T - 3, T, 1, WALL.baseHi);
        R(g, x, y + T - 1, T, 1, WALL.out);
      } else if (faceLower(tx, ty + 1) && ty + 1 < ROWS - 1) {
        // upper face row: cap strip then bricks
        capTop(g, x, y, T, CAP_H);
        R(g, x, y, T, 1, WALL.out);
        R(g, x, y + CAP_H - 1, T, 1, WALL.capEdge);
        bricks(g, x, y + CAP_H, T, T - CAP_H);
        R(g, x, y + CAP_H, T, 2, 'rgba(0,0,0,0.25)');
      } else if (ty === ROWS - 1) {
        // outer bottom wall: cap with its brick face toward the viewer
        capTop(g, x, y, T, CAP_H);
        R(g, x, y, T, 1, WALL.out);
        R(g, x, y + CAP_H - 1, T, 1, WALL.capEdge);
        bricks(g, x, y + CAP_H, T, T - CAP_H);
      } else {
        // cap seen from above (vertical walls and junctions)
        capTop(g, x, y, T, T);
        if (!isWall(tx - 1, ty)) R(g, x, y, 1, T, WALL.out), R(g, x + 1, y, 1, T, WALL.capEdge);
        if (!isWall(tx + 1, ty)) R(g, x + T - 1, y, 1, T, WALL.out), R(g, x + T - 2, y, 1, T, WALL.capLo);
        if (!isWall(tx, ty - 1)) R(g, x, y, T, 1, WALL.out), R(g, x, y + 1, T, 1, WALL.capEdge);
      }
    }
  }
  // door frames on brick faces
  for (const [x0, y0, x1, y1] of grid.doors) {
    if (y0 === y1 - 1 && x1 > x0) {
      const fy = (y0 + 1) * T - (T - CAP_H);
      for (const px of [x0 * T - 2, (x1 + 1) * T]) {
        R(g, px, fy, 2, T * 2 - CAP_H, '#3a2416');
        R(g, px === x0 * T - 2 ? px + 1 : px, fy, 1, T * 2 - CAP_H, '#6b4a30');
      }
    }
  }
}

export function drawFloors(g, grid) {
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      const kind = grid.floor[ty * COLS + tx];
      if (!kind) continue;
      const f = FLOORS[kind];
      if (kind === 'wood' || kind === 'warm') drawPlanks(g, tx, ty, f);
      else drawSlabs(g, tx, ty, f);
    }
  }
  // ambient occlusion along the foot of walls
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      if (grid.isWall(tx, ty)) continue;
      const x = tx * T;
      const y = ty * T;
      if (grid.isWall(tx, ty - 1)) {
        R(g, x, y, T, 1, 'rgba(0,0,0,0.45)');
        R(g, x, y + 1, T, 2, 'rgba(0,0,0,0.28)');
        R(g, x, y + 3, T, 2, 'rgba(0,0,0,0.14)');
      }
      if (grid.isWall(tx - 1, ty)) R(g, x, y, 2, T, 'rgba(0,0,0,0.3)'), R(g, x + 2, y, 1, T, 'rgba(0,0,0,0.14)');
      if (grid.isWall(tx + 1, ty)) R(g, x + T - 1, y, 1, T, 'rgba(0,0,0,0.22)');
    }
  }
}
