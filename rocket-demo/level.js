// Hand-authored rocket puzzle. Screws are candy colors, never the part color.
// Each color appears 6 times (two boxes of 3). Outer parts are free; the belt
// covers the body shells, the front shells cover the window and the nozzle.

export const BOX_SLOTS = 3;
export const BUFFER = 5;

export const COLOR_HEX = {
  pink: '#FF5CA8',
  yellow: '#FFC918',
  lime: '#8FD21E',
  cyan: '#19C3D3',
};

// Shared dimensions so screws sit on the meshes that use the same numbers.
export const LAYOUT = {
  hullR: 0.58,
  panelIn: 0.60,
  panelOut: 0.78,
  panelSpan: 2.05,
  lowerY: 0.96,
  lowerH: 0.52,
  upperY: 1.64,
  upperH: 0.56,
  bandY: 1.30,
  bandR: 0.90,
  noseBase: 1.90,
  windowY: 1.66,
  windowZ: 0.86,
  windowR: 0.25,
  finAngles: [0.55, 2.55, 4.25],
  finRoot: 0.50,
  finTip: 1.02,
  finY: 0.10,
};

function onCyl(y, ang, r, part, color, tilt = 0) {
  const x = Math.sin(ang) * r;
  const z = Math.cos(ang) * r;
  const ny = Math.sin(tilt);
  const c = Math.cos(tilt);
  return {
    part, color,
    pos: [x, y, z],
    normal: [Math.sin(ang) * c, ny, Math.cos(ang) * c],
  };
}

const L = LAYOUT;

// 24 screws. Free at the start: nose, band, three fins.
const SCREW_LIST = [
  onCyl(2.28, -0.45, 0.40, 'nose', 'yellow', 0.55),
  onCyl(2.22, 0.50, 0.42, 'nose', 'cyan', 0.50),

  onCyl(L.bandY, -0.65, L.bandR, 'band', 'pink'),
  onCyl(L.bandY, 0.55, L.bandR, 'band', 'lime'),
  onCyl(L.bandY, 2.70, L.bandR, 'band', 'yellow'),

  onCyl(L.upperY + 0.08, -0.42, L.panelOut, 'upperF', 'cyan'),
  onCyl(L.upperY - 0.10, 0.38, L.panelOut, 'upperF', 'lime'),
  onCyl(L.upperY + 0.08, Math.PI + 0.40, L.panelOut, 'upperB', 'pink'),
  onCyl(L.upperY - 0.10, Math.PI - 0.38, L.panelOut, 'upperB', 'yellow'),

  { part: 'window', color: 'pink', pos: [0, L.windowY + L.windowR, L.windowZ + 0.05], normal: [0, 0.4, 0.92] },
  { part: 'window', color: 'yellow', pos: [-L.windowR, L.windowY, L.windowZ + 0.06], normal: [-0.62, 0, 0.78] },
  { part: 'window', color: 'cyan', pos: [L.windowR, L.windowY, L.windowZ + 0.06], normal: [0.62, 0, 0.78] },

  onCyl(L.lowerY + 0.08, -0.40, L.panelOut, 'lowerF', 'lime'),
  onCyl(L.lowerY - 0.08, 0.36, L.panelOut, 'lowerF', 'cyan'),
  onCyl(L.lowerY + 0.08, Math.PI + 0.36, L.panelOut, 'lowerB', 'yellow'),
  onCyl(L.lowerY - 0.08, Math.PI - 0.40, L.panelOut, 'lowerB', 'pink'),

  onCyl(0.36, L.finAngles[0], 0.78, 'finR', 'pink', 0.15),
  onCyl(0.24, L.finAngles[0], 0.92, 'finR', 'cyan', 0.1),
  onCyl(0.36, L.finAngles[1], 0.78, 'finL', 'lime', 0.15),
  onCyl(0.24, L.finAngles[1], 0.92, 'finL', 'yellow', 0.1),
  onCyl(0.36, L.finAngles[2], 0.78, 'finB', 'pink', 0.15),
  onCyl(0.24, L.finAngles[2], 0.92, 'finB', 'lime', 0.1),

  onCyl(0.16, -0.7, 0.40, 'nozzle', 'cyan', -0.35),
  onCyl(0.16, 0.75, 0.40, 'nozzle', 'lime', -0.35),
];

export const PARTS = [
  { id: 'nose', blocks: [] },
  { id: 'band', blocks: ['upperF', 'upperB', 'lowerF', 'lowerB'] },
  { id: 'upperF', blocks: ['window'] },
  { id: 'upperB', blocks: [] },
  { id: 'window', blocks: [] },
  { id: 'lowerF', blocks: ['nozzle'] },
  { id: 'lowerB', blocks: [] },
  { id: 'finR', blocks: [] },
  { id: 'finL', blocks: [] },
  { id: 'finB', blocks: [] },
  { id: 'nozzle', blocks: [] },
];

export const PUZZLE = {
  screws: SCREW_LIST,
  parts: PARTS.map(p => ({ ...p, screws: [] })),
  opening: ['pink', 'yellow', 'cyan', 'lime'],
  queue: ['pink', 'yellow', 'cyan', 'lime'],
};

PUZZLE.screws.forEach((s, i) => {
  const p = PUZZLE.parts.find(q => q.id === s.part);
  if (!p) throw new Error('unknown part ' + s.part);
  p.screws.push(i);
});

function rng(seed) {
  let s = seed % 2147483646;
  if (s <= 0) s += 2147483646;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

export function createState() {
  return {
    removed: PUZZLE.screws.map(() => false),
    boxes: PUZZLE.opening.map(color => ({ color, n: 0 })),
    queue: PUZZLE.queue.slice(),
    buffer: [],
  };
}

function alive(st, part) {
  return part.screws.some(i => !st.removed[i]);
}

export function isBlocked(st, i) {
  const owner = PUZZLE.screws[i].part;
  return PUZZLE.parts.some(p => p.blocks.includes(owner) && alive(st, p));
}

export function coveringParts(st, i) {
  const owner = PUZZLE.screws[i].part;
  return PUZZLE.parts.filter(p => p.blocks.includes(owner) && alive(st, p)).map(p => p.id);
}

function settle(st) {
  const cleared = [];
  let changed = true;
  while (changed) {
    changed = false;
    st.boxes.forEach((b, k) => {
      if (b && b.n >= BOX_SLOTS) {
        cleared.push(b.color);
        st.boxes[k] = st.queue.length ? { color: st.queue.shift(), n: 0 } : null;
        changed = true;
      }
    });
    for (let j = 0; j < st.buffer.length; j++) {
      const b = st.boxes.find(box => box && box.color === st.buffer[j] && box.n < BOX_SLOTS);
      if (b) { b.n++; st.buffer.splice(j, 1); j--; changed = true; }
    }
  }
  return cleared;
}

export function freshParts(st) {
  return PUZZLE.parts.filter(p => p.screws.length && p.screws.every(i => st.removed[i])).map(p => p.id);
}

export function doMove(st, i) {
  if (st.removed[i] || isBlocked(st, i)) return null;
  const color = PUZZLE.screws[i].color;
  const k = st.boxes.findIndex(b => b && b.color === color && b.n < BOX_SLOTS);
  let dest;
  if (k >= 0) {
    const slot = st.boxes[k].n;
    st.boxes[k].n++;
    dest = { dest: 'box', k, slot, color };
  } else if (st.buffer.length < BUFFER) {
    dest = { dest: 'buf', k: st.buffer.length, color };
    st.buffer.push(color);
  } else return null;
  st.removed[i] = true;
  const cleared = settle(st);
  const fell = PUZZLE.parts.filter(p => p.screws.includes(i) && p.screws.every(si => st.removed[si])).map(p => p.id);
  return { ...dest, cleared, fell };
}

export const isWin = st => st.removed.every(Boolean);

export function freeScrews(st) {
  const out = [];
  for (let i = 0; i < PUZZLE.screws.length; i++) if (!st.removed[i] && !isBlocked(st, i)) out.push(i);
  return out;
}

export function solve(tries = 500) {
  const rand = rng(90210);
  for (let t = 0; t < tries; t++) {
    const st = createState();
    const moves = [];
    for (;;) {
      if (isWin(st)) return moves;
      const free = freeScrews(st);
      if (!free.length) break;
      const open = st.boxes.filter(Boolean).map(b => b.color);
      const good = free.filter(i => open.includes(PUZZLE.screws[i].color));
      let pool = good;
      if (!pool.length) {
        if (st.buffer.length >= BUFFER) break;
        const last = free.filter(i => {
          const p = PUZZLE.parts.find(q => q.id === PUZZLE.screws[i].part);
          return p.screws.filter(j => !st.removed[j]).length === 1;
        });
        pool = last.length && rand() < 0.65 ? last : free;
      }
      const pick = pool[Math.floor(rand() * pool.length)];
      if (!doMove(st, pick)) break;
      moves.push(pick);
    }
  }
  return null;
}

export function selfTest() {
  const counts = {};
  for (const s of PUZZLE.screws) counts[s.color] = (counts[s.color] || 0) + 1;
  for (const k of Object.keys(counts)) {
    if (counts[k] % 3 !== 0) throw new Error(k + ' count ' + counts[k]);
  }
  const moves = solve();
  if (!moves || moves.length !== PUZZLE.screws.length) {
    throw new Error('unsolvable ' + (moves && moves.length));
  }
  return { screws: PUZZLE.screws.length, moves: moves.length, counts };
}
