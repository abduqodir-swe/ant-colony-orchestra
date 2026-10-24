// Ant agents living in the office: seats, coffee breaks, A* walking between rooms.

import { T, COLS, ROWS } from './map.js';
import { ANIMS } from '../ant/animations.js';
import { buildAnt, W as AW, H as AH, GROUND } from '../ant/model.js';
import { render, blit } from '../ant/renderer.js';
import { applyLight } from './lighting.js';

export const ANT_S = 0.56;
const BW = Math.round(AW * ANT_S);
const BH = Math.round(AH * ANT_S);
const FOOT_X = Math.round(28 * ANT_S);
const FOOT_Y = Math.round(GROUND * ANT_S);
const SPEED = 16; // px/s
const WALK_RATE = SPEED / 10; // walk cycle covers ~10 px/s at this sprite scale

// rendered frames are shared by every ant: key = anim|view|frame|blink
const frames = new Map();
function antFrame(anim, view, frame, blink) {
  const key = `${anim}|${view}|${frame}|${blink ? 1 : 0}`;
  let buf = frames.get(key);
  if (!buf) {
    const A = ANIMS[anim];
    const pose = A.pose(frame / A.frames, view, frame, blink ? 0.05 : 1);
    const { parts, fx, lights } = buildAnt(view, pose);
    buf = render(parts, { w: BW, h: BH, s: ANT_S, lights, time: 1, fx });
    frames.set(key, buf);
  }
  return buf;
}

// ---- navigation -------------------------------------------------------------------------------

export function buildNav(grid, props, forced) {
  const walk = new Uint8Array(COLS * ROWS);
  for (let i = 0; i < COLS * ROWS; i++) walk[i] = grid.floor[i] ? 1 : 0;
  for (const p of props) {
    for (const [x, y, w, h] of p.blocks) {
      for (let ty = Math.floor(y / T); ty <= Math.floor((y + h - 1) / T); ty++) {
        for (let tx = Math.floor(x / T); tx <= Math.floor((x + w - 1) / T); tx++) {
          if (tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS) walk[ty * COLS + tx] = 0;
        }
      }
    }
  }
  for (const p of forced) {
    const { x, y } = p.access ?? p;
    walk[Math.floor(y / T) * COLS + Math.floor(x / T)] = 1;
  }
  return walk;
}

function findPath(walk, sx, sy, gx, gy) {
  const start = sy * COLS + sx;
  const goal = gy * COLS + gx;
  const came = new Int32Array(COLS * ROWS).fill(-1);
  const cost = new Float32Array(COLS * ROWS).fill(Infinity);
  const open = [start];
  cost[start] = 0;
  const h = (i) => Math.abs((i % COLS) - gx) + Math.abs(Math.floor(i / COLS) - gy);
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (cost[open[i]] + h(open[i]) < cost[open[bi]] + h(open[bi])) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur === goal) break;
    const cx = cur % COLS;
    const cy = Math.floor(cur / COLS);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const n = ny * COLS + nx;
      if (!walk[n]) continue;
      const c = cost[cur] + 1;
      if (c < cost[n]) {
        cost[n] = c;
        came[n] = cur;
        if (!open.includes(n)) open.push(n);
      }
    }
  }
  if (came[goal] === -1 && goal !== start) return null;
  const path = [];
  for (let i = goal; i !== start; i = came[i]) path.push(i);
  return path.reverse().map((i) => ({ x: (i % COLS) * T + T / 2, y: Math.floor(i / COLS) * T + 11 }));
}

// ---- agents -----------------------------------------------------------------------------------

const rand = (a, b) => a + Math.random() * (b - a);

export class Agent {
  constructor(def, seat, world) {
    Object.assign(this, def);
    this.seat = seat;
    this.world = world;
    this.x = seat.x;
    this.y = seat.y;
    this.state = 'work';
    this.timer = rand(6, 26);
    this.clock = Math.random() * 10;
    this.blinkOffset = Math.random() * 3.7;
    this.facing = 'right';
    this.view = seat.view;
    this.path = null;
    this.spot = null;
  }

  goTo(target) {
    const { walk } = this.world;
    // leave a seat via its access point, path between access tiles, then step onto the seat
    const from = this.state === 'work' ? this.seat : this.spot;
    const start = from?.access ?? this;
    const goal = target.access ?? target;
    const path = findPath(walk, Math.floor(start.x / T), Math.floor(start.y / T), Math.floor(goal.x / T), Math.floor(goal.y / T));
    if (!path) return false;
    path.pop();
    if (from?.access) path.unshift({ x: from.access.x, y: from.access.y });
    if (target.access) path.push({ x: target.access.x, y: target.access.y });
    path.push({ x: target.x, y: target.y });
    this.path = path;
    this.state = 'walk';
    this.target = target;
    return true;
  }

  // Live mode: an ant with work heads back to its desk and stays there until it is idle again.
  setBusy(busy) {
    this.busy = busy;
    if (!busy || this.state === 'work') return;
    if (this.state === 'walk') {
      if (this.target === this.seat) return;
      // turn around mid-walk: path from where the ant is now, and free the spot it was heading to
      if (this.spot) this.spot.taken = null;
      this.spot = null;
      this.goTo(this.seat);
      return;
    }
    const spot = this.spot;
    if (this.goTo(this.seat) && spot) {
      spot.taken = null;
      this.spot = null;
    }
  }

  update(dt) {
    this.clock += dt;
    if (this.state === 'walk') {
      let step = SPEED * dt;
      while (step > 0 && this.path.length) {
        const p = this.path[0];
        const dx = p.x - this.x;
        const dy = p.y - this.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.01) {
          if (Math.abs(dx) > Math.abs(dy)) {
            this.view = 'side';
            this.facing = dx > 0 ? 'right' : 'left';
          } else this.view = dy > 0 ? 'front' : 'back';
        }
        if (d <= step) {
          this.x = p.x;
          this.y = p.y;
          step -= d;
          this.path.shift();
        } else {
          this.x += (dx / d) * step;
          this.y += (dy / d) * step;
          step = 0;
        }
      }
      if (!this.path.length) {
        this.state = this.target === this.seat ? 'work' : 'break';
        this.timer = this.state === 'work' ? rand(10, 30) : rand(6, 14);
        this.view = this.target.view;
      }
      return;
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    if (this.state === 'work') {
      const free = this.world.spots.filter((s) => !s.taken);
      if (!this.busy && free.length && Math.random() < (this.status === 'idle' ? 0.6 : 0.18)) {
        const s = free[Math.floor(Math.random() * free.length)];
        if (this.goTo(s)) {
          s.taken = this;
          this.spot = s;
          return;
        }
      }
      this.timer = rand(8, 24);
    } else if (this.state === 'break') {
      if (this.goTo(this.seat)) {
        this.spot.taken = null;
        this.spot = null;
      } else this.timer = 3;
    }
  }

  get pose() {
    if (this.state === 'walk') return { anim: 'walk', view: this.view, rate: WALK_RATE };
    const at = this.state === 'work' ? this.seat : this.spot;
    return { anim: at.anim, view: at.view, rate: 1 };
  }

  get sortY() {
    return this.y;
  }

  bounds() {
    return { x: Math.round(this.x) - FOOT_X, y: Math.round(this.y) - FOOT_Y, w: BW, h: BH };
  }

  draw(g, lightMap) {
    const { anim, view, rate } = this.pose;
    const A = ANIMS[anim];
    const frame = Math.floor(this.clock * A.fps * rate) % A.frames;
    const blink = (this.clock + this.blinkOffset) % 3.7 < 0.13;
    const lit = antFrame(anim, view, frame, blink).slice();
    const b = this.bounds();
    applyLight(new Uint8ClampedArray(lit.buffer), BW, BH, b.x, b.y, lightMap);
    blit(g, lit, BW, BH, b.x, b.y, 1, view === 'side' && this.facing === 'left');
  }
}
