import { spawn } from 'child_process';
import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let WebSocket;
try { WebSocket = require('/tmp/wspkg/node_modules/ws'); }
catch { WebSocket = (await import('ws')).default; }

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const OUT = '/workspace';
const PORT = 8766;
const MIME = {
  '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.glb':'model/gltf-binary', '.json':'application/json', '.md':'text/plain', '.map':'application/json'
};

const server = createServer((req, res) => {
  let u = decodeURIComponent((req.url || '/').split('?')[0]);
  if (u === '/') u = '/index.html';
  const fp = join(ROOT, u);
  if (!fp.startsWith(ROOT) || !existsSync(fp)) { res.writeHead(404); res.end('no '+u); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream', 'Cache-Control':'no-store' });
  res.end(readFileSync(fp));
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));
console.log('serve', ROOT, PORT);

const chrome = spawn('google-chrome', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--window-size=390,844', '--remote-debugging-port=9230',
  `http://127.0.0.1:${PORT}/`
], { stdio: ['ignore', 'pipe', 'pipe'] });
let errBuf = '';
chrome.stderr.on('data', d => { errBuf += d.toString(); });

async function waitCDP(ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const tabs = await fetch('http://127.0.0.1:9230/json').then(r => r.json());
      const page = tabs.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('CDP not ready: ' + errBuf.slice(-800));
}

const page = await waitCDP();
const ws = new WebSocket(page.webSocketDebuggerUrl, { origin: '' });
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });

let nid = 0;
const pending = new Map();
ws.on('message', raw => {
  const msg = JSON.parse(raw.toString());
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
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitGame(timeout = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await send('Runtime.evaluate', { expression: '!!(window.__game && window.__game.G)', returnByValue: true });
    if (r.result?.value) return;
    await sleep(200);
  }
  const dump = await send('Runtime.evaluate', { expression: 'document.body && document.body.innerText.slice(0,500)', returnByValue: true }).catch(()=>({}));
  throw new Error('game not ready; body=' + (dump.result?.value || '') + ' stderr=' + errBuf.slice(-400));
}

async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text || JSON.stringify(d));
  }
  return r.result?.value;
}

async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const buf = Buffer.from(r.data, 'base64');
  writeFileSync(join(OUT, name), buf);
  console.log('shot', name, buf.length);
}

await waitGame();

// Seed save + reload
await ev(`localStorage.setItem('lscc3d', JSON.stringify({
  coins:99, unlocked:15, stars:{}, items:{hammer:2,slot:2,magnet:1,undo:2,revive:1},
  lastDaily:'2099-01-01', collection:{}, theme:'pets', sound:false, vibe:false
})); location.reload(); true`);
await sleep(2000);
await waitGame();

await ev(`window.__errs=[]; addEventListener('error',e=>__errs.push(String(e.message||e))); addEventListener('unhandledrejection',e=>__errs.push(String(e.reason))); true`);

const results = { wins: {}, hold: null, errors: [], pageErrors: [] };

for (const lv of [1, 5, 10]) {
  try {
    const ok = await ev(`window.__game.autoWin(${lv})`);
    results.wins[lv] = !!ok;
    console.log('WIN', lv, ok);
  } catch (e) {
    results.wins[lv] = false;
    results.errors.push('L' + lv + ': ' + e.message);
    console.error('FAIL', lv, e.message);
  }
}

// Hold preview
await ev(`window.__game.startLevel(4)`);
await sleep(500);
const hold = await ev(`(() => {
  const g = window.__game, L = g.L, st = g.st;
  let idx = 0;
  for (let i = 0; i < L.screws.length; i++) {
    if (!st.removed[i] && g.G.isBlocked(L, st, i)) { idx = i; break; }
  }
  g.startHoldPreview(idx);
  const hp = g.holdPreview;
  let translucent = false;
  if (hp && hp.plates) {
    for (const pi of hp.plates) {
      const pv = g.plateVis[pi];
      if (pv && pv.mat && pv.mat.transparent && pv.mat.opacity < 0.4) translucent = true;
    }
  }
  return { idx, plateCount: hp ? hp.plates.length : 0, translucent, hasPreview: !!hp };
})()`);
results.hold = hold;
console.log('HOLD', hold);

// Play screenshot
await ev(`window.__game.setTheme('pets'); window.__game.startLevel(1); true`);
await sleep(700);
await shot('s3_play.png');

// Screw close-up
await ev(`(() => {
  const g = window.__game;
  const v = g.screwVis.find(s => s && s.onObj);
  if (!v) return false;
  const wp = new (Object.getPrototypeOf(g.camera).constructor === g.camera.constructor ? g.camera.constructor : null);
  // Use THREE via screw group
  const pos = v.group.getWorldPosition(new g.camera.position.constructor());
  // Actually Vector3 is on position
  const THREE_Vector3 = g.camera.position.clone().constructor;
  const p = v.group.getWorldPosition(new THREE_Vector3());
  g.controls.target.copy(p);
  g.camera.position.set(p.x + 0.35, p.y + 0.25, p.z + 0.85);
  g.controls.update();
  return [p.x, p.y, p.z];
})()`);
await sleep(300);
await shot('s3_screw_close.png');

// Models gallery-ish
await ev(`window.__game.setTheme('sweets'); window.__game.startLevel(2); true`);
await sleep(700);
await ev(`(() => {
  const g = window.__game;
  g.camera.position.set(2.2, 1.8, 5.5);
  g.controls.target.set(0, 0.2, 0);
  g.controls.update();
  return true;
})()`);
await sleep(200);
await shot('s3_models.png');

results.pageErrors = await ev(`window.__errs || []`);
writeFileSync(join(OUT, 's3_test_results.json'), JSON.stringify(results, null, 2));
console.log('RESULTS', JSON.stringify(results, null, 2));

const ok = results.wins[1] && results.wins[5] && results.wins[10] && results.hold && results.hold.hasPreview && !(results.pageErrors||[]).length;
ws.close(); chrome.kill(); server.close();
process.exit(ok ? 0 : 2);
