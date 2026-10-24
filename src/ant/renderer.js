// Procedural pixel-art rasterizer.
// Parts are soft 3D-ish primitives (ellipsoids, tapered capsules, flat polygons) described in
// design units; every pixel is shaded with a fake normal and snapped to a palette ramp, then
// outer outlines and inner seams are added so the result reads as hand-placed pixel art.

const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const pack = ([r, g, b], a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
const unpack = (c) => [c & 255, (c >> 8) & 255, (c >> 16) & 255, c >>> 24];
const mix = (c, rgb, k) => {
  const [r, g, b, a] = unpack(c);
  return pack([r + (rgb[0] - r) * k, g + (rgb[1] - g) * k, b + (rgb[2] - b) * k].map(Math.round), a);
};
const ramp = (...hs) => hs.map((h) => pack(hex(h)));

export const PALETTE = {
  outline: pack(hex('#0a0708')),
  seam: pack(hex('#0e0a0b')),
  shell: ramp('#0f0b0c', '#151011', '#1b1516', '#221b1c', '#2b2223', '#352a2b', '#413334', '#4f3e3e'),
  gloss: ramp('#655150', '#8e766f', '#cdb3a0', '#f1e2d2'),
  limb: ramp('#1c120e', '#291a14', '#38241a', '#4a3021', '#5e3e2a', '#774f35'),
  bronze: ramp('#4a2e1f', '#6b432c', '#8f5c3a', '#b4784b', '#d49a66', '#ebbd8a'),
  eye: ramp('#0e1320', '#172136', '#22314e', '#334867', '#4a6286', '#6681a6', '#8ea7c8'),
  eyeHi: pack(hex('#eef4ff')),
  device: ramp('#121419', '#1b1f26', '#262b34', '#343b47', '#4a5363'),
  screen: ramp('#0f4f78', '#1a7fb3', '#2fa9dc', '#67d2f4', '#c4f2ff'),
  spark: pack(hex('#55c8f0')),
};

const norm3 = (x, y, z) => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};
const KEY = norm3(-0.45, -0.72, 0.55);
const HALF = norm3(KEY[0], KEY[1], KEY[2] + 1);
const RIM = (() => {
  const l = Math.hypot(0.6, -0.8);
  return [0.6 / l, -0.8 / l];
})();

// gloss: [power, threshold, colour] tiers, tested broadest-last so the sharpest highlight wins.
// bounce: reflected floor light along the lower-right silhouette, which keeps dark parts round.
const MATERIALS = {
  shell: {
    ramp: PALETTE.shell, amb: 0.03, dif: 0.95, difPow: 1.5, wrap: 0.08, rimPx: 1.15, rimMin: 0.3, bounce: PALETTE.shell[4],
    gloss: [[180, 0.55, PALETTE.gloss[3]], [64, 0.5, PALETTE.gloss[2]], [22, 0.55, PALETTE.gloss[1]], [8, 0.64, PALETTE.gloss[0]]],
  },
  limb: {
    ramp: PALETTE.limb, amb: 0.12, dif: 0.9, difPow: 1.2, wrap: 0.12, rimPx: 0.8, rimMin: 0.35, rimSoft: true,
    gloss: [[40, 0.6, PALETTE.bronze[4]], [12, 0.62, PALETTE.bronze[3]]],
  },
  bronze: { ramp: PALETTE.bronze, amb: 0.14, dif: 0.85, difPow: 1, wrap: 0.05, rimPx: 0, gloss: [[24, 0.7, PALETTE.bronze[5]]] },
  device: { ramp: PALETTE.device, amb: 0.2, dif: 0.7, difPow: 1, wrap: 0.1, rimPx: 0, gloss: [] },
};
const BOUNCE = (() => {
  const l = Math.hypot(0.45, 0.9);
  return [0.45 / l, 0.9 / l];
})();
const SHADOW_RGB = [6, 4, 5];

// ---- geometry -------------------------------------------------------------------------------

function bounds(p) {
  if (p.kind === 'ellipse') {
    const r = Math.max(p.rx, p.ry);
    return [p.x - r, p.y - r, p.x + r, p.y + r];
  }
  if (p.kind === 'capsule') {
    const r = Math.max(p.ra, p.rb);
    return [Math.min(p.ax, p.bx) - r, Math.min(p.ay, p.by) - r, Math.max(p.ax, p.bx) + r, Math.max(p.ay, p.by) + r];
  }
  const xs = p.pts.map((q) => q[0]);
  const ys = p.pts.map((q) => q[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// Returns {nx, ny, nz, u, v, edge} or null. u/v are part-local coords, edge is distance to the
// silhouette in pixels (used for resolution-independent rim light).
function hit(p, x, y, s) {
  if (p.kind === 'ellipse') {
    const c = Math.cos(-(p.rot || 0));
    const sn = Math.sin(-(p.rot || 0));
    const dx = x - p.x;
    const dy = y - p.y;
    const lx = dx * c - dy * sn;
    const ly = dx * sn + dy * c;
    const u = lx / p.rx;
    const v = ly / p.ry;
    const d2 = u * u + v * v;
    if (d2 > 1) return null;
    const nz = Math.sqrt(1 - d2);
    // rotate local normal back to screen space
    const c2 = Math.cos(p.rot || 0);
    const s2 = Math.sin(p.rot || 0);
    const [nx, ny, nnz] = norm3(u * c2 - v * s2, u * s2 + v * c2, nz);
    return { nx, ny, nz: nnz, u, v, lx, ly, edge: (1 - Math.sqrt(d2)) * Math.min(p.rx, p.ry) * s };
  }
  if (p.kind === 'capsule') {
    const ex = p.bx - p.ax;
    const ey = p.by - p.ay;
    const len2 = ex * ex + ey * ey || 1e-6;
    const t = Math.max(0, Math.min(1, ((x - p.ax) * ex + (y - p.ay) * ey) / len2));
    const cx = p.ax + ex * t;
    const cy = p.ay + ey * t;
    const r = p.ra + (p.rb - p.ra) * t;
    const ox = (x - cx) / r;
    const oy = (y - cy) / r;
    const d2 = ox * ox + oy * oy;
    if (d2 > 1) return null;
    const [nx, ny, nz] = norm3(ox, oy, Math.sqrt(1 - d2));
    return { nx, ny, nz, u: t, v: Math.sqrt(d2), edge: (1 - Math.sqrt(d2)) * r * s };
  }
  // polygon (even-odd)
  let inside = false;
  const pts = p.pts;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  if (!inside) return null;
  const [x0, y0, x1, y1] = bounds(p);
  return { nx: p.n?.[0] ?? 0, ny: p.n?.[1] ?? 0, nz: p.n?.[2] ?? 1, u: (x - x0) / (x1 - x0 || 1), v: (y - y0) / (y1 - y0 || 1), edge: 9 };
}

// ---- shading --------------------------------------------------------------------------------

const pick = (r, i) => r[Math.max(0, Math.min(r.length - 1, Math.floor(i * r.length)))];

function shadeSurface(p, h, mat, ctx, px, py) {
  const { nx, ny, nz } = h;
  const dif = Math.max(0, nx * KEY[0] + ny * KEY[1] + nz * KEY[2]);
  let I = mat.amb + Math.pow(dif, mat.difPow) * mat.dif + nz * mat.wrap;
  if (p.far) I *= 0.62;
  if (p.shade) I += p.shade;

  // segment bands (abdomen, antenna)
  let seam = false;
  let glint = 0;
  if (p.bands) {
    const coord = p.bandAxis === 'u' ? (p.kind === 'capsule' ? h.u : (h.u + 1) / 2) : (h.v + 1) / 2;
    const f = (coord * p.bands) % 1;
    if (f < 0.16 && coord > 0.08 && coord < 0.97) seam = true;
    // each segment's leading lip catches a bronze glint, like the plates on the reference
    else if (p.glint && !p.far && f < 0.3 && coord > 0.08 && dif > 0.42) glint = dif > 0.7 ? PALETTE.bronze[3] : PALETTE.bronze[2];
    else if (f < 0.42 && dif > 0.3) I += 0.16;
  }
  if (p.seamsX) {
    for (const sx of p.seamsX) if (Math.abs(h.lx - sx * p.rx) * ctx.s < 0.5 && h.v > -0.92) seam = true;
  }
  let c = seam ? mat.ramp[0] : glint || pick(mat.ramp, I);

  const l2 = Math.hypot(nx, ny) || 1;

  // reflected light: a lighter sliver inside the shadowed lower-right edge
  if (!seam && mat.bounce && !p.far && h.edge < 1.5 && (nx / l2) * BOUNCE[0] + (ny / l2) * BOUNCE[1] > 0.55) c = mat.bounce;

  // glossy highlight, tiered from a soft sheen down to a crisp hot spot
  const nh = Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]);
  if (!seam && !p.far && !p.matte) {
    for (const [pow, t, col] of mat.gloss) {
      if (Math.pow(nh, pow) > t) {
        c = col;
        break;
      }
    }
  }

  // warm bronze rim light hugging the silhouette
  if (!seam && mat.rimPx > 0 && !p.far && h.edge < mat.rimPx) {
    const facing = (nx / l2) * RIM[0] + (ny / l2) * RIM[1];
    if (facing > mat.rimMin) c = mat.rimSoft ? PALETTE.bronze[facing > 0.85 ? 3 : 2] : PALETTE.bronze[facing > 0.8 ? 4 : facing > 0.55 ? 3 : 2];
  }

  // coloured point lights (screen glow etc.)
  for (const L of ctx.lights) {
    const lx = L.x - px;
    const ly = L.y - py;
    const dist = Math.hypot(lx, ly);
    if (dist > L.r) continue;
    const [dx, dy, dz] = norm3(lx, ly, L.z);
    const lam = Math.max(0, nx * dx + ny * dy + nz * dz) * (1 - dist / L.r);
    const k = lam > 0.5 ? L.k : lam > 0.22 ? L.k * 0.55 : 0;
    if (k) c = mix(c, L.rgb, k);
  }
  return c;
}

function shadeEye(p, h, ctx) {
  const r = PALETTE.eye;
  const dif = Math.max(0, h.nx * KEY[0] + h.ny * KEY[1] + h.nz * KEY[2]);
  let I = 0.18 + 0.5 * ((h.v + 1) / 2) + 0.28 * dif - 0.5 * (1 - h.nz);
  let c = pick(r, I);
  const pxR = p.rx * ctx.s;
  const d1 = Math.hypot(h.u + 0.34, h.v + 0.38) * pxR;
  const d2 = Math.hypot(h.u - 0.36, h.v - 0.36) * pxR;
  if (d1 < Math.max(0.75, 0.27 * pxR)) c = PALETTE.eyeHi;
  else if (d1 < Math.max(1.1, 0.4 * pxR)) c = r[r.length - 1];
  else if (d2 < Math.max(0.5, 0.13 * pxR)) c = r[r.length - 2];
  for (const L of ctx.lights) {
    if (Math.hypot(L.x - p.x, L.y - p.y) < L.r && h.u > 0 && c !== PALETTE.eyeHi) c = mix(c, L.rgb, L.k * 0.5);
  }
  return c;
}

function shadeScreen(p, h, ctx, py) {
  const r = PALETTE.screen;
  let I = 0.35 + 0.45 * (1 - h.v) + 0.12 * Math.sin(ctx.time * 9);
  if (Math.floor(py * ctx.s) % 2 === 0) I -= 0.12;
  // a couple of "text lines" on the screen
  if (h.v > 0.25 && h.v < 0.85 && Math.floor(h.v * 6) % 2 === 0 && h.u > 0.18 && h.u < 0.3 + 0.5 * ((Math.floor(h.v * 6) * 37) % 10) / 10) I += 0.35;
  return pick(r, I);
}

function shade(p, h, ctx, x, y) {
  if (p.mat === 'eye') return shadeEye(p, h, ctx);
  if (p.mat === 'screen') return shadeScreen(p, h, ctx, y);
  if (p.mat === 'lid') return h.v > -0.12 && h.v < 0.22 ? PALETTE.seam : shadeSurface(p, h, MATERIALS.shell, ctx, x, y);
  return shadeSurface(p, h, MATERIALS[p.mat] || MATERIALS.shell, ctx, x, y);
}

// ---- rasterization --------------------------------------------------------------------------

export function render(parts, opts) {
  const { w, h, s, lights = [], time = 0, fx = [] } = opts;
  const color = new Uint32Array(w * h);
  const owner = new Int16Array(w * h).fill(-1);
  const ctx = {
    s,
    time,
    lights: lights.map((L) => ({ ...L, rgb: hex(L.color) })),
  };
  const order = parts.map((p, i) => i).sort((a, b) => parts[a].z - parts[b].z);

  for (const i of order) {
    const p = parts[i];
    const [x0, y0, x1, y1] = bounds(p);
    const px0 = Math.max(0, Math.floor(x0 * s));
    const py0 = Math.max(0, Math.floor(y0 * s));
    const px1 = Math.min(w - 1, Math.ceil(x1 * s));
    const py1 = Math.min(h - 1, Math.ceil(y1 * s));
    for (let py = py0; py <= py1; py++) {
      for (let px = px0; px <= px1; px++) {
        const x = (px + 0.5) / s;
        const y = (py + 0.5) / s;
        const hh = hit(p, x, y, s);
        if (!hh) continue;
        const k = py * w + px;
        if (p.mat === 'shadow') {
          if (owner[k] === -1) {
            color[k] = pack([10, 6, 6], p.alpha ?? 90);
            owner[k] = -2;
          }
          continue;
        }
        color[k] = shade(p, hh, ctx, x, y);
        owner[k] = i;
      }
    }
  }

  // cast shadows: parts flagged `cast` darken what lies just below-right of them (key light is
  // top-left), which separates arms from the torso and tucks the body under the head
  const sx = Math.max(1, Math.round(0.9 * s));
  const sy = Math.max(1, Math.round(1.8 * s));
  const shadowed = new Uint8Array(w * h);
  for (let y = sy; y < h; y++) {
    for (let x = sx; x < w; x++) {
      const k = y * w + x;
      const a = owner[k];
      if (a < 0) continue;
      for (const [ox, oy] of [[sx, sy], [0, sy], [sx, 0]]) {
        const b = owner[k - oy * w - ox];
        if (b < 0 || b === a) continue;
        const pb = parts[b];
        if (pb.cast && pb.z > parts[a].z && (pb.group == null || pb.group !== parts[a].group)) {
          shadowed[k] = 1;
          break;
        }
      }
    }
  }
  for (let k = 0; k < w * h; k++) if (shadowed[k]) color[k] = mix(color[k], SHADOW_RGB, 0.55);

  // inner seams: a back part gets a dark line where a front part (other group) covers it
  const out = color.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      const a = owner[k];
      if (a < 0) continue;
      const pa = parts[a];
      if (pa.noSeam) continue;
      const nb = [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1];
      // dark-on-dark needs a light edge: front parts flagged `edgeLight` catch a bronze sliver on
      // their lit (left/top) border where they overlap something behind them
      if (pa.edgeLight && !pa.far) {
        const lit = [nb[0], nb[2]].some((n) => n >= 0 && owner[n] >= 0 && owner[n] !== a && parts[owner[n]].z < pa.z && parts[owner[n]].group !== pa.group);
        if (lit) {
          out[k] = PALETTE.bronze[2];
          continue;
        }
      }
      for (const n of nb) {
        if (n < 0) continue;
        const b = owner[n];
        if (b < 0 || b === a) continue;
        const pb = parts[b];
        if (pb.z > pa.z && !pb.noSeam && (pa.group == null || pa.group !== pb.group)) {
          out[k] = PALETTE.seam;
          break;
        }
      }
    }
  }

  // outer outline (4-neighbourhood)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (owner[k] >= 0) continue;
      const solid = (n) => n >= 0 && owner[n] >= 0 && !parts[owner[n]].noOutline;
      if (
        (x > 0 && solid(k - 1)) ||
        (x < w - 1 && solid(k + 1)) ||
        (y > 0 && solid(k - w)) ||
        (y < h - 1 && solid(k + w))
      ) {
        out[k] = PALETTE.outline;
      }
    }
  }

  // overlay effects (pixel lines), drawn on top without outline
  for (const f of fx) line(out, w, h, f.x0 * s, f.y0 * s, f.x1 * s, f.y1 * s, f.color ?? PALETTE.spark);

  return out;
}

function line(buf, w, h, x0, y0, x1, y1, c) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (x0 >= 0 && y0 >= 0 && x0 < w && y0 < h) buf[y0 * w + x0] = c;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

// Draws a rendered buffer onto a canvas context at an integer scale, optionally mirrored.
const scratch = new Map();
export function blit(g, buf, w, h, dx, dy, scale, flip = false) {
  const key = `${w}x${h}`;
  let c = scratch.get(key);
  if (!c) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    c = { canvas, g: canvas.getContext('2d'), img: new ImageData(w, h) };
    scratch.set(key, c);
  }
  new Uint32Array(c.img.data.buffer).set(buf);
  c.g.putImageData(c.img, 0, 0);
  g.save();
  g.imageSmoothingEnabled = false;
  if (flip) {
    g.translate(dx + w * scale, dy);
    g.scale(-1, 1);
    g.drawImage(c.canvas, 0, 0, w * scale, h * scale);
  } else {
    g.drawImage(c.canvas, dx, dy, w * scale, h * scale);
  }
  g.restore();
}
