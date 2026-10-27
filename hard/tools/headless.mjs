// Phone-sized headless pass for /hard/. No console errors, three templates boot.
import { spawn } from 'child_process';
import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let WebSocket;
try { WebSocket = require('/tmp/wspkg/node_modules/ws'); }
catch { WebSocket = (await import('ws')).default; }

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..');
const OUT = '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });
const PORT = 8771;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mjs': 'text/javascript',
  '.glb': 'model/gltf-binary', '.json': 'application/json', '.map': 'application/json',
};

const server = createServer((req, res) => {
  let u = decodeURIComponent((req.url || '/').split('?')[0]);
  if (u.endsWith('/')) u += 'index.html';
  const fp = join(ROOT, u);
  if (!fp.startsWith(ROOT) || !existsSync(fp)) { res.writeHead(404); res.end('no ' + u); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(readFileSync(fp));
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--user-data-dir=/tmp/chrome-hard-screw',
  '--window-size=390,844', '--remote-debugging-port=9241',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
let errBuf = '';
chrome.stderr.on('data', d => { errBuf += d.toString(); });

async function waitCDP(ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const tabs = await fetch('http://127.0.0.1:9241/json').then(r => r.json());
      const page = tabs.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('CDP not ready ' + errBuf.slice(-500));
}

const page = await waitCDP();
const ws = new WebSocket(page.webSocketDebuggerUrl, { origin: '' });
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
let nid = 0;
const pending = new Map();
const logs = [];
ws.on('message', raw => {
  const msg = JSON.parse(raw.toString());
  if (msg.method === 'Runtime.consoleAPICalled') {
    const type = msg.params.type;
    const text = (msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' ');
    if (type === 'error' || type === 'warning') logs.push(type + ': ' + text);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    logs.push('exception: ' + (msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || ''));
  }
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) rej(new Error(JSON.stringify(msg.error)));
    else res(msg.result);
  }
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++nid;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text || 'eval');
  }
  return r.result?.value;
}

async function go(path) {
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}${path}` });
  const t0 = Date.now();
  while (Date.now() - t0 < 25000) {
    const ok = await ev('!!(window.__game && window.__game.G)').catch(() => false);
    if (ok) return;
    await sleep(200);
  }
  const body = await ev('document.body ? document.body.innerText.slice(0,400) : ""').catch(() => '');
  throw new Error('game not ready ' + body);
}

async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name), Buffer.from(r.data, 'base64'));
  console.log('shot', name);
}

const save = {
  coins: 10, unlocked: { 1: 10, 2: 10, 3: 10 }, stars: {}, badges: 7, totalBadges: 7,
  skins: ['classic'], skin: 'classic', items: { undo: 1, slot: 1 },
  tut: { 1: 1, 2: 1, 3: 1 }, sound: false, vibe: false, theme: 'pets', chests: 0,
};

await go('/hard/?t=1');
await ev(`localStorage.setItem('screwHardV1', ${JSON.stringify(JSON.stringify(save))}); true`);
await go('/hard/?t=1');
await ev('window.__game.startLevel(1)');
await sleep(900);
const hud = await ev(`(() => {
  const t = document.getElementById('steps').textContent;
  const h = document.getElementById('hearts').textContent;
  const lvl = document.getElementById('lvl').textContent;
  const g = window.__game;
  return { t, h, lvl, screws: g.L.screws.length, colors: g.L.colors, layers: g.L.cover, hearts: g.st.hearts, steps: g.st.stepLimit, boxes: g.L.boxes, buf: g.L.buf, template: g.template, charErr: window.__charErr || '' };
})()`);
console.log('HUD1', JSON.stringify(hud));
await shot('hard_t1_level1.png');

const tap = await ev(`(() => {
  const g = window.__game, L = g.L, st = g.st;
  const open = st.boxes.filter(Boolean).map(b => b.color);
  const i = g.G.freeScrews(L, st).find(i => L.screws[i].kind === 'goal' && open.includes(L.screws[i].color));
  g.tap(i);
  return { i, steps: g.st.steps, removed: g.st.removed[i] };
})()`);
console.log('TAP', JSON.stringify(tap));
await sleep(700);

const win = await ev('window.__game.autoWin(5)');
console.log('WIN5', win);
await sleep(400);
await shot('hard_t1_level5.png');

await go('/hard/?t=2');
await ev('window.__game.startLevel(1)');
await sleep(700);
await shot('hard_t2_level1.png');
const t2front = await ev(`(() => {
  const L = window.__game.L;
  return L.screws.filter(s => s.kind !== 'goal').map(s => s.kind + (s.required ? '*' : '') + '@' + s.side + (s.back ? '/back' : ''));
})()`);
console.log('T2L1', JSON.stringify(t2front));
await ev('window.__game.startLevel(4)');
await sleep(800);
const t2 = await ev(`(() => {
  const g = window.__game, L = g.L;
  const bombs = L.screws.filter(s => s.kind === 'bomb').length;
  const minus = L.screws.filter(s => s.kind === 'minus').length;
  const req = L.screws.filter(s => s.kind === 'minus' && s.required).length;
  const bombInSol = L.solution.some(i => L.screws[i].kind === 'bomb');
  return { template: g.template, bombs, minus, req, bombInSol, lvl: document.getElementById('lvl').textContent, hearts: document.getElementById('hearts').textContent };
})()`);
console.log('T2', JSON.stringify(t2));
await shot('hard_t2_level4.png');

await go('/hard/?t=3');
await ev('window.__game.startLevel(1)');
await sleep(700);
const t3 = await ev(`(() => {
  const g = window.__game;
  const badges = g.L.screws.filter(s => s.badge).length;
  const pill = document.getElementById('badgePill');
  const shown = !pill.classList.contains('hidden');
  const count = document.getElementById('badgeCount').textContent;
  return { template: g.template, badges, shown, count, lvl: document.getElementById('lvl').textContent };
})()`);
console.log('T3', JSON.stringify(t3));
await shot('hard_t3_level1.png');

await ev('window.__game.save.badges = 9');
const badgeTap = await ev(`(() => {
  const g = window.__game;
  const free = g.G.freeScrews(g.L, g.st);
  const i = free.find(idx => g.L.screws[idx].badge);
  if (i == null) return { err: 'no-free-badge' };
  g.tap(i);
  return { i, kind: g.L.screws[i].color, count: document.getElementById('badgeCount').textContent };
})()`);
console.log('BADGE TAP', JSON.stringify(badgeTap));
await sleep(2200);
const chest = await ev(`document.getElementById('chest').className + '|' + document.getElementById('chestTitle').textContent`);
console.log('CHEST', chest);
await shot('hard_t3_badge.png');

await sleep(200);
const badLogs = logs.filter(l => !/WebGL|GPU|swiftshader|GL Driver|Automatic fallback|GroupMarker|deprecated/i.test(l));
console.log('LOGS', JSON.stringify(badLogs, null, 2));
const chestOpen = typeof chest === 'string' && chest.startsWith('modal') && !chest.includes('hidden');
const ok = hud && hud.template === 1 && hud.boxes === 2 && hud.hearts === 3 && tap.removed && win === true
  && t2.template === 2 && t2.bombs >= 1 && t2.req === 1 && t2.bombInSol === false
  && t3.template === 3 && t3.badges >= 4 && t3.shown && t3.count === '7'
  && chestOpen && !hud.charErr && badLogs.length === 0;
writeFileSync(join(OUT, 'hard_test.json'), JSON.stringify({ hud, tap, win, t2, t3, badLogs }, null, 2));
ws.close();
chrome.kill();
server.close();
process.exit(ok ? 0 : 2);
