// Ant head portrait for avatars: one front-view frame rendered at full detail, cropped to the head.

import { render } from '../ant/renderer.js';
import { buildAnt, W, H } from '../ant/model.js';
import { ANIMS } from '../ant/animations.js';

let url = null;

export function portraitUrl() {
  if (url) return url;
  const pose = ANIMS.idle.pose(0, 'front', 0, 1);
  const { parts, fx, lights } = buildAnt('front', pose);
  const buf = render(parts.filter((p) => p.mat !== 'shadow'), { w: W, h: H, s: 1, lights, time: 1, fx });
  const full = document.createElement('canvas');
  full.width = W;
  full.height = H;
  const img = new ImageData(W, H);
  new Uint32Array(img.data.buffer).set(buf);
  full.getContext('2d').putImageData(img, 0, 0);
  // head + antennae + a hint of shoulders, squared up
  const crop = document.createElement('canvas');
  crop.width = 36;
  crop.height = 36;
  crop.getContext('2d').drawImage(full, 10, 9, 36, 36, 0, 0, 36, 36);
  url = crop.toDataURL();
  return url;
}
