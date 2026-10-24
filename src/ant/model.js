// Ant worker rig: turns a pose into renderer parts for a given view.
// Design space is 56x72 units, feet on GROUND, facing +x in the side view.

export const W = 56;
export const H = 72;
export const GROUND = 68;
const CX = 28;

const ARM = { upper: 4.8, fore: 4.4 };
const LEG = { thigh: 5.4, shin: 5.4 };
const HIP_REST = 10.4;

const E = (x, y, rx, ry, o = {}) => ({ kind: 'ellipse', x, y, rx, ry, mat: 'shell', ...o });
const C = (ax, ay, bx, by, ra, rb, o = {}) => ({ kind: 'capsule', ax, ay, bx, by, ra, rb, mat: 'limb', ...o });

// Two-bone IK; bend = +1/-1 picks which side the joint bulges to.
function ik(sx, sy, tx, ty, l1, l2, bend) {
  let dx = tx - sx;
  let dy = ty - sy;
  let d = Math.hypot(dx, dy) || 1e-3;
  const dc = Math.max(Math.abs(l1 - l2) + 0.05, Math.min(l1 + l2 - 0.05, d));
  dx = (dx / d) * dc;
  dy = (dy / d) * dc;
  d = dc;
  const base = Math.atan2(dy, dx);
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const ang = base + bend * a;
  return { jx: sx + Math.cos(ang) * l1, jy: sy + Math.sin(ang) * l1, ex: sx + dx, ey: sy + dy };
}

function limb(parts, sx, sy, tx, ty, len, bend, r, o) {
  const { jx, jy, ex, ey } = ik(sx, sy, tx, ty, len[0], len[1], bend);
  parts.push(C(sx, sy, jx, jy, r[0], r[1], o));
  parts.push(C(jx, jy, ex, ey, r[1], r[2], o));
  parts.push(E(jx, jy, r[1] * 1.12, r[1] * 1.12, { ...o, mat: 'limb', z: o.z + 0.01 }));
  return { x: ex, y: ey };
}

// Elbowed antenna: straight scape, then a funiculus that curls toward `bendA`, ending in a bronze club.
// Angles: 0 = straight up, positive = toward +x.
function antenna(parts, x, y, scapeA, bendA, o) {
  const pts = [[x, y]];
  const seg = (a, len) => {
    const [px, py] = pts[pts.length - 1];
    pts.push([px + Math.sin(a) * len, py - Math.cos(a) * len]);
  };
  for (let j = 0; j < 3; j++) seg(scapeA, 2.1);
  for (let j = 1; j <= 4; j++) seg(scapeA + (bendA - scapeA) * (j / 4), 1.55);
  const n = pts.length - 1;
  for (let j = 0; j < n; j++) {
    const t = j / (n - 1);
    const tip = j >= n - 3;
    parts.push(
      C(pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1], 0.78 + t * 0.12 + (j === n - 1 ? 0.35 : 0), 0.82 + t * 0.12 + (j === n - 1 ? 0.55 : 0), {
        ...o,
        mat: tip ? 'bronze' : 'limb',
        shade: j % 2 ? -0.08 : 0,
        z: o.z + j * 0.001,
      }),
    );
  }
}

function rotateGroup(parts, from, px, py, a) {
  if (!a) return;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const rot = (x, y) => [px + (x - px) * c - (y - py) * s, py + (x - px) * s + (y - py) * c];
  for (let i = from; i < parts.length; i++) {
    const p = parts[i];
    if (p.kind === 'ellipse') {
      [p.x, p.y] = rot(p.x, p.y);
      p.rot = (p.rot || 0) + a;
    } else if (p.kind === 'capsule') {
      [p.ax, p.ay] = rot(p.ax, p.ay);
      [p.bx, p.by] = rot(p.bx, p.by);
    } else {
      p.pts = p.pts.map(([x, y]) => rot(x, y));
    }
  }
}

function scaleAll(parts, fx, px, py, sx, sy) {
  if (sx === 1 && sy === 1) return;
  const S = (x, y) => [px + (x - px) * sx, py + (y - py) * sy];
  const rs = (sx + sy) / 2;
  for (const p of parts) {
    if (p.mat === 'shadow') continue;
    if (p.kind === 'ellipse') {
      [p.x, p.y] = S(p.x, p.y);
      p.rx *= sx;
      p.ry *= sy;
    } else if (p.kind === 'capsule') {
      [p.ax, p.ay] = S(p.ax, p.ay);
      [p.bx, p.by] = S(p.bx, p.by);
      p.ra *= rs;
      p.rb *= rs;
    } else {
      p.pts = p.pts.map(([x, y]) => S(x, y));
    }
  }
  for (const f of fx) {
    [f.x0, f.y0] = S(f.x0, f.y0);
    [f.x1, f.y1] = S(f.x1, f.y1);
  }
}

const arm = (P, i, fallback) => ({ ...fallback, ...(P.arms?.[i] || {}) });
const leg = (P, i) => ({ dx: 0, lift: 0, ...(P.legs?.[i] || {}) });

export function buildAnt(view, P = {}) {
  const parts = [];
  const fx = [];
  const lights = [];
  const air = P.air || 0;
  const bx = CX + (P.sway || 0);
  const hipY = GROUND - HIP_REST + (P.crouch || 0) * 3.2 + (P.bob || 0) - air;
  const up = (P.breath || 0) * 0.8;
  const lean = P.lean || 0;
  const side = view === 'side';
  const back = view === 'back';

  const absY = hipY - 4.6 + up * 0.5;
  const chestY = hipY - 12.2 + up;
  const headX = bx + (side ? 2.2 + lean : 0) + (P.headDx || 0);
  const headY = hipY - 28.6 + up + (P.headDy || 0);
  const sway = P.antSway || [0, 0];
  const footY = (lift) => Math.min(GROUND - 1.3 - lift, hipY + HIP_REST - 0.9);

  const shadowK = Math.max(0.45, 1 - air / 14);
  parts.push(E(bx + (side ? -4 : 0), GROUND + 0.4, (side ? 14 : 10.5) * shadowK, 2.3 * shadowK, { mat: 'shadow', z: -10, alpha: 80 }));

  if (!side) {
    // ---- front / back ----
    for (const [k, i] of [[0, -1], [1, 1]]) {
      const L = leg(P, k);
      const hx = bx + i * 3.4;
      const f = limb(parts, hx, hipY, hx + i * (0.9 + L.dx), footY(L.lift), [LEG.thigh, LEG.shin], i < 0 ? 1 : -1, [1.9, 1.7, 1.45], { z: 1, group: `leg${k}` });
      parts.push(E(f.x + i * 0.35, f.y + 0.45, 2.35, 1.4, { mat: 'limb', z: 1.02, group: `leg${k}` }));
    }
    parts.push(E(bx, absY, 8.4, 7.6, { z: 2, bands: back ? 0 : 4, shade: 0.07 }));
    parts.push(E(bx, chestY, 6.6, 4.6, { z: 2.6, shade: 0.07 }));
    parts.push(E(bx, chestY - 4.2, 2.8, 2, { z: 2.5 }));
    if (back) parts.push(E(bx, hipY - 4.4 + up * 0.5, 9.2, 8.4, { z: 3.5, bands: 4, shade: 0.07 }));
    for (const [k, i] of [[0, -1], [1, 1]]) {
      const A = arm(P, k, { dx: 1.6, dy: 8.4 });
      const sx = bx + i * 5.8;
      const sy = chestY - 0.6;
      const h = limb(parts, sx, sy, sx + i * A.dx, sy + A.dy, [ARM.upper, ARM.fore], i < 0 ? 1 : -1, [1.6, 1.4, 1.3], { z: back ? 3.7 : 4, group: `arm${k}`, cast: true, edgeLight: true });
      parts.push(E(h.x, h.y + 0.3, 1.75, 1.75, { mat: 'limb', z: (back ? 3.7 : 4) + 0.02, group: `arm${k}`, cast: true, edgeLight: true }));
    }
    const headStart = parts.length;
    for (const [k, i] of [[0, -1], [1, 1]]) {
      antenna(parts, headX + i * 4.4, headY - 9.4, i * 0.28 + sway[k], i * 1.3 + sway[k] * 1.6, { z: back ? 5.6 : 4.5, group: `ant${k}` });
    }
    parts.push(E(headX, headY, 13, 11.6, { z: 5, cast: true, seamsX: back ? [0, -0.52, 0.52] : null }));
    if (!back) {
      const es = P.eyeScale || 1;
      for (const i of [-1, 1]) {
        parts.push(E(headX + i * 7.5, headY + 1.6, 4.3 * es, 4.8 * es, { mat: P.blink ? 'lid' : 'eye', z: 6 }));
        parts.push(C(headX + i * 3.7, headY + 9.4, headX + i * 3.3, headY + 11.6, 1.15, 0.95, { mat: 'limb', z: 6, group: `mand${i}` }));
        parts.push(C(headX + i * 3.3, headY + 11.6, headX + i * 1.9, headY + 12.5, 0.9, 0.55, { mat: 'bronze', z: 6.01, group: `mand${i}` }));
      }
    }
    rotateGroup(parts, headStart, headX, headY + 10, P.headTilt || 0);
  } else {
    // ---- side (facing +x) ----
    const hipX = bx - 0.6;
    for (const [k, off, z, far] of [[0, -0.8, 0.5, true], [1, 0.6, 3, false]]) {
      const L = leg(P, k);
      const f = limb(parts, hipX + off, hipY, hipX + off + L.dx, footY(L.lift), [LEG.thigh, LEG.shin], -1, [1.9, 1.7, 1.45], { z, far, group: `leg${k}` });
      parts.push(E(f.x + 1.1, f.y + 0.4, 2.5, 1.3, { mat: 'limb', z: z + 0.02, far, group: `leg${k}` }));
    }
    const farA = arm(P, 0, { dx: -0.4, dy: 8.2 });
    {
      const sx = bx - 0.2 + lean * 0.5;
      const sy = chestY - 1;
      const h = limb(parts, sx, sy, sx + farA.dx, sy + farA.dy, [ARM.upper, ARM.fore], 1, [1.6, 1.4, 1.3], { z: 0.7, far: true, group: 'arm0' });
      parts.push(E(h.x, h.y + 0.3, 1.75, 1.75, { mat: 'limb', z: 0.72, far: true, group: 'arm0' }));
    }
    // gaster hangs off a small waist node behind the belly and sways with P.tail
    const wx = bx - 5.4 + lean * 0.2;
    const wy = absY - 4 + up * 0.4;
    const ta = -0.2 + (P.tail || 0);
    const gl = 5.8;
    parts.push(E(wx - Math.cos(ta) * gl, wy - Math.sin(ta) * gl, 6.8, 5.4, { rot: ta, z: 1.6, bands: 3, bandAxis: 'u', cast: true, shade: 0.12 }));
    parts.push(E(wx, wy, 1.9, 1.9, { z: 1.7 }));
    parts.push(E(bx - 0.2 + lean * 0.3, absY - 0.8, 6.2, 6.6, { z: 2, bands: 3, shade: 0.12 }));
    parts.push(E(bx + 0.8 + lean * 0.6, chestY, 4.8, 4.3, { z: 2.6, shade: 0.08, cast: true }));
    parts.push(E(bx + 1.2 + lean * 0.8, chestY - 4.2, 2.6, 2, { z: 2.5 }));

    if (P.tablet) {
      const tx = bx + 10.2 + P.tablet.dx;
      const ty = chestY + 3 + P.tablet.dy;
      const frame = [[tx - 2.6, ty - 5.8], [tx + 2.4, ty - 5.2], [tx + 3.6, ty + 5.2], [tx - 1.4, ty + 5.8]];
      const screen = [[tx - 1.7, ty - 4.8], [tx + 1.6, ty - 4.3], [tx + 2.6, ty + 4.3], [tx - 0.7, ty + 4.8]];
      parts.push({ kind: 'poly', pts: frame, mat: 'device', z: 6.5, cast: true, n: [-0.3, -0.3, 0.9] });
      parts.push({ kind: 'poly', pts: screen, mat: 'screen', z: 6.51, noSeam: true });
      lights.push({ x: tx - 2.5, y: ty - 2, z: 6, r: 13, color: '#3fb4ea', k: 0.32 });
      P._tablet = { tx, ty };
    }

    const nearA = arm(P, 1, { dx: 1.6, dy: 8.2 });
    {
      const sx = bx + 2.6 + lean * 0.6;
      const sy = chestY - 0.6;
      const z = P.tablet ? 6.6 : 4.6;
      const h = limb(parts, sx, sy, sx + nearA.dx, sy + nearA.dy, [ARM.upper, ARM.fore], 1, [1.45, 1.25, 1.15], { z, group: 'arm1', cast: true, edgeLight: true });
      parts.push(E(h.x, h.y + 0.3, 1.6, 1.6, { mat: 'limb', z: z + 0.02, group: 'arm1', cast: true, edgeLight: true }));
    }

    const headStart = parts.length;
    antenna(parts, headX - 2.6, headY - 10.2, 0.1 + sway[0], 1.45 + sway[0] * 1.6, { z: 4.4, far: true, group: 'ant0' });
    antenna(parts, headX + 2.2, headY - 10.2, 0.3 + sway[1], 1.55 + sway[1] * 1.6, { z: 5.4, group: 'ant1' });
    parts.push(E(headX, headY, 12.2, 11.6, { z: 5, cast: true }));
    const es = P.eyeScale || 1;
    parts.push(E(headX + 6.5, headY + 1.8, 4.2 * es, 4.9 * es, { mat: P.blink ? 'lid' : 'eye', z: 6 }));
    parts.push(C(headX + 8.8, headY + 8.2, headX + 10.8, headY + 11.0, 1.25, 0.95, { mat: 'bronze', z: 6, group: 'mand' }));
    parts.push(C(headX + 10.8, headY + 11.0, headX + 9.6, headY + 12.9, 0.9, 0.55, { mat: 'bronze', z: 6.01, group: 'mand' }));
    rotateGroup(parts, headStart, headX - 1, headY + 10, P.headTilt || 0);
  }

  if (P.sparks) {
    const k = P.sparkFrame || 0;
    const o = k % 2 ? 0.8 : 0;
    fx.push({ x0: headX + 10.5, y0: headY - 13 - o, x1: headX + 11.6, y1: headY - 16.5 - o });
    fx.push({ x0: headX + 14, y0: headY - 9.5, x1: headX + 17 + o, y1: headY - 11.5 - o });
    fx.push({ x0: headX + 15.2, y0: headY - 4.6, x1: headX + 18.4 + o, y1: headY - 4.8 });
  }

  const st = P.stretch || 0;
  scaleAll(parts, fx, bx, GROUND - air, 1 - st * 0.6, 1 + st);
  return { parts, fx, lights };
}
