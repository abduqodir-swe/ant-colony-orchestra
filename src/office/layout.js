// Room furnishing, agent seats and break spots. Coordinates are world pixels (16px tiles).
// Keep the tile in front of every doorway free (see DOORS in map.js): validateLayout() warns
// in the console when a seat or spot can't be reached.

import * as F from './props.js';
import { ROOMS, DOORS, T } from './map.js';

const room = (id) => ROOMS.find((r) => r.id === id);
const cx = (id) => ((room(id).rect[0] + room(id).rect[2] + 1) * T) / 2;
// y of the sign / wall-piece band for a room (its brick face sits in the two tiles above)
const wallY = (id) => (room(id).rect[1] - 2) * T;
// pendant positions as a fraction of room width, where the default pair would hit a wall piece
const LAMPS = { command: [0.25, 0.86], hall: [0.65], security: [0.1], design: [0.36, 0.95], dev: [0.14, 0.38], analytics: [0.14, 0.38], lounge: [0.75, 0.9] };
// sign centre x, where the room centre sits above a doorway
const SIGN_X = { dev: 166, analytics: 166, lounge: 252, security: 560 };
const BLUE_CHAIR = '#2c4a6e';

// A desk with its chair; returns the seat for whoever works there.
function workstation(props, x, y, opts = {}) {
  const w = opts.w ?? 32;
  props.push(F.desk(x, y, { w, screens: opts.screens ?? ['code'], seed: opts.seed ?? x + y, lamp: opts.lamp, plant: opts.plant }));
  const sx = x + w / 2;
  // far enough back that the monitor shows above the sitter's head
  const sy = y + 37;
  props.push(F.chair(sx, sy, { color: opts.chair }));
  return { x: sx, y: sy, view: 'back', anim: 'type' };
}

// Lanterns on the wall ledge either side of every doorway.
function doorLanterns(props) {
  for (const [x0, y0, x1, y1] of DOORS) {
    if (x1 > x0) {
      props.push(F.lantern(x0 * T - 4, y0 * T));
      props.push(F.lantern((x1 + 1) * T + 3, y0 * T));
    } else {
      props.push(F.lantern(x0 * T + 8, (y0 - 2) * T));
      props.push(F.lantern(x0 * T + 8, (y1 + 1) * T + 3));
    }
  }
}

export function buildLayout() {
  const props = [];
  const seats = {};
  const spots = [];

  for (const r of ROOMS) {
    const y = wallY(r.id);
    if (r.name) props.push(F.sign(SIGN_X[r.id] ?? cx(r.id), y + 1, r.name, r.color));
    const [x0, , x1] = r.rect;
    const span = (x1 - x0 + 1) * T;
    for (const f of LAMPS[r.id] || [0.14, 0.86]) props.push(F.pendant(Math.round(x0 * T + span * f), y + 4));
  }
  doorLanterns(props);

  // ---- command center ----
  {
    const y = wallY('command');
    props.push(F.wallScreen(18, y + 8, 42, 23, 'checklist'));
    props.push(F.wallScreen(86, y + 14, 68, 17, 'tv', { seed: 5 }));
    props.push(F.wallScreen(168, y + 15, 20, 13, 'dash', { seed: 11 }));
    props.push(F.wallScreen(192, y + 15, 20, 13, 'line', { seed: 12 }));
    props.push(F.bookshelf(18, 28, { seed: 21 }));
    props.push(F.plant(62, 62, { seed: 4 }));
    props.push(F.holoTable(88, 84, { w: 64 }));
    props.push(F.chairBack(80, 106, { color: BLUE_CHAIR }));
    props.push(F.chairBack(160, 106, { color: BLUE_CHAIR }));
    seats.pm_lead = { x: 120, y: 88, view: 'front', anim: 'idle' };
    props.push(F.plant(208, 62, { seed: 3, style: 'snake' }));
    props.push(F.plant(26, 140, { size: 'small', seed: 5 }));
    seats.architect = workstation(props, 164, 100, { screens: ['dash'], seed: 31, lamp: true });
    props.push(F.filingCabinet(200, 112));
    props.push(F.trash(156, 140));
  }

  // ---- meeting room ----
  {
    const y = wallY('meeting');
    props.push(F.whiteboard(282, y + 13, 60, 18, 'flow'));
    props.push(F.clock(252, y + 17));
    props.push(F.poster(352, y + 14, 16, 15, { kind: 'mountain', seed: 3 }));
    props.push(F.credenza(244, 40, { w: 30, top: 'coffee' }));
    props.push(F.rug(254, 72, 116, 66, { field: '#6a2622', border: '#a04e3a', motif: '#84362c' }));
    props.push(F.meetingTable(268, 88, { w: 88, h: 18 }));
    for (const x of [286, 312, 338]) props.push(F.chairBack(x, 94));
    seats.writer_01 = { x: 312, y: 94, view: 'front', anim: 'idle' };
    for (const x of [286, 338]) spots.push({ x, y: 94, view: 'front', anim: 'idle', seat: true });
    for (const x of [290, 322]) {
      props.push(F.chair(x, 131));
      spots.push({ x, y: 131, view: 'back', anim: 'idle', seat: true });
    }
    props.push(F.plant(250, 140, { size: 'small', seed: 7 }));
    props.push(F.plant(372, 68, { seed: 8 }));
  }

  // ---- devops ----
  {
    const y = wallY('devops');
    props.push(F.wallScreen(452, y + 14, 26, 15, 'dash', { seed: 13 }));
    props.push(F.wallScreen(536, y + 14, 44, 17, 'cctv', { seed: 3 }));
    props.push(F.wallScreen(584, y + 14, 30, 15, 'line', { seed: 14 }));
    for (const [i, x] of [404, 420, 436].entries()) props.push(F.serverRack(x, 26, { seed: 40 + i }));
    props.push(F.serverRack(470, 26, { seed: 44 }));
    props.push(F.extinguisher(458, 46));
    seats.devops_01 = workstation(props, 496, 78, { screens: ['dash'], seed: 51, plant: true });
    seats.sre_01 = workstation(props, 540, 78, { screens: ['line'], seed: 52 });
    workstation(props, 584, 78, { screens: ['code'], seed: 53, lamp: true });
    props.push(F.filingCabinet(404, 108));
    props.push(F.boxes(422, 118));
    props.push(F.plant(452, 140, { size: 'small', seed: 9 }));
    props.push(F.trash(486, 140));
  }

  // ---- development ----
  {
    const y = wallY('dev');
    props.push(F.wallScreen(26, y + 14, 26, 16, 'codeicon'));
    props.push(F.wallShelf(136, y + 17, 36, { seed: 4 }));
    props.push(F.bookshelf(176, y + 26, { seed: 23, h: 36 }));
    seats.backend_01 = workstation(props, 22, 186, { screens: ['code'], seed: 61, plant: true });
    seats.frontend_01 = workstation(props, 54, 186, { screens: ['design'], seed: 62 });
    workstation(props, 136, 186, { screens: ['code'], seed: 63, lamp: true });
    workstation(props, 22, 234, { w: 40, screens: ['code', 'code'], seed: 64 });
    seats.mobile_01 = workstation(props, 136, 234, { screens: ['code'], seed: 65, plant: true });
    props.push(F.trash(92, 222));
    props.push(F.plant(24, 284, { size: 'small', seed: 19 }));
    props.push(F.plant(200, 284, { size: 'small', seed: 10 }));
    props.push(F.beanBag(78, 278));
  }

  // ---- hall ----
  {
    const y = wallY('hall');
    props.push(F.whiteboard(230, y + 7, 80, 25, 'kanban'));
    props.push(F.clock(318, y + 17));
    props.push(F.mosaic(296, 232));
    props.push(F.bench(236, 266));
    props.push(F.bench(326, 266));
    props.push(F.plant(234, 202, { seed: 11 }));
    props.push(F.plant(358, 284, { seed: 12, style: 'snake' }));
    props.push(F.waterCooler(318, 180));
    props.push(F.trash(306, 196));
    spots.push({ x: 270, y: 200, view: 'back', anim: 'idle' });
    spots.push({ x: 324, y: 216, view: 'back', anim: 'idle' });
    spots.push({ x: 276, y: 244, view: 'front', anim: 'idle' });
    spots.push({ x: 318, y: 252, view: 'front', anim: 'idle' });
  }

  // ---- qa lab ----
  {
    const y = wallY('qa');
    props.push(F.poster(390, y + 15, 14, 15, { kind: 'bug', seed: 2 }));
    props.push(F.wallScreen(466, y + 15, 24, 14, 'chart', { seed: 22 }));
    props.push(F.testBoard(388, 230));
    seats.qa_engineer = workstation(props, 420, 186, { screens: ['code'], seed: 71, lamp: true });
    workstation(props, 456, 186, { screens: ['chart'], seed: 72, plant: true });
    props.push(F.specimenTank(476, 248));
    props.push(F.extinguisher(488, 200));
    props.push(F.trash(412, 284));
  }

  // ---- security ----
  {
    const y = wallY('security');
    props.push(F.wallScreen(522, y + 14, 18, 17, 'shield'));
    props.push(F.wallScreen(546, y + 15, 44, 15, 'secscan'));
    props.push(F.lockers(516, 180, 3));
    seats.sec_analyst = workstation(props, 548, 198, { w: 40, screens: ['cctv', 'dash'], seed: 81 });
    props.push(F.cabinet(600, 182));
    props.push(F.filingCabinet(604, 244));
    props.push(F.plant(524, 284, { size: 'small', seed: 13 }));
    props.push(F.trash(590, 284));
  }

  // ---- analytics ----
  {
    const y = wallY('analytics');
    props.push(F.wallScreen(22, y + 15, 28, 15, 'chart', { seed: 15 }));
    props.push(F.wallScreen(54, y + 15, 16, 15, 'pie'));
    props.push(F.wallScreen(150, y + 15, 28, 15, 'line', { seed: 16 }));
    props.push(F.wallScreen(182, y + 15, 20, 15, 'chart', { seed: 17 }));
    seats.data_analyst = workstation(props, 28, 334, { screens: ['chart'], seed: 91, lamp: true });
    workstation(props, 60, 334, { screens: ['line'], seed: 92 });
    seats.researcher = workstation(props, 140, 334, { screens: ['pie'], seed: 93, plant: true });
    workstation(props, 28, 390, { screens: ['dash'], seed: 94 });
    props.push(F.credenza(140, 392, { w: 32, top: 'printer' }));
    props.push(F.filingCabinet(188, 402));
    props.push(F.plant(80, 428, { seed: 14 }));
    props.push(F.trash(112, 428));
  }

  // ---- lounge ----
  // rows 23-24 stay a clear walkway between the side doors; column 20 links it to the top door
  {
    const y = wallY('lounge');
    props.push(F.frame(240, y + 14, 22, 15, { seed: 9 }));
    props.push(F.frame(332, y + 14, 22, 15, { seed: 2 }));
    props.push(F.wallShelf(264, y + 18, 20, { seed: 7 }));
    props.push(F.bookshelf(226, 318, { seed: 31, w: 26, h: 38 }));
    props.push(F.rug(238, 340, 116, 84, { field: '#7a4a2a', border: '#b07a48', motif: '#8e5a34' }));
    props.push(F.sofa(264, 334));
    props.push(F.floorLamp(256, 346));
    props.push(F.vending(344, 322));
    props.push(F.coffeeTable(281, 402));
    props.push(F.armchair(240, 398, { facing: 'back' }));
    props.push(F.armchair(330, 398, { facing: 'back' }));
    props.push(F.plant(232, 430, { size: 'small', seed: 16 }));
    props.push(F.plant(366, 430, { size: 'small', seed: 17 }));
    spots.push({ x: 280, y: 354, view: 'front', anim: 'idle', seat: true });
    spots.push({ x: 304, y: 354, view: 'front', anim: 'idle', seat: true });
    spots.push({ x: 252, y: 414, view: 'back', anim: 'idle', seat: true, access: { x: 252, y: 386 } });
    spots.push({ x: 342, y: 414, view: 'back', anim: 'idle', seat: true, access: { x: 342, y: 386 } });
    spots.push({ x: 356, y: 372, view: 'back', anim: 'idle' });
  }

  // ---- design ----
  {
    const y = wallY('design');
    props.push(F.wallScreen(390, y + 14, 36, 16, 'design'));
    props.push(F.poster(440, y + 15, 14, 15, { kind: 'mountain', seed: 6 }));
    props.push(F.whiteboard(540, y + 13, 60, 18, 'cork'));
    props.push(F.rug(458, 328, 124, 92, { field: '#4a1e26', border: '#7a3440', motif: '#5e2630' }));
    props.push(F.sketchEasel(400, 336));
    seats.designer_01 = workstation(props, 470, 340, { w: 48, screens: ['design', 'design'], seed: 101, lamp: true });
    workstation(props, 534, 340, { screens: ['design'], seed: 102, plant: true });
    props.push(F.bookshelf(590, 314, { seed: 27, h: 38 }));
    props.push(F.floorLamp(588, 404));
    props.push(F.plant(612, 430, { seed: 18 }));
    props.push(F.plant(408, 428, { size: 'small', seed: 20, style: 'snake' }));
    props.push(F.beanBag(440, 410, ['#3a1e3a', '#5a2e5a', '#7a4078', '#9a5a98']));
    props.push(F.credenza(540, 404, { w: 30, top: 'plants' }));
  }

  return { props, seats, spots };
}

export const AGENTS = [
  { id: 'pm_lead', role: 'PM', status: 'planning' },
  { id: 'architect', role: 'Architect', status: 'working' },
  { id: 'backend_01', role: 'Backend', status: 'working' },
  { id: 'frontend_01', role: 'Frontend', status: 'testing' },
  { id: 'mobile_01', role: 'Mobile', status: 'working' },
  { id: 'qa_engineer', role: 'QA', status: 'testing' },
  { id: 'sec_analyst', role: 'Security', status: 'reviewing' },
  { id: 'devops_01', role: 'DevOps', status: 'working' },
  { id: 'sre_01', role: 'SRE', status: 'working' },
  { id: 'data_analyst', role: 'Analytics', status: 'working' },
  { id: 'researcher', role: 'Research', status: 'idle' },
  { id: 'designer_01', role: 'Design', status: 'idle' },
  { id: 'writer_01', role: 'Docs', status: 'reviewing' },
];
