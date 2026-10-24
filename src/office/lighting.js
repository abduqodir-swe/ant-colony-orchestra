// Baked per-pixel light map: dim ambient plus warm lamps and coloured screen glows, quantized in
// steps with an ordered dither so gradients stay pixel-art instead of smooth airbrush.

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
const STEP = 1 / 12;

export const hexRgb = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export function buildLightMap(w, h, lights, ambient = [0.4, 0.37, 0.4]) {
  const L = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) L.set(ambient, i * 3);
  for (const l of lights) {
    const [r, g, b] = hexRgb(l.color);
    const x0 = Math.max(0, Math.floor(l.x - l.r));
    const x1 = Math.min(w - 1, Math.ceil(l.x + l.r));
    const y0 = Math.max(0, Math.floor(l.y - l.r * (l.squash ?? 0.8)));
    const y1 = Math.min(h - 1, Math.ceil(l.y + l.r * (l.squash ?? 0.8)));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - l.x) / l.r;
        const dy = (y - l.y) / (l.r * (l.squash ?? 0.8));
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= 1) continue;
        const f = (1 - d) * (1 - d) * l.k;
        const k = (y * w + x) * 3;
        L[k] += r * f;
        L[k + 1] += g * f;
        L[k + 2] += b * f;
      }
    }
  }
  // quantize with dither
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = BAYER[(y & 3) * 4 + (x & 3)] * STEP;
      const k = (y * w + x) * 3;
      for (let c = 0; c < 3; c++) L[k + c] = Math.min(1.6, Math.round((L[k + c] + d) / STEP) * STEP);
    }
  }
  return { L, w, h };
}

// Multiplies an RGBA byte array (placed at world offset ox, oy) by the light map.
export function applyLight(data, dw, dh, ox, oy, map) {
  const { L, w, h } = map;
  for (let y = 0; y < dh; y++) {
    const wy = y + oy;
    if (wy < 0 || wy >= h) continue;
    for (let x = 0; x < dw; x++) {
      const wx = x + ox;
      if (wx < 0 || wx >= w) continue;
      const i = (y * dw + x) * 4;
      if (data[i + 3] === 0) continue;
      const k = (wy * w + wx) * 3;
      data[i] = Math.min(255, data[i] * L[k]);
      data[i + 1] = Math.min(255, data[i + 1] * L[k + 1]);
      data[i + 2] = Math.min(255, data[i + 2] * L[k + 2]);
    }
  }
}

export function lightCanvas(g, w, h, ox, oy, map) {
  const img = g.getImageData(0, 0, w, h);
  applyLight(img.data, w, h, ox, oy, map);
  g.putImageData(img, 0, 0);
}
