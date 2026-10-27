// Prove every hard level and measure a random-tap bot.
// Usage: node hard/tools/simulate.mjs
import { readFileSync } from 'fs';
import { pathToFileURL } from 'url';
import { writeFileSync } from 'fs';

const root = new URL('../../', import.meta.url);
writeFileSync('/tmp/screw-hard-logic.mjs', readFileSync(new URL('./hard/js/logic.js', root)));
writeFileSync('/tmp/screw-models.mjs', readFileSync(new URL('./js/models.js', root)));
const G = await import(pathToFileURL('/tmp/screw-hard-logic.mjs').href + '?v=' + Date.now());
const { MODELS } = await import(pathToFileURL('/tmp/screw-models.mjs').href);

const THEMES = {
  pets: ['cat', 'bear'],
  mech: ['robot', 'car'],
  sweets: ['cake', 'popsicle'],
  space: ['rocket', 'ufo'],
};

function modelFor(theme, n) {
  const list = THEMES[theme];
  return list[(n - 1) % list.length];
}

const trials = Number(process.env.TRIALS || 200);
const rows = [];
let failed = 0;

function checkRules(L) {
  const sol = new Set(L.solution);
  for (let i = 0; i < L.screws.length; i++) {
    const s = L.screws[i];
    if (s.kind === 'bomb' && sol.has(i)) throw new Error('bomb in solution');
    if (s.kind === 'minus' && !s.required && sol.has(i)) throw new Error('decoy minus in solution');
    if (s.kind === 'minus' && s.required && !sol.has(i)) throw new Error('required minus missing');
  }
  if (L.template === 2 && L.n >= 4 && !L.screws.some(s => s.kind === 'minus' && s.required)) throw new Error('no required minus');
  if (L.template === 2 && L.n < 4 && L.screws.some(s => s.kind === 'minus' && s.required)) throw new Error('early minus was required');
  if (L.template !== 2 && L.screws.some(s => s.kind === 'bomb' || s.kind === 'minus')) throw new Error('specials leaked');
  if (L.template === 3) {
    const goals = L.screws.filter(s => s.kind === 'goal');
    const badges = goals.filter(s => s.badge).length;
    if (badges < Math.floor(goals.length / 4)) throw new Error('too few badges ' + badges);
  } else if (L.screws.some(s => s.badge)) throw new Error('badges leaked');
  if (L.boxes !== 2) throw new Error('boxes');
  if (L.hearts !== 3) throw new Error('hearts');
  if (L.buf < 3 || L.buf > 4) throw new Error('buf');
  if (L.cover < 3 || L.cover > 4) throw new Error('cover ' + L.cover);
  const played = G.playSolution(L);
  if (!played.ok) throw new Error('playSolution ' + played.reason);
  const found = G.solve(L, G.rng(1000 + L.n * 17 + L.template * 99), 8);
  if (!found) throw new Error('search solver failed');
  const st = G.initState(L);
  for (const i of found) {
    const r = G.tap(L, st, i);
    if (!r.ok || r.lose) throw new Error('solver replay');
  }
  if (!G.isWin(L, st)) throw new Error('solver not win');
}

for (const template of [1, 2, 3]) {
  for (let n = 1; n <= G.LEVEL_COUNT; n++) {
    const theme = 'pets';
    const mk = modelFor(theme, n);
    let L;
    try {
      L = G.makeLevel(n, mk, MODELS[mk], template);
      checkRules(L);
    } catch (e) {
      failed++;
      console.error('FAIL', 't' + template, 'L' + n, mk, e.message);
      continue;
    }
    const rate = G.randomWinRate(L, trials, 5000 + template * 1000 + n * 13);
    const row = G.levelSummary(L, rate);
    rows.push(row);
    const mid = n >= 4 && n <= 7;
    const flag = template === 1 && mid && rate >= 0.1 ? '  ** HIGH' : '';
    console.log(
      `t${template} L${String(n).padStart(2)} ${mk.padEnd(8)} colors=${row.colors} layers=${row.layers} buf=${row.buf} steps=${row.stepLimit} hearts=${row.hearts} bombs=${row.bombs} minus=${row.minuses}/${row.minusRequired} badges=${row.badges} random=${(rate * 100).toFixed(1)}%${flag}`
    );
    if (template === 1 && mid && rate >= 0.1) failed++;
  }
}

for (const template of [1, 2, 3]) {
  for (const theme of Object.keys(THEMES)) {
    for (let n = 1; n <= G.LEVEL_COUNT; n++) {
      const mk = modelFor(theme, n);
      try {
        const L = G.makeLevel(n, mk, MODELS[mk], template);
        checkRules(L);
      } catch (e) {
        failed++;
        console.error('MODEL FAIL', theme, mk, 't' + template, 'L' + n, e.message);
      }
    }
  }
}

// Spot-check penalties on template 1 level 5 and template 2 level 5.
{
  const L = G.makeLevel(5, 'cat', MODELS.cat, 1);
  const st = G.initState(L);
  const buried = L.screws.findIndex((s, i) => !st.removed[i] && G.isBlocked(L, st, i));
  const before = st.hearts;
  const r = G.tap(L, st, buried);
  if (!(r.reason === 'blocked' && st.hearts === before - 1 && !st.removed[buried])) {
    failed++;
    console.error('blocked tap did not cost a heart', r, st.hearts);
  } else console.log('penalty blocked-tap OK');

  const st2 = G.initState(L);
  const openSet = new Set(st2.boxes.filter(Boolean).map(b => b.color));
  const trap = G.freeScrews(L, st2).find(i => {
    const s = L.screws[i];
    return s.kind === 'goal' && !openSet.has(s.color) && G.isBadBuffer(L, st2, s.color, i);
  });
  const r2 = trap == null ? null : G.tap(L, st2, trap);
  if (!(r2 && r2.dest === 'buf' && r2.bad && st2.hearts === L.hearts - 1)) {
    failed++;
    console.error('bad buffer did not cost a heart', r2, 'hearts', st2.hearts);
  } else console.log('penalty bad-buffer OK');
}
{
  const L = G.makeLevel(5, 'cat', MODELS.cat, 2);
  const st = G.initState(L);
  const bomb = L.screws.findIndex(s => s.kind === 'bomb');
  const rb = G.tap(L, st, bomb);
  if (!(rb.reason === 'bomb' && rb.lose)) {
    failed++;
    console.error('bomb did not lose', rb);
  } else console.log('bomb lose OK');

  // Required minus, once uncovered with a full buffer, loses.
  const st3 = G.initState(L);
  for (const i of L.solution) {
    if (L.screws[i].kind === 'minus') break;
    G.tap(L, st3, i);
  }
  const minus = L.solution.find(i => L.screws[i].kind === 'minus');
  const openNow = new Set(st3.boxes.filter(Boolean).map(b => b.color));
  const filler = G.COLOR_NAMES.find(c => !openNow.has(c));
  st3.buffer = Array.from({ length: st3.bufCap }, () => filler);
  const rm = G.tap(L, st3, minus);
  if (!(rm.reason === 'minus-full' && rm.lose)) {
    failed++;
    console.error('full-buffer minus did not lose', rm, 'buf', st3.buffer.length, 'blocked', G.isBlocked(L, st3, minus));
  } else console.log('minus timing loss OK');
}

console.log('\nFAILED', failed);
if (failed) process.exit(1);
