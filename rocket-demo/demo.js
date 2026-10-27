// Rocket demo. Meshes, palette, and baked maps come from tools/blender/rocket.py.
// Screws are one template, placed from layout.json, drawn with InstancedMesh.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.08, 80);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
pmrem.dispose();

scene.add(new THREE.HemisphereLight(0xfff6ee, 0x9aa6ff, 0.62));
const key = new THREE.DirectionalLight(0xfff1e2, 2.25);
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
const fill = new THREE.DirectionalLight(0xc5d6ff, 0.42);
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
  grd.addColorStop(0, 'rgba(90, 104, 196, 0.38)');
  grd.addColorStop(0.55, 'rgba(111, 120, 200, 0.18)');
  grd.addColorStop(1, 'rgba(111, 120, 200, 0)');
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

// Cap diameter is 1. A visible shank carries two thread rings, then a low
// dome. The cross is 40% of the cap height deep and thick enough to read
// at phone size (a hairline slot looks like a sticker).
function screwTemplate() {
  const pts = [
    [0.16, 0.00], [0.16, 0.07], [0.36, 0.15], [0.16, 0.23],
    [0.16, 0.34], [0.36, 0.42], [0.16, 0.50], [0.16, 0.60],
    [0.44, 0.63], [0.50, 0.68], [0.50, 0.78], [0.38, 0.84],
    [0.16, 0.88], [0.00, 0.90],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.LatheGeometry(pts, 20);
  body.computeVertexNormals();
  const capH = 0.22;
  const slotD = capH * 0.40;
  const slotY = 0.93 - slotD * 0.5;
  const a = new THREE.BoxGeometry(0.72, slotD, 0.20);
  const b = new THREE.BoxGeometry(0.20, slotD, 0.72);
  a.translate(0, slotY, 0);
  b.translate(0, slotY, 0);
  return { body, slot: mergeGeometries([a, b]) };
}
const screwGeo = screwTemplate();
const screwMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  roughness: 0.32,
  metalness: 0,
  clearcoat: 0.55,
  clearcoatRoughness: 0.35,
  sheen: 0,
  envMapIntensity: 0.28,
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
    roughness: 0.4,
    metalness: 0,
    clearcoat: 0.52,
    clearcoatRoughness: 0.26,
    sheen: 0.08,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color('#fff6ee'),
    envMapIntensity: 0.72,
    aoMapIntensity: 0.9,
    normalScale: new THREE.Vector2(0.8, 0.8),
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
let pickMesh = null;
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
    writeInstance(pickMesh, i, s.pos, s.quat, s.hidden ? 0 : Math.max(s.diameter, 0.1));
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
  writeInstance(pickMesh, i, screwState[i].pos, screwState[i].quat, 0);
}

let previewIds = [];
let returnAt = 0;
let won = false;
let launching = false;
const flies = [];
const motes = [];
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
function blip(freq, dur) {
  try {
    const ctx = blip.ctx || (blip.ctx = new AudioContext());
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.03, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur);
  } catch { /* autoplay */ }
}
function uiTarget(el) {
  const cr = view.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const x = ((r.left + r.width / 2) - cr.left) / cr.width * 2 - 1;
  const y = -(((r.top + r.height / 2) - cr.top) / cr.height * 2 - 1);
  const ndc = new THREE.Vector3(x, y, 0.42).unproject(camera);
  const dir = ndc.sub(camera.position);
  const dist = Math.min(6.2, dir.length());
  return camera.position.clone().add(dir.normalize().multiplyScalar(dist));
}
function flyScrew(index, el) {
  const s = screwState[index];
  hideScrew(index);
  const start = s.pos.clone();
  bodyMesh.localToWorld(start);
  const flyer = new THREE.Group();
  const head = new THREE.Mesh(screwGeo.body, screwMat.clone());
  head.material.color.set(COLOR_HEX[s.colorName]);
  const slot = new THREE.Mesh(screwGeo.slot, slotMat);
  flyer.add(head, slot);
  flyer.scale.setScalar(s.diameter);
  flyer.quaternion.copy(s.quat);
  flyer.position.copy(start);
  scene.add(flyer);
  const end = uiTarget(el);
  const mid = start.clone().lerp(end, 0.45);
  mid.y += 0.9;
  flies.push({ mesh: flyer, start, mid, end, t0: performance.now(), base: s.diameter });
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
  shake = Math.max(shake, 0.22);
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
    blip(res.dest === 'box' ? 660 : 420, 0.08);
  }
  if (res.cleared.length) {
    const box = boxesEl.querySelector('.box.' + res.cleared[0]);
    if (box) box.classList.add('pop');
  }
  renderHUD();
  if (isWin(state) && !launching) startLaunch();
}
function tryUnscrew(index) {
  if (won) return;
  if (isBlocked(state, index)) {
    showTip('先拆掉外面的零件');
    shake = 0.12;
    return;
  }
  const res = doMove(state, index);
  if (!res) { showTip('暂存孔满了'); return; }
  applyResult(index, res, true);
}
function resetAll() {
  state = createState();
  won = false;
  launching = false;
  if (core) core.position.set(0, 0, 0);
  winEl.classList.remove('show');
  document.getElementById('bannerText').textContent = '点彩色螺丝，拆开火箭';
  screwState.forEach(s => { s.hidden = false; });
  placeAllScrews();
  flies.forEach(f => scene.remove(f.mesh));
  flies.length = 0;
  Object.values(parts).forEach(p => {
    p.gone = false;
    p.falling = null;
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
  blip(520, 0.12);
  setTimeout(() => blip(780, 0.18), 140);
  shake = 0.8;
  setTimeout(() => winEl.classList.add('show'), 700);
}

const ray = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let ptr = null;
function pick(e) {
  if (!pickMesh) return -1;
  const r = view.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  ray.setFromCamera(pointer, camera);
  const hits = ray.intersectObject(pickMesh, false);
  if (!hits.length || hits[0].instanceId == null) return -1;
  const id = hits[0].instanceId;
  return screwState[id] && !screwState[id].hidden ? id : -1;
}
view.addEventListener('pointerdown', e => {
  view.setPointerCapture(e.pointerId);
  const hit = pick(e);
  ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), hit, drag: false };
  ptr.hold = setTimeout(() => {
    if (ptr && !ptr.drag && ptr.hit >= 0 && isBlocked(state, ptr.hit)) startPreview(ptr.hit);
  }, 380);
});
view.addEventListener('pointermove', e => {
  if (!ptr || e.pointerId !== ptr.id) return;
  const dx = e.clientX - ptr.x;
  const dy = e.clientY - ptr.y;
  if (!ptr.drag && dx * dx + dy * dy > 80) {
    ptr.drag = true;
    clearTimeout(ptr.hold);
    endPreview();
  }
  if (ptr.drag) {
    spin.rotation.y += dx * 0.012;
    spin.rotation.x = THREE.MathUtils.clamp(spin.rotation.x + dy * 0.004, -0.35, 0.45);
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    returnAt = performance.now() + 700;
  }
});
function endPtr(e) {
  if (!ptr || (e && e.pointerId !== ptr.id)) return;
  clearTimeout(ptr.hold);
  const was = ptr;
  ptr = null;
  endPreview();
  if (!was.drag && performance.now() - was.t < 500 && was.hit >= 0) tryUnscrew(was.hit);
  returnAt = performance.now() + 600;
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
    const distH = (fitSize.y * 0.52) / Math.tan(vFov / 2);
    const distW = (fitSize.x * 0.50) / Math.tan(vFov / 2) / Math.max(0.4, camera.aspect);
    camDist = Math.max(distH, distW) * 1.02;
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
  const dpr = Math.min(window.devicePixelRatio || 1, w < 500 ? 1.5 : 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
}
addEventListener('resize', frame);
frame();
spin.rotation.y = HOME_YAW;

const starMat = new THREE.SpriteMaterial({ map: starTex(), transparent: true, depthWrite: false, opacity: 0.85 });
const stars = [];
for (let i = 0; i < 14; i++) {
  const s = new THREE.Sprite(starMat);
  const a = Math.random() * Math.PI * 2;
  const r = 2.1 + Math.random() * 1.6;
  s.position.set(Math.sin(a) * r, 0.6 + Math.random() * 2.8, Math.cos(a) * r);
  const sc = 0.12 + Math.random() * 0.14;
  s.scale.set(sc, sc, sc);
  s.userData.phase = Math.random() * Math.PI * 2;
  scene.add(s);
  stars.push(s);
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
  if (!ptr && now > returnAt && !launching) {
    spin.rotation.y += (HOME_YAW - spin.rotation.y) * 0.04;
    spin.rotation.x += (0 - spin.rotation.x) * 0.05;
  }
  bob.position.y = Math.sin(tAll * 1.4) * 0.02;
  flame.scale.y = 0.85 + Math.sin(tAll * 18) * 0.18;
  flameCore.scale.y = 0.8 + Math.sin(tAll * 22 + 1) * 0.2;
  nozzleLight.intensity = 0.7 + Math.sin(tAll * 16) * 0.22;
  stars.forEach(s => { s.material.opacity = 0.4 + Math.sin(tAll * 2.2 + s.userData.phase) * 0.35; });
  for (let i = flies.length - 1; i >= 0; i--) {
    const f = flies[i];
    const t = Math.min(1, (now - f.t0) / 460);
    const e = t * t * (3 - 2 * t);
    const a = 1 - e;
    f.mesh.position.set(
      a * a * f.start.x + 2 * a * e * f.mid.x + e * e * f.end.x,
      a * a * f.start.y + 2 * a * e * f.mid.y + e * e * f.end.y,
      a * a * f.start.z + 2 * a * e * f.mid.z + e * e * f.end.z
    );
    f.mesh.rotateY(0.28);
    f.mesh.scale.setScalar(f.base * (1 + Math.sin(t * Math.PI) * 0.18));
    if (Math.random() < 0.55) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 0.8, toneMapped: false }));
      m.position.copy(f.mesh.position);
      scene.add(m);
      motes.push(m);
    }
    if (t >= 1) {
      scene.remove(f.mesh);
      flies.splice(i, 1);
      const holes = document.querySelectorAll('.hole.filled');
      if (holes.length) burstAt(holes[holes.length - 1]);
    }
  }
  for (let i = motes.length - 1; i >= 0; i--) {
    motes[i].material.opacity -= dt * 2.2;
    motes[i].scale.multiplyScalar(0.96);
    if (motes[i].material.opacity <= 0) { scene.remove(motes[i]); motes.splice(i, 1); }
  }
  Object.values(parts).forEach(p => {
    if (p.falling == null || p.falling >= 1) return;
    p.falling = Math.min(1, p.falling + dt / 0.55);
    const e = p.falling * p.falling;
    p.obj.position.copy(p.base).addScaledVector(p.out, e);
    p.obj.rotateZ(dt * 1.6);
    const fade = 1 - e;
    p.obj.traverse(m => {
      if (!m.material) return;
      const list = Array.isArray(m.material) ? m.material : [m.material];
      list.forEach(mat => { mat.transparent = true; mat.opacity = fade; mat.depthWrite = false; });
    });
    if (p.falling >= 1) p.obj.visible = false;
  });
  if (launching && core) {
    core.position.y += dt * (1.15 + core.position.y * 0.7);
    flame.scale.y = 1.5 + Math.sin(tAll * 30) * 0.35;
  }
  if (shake > 0) {
    shake = Math.max(0, shake - dt);
    camera.position.copy(camBase).add(new THREE.Vector3((Math.random() - 0.5) * shake * 0.12, (Math.random() - 0.5) * shake * 0.08, 0));
  } else camera.position.copy(camBase);
  if (tipTimer && now > tipTimer) { tipEl.classList.remove('show'); tipTimer = 0; }
  renderer.render(scene, camera);
}
tick();

function fitCamera(root) {
  // Frame the rocket, not the grass. The pad is pulled back in by hand
  // so the diorama still peeks in under the hull.
  const box = new THREE.Box3();
  let any = false;
  root.traverse(o => {
    if (!o.isMesh || o.name === 'static') return;
    box.expandByObject(o);
    any = true;
  });
  if (!any) box.setFromObject(root);
  box.min.y -= 0.48;
  box.min.x -= 0.16;
  box.max.x += 0.16;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  lookTarget = new THREE.Vector3(center.x, center.y + size.y * 0.02, center.z);
  fitSize = { x: size.x, y: size.y, z: size.z };
  frame();
}

async function boot() {
  await loadPuzzle();
  solution = LAYOUT.solution.slice();
  state = createState();
  const gltf = await new GLTFLoader().loadAsync(new URL('./assets/rocket.glb', import.meta.url).href);
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
    parts[def.id] = {
      obj,
      gone: false,
      falling: null,
      base: obj.position.clone(),
      baseQuat: obj.quaternion.clone(),
      out: new THREE.Vector3().fromArray(def.fall),
    };
  });
  core = byName.core || null;
  if (core) core.add(flame, flameCore);
  // Static mesh stays on the shared upgraded material (one draw).
  void shared;

  const n = LAYOUT.screws.length;
  bodyMesh = new THREE.InstancedMesh(screwGeo.body, screwMat, n);
  slotMesh = new THREE.InstancedMesh(screwGeo.slot, slotMat, n);
  pickMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 8, 6), new THREE.MeshBasicMaterial({ visible: false }), n);
  bodyMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  bodyMesh.frustumCulled = false;
  slotMesh.frustumCulled = false;
  pickMesh.frustumCulled = false;
  bodyMesh.renderOrder = 2;
  slotMesh.renderOrder = 3;
  bodyMesh.castShadow = true;
  bob.add(bodyMesh, slotMesh, pickMesh);

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
    });
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
  const info = {
    ready: true,
    errors,
    solution,
    screwCount: n,
    parts: LAYOUT.parts.length,
    midMove: LAYOUT.midMove,
    previewScrew: LAYOUT.previewScrew,
    previewCover: LAYOUT.previewCover,
    socketDelta: Math.round(socketDelta * 1000) / 1000,
    get won() { return won; },
    get left() { return state.removed.filter(r => !r).length; },
    get fps() { return fps; },
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
