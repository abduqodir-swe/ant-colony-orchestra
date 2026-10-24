// Pose generators. Each animation is stepped at its own fps like a classic sprite sheet;
// pose(t, view, frame, time) receives the normalized cycle position t = frame / frames.

const TAU = Math.PI * 2;
const blinkAt = (time) => time % 3.7 < 0.13;
const smooth = (x) => x * x * (3 - 2 * x);

function walkSide(t) {
  const A = 3.6;
  const foot = (phase) => {
    const p = (t + phase) % 1;
    if (p < 0.5) return { dx: A - 4 * A * p, lift: 0 };
    const s = (p - 0.5) / 0.5;
    return { dx: -A + 2 * A * smooth(s), lift: Math.sin(Math.PI * s) * 3 };
  };
  const far = foot(0.5);
  const near = foot(0);
  return {
    bob: -1.1 * Math.sin(TAU * t) ** 2,
    lean: 0.8,
    legs: [far, near],
    arms: [
      { dx: -near.dx * 0.7 - 0.2, dy: 8 },
      { dx: -far.dx * 0.7 + 1.4, dy: 7.9 },
    ],
    antSway: [0.07 * Math.sin(TAU * 2 * t - 0.9), 0.07 * Math.sin(TAU * 2 * t - 0.5)],
    headDy: 0.4 * Math.sin(TAU * 2 * t - 0.6),
    tail: 0.06 * Math.sin(TAU * 2 * t - 1.3),
  };
}

function walkFront(t) {
  const w = Math.sin(TAU * t);
  return {
    bob: -0.9 * Math.abs(w),
    sway: 0.6 * w,
    legs: [
      { lift: Math.max(0, w) * 2.4, dx: 0 },
      { lift: Math.max(0, -w) * 2.4, dx: 0 },
    ],
    arms: [
      { dx: 1.6, dy: 8.2 - Math.max(0, -w) * 1.6 },
      { dx: 1.6, dy: 8.2 - Math.max(0, w) * 1.6 },
    ],
    antSway: [0.06 * Math.sin(TAU * 2 * t - 0.8), 0.06 * Math.sin(TAU * 2 * t - 0.4)],
    headTilt: 0.03 * w,
  };
}

const HAPPY = [
  { arms: 'down' },
  { crouch: 0.5, arms: 'down', stretch: -0.03 },
  { crouch: 1, arms: 'down', stretch: -0.07 },
  { air: 3, arms: 'up', stretch: 0.07, sparks: true },
  { air: 6, arms: 'up', stretch: 0.04, sparks: true },
  { air: 7.2, arms: 'up', sparks: true },
  { air: 6.4, arms: 'up', sparks: true },
  { air: 3.4, arms: 'up', stretch: 0.05, sparks: true },
  { crouch: 0.9, arms: 'mid', stretch: -0.07, sparks: true },
  { crouch: 0.35, arms: 'up', sparks: true },
  { arms: 'wave1', sparks: true },
  { arms: 'wave2' },
];
const ARMS = {
  down: { dx: 2.8, dy: 7.6 },
  mid: { dx: 5.6, dy: 3 },
  up: { dx: 8.2, dy: -3.4 },
};

export const ANIMS = {
  idle: {
    label: 'Idle',
    fps: 6,
    frames: 8,
    views: ['front', 'side', 'back'],
    pose(t, view, frame, time) {
      const w = Math.sin(TAU * t);
      const side = view === 'side';
      return {
        breath: 0.5 - 0.5 * w,
        antSway: [0.06 * Math.sin(TAU * t), 0.06 * Math.sin(TAU * t + 1.4)],
        arms: side
          ? [{ dx: -0.4, dy: 8.2 + 0.2 * w }, { dx: 1.6, dy: 8.1 + 0.2 * w }]
          : [{ dx: 1.6 + 0.25 * w, dy: 8.3 }, { dx: 1.6 + 0.25 * w, dy: 8.3 }],
        blink: blinkAt(time),
      };
    },
  },
  walk: {
    label: 'Walk',
    fps: 10,
    frames: 8,
    views: ['side', 'front', 'back'],
    pose(t, view, frame, time) {
      return { ...(view === 'side' ? walkSide(t) : walkFront(t)), blink: blinkAt(time) };
    },
  },
  work: {
    label: 'Work',
    fps: 8,
    frames: 8,
    views: ['side'],
    pose(t, view, frame, time) {
      // tap pattern: press, lift, press lower, lift
      const taps = [
        [6.4, 3.4],
        [5.4, 1.6],
        [7.2, 6.2],
        [6.0, 4.2],
        [6.7, 2.4],
        [5.4, 0.8],
        [7.0, 5.4],
        [5.8, 3.6],
      ];
      const [tx, ty] = taps[frame % taps.length];
      return {
        lean: 1.2,
        headTilt: 0.1 + (frame % 4 === 0 ? 0.02 : 0),
        breath: 0.5 - 0.5 * Math.sin(TAU * t),
        tablet: { dx: 0, dy: 0 },
        arms: [
          { dx: 9.2, dy: 9.6 },
          { dx: tx, dy: ty },
        ],
        antSway: [0.05 * Math.sin(TAU * t), frame % 4 === 1 ? 0.12 : 0.03],
        blink: blinkAt(time),
      };
    },
  },
  type: {
    label: 'Type',
    fps: 8,
    frames: 8,
    views: ['back', 'front'],
    // seated at a desk: hands work a keyboard in front, head nods along; the chair/desk hides the legs
    pose(t, view, frame, time) {
      const a = frame % 2 ? 0.8 : -0.4;
      return {
        crouch: 0.35,
        breath: 0.5 - 0.5 * Math.sin(TAU * t),
        headDy: frame % 4 === 0 ? 0.5 : 0,
        arms: [
          { dx: 2.6, dy: 4.2 + a },
          { dx: 2.6, dy: 4.2 - a },
        ],
        antSway: [0.04 * Math.sin(TAU * t), 0.04 * Math.sin(TAU * t + 1.7)],
        blink: blinkAt(time),
      };
    },
  },
  happy: {
    label: 'Happy',
    fps: 10,
    frames: HAPPY.length,
    views: ['front'],
    pose(t, view, frame) {
      const k = HAPPY[frame % HAPPY.length];
      const a = k.arms;
      const arms =
        a === 'wave1' ? [ARMS.up, { dx: 8.6, dy: -1.2 }] : a === 'wave2' ? [{ dx: 8.6, dy: -1.2 }, ARMS.up] : [ARMS[a], ARMS[a]];
      const perk = k.air ? 0.14 : 0;
      return {
        ...k,
        arms,
        eyeScale: k.air ? 1.08 : 1,
        antSway: [-perk, perk],
        sparkFrame: frame,
      };
    },
  },
};
