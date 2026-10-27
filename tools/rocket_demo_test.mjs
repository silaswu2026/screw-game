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
const PORT = 8771;

const server = createServer((req, res) => {
  let u = decodeURIComponent((req.url || '/').split('?')[0]);
  if (u.endsWith('/')) u += 'index.html';
  const fp = join(ROOT, u);
  if (!fp.startsWith(ROOT) || !existsSync(fp) || statSync(fp).isDirectory()) { res.writeHead(404); res.end('no ' + u); return; }
  const type = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.glb': 'model/gltf-binary',
    '.png': 'image/png', '.webp': 'image/webp',
  }[extname(fp)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(readFileSync(fp));
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--user-data-dir=/tmp/chrome-rocket-demo-b',
  '--window-size=390,844', '--remote-debugging-port=9341',
  `http://127.0.0.1:${PORT}/rocket-demo/`,
], { stdio: ['ignore', 'pipe', 'pipe'] });
let errBuf = '';
chrome.stderr.on('data', d => { errBuf += d.toString(); });

async function waitCDP(ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const tabs = await fetch('http://127.0.0.1:9341/json').then(r => r.json());
      const page = tabs.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 250));
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
    const t = msg.params.args.map(a => a.value || a.description || '').join(' ');
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
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
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

const t0 = Date.now();
while (Date.now() - t0 < 30000) {
  if (await ev('!!(window.__demo && window.__demo.ready)')) break;
  await sleep(200);
}
await sleep(500);
const boot = await ev(`({ sol: (__demo.solution||[]).length, parts: __demo.parts, screws: __demo.screwCount, err: __demo.errors, left: __demo.left, socket: __demo.socketDelta, mid: __demo.midMove, reveal: __demo.revealMove })`);
console.log('BOOT', JSON.stringify(boot));
await shot('rocket_start.png');
const preview = await ev(`const ids = window.__demo.preview(__demo.previewScrew); window.__demo.clearPreview(); ids`);
console.log('PREVIEW', JSON.stringify(preview));

const mid = await ev(`const r = window.__demo.jumpTo(__demo.midMove); ({ ...r, up0: __demo.gone('up0') })`);
console.log('MID', JSON.stringify(mid));
const reveal = await ev(`({ move: __demo.revealMove, r: __demo.jumpTo(__demo.revealMove), nose: __demo.gone('nose'), band: __demo.gone('band') })`);
console.log('REVEAL', JSON.stringify(reveal));
await sleep(300);
await shot('rocket_mid.png');

const end = await ev(`window.__demo.jumpTo(__demo.screwCount); window.__demo.launch(); ({ won: __demo.won, left: __demo.left, err: __demo.errors })`);
console.log('END', JSON.stringify(end));
await sleep(1000);
await shot('rocket_win.png');
await sleep(1200);
const fps = await ev('__demo.fps');
console.log('FPS', fps);

await ev('location.reload()');
await sleep(700);
const t1 = Date.now();
while (Date.now() - t1 < 30000) {
  if (await ev('!!(window.__demo && window.__demo.ready)')) break;
  await sleep(200);
}
const played = await ev(`(async () => {
  const moves = __demo.solution;
  for (let i = 0; i < moves.length; i++) {
    const r = __demo.jumpTo(i + 1);
    if (r.left !== moves.length - i - 1) return { ok: false, i, r };
  }
  return { ok: true, won: __demo.won, left: __demo.left, err: __demo.errors };
})()`);
console.log('PLAY', JSON.stringify(played));
console.log('LOGS', logs.slice(0, 30));
const ok = boot.sol === boot.screws && boot.screws >= 50 && boot.parts >= 25
  && mid.left === boot.screws - boot.mid && mid.up0
  && reveal.move > 0 && reveal.r.left === boot.screws - reveal.move
  && end.won && played.ok
  && Array.isArray(preview) && preview.includes('band')
  && boot.socket < 0.05
  && !(boot.err || []).length && !(end.err || []).length && !(played.err || []).length;
ws.close(); chrome.kill(); server.close();
process.exit(ok ? 0 : 2);
