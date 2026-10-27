// Puzzle rules for the rocket demo. Geometry and the solved order come from
// assets/layout.json, written by tools/blender/rocket.py.

export const BOX_SLOTS = 3;
export const BUFFER = 5;

export const COLOR_HEX = {
  pink: '#FF5CA8',
  yellow: '#FFC918',
  lime: '#8FD21E',
  cyan: '#19C3D3',
  orange: '#FF8A14',
  red: '#FF3B4E',
  blue: '#3D6BFF',
  purple: '#A13DFF',
};

export let LAYOUT = null;
export let PUZZLE = null;

export async function loadPuzzle() {
  const res = await fetch(new URL('./assets/layout.json', import.meta.url));
  if (!res.ok) throw new Error('layout ' + res.status);
  const layout = await res.json();
  const parts = layout.parts.map(p => ({
    id: p.id,
    blocks: p.blocks.slice(),
    screws: [],
    fall: p.fall,
    color: p.color,
    space: p.space,
  }));
  layout.screws.forEach((s, i) => {
    const p = parts.find(q => q.id === s.part);
    if (!p) throw new Error('unknown part ' + s.part);
    p.screws.push(i);
  });
  LAYOUT = layout;
  PUZZLE = {
    screws: layout.screws,
    parts,
    opening: layout.opening.slice(),
    queue: layout.queue.slice(),
  };
  const counts = {};
  for (const s of PUZZLE.screws) counts[s.color] = (counts[s.color] || 0) + 1;
  for (const k of Object.keys(counts)) {
    if (counts[k] % 3 !== 0) throw new Error(k + ' count ' + counts[k]);
  }
  const moves = layout.solution.slice();
  const st = createState();
  for (let i = 0; i < moves.length; i++) {
    if (!doMove(st, moves[i])) throw new Error('solution failed at ' + i);
  }
  if (!isWin(st)) throw new Error('solution short');
  return layout;
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
