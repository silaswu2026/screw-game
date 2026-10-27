// Hard-mode rules. Pure data — runs in the browser and in Node.
// Colors are painted along a chosen removal order (solution first), so that
// order always clears and a random order usually fills the buffer or the hearts.

export const COLOR_NAMES = ['red','blue','yellow','green','purple','orange','pink','cyan','lime','peach'];
export const COLOR_HEX = {
  red:'#ff6b6b', blue:'#4dabf7', yellow:'#ffd43b', green:'#51cf66', purple:'#b197fc',
  orange:'#ff922b', pink:'#ff8ad4', cyan:'#3bc9db', lime:'#a9e34b', peach:'#ffbe9a',
};
export const COLOR_NUM = {
  red:0xff6b6b, blue:0x4dabf7, yellow:0xffd43b, green:0x51cf66, purple:0xb197fc,
  orange:0xff922b, pink:0xff8ad4, cyan:0x3bc9db, lime:0xa9e34b, peach:0xffbe9a,
};
export const BOX_SLOTS = 3;
const MARGIN = 0.08;
export const LEVEL_COUNT = 10;

// stackH = plates in a normal column. Cover depth = stackH - 1 (3 or 4).
// Goals = stacks * stackH + traps = colors * 3.
const CURVE = [
  { colors:6,  stackH:4, stacks:3, traps:6,  buf:4, slack:4 },
  { colors:6,  stackH:4, stacks:3, traps:6,  buf:4, slack:3 },
  { colors:7,  stackH:4, stacks:4, traps:5,  buf:4, slack:3 },
  { colors:8,  stackH:4, stacks:4, traps:8,  buf:3, slack:2 },
  { colors:8,  stackH:4, stacks:5, traps:4,  buf:3, slack:2 },
  { colors:9,  stackH:5, stacks:4, traps:7,  buf:3, slack:2 },
  { colors:9,  stackH:5, stacks:4, traps:7,  buf:3, slack:1 },
  { colors:10, stackH:5, stacks:4, traps:10, buf:3, slack:1 },
  { colors:10, stackH:5, stacks:5, traps:5,  buf:3, slack:1 },
  { colors:10, stackH:5, stacks:5, traps:5,  buf:3, slack:1 },
];

export function levelParams(n, template = 1) {
  const c = CURVE[n - 1];
  if (!c) throw new Error('level ' + n);
  const t2 = template === 2;
  return {
    n, template, ...c,
    boxes: 2,
    hearts: 3,
    layers: c.stackH - 1,
    bombs: t2 ? Math.min(3, 1 + Math.floor((n - 1) / 3)) : 0,
    decoy: t2 ? 1 : 0,
    needMinus: t2 && n >= 4,
    badges: template === 3,
  };
}

export function rng(seed) {
  seed = (seed % 2147483646) + 1;
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

function palette(n, k) {
  const base = COLOR_NAMES.slice(0, k);
  const rot = (n * 3) % k;
  return base.slice(rot).concat(base.slice(0, rot));
}

function collectSlots(model, need) {
  const anchors = (model.anchors || []).filter(a => a.w >= 0.3 && a.h >= 0.3);
  anchors.sort((a, b) => (a.back ? 1 : 0) - (b.back ? 1 : 0) || (b.w * b.h - a.w * a.h));
  let best = [];
  for (const pitch of [0.82, 0.7, 0.58, 0.48, 0.4, 0.34]) {
    const slots = [];
    for (const a of anchors) {
      const cols = Math.max(1, Math.floor((a.w + 1e-6) / pitch));
      const rows = Math.max(1, Math.floor((a.h + 1e-6) / pitch));
      const cw = a.w / cols, rh = a.h / rows;
      const multi = cols * rows > 1;
      const plate = multi
        ? Math.min(0.5, cw - (MARGIN * 2 + 0.04), rh - (MARGIN * 2 + 0.04))
        : Math.min(0.52, a.w * 0.82, a.h * 0.82);
      if (!(plate >= 0.16)) continue;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        slots.push({
          side: a.id, back: !!a.back,
          x: -a.w / 2 + cw * (c + 0.5),
          y: -a.h / 2 + rh * (r + 0.5),
          w: plate, h: plate,
        });
      }
    }
    if (slots.length > best.length) best = slots;
    if (slots.length >= need) return slots;
  }
  const err = new Error('need ' + need + ' slots, have ' + best.length);
  err.slots = best.length;
  throw err;
}

function covers(p, s) {
  if (p.side !== s.side || p.layer <= s.layer) return false;
  return Math.abs(s.lx - p.x) < p.w / 2 + MARGIN && Math.abs(s.ly - p.y) < p.h / 2 + MARGIN;
}

const cache = new Map();

export function makeLevel(n, modelKey, model, template = 1) {
  const key = template + '|' + n + '|' + modelKey;
  if (cache.has(key)) return cache.get(key);
  const p = levelParams(n, template);
  const colors = palette(n, p.colors);
  const loose = p.needMinus ? 1 : 0;
  const needSlots = p.stacks + p.traps + loose + p.bombs + p.decoy;
  let slots;
  try { slots = collectSlots(model, needSlots); }
  catch (e) { throw new Error('level ' + n + ' ' + modelKey + ' t' + template + ': ' + e.message); }

  const plates = [];
  const screws = [];
  const front = slots.filter(s => !s.back).sort((a, b) => b.w * b.h - a.w * a.h);
  const back = slots.filter(s => s.back);
  const specials = [];
  const specialNeed = p.bombs + p.decoy;
  while (specials.length < specialNeed && front.length) specials.push(front.pop());
  const boom = () => { throw new Error('slots exhausted ' + modelKey); };
  const takeStack = () => front.shift() || back.shift() || boom();
  const takeAny = () => front.shift() || back.shift() || boom();
  const takeSpecial = () => specials.shift() || front.shift() || back.shift() || boom();
  const add = (slot, layer, kind, required) => {
    const screwI = screws.length;
    const pi = plates.length;
    plates.push({
      side: slot.side, layer, x: slot.x, y: slot.y, w: slot.w, h: slot.h,
      shape: 'rect', screws: [screwI],
    });
    screws.push({
      plate: pi, side: slot.side, layer, lx: slot.x, ly: slot.y,
      kind, required: !!required, color: null, badge: false, back: !!slot.back,
    });
    return screwI;
  };

  const moves = [];
  for (let s = 0; s < p.stacks; s++) {
    const minusHere = p.needMinus && s === 0;
    const goalCount = minusHere ? p.stackH - 1 : p.stackH;
    const items = Array.from({ length: goalCount }, () => ({ kind: 'goal' }));
    if (minusHere) items.splice(Math.min(2, items.length), 0, { kind: 'minus', required: true });
    const slot = takeStack();
    items.forEach((it, idx) => { it.layer = items.length - 1 - idx; });
    for (const it of items) {
      const id = add(slot, it.layer, it.kind, it.required);
      moves.push(id);
    }
    if (minusHere) moves.push(add(takeAny(), 0, 'goal', false));
  }
  const trapIds = [];
  for (let t = 0; t < p.traps; t++) trapIds.push(add(takeAny(), 0, 'goal', false));
  for (const id of trapIds) moves.push(id);
  for (let b = 0; b < p.bombs; b++) add(takeSpecial(), 0, 'bomb', false);
  for (let d = 0; d < p.decoy; d++) add(takeSpecial(), 0, 'minus', false);

  const goalN = screws.filter(s => s.kind === 'goal').length;
  if (goalN !== p.colors * 3) throw new Error('goal count ' + goalN + ' != ' + (p.colors * 3));
  if (goalN % 3) throw new Error('goals not divisible by 3');

  const L = {
    ...p,
    model: modelKey,
    colorsList: colors,
    plates,
    screws,
    queue: colors.slice(),
    solution: moves,
    stepLimit: moves.length + p.slack,
  };
  assignColors(L, moves);
  if (p.badges) {
    let g = 0;
    for (const s of screws) if (s.kind === 'goal') { if (g % 4 === 0) s.badge = true; g++; }
  }
  assertSurfaceFree(L);
  const end = replay(L, moves);
  if (end.buffer.length) throw new Error('solution left buffer ' + modelKey + ' L' + n);
  L.cover = coverDepth(L);
  cache.set(key, L);
  return L;
}

function soloSurface(L, s) {
  return !L.screws.some(o => o !== s && o.side === s.side && o.layer > s.layer &&
    Math.abs(o.lx - s.lx) < 0.02 && Math.abs(o.ly - s.ly) < 0.02);
}

function assertSurfaceFree(L) {
  for (const s of L.screws) {
    const buried = L.plates.some(p => covers(p, s));
    if (s.kind === 'bomb' && buried) throw new Error('bomb covered');
    if (s.kind === 'minus' && !s.required && buried) throw new Error('decoy minus covered');
    if (s.kind === 'goal' && soloSurface(L, s) && buried) throw new Error('trap covered');
  }
  for (const s of L.screws) {
    if (s.kind !== 'bomb' && !(s.kind === 'minus' && !s.required)) continue;
    const plate = L.plates[s.plate];
    for (const o of L.screws) {
      if (o === s || o.kind === 'bomb') continue;
      if (plate.side === o.side && plate.layer > o.layer &&
        Math.abs(o.lx - plate.x) < plate.w / 2 + MARGIN && Math.abs(o.ly - plate.y) < plate.h / 2 + MARGIN) {
        throw new Error(s.kind + ' covers a needed screw');
      }
    }
  }
}

export function coverDepth(L) {
  let m = 0;
  L.screws.forEach(s => {
    if (s.kind !== 'goal') return;
    let c = 0;
    L.plates.forEach(p => { if (covers(p, s)) c++; });
    if (c > m) m = c;
  });
  return m;
}

function assignColors(L, moves) {
  const st = initState(L);
  for (const i of moves) {
    const s = L.screws[i];
    beginTurn(st);
    if (s.kind === 'minus') {
      const r = applyMinus(st);
      if (!r.ok) throw new Error('minus unsound during coloring');
      st.removed[i] = true;
    } else {
      const b = pickBox(st);
      if (!b) throw new Error('no open box while coloring');
      s.color = b.color;
      b.n++;
      st.removed[i] = true;
      settle(st);
    }
  }
  const cnt = {};
  for (const s of L.screws) if (s.kind === 'goal') cnt[s.color] = (cnt[s.color] || 0) + 1;
  for (const c of L.colorsList) if (cnt[c] !== 3) throw new Error('color ' + c + ' has ' + cnt[c]);
}

function replay(L, moves) {
  const st = initState(L);
  const hearts = st.hearts;
  for (let m = 0; m < moves.length; m++) {
    const r = tap(L, st, moves[m]);
    if (!r.ok || r.lose || r.bad || r.heart || r.reason) {
      const s = L.screws[moves[m]];
      throw new Error('replay L' + L.n + ' t' + L.template + ' @' + m + ' ' + (r.reason || r.dest) + ' kind=' + s.kind + ' blocked=' + isBlocked(L, st, moves[m]));
    }
  }
  if (!isWin(L, st)) throw new Error('solution is not a win');
  if (st.hearts !== hearts) throw new Error('solution lost a heart');
  return st;
}

export function initState(L) {
  const st = {
    removed: L.screws.map(() => false),
    boxes: [],
    queue: L.queue.slice(),
    buffer: [],
    bufCap: L.buf,
    cleared: 0,
    hearts: L.hearts,
    steps: 0,
    stepLimit: L.stepLimit,
    dead: false,
    deadReason: '',
  };
  for (let k = 0; k < L.boxes; k++) st.boxes.push(st.queue.length ? { color: st.queue.shift(), n: 0 } : null);
  return st;
}

export const clone = st => JSON.parse(JSON.stringify(st));
const plateAttached = (L, st, pi) => L.plates[pi].screws.some(i => !st.removed[i]);

export function isBlocked(L, st, i) {
  const s = L.screws[i];
  return L.plates.some((p, pi) => plateAttached(L, st, pi) && covers(p, s));
}

export function coveringPlates(L, st, i) {
  const s = L.screws[i];
  const out = [];
  L.plates.forEach((p, pi) => { if (plateAttached(L, st, pi) && covers(p, s)) out.push(pi); });
  return out;
}

function bcol(x) { return typeof x === 'string' ? x : x.color; }
function bhold(x) { return typeof x === 'object' && !!x.hold; }

function releaseHolds(st) {
  st.buffer = st.buffer.map(bcol);
}

export function settle(st) {
  let ch = true;
  while (ch) {
    ch = false;
    st.boxes.forEach((b, k) => {
      if (b && b.n >= BOX_SLOTS) {
        st.boxes[k] = st.queue.length ? { color: st.queue.shift(), n: 0 } : null;
        st.cleared = (st.cleared || 0) + 1;
        ch = true;
      }
    });
    for (let j = 0; j < st.buffer.length; j++) {
      if (bhold(st.buffer[j])) continue;
      const color = bcol(st.buffer[j]);
      const b = st.boxes.find(bx => bx && bx.color === color && bx.n < BOX_SLOTS);
      if (b) { b.n++; st.buffer.splice(j, 1); j--; ch = true; }
    }
  }
}

function beginTurn(st) { releaseHolds(st); settle(st); }

function pickBox(st) {
  let best = null;
  for (const b of st.boxes) {
    if (!b || b.n >= BOX_SLOTS) continue;
    if (!best || b.n > best.n) best = b;
  }
  return best;
}

function applyMinus(st) {
  let best = null;
  for (const b of st.boxes) if (b && b.n > 0 && (!best || b.n > best.n)) best = b;
  if (!best) return { ok: true, pushed: false };
  if (st.buffer.length >= st.bufCap) return { ok: false };
  const color = best.color;
  best.n -= 1;
  st.buffer.push({ color, hold: true });
  return { ok: true, pushed: true, color };
}

function lostNow(L, st) {
  if (st.dead) return true;
  if (isWin(L, st)) return false;
  if (st.hearts <= 0) return true;
  if (st.steps >= st.stepLimit) return true;
  return false;
}

/** A buffer drop is a mistake when a matching screw is sitting free, or this color will never have a box. Parking the very next box color is allowed. */
export function isBadBuffer(L, st, color, self) {
  const open = st.boxes.filter(Boolean).map(b => b.color);
  if (open.includes(color)) return false;
  if (st.queue[0] === color) return false;
  const better = freeScrews(L, st).some(i => {
    if (i === self) return false;
    const s = L.screws[i];
    return s.kind === 'goal' && open.includes(s.color);
  });
  if (better) return true;
  if (!st.queue.includes(color)) return true;
  return false;
}

export function tap(L, st, i) {
  if (i == null || st.removed[i] || st.dead) return { ok: false, reason: 'gone' };
  if (isBlocked(L, st, i)) {
    st.steps++;
    st.hearts = Math.max(0, st.hearts - 1);
    return { ok: false, reason: 'blocked', heart: true, lose: lostNow(L, st) };
  }
  st.steps++;
  beginTurn(st);
  const s = L.screws[i];
  if (s.kind === 'bomb') {
    st.removed[i] = true;
    st.dead = true;
    st.deadReason = 'bomb';
    return { ok: false, reason: 'bomb', lose: true };
  }
  if (s.kind === 'minus') {
    const pen = applyMinus(st);
    if (!pen.ok) {
      st.removed[i] = true;
      st.dead = true;
      st.deadReason = 'minus';
      return { ok: false, reason: 'minus-full', lose: true };
    }
    st.removed[i] = true;
    const lose = lostNow(L, st);
    return { ok: !lose, dest: 'minus', pushed: pen.pushed, color: pen.color || null, heart: false, bad: false, lose };
  }
  const c = s.color;
  const k = st.boxes.findIndex(b => b && b.color === c && b.n < BOX_SLOTS);
  if (k >= 0) {
    st.boxes[k].n++;
    st.removed[i] = true;
    settle(st);
    const lose = lostNow(L, st);
    return { ok: !lose, dest: 'box', k, bad: false, heart: false, lose, badge: !!s.badge };
  }
  if (st.buffer.length >= st.bufCap) {
    st.dead = true;
    st.deadReason = 'buffer';
    return { ok: false, reason: 'buffer', lose: true };
  }
  const bad = isBadBuffer(L, st, c, i);
  st.buffer.push(c);
  st.removed[i] = true;
  if (bad) st.hearts = Math.max(0, st.hearts - 1);
  settle(st);
  const lose = lostNow(L, st);
  return { ok: !lose, dest: 'buf', k: st.buffer.length - 1, bad, heart: bad, lose, badge: !!s.badge };
}

export function isWin(L, st) {
  return L.screws.every((s, i) => st.removed[i] || s.kind === 'bomb' || (s.kind === 'minus' && !s.required));
}

export function isLose(L, st) { return lostNow(L, st); }

export function freeScrews(L, st) {
  const out = [];
  for (let i = 0; i < L.screws.length; i++) if (!st.removed[i] && !isBlocked(L, st, i)) out.push(i);
  return out;
}

export function bufferColors(st) { return st.buffer.map(bcol); }

function minusSafe(st) {
  const c = clone(st);
  beginTurn(c);
  return applyMinus(c).ok;
}

/** Search solver. Never taps a bomb. Taps a minus only when it is required and the buffer can take the penalty. */
export function solve(L, r, tries = 30) {
  for (let t = 0; t < tries; t++) {
    const st = initState(L);
    const moves = [];
    let guard = 0;
    while (guard++ < 500) {
      if (isWin(L, st)) return moves;
      if (st.dead || st.hearts <= 0 || st.steps >= st.stepLimit) break;
      const free = freeScrews(L, st);
      if (!free.length) break;
      const open = st.boxes.filter(Boolean).map(b => b.color);
      let pool = free.filter(i => L.screws[i].kind === 'goal' && open.includes(L.screws[i].color));
      if (!pool.length) {
        pool = free.filter(i => L.screws[i].kind === 'minus' && L.screws[i].required && minusSafe(st));
      }
      if (!pool.length) {
        pool = free.filter(i => L.screws[i].kind === 'goal' && st.queue[0] === L.screws[i].color && st.buffer.length < st.bufCap);
      }
      if (!pool.length) break;
      const pick = pool[Math.floor(r() * pool.length)];
      const res = tap(L, st, pick);
      moves.push(pick);
      if (!res.ok || res.lose) break;
    }
  }
  return null;
}

export function playSolution(L) {
  const st = initState(L);
  for (const i of L.solution) {
    const r = tap(L, st, i);
    if (!r.ok || r.lose) return { ok: false, reason: r.reason || 'lose', st };
  }
  return { ok: isWin(L, st), st };
}

export function randomWinRate(L, trials, seed) {
  const r = rng(seed);
  let wins = 0;
  for (let t = 0; t < trials; t++) if (playRandom(L, r)) wins++;
  return wins / trials;
}

function playRandom(L, r) {
  const st = initState(L);
  let guard = 0;
  while (guard++ < 500) {
    if (isWin(L, st)) return true;
    if (st.dead || st.hearts <= 0 || st.steps >= st.stepLimit) return false;
    const free = freeScrews(L, st);
    if (!free.length) return false;
    const res = tap(L, st, free[Math.floor(r() * free.length)]);
    if (res.lose || st.dead) return false;
    if (isWin(L, st)) return true;
  }
  return false;
}

export function levelSummary(L, rate) {
  const kinds = { goal: 0, bomb: 0, minus: 0, minusReq: 0, badge: 0 };
  for (const s of L.screws) {
    kinds[s.kind] = (kinds[s.kind] || 0) + 1;
    if (s.kind === 'minus' && s.required) kinds.minusReq++;
    if (s.badge) kinds.badge++;
  }
  return {
    template: L.template, n: L.n, model: L.model,
    colors: L.colors, layers: L.cover, buf: L.buf, boxes: L.boxes,
    hearts: L.hearts, stepLimit: L.stepLimit, screws: L.screws.length,
    goals: kinds.goal, bombs: kinds.bomb || 0, minuses: kinds.minus || 0,
    minusRequired: kinds.minusReq, badges: kinds.badge,
    solution: L.solution.length, random: rate,
  };
}
