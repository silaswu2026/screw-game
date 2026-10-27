import { spawn } from 'child_process';
import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let WebSocket;
try { WebSocket = require('/tmp/wspkg/node_modules/ws'); }
catch { WebSocket = (await import('ws')).default; }

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const OUT = '/opt/cursor/artifacts';
const PORT = 8773;

const server = createServer((req, res) => {
  let u = decodeURIComponent((req.url || '/').split('?')[0]);
  if (u.endsWith('/')) u += 'index.html';
  const fp = join(ROOT, u);
  if (!fp.startsWith(ROOT) || !existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end('no ' + u); return; }
  const type = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  }[extname(fp)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(readFileSync(fp));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--user-data-dir=/tmp/chrome-ninja-run',
  '--window-size=390,844', '--remote-debugging-port=9343',
  `http://127.0.0.1:${PORT}/ninja-run/`,
], { stdio: ['ignore', 'pipe', 'pipe'] });
let errBuf = '';
chrome.stderr.on('data', (d) => { errBuf += d.toString(); });

async function waitCDP(ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const tabs = await fetch('http://127.0.0.1:9343/json').then((r) => r.json());
      const page = tabs.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('CDP not ready ' + errBuf.slice(-500));
}
const page = await waitCDP();
const ws = new WebSocket(page.webSocketDebuggerUrl, { origin: '' });
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
let nid = 0;
const pending = new Map();
const logs = [];
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.method === 'Runtime.consoleAPICalled') {
    const t = msg.params.args.map((a) => a.value || a.description || '').join(' ');
    if (msg.params.type === 'error' || msg.params.type === 'warning') logs.push(msg.params.type + ': ' + t);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    logs.push('EXC ' + (msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text));
  }
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
    if (msg.error) rej(new Error(JSON.stringify(msg.error))); else res(msg.result);
  }
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++nid; pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});
await send('Page.enable');
await send('Runtime.enable');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, name), Buffer.from(r.data, 'base64'));
  console.log('shot', name);
}
async function size(w, h) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  await ev('window.dispatchEvent(new Event("resize"))');
  await sleep(80);
}

await size(390, 844);
const t0 = Date.now();
while (Date.now() - t0 < 15000) {
  if (await ev('!!(window.__ninja && window.__ninja.ready)')) break;
  await sleep(100);
}
const boot = await ev(`({ title: document.title, h1: document.querySelector('h1').innerText, ready: __ninja.ready, err: __ninja.state.errors })`);
console.log('BOOT', JSON.stringify(boot));
await shot('ninja_title_portrait.png');

const play = await ev(`(() => {
  __ninja.start(0);
  __ninja.press('right', true);
  __ninja.step(12);
  const wind = __ninja.state.whooshLevel;
  __ninja.press('jump', true);
  __ninja.step(2);
  const burst = __ninja.state.whooshBurst;
  const g = __ninja.markers.gaps[0];
  __ninja.place(g.x0 - 18, g.y);
  __ninja.press('jump', false);
  __ninja.press('jump', true);
  __ninja.step(70);
  const after = __ninja.state;
  __ninja.press('right', false);
  __ninja.press('jump', false);
  const slime = __ninja.markers.slimes[0];
  __ninja.place(slime.x - 52, slime.y);
  __ninja.press('right', true);
  __ninja.step(1);
  __ninja.press('right', false);
  __ninja.press('throw', true);
  __ninja.step(1);
  const throwAnim = __ninja.state.anim;
  __ninja.press('throw', false);
  __ninja.step(24);
  const thrown = __ninja.state;
  const coin = __ninja.markers.coins[__ninja.markers.coins.length - 1];
  const beforeCoins = thrown.coins;
  __ninja.place(coin.x, coin.y + 24);
  __ninja.step(4);
  const coined = __ninja.state;
  __ninja.press('right', true);
  __ninja.step(18);
  __ninja.pause(true);
  return {
    gap: g,
    x: after.x, y: after.y,
    whoosh: burst, level: wind,
    throwAnim, slimes: thrown.slimes,
    coins: coined.coins, beforeCoins,
    err: coined.errors,
  };
})()`);
console.log('PLAY', JSON.stringify(play));
await ev('__ninja.pause(true)');
await shot('ninja_play_portrait.png');

await size(844, 390);
const wall = await ev(`(() => {
  __ninja.pause(false);
  __ninja.start(1);
  const w = __ninja.markers.walls[0];
  __ninja.place(w.x0 + 18, (w.top + w.bottom) / 2);
  __ninja.press('left', true);
  __ninja.step(18);
  const slide = { anim: __ninja.state.anim, onWall: __ninja.state.onWall, y: __ninja.state.y };
  __ninja.press('jump', true);
  __ninja.step(3);
  const hop = { vx: __ninja.state.vx, vy: __ninja.state.vy, anim: __ninja.state.anim, whoosh: __ninja.state.whooshBurst };
  __ninja.press('left', false);
  __ninja.press('jump', false);
  __ninja.step(8);
  __ninja.pause(true);
  const pit = __ninja.markers.gaps[0];
  return { w, slide, hop, err: __ninja.state.errors, pit };
})()`);
console.log('WALL', JSON.stringify(wall));
await shot('ninja_wall_landscape.png');

const fall = await ev(`(() => {
  __ninja.pause(false);
  const spawn = __ninja.markers.spawn.x;
  const pit = __ninja.markers.gaps[0];
  __ninja.place((pit.x0 + pit.x1) / 2, pit.y + 200);
  __ninja.step(8);
  const s = __ninja.state;
  __ninja.pause(true);
  return { spawn, x: s.x, y: s.y, mode: s.mode, err: s.errors };
})()`);
console.log('FALL', JSON.stringify(fall));
await shot('ninja_play_landscape.png');

const buttons = await ev(`({
  n: document.querySelectorAll('#touch button').length,
  jump: document.getElementById('btnJ').getBoundingClientRect().width,
  title: document.title,
})`);
console.log('UI', JSON.stringify(buttons));
console.log('LOGS', logs.slice(0, 20));

const gapOk = play.x > play.gap.x1 - 4 && play.y <= play.gap.y + 8;
const ok = boot.title === '忍者水管工 Ninja Plumber'
  && boot.h1.includes('忍者水管工') && boot.h1.includes('Ninja Plumber')
  && gapOk
  && play.slimes === 0
  && play.throwAnim === 'throw'
  && play.coins > play.beforeCoins
  && (play.whoosh > 0.4 || play.level > 0.4)
  && wall.slide.anim === 'slide' && wall.slide.onWall === -1
  && wall.hop.vy < 0 && wall.hop.vx > 0 && wall.hop.whoosh > 0.4
  && Math.abs(fall.x - fall.spawn) < 40
  && buttons.n === 4 && buttons.jump >= 70
  && !(boot.err || []).length && !(play.err || []).length && !(wall.err || []).length && !(fall.err || []).length
  && !logs.some((l) => l.startsWith('error') || l.startsWith('EXC'));
ws.close();
chrome.kill();
server.close();
process.exit(ok ? 0 : 2);
