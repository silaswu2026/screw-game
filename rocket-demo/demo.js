// Rocket demo. Meshes, palette, and baked maps come from tools/blender/rocket.py.
// Screws are one template, placed from layout.json, drawn with InstancedMesh.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  PUZZLE, COLOR_HEX, LAYOUT, loadPuzzle, createState, doMove, isBlocked,
  coveringParts, isWin,
} from './level.js';

const view = document.getElementById('view');
const boxesEl = document.getElementById('boxes');
const slotsEl = document.getElementById('slots');
const tipEl = document.getElementById('tip');
const winEl = document.getElementById('win');
const errEl = document.getElementById('err');
const errors = [];
addEventListener('error', e => errors.push(String(e.message || e.error || e)));
addEventListener('unhandledrejection', e => errors.push(String(e.reason)));

window.__demo = { ready: false, errors, screwCount: 0, solution: [] };

const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.16;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.08, 80);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
pmrem.dispose();

scene.add(new THREE.HemisphereLight(0xfff3e4, 0xffd0e8, 0.38));
const key = new THREE.DirectionalLight(0xfff6e4, 2.7);
key.position.set(-3.4, 7.2, 4.4);
key.castShadow = true;
key.shadow.mapSize.set(512, 512);
key.shadow.camera.near = 0.4;
key.shadow.camera.far = 30;
key.shadow.camera.left = -6;
key.shadow.camera.right = 6;
key.shadow.camera.top = 6;
key.shadow.camera.bottom = -6;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.03;
scene.add(key);
const fill = new THREE.DirectionalLight(0xffe4f2, 0.28);
fill.position.set(4.4, 2.4, 3.2);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 0.9);
rim.position.set(0.2, 3.4, -5.4);
scene.add(rim);
const nozzleLight = new THREE.PointLight(0xffb02e, 0.85, 5.5, 2);
nozzleLight.position.set(0, 0.2, 0.15);
scene.add(nozzleLight);

const spin = new THREE.Group();
const bob = new THREE.Group();
spin.add(bob);
scene.add(spin);
const HOME_YAW = -0.18;

function contactTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 16, 128, 128, 122);
  grd.addColorStop(0, 'rgba(120, 70, 110, 0.28)');
  grd.addColorStop(0.55, 'rgba(160, 90, 120, 0.12)');
  grd.addColorStop(1, 'rgba(160, 90, 120, 0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function starTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.translate(32, 32);
  g.fillStyle = '#fff';
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? 7 : 28;
    const a = i / 8 * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const shadow = new THREE.Mesh(
  new THREE.PlaneGeometry(5.2, 5.2),
  new THREE.MeshBasicMaterial({ map: contactTex(), transparent: true, depthWrite: false })
);
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = -0.19;
bob.add(shadow);

// Cap diameter is 1. y = 0 is the underside of the cap, seated on the part.
// The threaded shank is negative so it embeds; only the low dome stays proud.
// The cross is 40% of the cap height and thick enough to read on a phone.
function screwTemplate() {
  const pts = [
    [0.16, -0.63], [0.16, -0.56], [0.36, -0.48], [0.16, -0.40],
    [0.16, -0.29], [0.36, -0.21], [0.16, -0.13], [0.16, -0.03],
    [0.44, 0.00], [0.50, 0.05], [0.50, 0.15], [0.38, 0.21],
    [0.16, 0.25], [0.00, 0.27],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.LatheGeometry(pts, 20);
  body.computeVertexNormals();
  const capH = 0.27;
  const slotD = capH * 0.40;
  const slotY = 0.29 - slotD * 0.5;
  const a = new THREE.BoxGeometry(0.72, slotD, 0.20);
  const b = new THREE.BoxGeometry(0.20, slotD, 0.72);
  a.translate(0, slotY, 0);
  b.translate(0, slotY, 0);
  return { body, slot: mergeGeometries([a, b]) };
}
const screwGeo = screwTemplate();
const screwMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  roughness: 0.24,
  metalness: 0,
  clearcoat: 0.72,
  clearcoatRoughness: 0.22,
  sheen: 0,
  envMapIntensity: 0.22,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});
const slotMat = new THREE.MeshStandardMaterial({
  color: 0x2a2230,
  roughness: 0.72,
  metalness: 0,
  polygonOffset: true,
  polygonOffsetFactor: -3,
  polygonOffsetUnits: -3,
});

function upgradeVinyl(src) {
  const m = new THREE.MeshPhysicalMaterial({
    map: src.map || null,
    normalMap: src.normalMap || null,
    aoMap: src.aoMap || null,
    color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
    roughness: 0.18,
    metalness: 0,
    clearcoat: 0.82,
    clearcoatRoughness: 0.16,
    sheen: 0,
    envMapIntensity: 0.28,
    aoMapIntensity: 0.42,
    normalScale: new THREE.Vector2(0.35, 0.35),
    side: src.side || THREE.FrontSide,
  });
  for (const tex of [m.map, m.normalMap, m.aoMap]) {
    if (!tex) continue;
    tex.needsUpdate = true;
  }
  if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
  if (m.normalMap) m.normalMap.colorSpace = THREE.NoColorSpace;
  if (m.aoMap) m.aoMap.colorSpace = THREE.NoColorSpace;
  return m;
}

const parts = {};
let core = null;
let state = null;
let solution = [];
const screwObjs = [];
let bodyMesh = null;
let slotMesh = null;
const partList = [];
const _dummy = new THREE.Object3D();
const up = new THREE.Vector3(0, 1, 0);
const screwState = [];

function writeInstance(mesh, i, pos, quat, scale) {
  _dummy.position.copy(pos);
  _dummy.quaternion.copy(quat);
  _dummy.scale.setScalar(scale);
  _dummy.updateMatrix();
  mesh.setMatrixAt(i, _dummy.matrix);
  mesh.instanceMatrix.needsUpdate = true;
}

function placeAllScrews() {
  screwState.forEach((s, i) => {
    const sc = s.hidden ? 0 : s.diameter;
    writeInstance(bodyMesh, i, s.pos, s.quat, sc);
    writeInstance(slotMesh, i, s.pos, s.quat, sc);
    if (bodyMesh.setColorAt) {
      bodyMesh.setColorAt(i, s.color);
      bodyMesh.instanceColor.needsUpdate = true;
    }
  });
}

function hideScrew(i) {
  screwState[i].hidden = true;
  writeInstance(bodyMesh, i, screwState[i].pos, screwState[i].quat, 0);
  writeInstance(slotMesh, i, screwState[i].pos, screwState[i].quat, 0);
}

let previewIds = [];
let returnAt = 0;
let won = false;
let launching = false;
let loadMs = 0;
let shake = 0;
const camBase = new THREE.Vector3();
let lookTarget = new THREE.Vector3(0, 1.35, 0);
let camDist = 7.2;
let fitSize = null;
let tipTimer = 0;
let frames = 0;
let fpsStamp = performance.now();
let fps = 0;

function showTip(text) {
  tipEl.textContent = text;
  tipEl.classList.add('show');
  tipTimer = performance.now() + 1400;
}
function setPartOpacity(id, o) {
  const p = parts[id];
  if (!p || p.gone) return;
  p.obj.traverse(m => {
    if (!m.material) return;
    const list = Array.isArray(m.material) ? m.material : [m.material];
    list.forEach(mat => {
      if (mat.userData.baseOpacity == null) mat.userData.baseOpacity = mat.opacity;
      mat.transparent = o < 0.98 || mat.userData.baseOpacity < 0.98;
      mat.opacity = mat.userData.baseOpacity * o;
      mat.depthWrite = o > 0.9 && mat.userData.baseOpacity > 0.9;
    });
  });
}
function endPreview() {
  previewIds.forEach(id => setPartOpacity(id, 1));
  previewIds = [];
}
function startPreview(index) {
  endPreview();
  previewIds = coveringParts(state, index);
  previewIds.forEach(id => setPartOpacity(id, 0.18));
  showTip('先拆掉挡住它的零件');
}

function renderHUD() {
  boxesEl.innerHTML = '';
  state.boxes.forEach(b => {
    const el = document.createElement('div');
    if (!b) { el.className = 'box empty'; boxesEl.append(el); return; }
    el.className = 'box ' + b.color;
    const tray = document.createElement('div');
    tray.className = 'tray';
    for (let i = 0; i < 3; i++) {
      const h = document.createElement('div');
      h.className = 'hole' + (i < b.n ? ' filled' : '');
      tray.append(h);
    }
    el.append(tray);
    boxesEl.append(el);
  });
  slotsEl.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const s = document.createElement('div');
    const c = state.buffer[i];
    s.className = 'slot' + (c ? ' filled ' + c : '');
    slotsEl.append(s);
  }
}
function burstAt(el) {
  const r = el.getBoundingClientRect();
  for (let i = 0; i < 6; i++) {
    const s = document.createElement('b');
    s.className = 'starburst';
    s.textContent = '✦';
    s.style.left = (r.left + r.width / 2) + 'px';
    s.style.top = (r.top + r.height / 2) + 'px';
    const a = i / 6 * Math.PI * 2;
    s.style.setProperty('--dx', Math.cos(a) * 26 + 'px');
    s.style.setProperty('--dy', Math.sin(a) * 26 + 'px');
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 560);
  }
}
function confetti() {
  const colors = ['#FF5CA8', '#FFC918', '#8FD21E', '#19C3D3', '#8E4CE6', '#F2403A', '#fff'];
  for (let i = 0; i < 46; i++) {
    const d = document.createElement('i');
    d.className = 'confetti';
    d.style.left = Math.random() * 100 + '%';
    d.style.background = colors[i % colors.length];
    d.style.animationDelay = Math.random() * 0.25 + 's';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 2100);
  }
}
const sfx = (() => {
  let ctx = null;
  let noise = null;
  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const n = ctx.sampleRate;
      noise = ctx.createBuffer(1, n, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur, type, gain, slide) {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(48, freq * slide), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function tick(dur, gain, hp) {
    const c = ac();
    if (!c || !noise) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noise;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t); src.stop(t + dur);
  }
  return {
    unlock() { ac(); },
    unscrew() { tick(0.035, 0.16, 1600); tone(920, 0.05, 'square', 0.035, 0.55); },
    land() { tone(540, 0.06, 'sine', 0.055, 0.7); tick(0.025, 0.07, 500); },
    drop() { tone(150, 0.11, 'sine', 0.07, 0.45); },
    clear() { tone(680, 0.07, 'triangle', 0.05, 1); setTimeout(() => tone(1020, 0.09, 'triangle', 0.045, 1), 60); },
    blocked() { tone(170, 0.07, 'square', 0.03, 0.6); },
    launch() { tone(420, 0.09, 'sawtooth', 0.028, 1.6); },
  };
})();
function vibrate(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* desktop */ }
}
const _ndc = new THREE.Vector3();
const _worldQ = new THREE.Quaternion();
let pressFeedbackMs = 0;
function uiTarget(el, out) {
  const cr = view.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const x = ((r.left + r.width / 2) - cr.left) / cr.width * 2 - 1;
  const y = -(((r.top + r.height / 2) - cr.top) / cr.height * 2 - 1);
  _ndc.set(x, y, 0.42).unproject(camera);
  _ndc.sub(camera.position);
  const len = Math.max(1e-6, _ndc.length());
  const dist = Math.min(6.2, len);
  _ndc.multiplyScalar(dist / len);
  return out.copy(camera.position).add(_ndc);
}
const flyers = [];
for (let i = 0; i < 6; i++) {
  const mesh = new THREE.Group();
  const head = new THREE.Mesh(screwGeo.body, screwMat.clone());
  const slot = new THREE.Mesh(screwGeo.slot, slotMat);
  mesh.add(head, slot);
  mesh.visible = false;
  scene.add(mesh);
  flyers.push({
    mesh, head, busy: false, phase: '', t0: 0, base: 0.1, el: null,
    start: new THREE.Vector3(), end: new THREE.Vector3(),
    mid: new THREE.Vector3(), normal: new THREE.Vector3(),
    baseQuat: new THREE.Quaternion(),
  });
}
function flyScrew(index, el) {
  const s = screwState[index];
  hideScrew(index);
  let f = flyers[0];
  for (let i = 0; i < flyers.length; i++) if (!flyers[i].busy) { f = flyers[i]; break; }
  f.busy = true;
  f.phase = 'out';
  f.t0 = performance.now();
  f.base = s.diameter;
  f.el = el;
  f.head.material.color.copy(s.color);
  bodyMesh.updateWorldMatrix(true, false);
  f.start.copy(s.pos);
  bodyMesh.localToWorld(f.start);
  bodyMesh.getWorldQuaternion(_worldQ);
  f.baseQuat.copy(_worldQ).multiply(s.quat);
  f.mesh.quaternion.copy(f.baseQuat);
  f.mesh.scale.setScalar(s.diameter);
  f.mesh.visible = true;
  f.mesh.position.copy(f.start);
  f.normal.set(0, 1, 0).applyQuaternion(f.baseQuat);
  uiTarget(el, f.end);
  f.mid.copy(f.start).lerp(f.end, 0.42);
  f.mid.y += 0.85;
  sfx.unscrew();
  vibrate(12);
}
function hidePart(id) {
  const p = parts[id];
  if (!p) return;
  p.gone = true;
  p.obj.visible = false;
}
function fallPart(id) {
  const p = parts[id];
  if (!p || p.gone) return;
  p.gone = true;
  p.falling = 0;
  p.ox = 0;
  p.oy = 0;
  p.oz = 0;
  p.vy = 0.6;
  p.spinX = ((id.charCodeAt(0) % 7) - 3) * 1.1;
  p.spinY = ((id.charCodeAt(id.length - 1) % 5) - 2) * 0.9;
  p.spinZ = ((id.length % 5) - 2) * 1.6;
  shake = Math.max(shake, 0.16);
  sfx.drop();
  vibrate(16);
}
function applyResult(index, res, animate) {
  if (!animate) {
    hideScrew(index);
    res.fell.forEach(hidePart);
  } else {
    const el = res.dest === 'box'
      ? boxesEl.children[res.k]?.querySelectorAll('.hole')[res.slot]
      : slotsEl.children[res.k];
    if (el) flyScrew(index, el);
    else hideScrew(index);
    res.fell.forEach(fallPart);
    if (!el) { sfx.unscrew(); vibrate(12); }
  }
  if (res.cleared.length) {
    const box = boxesEl.querySelector('.box.' + res.cleared[0]);
    if (box) box.classList.add('pop');
    sfx.clear();
    vibrate(24);
  }
  renderHUD();
  if (isWin(state) && !launching) startLaunch();
}
function tryUnscrew(index) {
  if (won) return;
  if (isBlocked(state, index)) {
    showTip('先拆掉外面的零件');
    shake = 0.1;
    startPreview(index);
    sfx.blocked();
    vibrate(12);
    setTimeout(() => { if (!ptr) endPreview(); }, 380);
    return;
  }
  const res = doMove(state, index);
  if (!res) { showTip('暂存孔满了'); return; }
  tipEl.classList.remove('show');
  tipTimer = 0;
  applyResult(index, res, true);
}
function resetAll() {
  endPreview();
  state = createState();
  won = false;
  launching = false;
  if (core) core.position.set(0, 0, 0);
  winEl.classList.remove('show');
  document.getElementById('bannerText').textContent = '点彩色螺丝，拆开火箭';
  screwState.forEach(s => { s.hidden = false; });
  placeAllScrews();
  flyers.forEach(f => { f.busy = false; f.mesh.visible = false; });
  yawV = 0;
  pitchV = 0;
  shake = 0;
  Object.values(parts).forEach(p => {
    p.gone = false;
    p.falling = null;
    p.ox = p.oy = p.oz = p.vy = 0;
    p.obj.visible = true;
    p.obj.position.copy(p.base);
    p.obj.quaternion.copy(p.baseQuat);
    p.obj.scale.set(1, 1, 1);
    p.obj.traverse(m => {
      if (!m.material) return;
      const list = Array.isArray(m.material) ? m.material : [m.material];
      list.forEach(mat => {
        const base = mat.userData.baseOpacity;
        if (base != null) mat.opacity = base;
        mat.transparent = (base != null ? base : mat.opacity) < 0.98;
        mat.depthWrite = !mat.transparent;
      });
    });
  });
  renderHUD();
}
function jumpTo(n) {
  resetAll();
  const limit = Math.max(0, Math.min(n, solution.length));
  for (let s = 0; s < limit; s++) {
    const res = doMove(state, solution[s]);
    if (!res) throw new Error('move failed at ' + s);
    hideScrew(solution[s]);
    res.fell.forEach(hidePart);
  }
  renderHUD();
  if (isWin(state)) won = true;
}
function startLaunch() {
  if (launching) return;
  launching = true;
  won = true;
  document.getElementById('bannerText').textContent = '点火';
  confetti();
  sfx.launch();
  vibrate(28);
  shake = 0.8;
  setTimeout(() => winEl.classList.add('show'), 700);
}

const _proj = new THREE.Vector3();
const _shake = new THREE.Vector3();
let yawV = 0;
let pitchV = 0;
const PITCH_MIN = -0.42;
const PITCH_MAX = 0.55;
let ptr = null;
let pressed = -1;
function paintNow() {
  renderer.render(scene, camera);
}
function setPress(i, down) {
  const s = screwState[i];
  if (!s || s.hidden || !bodyMesh) return;
  const sc = down ? s.diameter * 0.78 : s.diameter;
  writeInstance(bodyMesh, i, s.pos, s.quat, sc);
  writeInstance(slotMesh, i, s.pos, s.quat, sc);
}
function pick(e) {
  if (!bodyMesh) return -1;
  bodyMesh.updateWorldMatrix(true, false);
  const rect = view.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const reach = Math.max(36, Math.min(rect.width, rect.height) * 0.095);
  let best = -1;
  let bestScore = 1e9;
  for (let i = 0; i < screwState.length; i++) {
    const s = screwState[i];
    if (s.hidden) continue;
    _proj.copy(s.pos).applyMatrix4(bodyMesh.matrixWorld).project(camera);
    if (_proj.z < -1 || _proj.z > 1) continue;
    const sx = (_proj.x * 0.5 + 0.5) * rect.width;
    const sy = (-_proj.y * 0.5 + 0.5) * rect.height;
    const dist = Math.hypot(sx - px, sy - py);
    if (dist > reach) continue;
    const score = dist + (_proj.z + 1) * 12;
    if (score < bestScore) { bestScore = score; best = i; }
  }
  return best;
}
view.addEventListener('pointerdown', e => {
  const tDown = performance.now();
  try { view.setPointerCapture(e.pointerId); } catch { /* synthetic or already released */ }
  const hit = pick(e);
  ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, t: tDown, hit, drag: false };
  pressed = hit;
  let blocked = false;
  if (hit >= 0) {
    if (isBlocked(state, hit)) {
      blocked = true;
      showTip('先拆掉外面的零件');
      shake = 0.1;
      startPreview(hit);
    } else {
      setPress(hit, true);
    }
  }
  paintNow();
  pressFeedbackMs = performance.now() - tDown;
  sfx.unlock();
  if (blocked) {
    sfx.blocked();
    vibrate(12);
  }
});
view.addEventListener('pointermove', e => {
  if (!ptr || e.pointerId !== ptr.id) return;
  const dx = e.clientX - ptr.x;
  const dy = e.clientY - ptr.y;
  if (!ptr.drag && dx * dx + dy * dy > 14 * 14) {
    ptr.drag = true;
    if (pressed >= 0) setPress(pressed, false);
    pressed = -1;
    endPreview();
  }
  if (ptr.drag) {
    yawV = dx * 0.015;
    pitchV = dy * 0.0055;
    spin.rotation.y += yawV;
    spin.rotation.x = THREE.MathUtils.clamp(spin.rotation.x + pitchV, PITCH_MIN, PITCH_MAX);
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    returnAt = performance.now() + 1100;
  }
});
function endPtr(e) {
  if (!ptr || (e && e.pointerId !== ptr.id)) return;
  const was = ptr;
  ptr = null;
  pressed = -1;
  const tap = !was.drag && was.hit >= 0 && performance.now() - was.t < 420;
  if (tap && isBlocked(state, was.hit)) {
    setTimeout(() => { if (!ptr) endPreview(); }, 380);
  } else if (tap) tryUnscrew(was.hit);
  else if (was.hit >= 0) setPress(was.hit, false);
  if (was.drag) endPreview();
  returnAt = performance.now() + 900;
}
view.addEventListener('pointerup', endPtr);
view.addEventListener('pointercancel', endPtr);
document.getElementById('restart').onclick = () => location.reload();
document.getElementById('again').onclick = () => location.reload();

function frame() {
  const w = view.clientWidth || 1;
  const h = view.clientHeight || 1;
  camera.aspect = w / h;
  camera.fov = 30;
  if (fitSize) {
    const vFov = 30 * Math.PI / 180;
    const tan = Math.tan(vFov / 2);
    const aspect = Math.max(0.4, camera.aspect);
    // Rocket silhouette fills about 80% of the stage width.
    const distW = (fitSize.x / 0.80) / (2 * tan * aspect);
    const distH = (fitSize.y / 0.90) / (2 * tan);
    camDist = Math.max(distH, distW);
  }
  const yaw = -0.62;
  const pitch = 0.40;
  camBase.set(
    lookTarget.x + Math.sin(yaw) * Math.cos(pitch) * camDist,
    lookTarget.y + Math.sin(pitch) * camDist,
    lookTarget.z + Math.cos(yaw) * Math.cos(pitch) * camDist
  );
  camera.position.copy(camBase);
  camera.lookAt(lookTarget);
  camera.updateProjectionMatrix();
  const dpr = Math.min(window.devicePixelRatio || 1, w < 900 ? 1.5 : 1.75);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
}
addEventListener('resize', frame);
frame();
spin.rotation.y = HOME_YAW;

const starMat = new THREE.MeshBasicMaterial({ map: starTex(), transparent: true, depthWrite: false, opacity: 0.85, toneMapped: false });
const starMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), starMat, 14);
{
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2;
    const r = 2.15 + (i % 3) * 0.4;
    dummy.position.set(Math.sin(a) * r, 0.7 + (i % 5) * 0.42, Math.cos(a) * r);
    dummy.scale.setScalar(0.14 + (i % 4) * 0.035);
    dummy.updateMatrix();
    starMesh.setMatrixAt(i, dummy.matrix);
  }
  starMesh.instanceMatrix.needsUpdate = true;
  starMesh.frustumCulled = false;
  scene.add(starMesh);
}

const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a2b, transparent: true, opacity: 0.9, toneMapped: false });
const flame = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.42, 16), flameMat);
flame.rotation.x = Math.PI;
const flameCore = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 12), new THREE.MeshBasicMaterial({ color: 0xfff0a8, transparent: true, opacity: 0.95, toneMapped: false }));
flameCore.rotation.x = Math.PI;
flameCore.position.y = 0.02;
flame.position.y = 0.12;
flameCore.position.y = 0.14;

const clock = new THREE.Clock();
let tAll = 0;
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(0.033, clock.getDelta());
  tAll += dt;
  const now = performance.now();
  frames++;
  if (now - fpsStamp > 1000) {
    fps = frames;
    frames = 0;
    fpsStamp = now;
  }
  const dragging = ptr && ptr.drag;
  if (!dragging && (Math.abs(yawV) > 0.0004 || Math.abs(pitchV) > 0.0004)) {
    yawV *= 0.9;
    pitchV *= 0.9;
    spin.rotation.y += yawV;
    spin.rotation.x = THREE.MathUtils.clamp(spin.rotation.x + pitchV, PITCH_MIN, PITCH_MAX);
  } else if (!ptr && now > returnAt && !launching) {
    const dyaw = Math.atan2(Math.sin(HOME_YAW - spin.rotation.y), Math.cos(HOME_YAW - spin.rotation.y));
    spin.rotation.y += dyaw * 0.05;
    spin.rotation.x += (0 - spin.rotation.x) * 0.05;
    yawV = 0;
    pitchV = 0;
  }
  bob.position.y = Math.sin(tAll * 1.4) * 0.02;
  flame.scale.y = 0.85 + Math.sin(tAll * 18) * 0.18;
  flameCore.scale.y = 0.8 + Math.sin(tAll * 22 + 1) * 0.2;
  nozzleLight.intensity = 0.7 + Math.sin(tAll * 16) * 0.22;
  starMesh.quaternion.copy(camera.quaternion);
  starMat.opacity = 0.45 + Math.sin(tAll * 2.2) * 0.28;
  for (let i = 0; i < flyers.length; i++) {
    const f = flyers[i];
    if (!f.busy) continue;
    const u = now - f.t0;
    if (f.phase === 'out') {
      const t = Math.min(1, u / 250);
      const e = 1 - (1 - t) * (1 - t);
      f.mesh.position.copy(f.start).addScaledVector(f.normal, e * 0.26);
      f.mesh.quaternion.setFromAxisAngle(f.normal, e * Math.PI * 4.5).multiply(f.baseQuat);
      f.mesh.scale.setScalar(f.base * (1 + e * 0.06));
      if (t >= 1) { f.phase = 'fly'; f.t0 = now; f.start.copy(f.mesh.position); }
    } else if (f.phase === 'fly') {
      const t = Math.min(1, u / 240);
      const e = 1 - (1 - t) * (1 - t);
      const a = 1 - e;
      f.mesh.position.set(
        a * a * f.start.x + 2 * a * e * f.mid.x + e * e * f.end.x,
        a * a * f.start.y + 2 * a * e * f.mid.y + e * e * f.end.y,
        a * a * f.start.z + 2 * a * e * f.mid.z + e * e * f.end.z
      );
      f.mesh.rotateY(dt * 18);
      if (t >= 1) {
        f.phase = 'land';
        f.t0 = now;
        sfx.land();
        vibrate(8);
        if (f.el) burstAt(f.el);
      }
    } else {
      const t = Math.min(1, u / 100);
      const sq = Math.sin(t * Math.PI);
      const wide = f.base * (1 + sq * 0.36);
      f.mesh.scale.set(wide, f.base * (1 - sq * 0.3), wide);
      if (t >= 1) { f.busy = false; f.mesh.visible = false; }
    }
  }
  for (let pi = 0; pi < partList.length; pi++) {
    const p = partList[pi];
    if (!p.gone && p.falling == null && p.screwIdx.length > 1) {
      let left = 0;
      for (let k = 0; k < p.screwIdx.length; k++) {
        const s = screwState[p.screwIdx[k]];
        if (s && !s.hidden) left++;
      }
      if (left === 1) {
        p.obj.quaternion.copy(p.baseQuat);
        p.obj.rotateZ(Math.sin(tAll * 10 + p.wobble) * 0.035);
      } else if (p.obj.quaternion.dot(p.baseQuat) < 0.9999) {
        p.obj.quaternion.copy(p.baseQuat);
      }
    }
    if (p.falling == null || p.falling >= 1) continue;
    p.falling += dt;
    p.vy -= 8.5 * dt;
    p.ox += p.out.x * dt * 1.15;
    p.oz += p.out.z * dt * 1.15;
    p.oy += (p.out.y * 0.25 + p.vy) * dt;
    p.obj.position.set(p.base.x + p.ox, p.base.y + p.oy, p.base.z + p.oz);
    p.obj.rotateX(p.spinX * dt);
    p.obj.rotateY(p.spinY * dt);
    p.obj.rotateZ(p.spinZ * dt);
    const life = p.falling / 0.9;
    if (life > 0.5) {
      const fade = Math.max(0, 1 - (life - 0.5) / 0.5);
      const mats = p.mats;
      for (let mi = 0; mi < mats.length; mi++) {
        mats[mi].transparent = true;
        mats[mi].opacity = fade;
        mats[mi].depthWrite = false;
      }
    }
    if (life >= 1 || p.obj.position.y < -1.4) {
      p.falling = 1;
      p.obj.visible = false;
    }
  }
  if (launching && core) {
    core.position.y += dt * (1.15 + core.position.y * 0.7);
    flame.scale.y = 1.5 + Math.sin(tAll * 30) * 0.35;
  }
  if (shake > 0) {
    shake = Math.max(0, shake - dt);
    _shake.set((Math.random() - 0.5) * shake * 0.12, (Math.random() - 0.5) * shake * 0.08, 0);
    camera.position.copy(camBase).add(_shake);
  } else camera.position.copy(camBase);
  if (tipTimer && now > tipTimer) { tipEl.classList.remove('show'); tipTimer = 0; }
  renderer.render(scene, camera);
}
tick();

function fitCamera(root) {
  // Frame the rocket hull. Pad props stay in the scene but do not widen the shot.
  const pad = new Set((LAYOUT.parts || []).filter(p => p.space === 'pad').map(p => p.id));
  const box = new THREE.Box3();
  let any = false;
  root.traverse(o => {
    if (!o.isMesh || o.name === 'static' || pad.has(o.name)) return;
    box.expandByObject(o);
    any = true;
  });
  if (!any) box.setFromObject(root);
  box.min.y -= 0.18;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  lookTarget = new THREE.Vector3(center.x, center.y, center.z);
  fitSize = { x: size.x, y: size.y, z: size.z };
  frame();
}

async function warmShaders() {
  // Opaque and ghost/fade programs, plus the flyer meshes, are compiled before the first tap.
  const saved = [];
  for (let i = 0; i < partList.length; i++) {
    const mats = partList[i].mats;
    for (let mi = 0; mi < mats.length; mi++) {
      const m = mats[mi];
      saved.push([m, m.transparent, m.opacity, m.depthWrite]);
      m.transparent = true;
      m.opacity = 0.18;
      m.depthWrite = false;
      m.needsUpdate = true;
    }
  }
  for (let i = 0; i < flyers.length; i++) flyers[i].mesh.visible = true;
  await compileScene();
  for (let i = 0; i < saved.length; i++) {
    const row = saved[i];
    row[0].transparent = row[1];
    row[0].opacity = row[2];
    row[0].depthWrite = row[3];
    row[0].needsUpdate = true;
  }
  for (let i = 0; i < flyers.length; i++) flyers[i].mesh.visible = false;
  await compileScene();
}

async function compileScene() {
  const gl = renderer.getContext();
  if (gl.getExtension('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
  else renderer.compile(scene, camera);
  renderer.render(scene, camera);
}

async function boot() {
  const bootT0 = performance.now();
  await loadPuzzle();
  solution = LAYOUT.solution.slice();
  state = createState();
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(new URL('./assets/rocket.glb', import.meta.url).href);
  const root = gltf.scene;
  bob.add(root);
  const byName = {};
  root.traverse(o => { byName[o.name] = o; });
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const src = Array.isArray(o.material) ? o.material : [o.material];
    const next = src.map(upgradeVinyl);
    o.material = Array.isArray(o.material) ? next : next[0];
  });
  // Removable parts keep their own material copies so a fade does not wash the rocket.
  const shared = new Map();
  function ownMaterials(obj) {
    obj.traverse(o => {
      if (!o.isMesh) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      const cloned = list.map(m => {
        const c = m.clone();
        c.userData.baseOpacity = c.opacity;
        return c;
      });
      o.material = Array.isArray(o.material) ? cloned : cloned[0];
    });
  }
  LAYOUT.parts.forEach(def => {
    const obj = byName[def.id];
    if (!obj) {
      errors.push('missing part ' + def.id);
      return;
    }
    ownMaterials(obj);
    const mats = [];
    obj.traverse(m => {
      if (!m.isMesh) return;
      const list = Array.isArray(m.material) ? m.material : [m.material];
      for (let mi = 0; mi < list.length; mi++) mats.push(list[mi]);
    });
    const rec = {
      obj,
      gone: false,
      falling: null,
      base: obj.position.clone(),
      baseQuat: obj.quaternion.clone(),
      out: new THREE.Vector3().fromArray(def.fall),
      screwIdx: [],
      wobble: Math.random() * Math.PI * 2,
      mats,
      ox: 0, oy: 0, oz: 0, vy: 0,
      spinX: 0, spinY: 0, spinZ: 0,
    };
    parts[def.id] = rec;
    partList.push(rec);
  });
  core = byName.core || null;
  if (core) core.add(flame, flameCore);
  // Static mesh stays on the shared upgraded material (one draw).
  void shared;

  const n = LAYOUT.screws.length;
  bodyMesh = new THREE.InstancedMesh(screwGeo.body, screwMat, n);
  slotMesh = new THREE.InstancedMesh(screwGeo.slot, slotMat, n);
  bodyMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  bodyMesh.frustumCulled = false;
  slotMesh.frustumCulled = false;
  bodyMesh.renderOrder = 2;
  slotMesh.renderOrder = 3;
  bodyMesh.castShadow = true;
  bob.add(bodyMesh, slotMesh);

  let socketDelta = 0;
  const empties = [];
  root.traverse(o => {
    if (o.isMesh) return;
    const ud = o.userData || {};
    if (ud.index == null || ud.part == null) return;
    empties.push(o);
  });
  LAYOUT.screws.forEach((s, i) => {
    const pos = new THREE.Vector3().fromArray(s.pos);
    const normal = new THREE.Vector3().fromArray(s.normal).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(up, normal);
    screwState.push({
      pos, quat, diameter: s.diameter, hidden: false,
      color: new THREE.Color(COLOR_HEX[s.color]),
      colorName: s.color,
      part: s.part,
    });
    if (parts[s.part]) parts[s.part].screwIdx.push(i);
    screwObjs.push(i);
  });
  empties.forEach(o => {
    const idx = Number(o.userData.index);
    if (!screwState[idx]) return;
    const p = new THREE.Vector3();
    o.getWorldPosition(p);
    bob.worldToLocal(p);
    socketDelta = Math.max(socketDelta, p.distanceTo(screwState[idx].pos));
  });
  placeAllScrews();
  renderHUD();

  fitCamera(root);
  await warmShaders();
  loadMs = Math.round(performance.now() - bootT0);
  const info = {
    ready: true,
    errors,
    solution,
    screwCount: n,
    parts: LAYOUT.parts.length,
    midMove: LAYOUT.midMove,
    revealMove: LAYOUT.revealMove || 0,
    previewScrew: LAYOUT.previewScrew,
    previewCover: LAYOUT.previewCover,
    socketDelta: Math.round(socketDelta * 1000) / 1000,
    get won() { return won; },
    get left() { return state.removed.filter(r => !r).length; },
    get fps() { return fps; },
    get draws() { return renderer.info.render.calls; },
    get tris() { return renderer.info.render.triangles; },
    get loadMs() { return loadMs; },
    get pixelRatio() { return renderer.getPixelRatio(); },
    home() {
      spin.rotation.set(0, HOME_YAW, 0);
      yawV = 0;
      pitchV = 0;
      returnAt = 0;
      return true;
    },
    get pressFeedbackMs() { return pressFeedbackMs; },
    projectScrew(i) {
      const s = screwState[i];
      if (!s || !bodyMesh) return null;
      bodyMesh.updateWorldMatrix(true, false);
      _proj.copy(s.pos).applyMatrix4(bodyMesh.matrixWorld).project(camera);
      const rect = view.getBoundingClientRect();
      return {
        x: rect.left + (_proj.x * 0.5 + 0.5) * rect.width,
        y: rect.top + (-_proj.y * 0.5 + 0.5) * rect.height,
        blocked: isBlocked(state, i),
      };
    },
    freeScrew() {
      for (let i = 0; i < screwState.length; i++) {
        if (!screwState[i].hidden && !isBlocked(state, i)) return i;
      }
      return -1;
    },
    bench() {
      const gl = renderer.getContext();
      const n = 12;
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        renderer.render(scene, camera);
        gl.finish();
      }
      return Math.round(n * 1000 / Math.max(1, performance.now() - t0));
    },
    jumpTo(k) {
      jumpTo(k);
      renderer.render(scene, camera);
      return { left: state.removed.filter(r => !r).length, won };
    },
    preview(i) { startPreview(i); return previewIds.slice(); },
    clearPreview() { endPreview(); return true; },
    launch() { startLaunch(); return true; },
    gone(id) { return !!(parts[id] && parts[id].gone); },
  };
  window.__demo = info;
  if (errors.length) {
    errEl.style.display = 'block';
    errEl.textContent = errors.join('\n');
  }
}

boot().catch(err => {
  errors.push(String(err && err.stack || err));
  errEl.style.display = 'block';
  errEl.textContent = errors.join('\n');
  window.__demo.errors = errors;
});
