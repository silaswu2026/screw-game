// Original candy rocket. All geometry is procedural (lathe, extrude, rounded box).
// No downloaded meshes. Puzzle rules live in level.js.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  LAYOUT as L, PUZZLE, COLOR_HEX, createState, doMove, isBlocked, coveringParts,
  isWin, solve,
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

const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
pmrem.dispose();

const hemi = new THREE.HemisphereLight(0xffffff, 0x9aa6ff, 0.72);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff2e0, 2.15);
key.position.set(-3.2, 6.4, 4.2);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 28;
key.shadow.camera.left = -5;
key.shadow.camera.right = 5;
key.shadow.camera.top = 5;
key.shadow.camera.bottom = -5;
key.shadow.bias = -0.00035;
key.shadow.normalBias = 0.025;
scene.add(key);
const fill = new THREE.DirectionalLight(0xbfd8ff, 0.48);
fill.position.set(4.2, 2.2, 3.4);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 1.05);
rim.position.set(0.4, 3.2, -5.2);
scene.add(rim);
const nozzleLight = new THREE.PointLight(0xffb02e, 0.9, 4.5, 2);
nozzleLight.position.set(0, 0.15, 0.2);
scene.add(nozzleLight);

const spin = new THREE.Group();
const bob = new THREE.Group();
spin.add(bob);
scene.add(spin);
const HOME_YAW = -0.42;

function paint(color, opts = {}) {
  const c = new THREE.Color(color);
  const m = new THREE.MeshPhysicalMaterial({
    color: opts.vertexColors ? 0xffffff : c,
    roughness: opts.roughness ?? 0.38,
    metalness: opts.metalness ?? 0,
    clearcoat: opts.clearcoat ?? 0.62,
    clearcoatRoughness: opts.clearcoatRoughness ?? 0.22,
    sheen: opts.sheen ?? 0.26,
    sheenRoughness: 0.5,
    sheenColor: c.clone().offsetHSL(0, -0.08, 0.2),
    envMapIntensity: opts.env ?? 0.85,
    emissive: c.clone().multiplyScalar(opts.em ?? 0.035),
    emissiveIntensity: 1,
    vertexColors: !!opts.vertexColors,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    depthWrite: opts.depthWrite !== false,
    side: opts.side ?? THREE.FrontSide,
  });
  return m;
}

function lathe(pairs, seg = 48) {
  const g = new THREE.LatheGeometry(pairs.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  g.computeVertexNormals();
  return g;
}

function arcPanel(rIn, rOut, span, height, hole) {
  const shape = new THREE.Shape();
  const N = 32;
  const a0 = -span / 2;
  for (let i = 0; i <= N; i++) {
    const a = a0 + span * i / N;
    const x = Math.sin(a) * rOut;
    const y = Math.cos(a) * rOut;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  for (let i = N; i >= 0; i--) {
    const a = a0 + span * i / N;
    shape.lineTo(Math.sin(a) * rIn, Math.cos(a) * rIn);
  }
  shape.closePath();
  if (hole) {
    const path = new THREE.Path();
    const hr = 0.20;
    const hy = (rIn + rOut) * 0.5 + 0.02;
    for (let i = 0; i <= 28; i++) {
      const a = -i / 28 * Math.PI * 2;
      const x = Math.sin(a) * hr;
      const y = hy + Math.cos(a) * hr;
      if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
    }
    shape.holes.push(path);
  }
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height, bevelEnabled: true, bevelThickness: 0.026, bevelSize: 0.026,
    bevelSegments: 2, curveSegments: 8,
  });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, height / 2, 0);
  geo.computeVertexNormals();
  return geo;
}

function hullGeo() {
  const geo = lathe([
    [0.20, 0.10], [0.38, 0.20], [0.52, 0.38], [0.58, 0.72],
    [0.57, 1.15], [0.52, 1.55], [0.40, 1.88], [0.24, 2.08], [0.06, 2.20],
  ], 56);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const A = new THREE.Color('#FF7A9A');
  const B = new THREE.Color('#3DDCB0');
  const C = new THREE.Color('#7AA7FF');
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 1.2) tmp.copy(A).lerp(B, THREE.MathUtils.smoothstep(y, 0.9, 1.2));
    else tmp.copy(B).lerp(C, THREE.MathUtils.smoothstep(y, 1.2, 1.6));
    tmp.offsetHSL(0, 0, THREE.MathUtils.clamp(pos.getZ(i), -0.5, 0.5) * 0.08);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function padGeo() {
  const geo = lathe([
    [0.02, 0.05], [0.70, 0.055], [0.92, 0.03], [1.12, 0.045],
    [1.24, 0.02], [1.30, -0.06], [1.28, -0.16], [1.16, -0.26], [0.02, -0.26],
  ], 72);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const top = new THREE.Color('#EEF1FF');
  const side = new THREE.Color('#3E5FD0');
  const rimC = new THREE.Color('#FFD45A');
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const rad = Math.hypot(pos.getX(i), pos.getZ(i));
    tmp.copy(side);
    if (y > -0.04) tmp.lerp(top, THREE.MathUtils.smoothstep(y, -0.06, 0.03));
    if (rad > 1.08 && y > -0.1) tmp.lerp(rimC, THREE.MathUtils.smoothstep(rad, 1.08, 1.22));
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function contactTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 18, 128, 128, 122);
  grd.addColorStop(0, 'rgba(90, 104, 196, 0.42)');
  grd.addColorStop(0.55, 'rgba(111, 120, 200, 0.22)');
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
  new THREE.PlaneGeometry(4.6, 4.6),
  new THREE.MeshBasicMaterial({ map: contactTex(), transparent: true, depthWrite: false })
);
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = -0.27;
bob.add(shadow);
const padShadow = shadow.clone();
padShadow.scale.set(0.55, 0.55, 0.55);
padShadow.position.y = 0.06;
bob.add(padShadow);

const pad = new THREE.Mesh(padGeo(), paint('#ffffff', { vertexColors: true, roughness: 0.4, clearcoat: 0.55, sheen: 0.2 }));
pad.receiveShadow = true;
pad.castShadow = true;
bob.add(pad);
const socket = new THREE.Mesh(
  new THREE.CylinderGeometry(0.52, 0.56, 0.06, 32),
  paint('#C9D4FF', { roughness: 0.45, clearcoat: 0.4 })
);
socket.position.y = 0.06;
bob.add(socket);

function tuft(x, z) {
  const g = new THREE.Group();
  const mat = paint('#3EAE55', { roughness: 0.48, clearcoat: 0.28, sheen: 0.15 });
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), mat);
    s.position.set((i - 1) * 0.07, 0.04, (i - 1) * 0.02);
    s.scale.y = 0.65;
    g.add(s);
  }
  g.position.set(x, 0.05, z);
  return g;
}
function flower(x, z, color) {
  const g = new THREE.Group();
  const petal = paint(color, { roughness: 0.36, clearcoat: 0.55 });
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), petal);
    const a = i / 5 * Math.PI * 2;
    m.position.set(Math.cos(a) * 0.05, 0.05, Math.sin(a) * 0.05);
    m.scale.set(1, 0.55, 0.75);
    g.add(m);
  }
  const center = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), paint('#FFC918', { clearcoat: 0.8, roughness: 0.28 }));
  center.position.y = 0.07;
  g.add(center);
  g.position.set(x, 0.05, z);
  return g;
}
function can(x, z, color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.26, 5, 16), paint(color, { clearcoat: 0.7, roughness: 0.32 }));
  body.position.y = 0.28;
  body.castShadow = true;
  g.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.118, 0.055, 16), paint('#F7F4EE', { roughness: 0.42 }));
  band.position.y = 0.32;
  g.add(band);
  g.position.set(x, 0.05, z);
  return g;
}
function tower() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new RoundedBoxGeometry(0.18, 1.05, 0.18, 3, 0.045), paint('#2F6FE8', { clearcoat: 0.7, roughness: 0.32 }));
  post.position.y = 0.55;
  post.castShadow = true;
  g.add(post);
  const arm = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.12, 0.12, 3, 0.04), paint('#FFC918', { clearcoat: 0.6 }));
  arm.position.set(0.22, 0.92, 0);
  g.add(arm);
  for (let i = 0; i < 3; i++) {
    const stripe = new THREE.Mesh(
      new RoundedBoxGeometry(0.1, 0.07, 0.13, 2, 0.02),
      paint(i % 2 ? '#2A2A35' : '#FFF6D8', { roughness: 0.4, clearcoat: 0.3, sheen: 0.05 })
    );
    stripe.position.set(0.08 + i * 0.16, 0.92, 0);
    g.add(stripe);
  }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 12), paint('#F2403A', { em: 0.18, clearcoat: 0.8, roughness: 0.28 }));
  lamp.position.y = 1.12;
  g.add(lamp);
  g.position.set(-0.95, 0.05, 0.72);
  return g;
}
[[-0.55, 1.05], [0.72, 0.95], [1.0, 0.15]].forEach(([x, z]) => bob.add(tuft(x, z)));
bob.add(flower(0.35, 1.08, '#FF5CA8'));
bob.add(flower(-0.15, 1.12, '#FFFFFF'));
bob.add(flower(0.95, 0.55, '#FF8A2B'));
bob.add(can(0.98, -0.35, '#19C3D3'));
bob.add(can(0.78, -0.62, '#FF5CA8'));
bob.add(tower());
const rockMat = paint('#CDB7E8', { roughness: 0.55, clearcoat: 0.25, sheen: 0.1 });
for (const [x, z, s] of [[1.05, 0.85, 0.09], [-1.05, 0.2, 0.07]]) {
  const r = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), rockMat);
  r.scale.set(1.2, 0.7, 1);
  r.position.set(x, 0.08, z);
  bob.add(r);
}

const core = new THREE.Group();
bob.add(core);
const hull = new THREE.Mesh(hullGeo(), paint('#ffffff', { vertexColors: true, roughness: 0.36, clearcoat: 0.7, sheen: 0.3 }));
hull.castShadow = true;
hull.receiveShadow = true;
core.add(hull);

function astronaut() {
  const g = new THREE.Group();
  const suit = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.1, 4, 12), paint('#F7F5F0', { roughness: 0.4, clearcoat: 0.4 }));
  g.add(suit);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), paint('#FFD2B8', { roughness: 0.45, clearcoat: 0.25, sheen: 0.2 }));
  face.position.set(0, 0.13, 0.03);
  g.add(face);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 16), paint('#E9FBFF', { roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true, opacity: 0.45, depthWrite: false }));
  helm.position.y = 0.14;
  g.add(helm);
  const eye = new THREE.MeshBasicMaterial({ color: 0x241c28 });
  for (const x of [-0.032, 0.032]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), eye);
    e.position.set(x, 0.145, 0.1);
    g.add(e);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    h.position.set(x + 0.007, 0.152, 0.112);
    g.add(h);
  }
  g.position.set(0, L.windowY - 0.02, 0.56);
  g.scale.setScalar(0.92);
  return g;
}
core.add(astronaut());

const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a2b, transparent: true, opacity: 0.92, toneMapped: false });
const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.46, 18), flameMat);
flame.rotation.x = Math.PI;
flame.position.y = 0.02;
const flameCore = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.30, 14), new THREE.MeshBasicMaterial({ color: 0xfff0a8, transparent: true, opacity: 0.95, toneMapped: false }));
flameCore.rotation.x = Math.PI;
flameCore.position.y = 0.04;
core.add(flame, flameCore);

const parts = {};
function track(id, obj, out) {
  obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  bob.add(obj);
  parts[id] = { obj, gone: false, out, base: obj.position.clone(), opacity: 1 };
}

function makeNose() {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(lathe([
    [0.02, 0.92], [0.10, 0.84], [0.22, 0.70], [0.38, 0.48],
    [0.52, 0.26], [0.62, 0.08], [0.56, -0.02], [0.34, -0.06],
  ], 48), paint('#F2403A', { em: 0.08, clearcoat: 0.75, roughness: 0.32 }));
  g.add(cone);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.07, 12, 32), paint('#FFC918', { clearcoat: 0.7, roughness: 0.3 }));
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.06;
  g.add(collar);
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.045 : 0.11;
    const a = i / 10 * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) star.moveTo(x, y); else star.lineTo(x, y);
  }
  const sg = new THREE.ExtrudeGeometry(star, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 });
  const sm = new THREE.Mesh(sg, paint('#FFC918', { clearcoat: 0.85, roughness: 0.28 }));
  sm.position.set(0, 0.42, 0.46);
  g.add(sm);
  g.position.y = L.noseBase;
  return g;
}
track('nose', makeNose(), new THREE.Vector3(0, 1.3, 0.35));

const shellMat = () => paint('#F6F1E8', { roughness: 0.46, clearcoat: 0.42, sheen: 0.32, em: 0.05 });
function addShell(id, y, h, rotY, hole, out) {
  const mesh = new THREE.Mesh(arcPanel(L.panelIn, L.panelOut, L.panelSpan, h, hole), shellMat());
  mesh.position.y = y;
  mesh.rotation.y = rotY;
  track(id, mesh, out);
}
addShell('upperF', L.upperY, L.upperH, 0, false, new THREE.Vector3(0, 0.25, 1.25));
addShell('upperB', L.upperY, L.upperH, Math.PI, false, new THREE.Vector3(0, 0.25, -1.25));
addShell('lowerF', L.lowerY, L.lowerH, 0, false, new THREE.Vector3(0, 0.15, 1.2));
addShell('lowerB', L.lowerY, L.lowerH, Math.PI, false, new THREE.Vector3(0, 0.15, -1.2));

const band = new THREE.Mesh(lathe([
  [0.66, -0.13], [0.78, -0.10], [0.90, -0.04], [0.93, 0], [0.90, 0.04], [0.78, 0.10], [0.66, 0.13],
], 56), paint('#F07012', { clearcoat: 0.55, roughness: 0.4, em: 0.03 }));
band.position.y = L.bandY;
track('band', band, new THREE.Vector3(0, 0.45, 0));

function makeWindow() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(L.windowR, 0.065, 14, 36), paint('#2F78F0', { clearcoat: 0.85, roughness: 0.28 }));
  ring.position.set(0, L.windowY, L.windowZ);
  g.add(ring);
  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(L.windowR * 0.82, 28),
    paint('#9AECFF', { roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.06, transparent: true, opacity: 0.42, depthWrite: false })
  );
  glass.position.set(0, L.windowY, L.windowZ - 0.02);
  g.add(glass);
  return g;
}
track('window', makeWindow(), new THREE.Vector3(0, 0.35, 1.35));

function finGeo() {
  const s = new THREE.Shape();
  s.moveTo(L.finRoot, 0.02);
  s.bezierCurveTo(0.78, 0.0, L.finTip, 0.12, L.finTip - 0.04, 0.40);
  s.bezierCurveTo(0.86, 0.52, 0.62, 0.50, L.finRoot + 0.06, 0.30);
  s.lineTo(L.finRoot, 0.02);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.16, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 10,
  });
  geo.translate(0, 0, -0.08);
  geo.computeVertexNormals();
  return geo;
}
const finG = finGeo();
const finColors = ['#8E4CE6', '#F2403A', '#2F78F0'];
L.finAngles.forEach((ang, i) => {
  const id = ['finR', 'finL', 'finB'][i];
  const m = new THREE.Mesh(finG, paint(finColors[i], { clearcoat: 0.7, roughness: 0.32 }));
  m.position.y = L.finY;
  m.rotation.y = ang - Math.PI / 2;
  const out = new THREE.Vector3(Math.sin(ang), 0.25, Math.cos(ang)).multiplyScalar(1.35);
  track(id, m, out);
});

function makeNozzle() {
  const g = new THREE.Group();
  const bell = new THREE.Mesh(lathe([
    [0.16, 0.24], [0.30, 0.16], [0.40, 0.08], [0.48, 0.0], [0.34, -0.03], [0.18, 0.06], [0.14, 0.16],
  ], 36), paint('#5C74E0', { clearcoat: 0.8, roughness: 0.3, metalness: 0.04 }));
  g.add(bell);
  const throat = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), new THREE.MeshBasicMaterial({ color: 0x241c40 }));
  throat.rotation.x = -Math.PI / 2;
  throat.position.y = 0.02;
  g.add(throat);
  return g;
}
track('nozzle', makeNozzle(), new THREE.Vector3(0, -0.7, 0.25));

const S = 0.30;
const screwGeo = lathe([
  [0.00, 0.00], [0.46, 0.00], [0.50, 0.045], [0.48, 0.10], [0.38, 0.15], [0.20, 0.185], [0.00, 0.195],
].map(([r, y]) => [r * S, y * S]), 40);
const slotGeo = new THREE.BoxGeometry(S * 0.46, S * 0.055, S * 0.10);
const slotMat = new THREE.MeshStandardMaterial({ color: 0x2a2230, roughness: 0.8 });
const screwMats = {};
function screwMat(color) {
  if (!screwMats[color]) {
    const c = new THREE.Color(COLOR_HEX[color]);
    screwMats[color] = new THREE.MeshPhysicalMaterial({
      color: c, roughness: 0.32, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.4,
      sheen: 0.55, sheenRoughness: 0.35, sheenColor: c.clone().lerp(new THREE.Color('#fff7ea'), 0.35),
      envMapIntensity: 0.22, emissive: c, emissiveIntensity: 0.16,
    });
  }
  return screwMats[color];
}
const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
function makeScrew(color, scale = 1) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(screwGeo, screwMat(color));
  g.add(head);
  const a = new THREE.Mesh(slotGeo, slotMat);
  const b = new THREE.Mesh(slotGeo, slotMat);
  b.rotation.y = Math.PI / 2;
  const top = 0.195 * S * 0.72;
  a.position.y = top;
  b.position.y = top;
  g.add(a, b);
  const shine = new THREE.Mesh(new THREE.SphereGeometry(S * 0.09, 8, 6), shineMat);
  shine.position.set(-0.03 * scale, 0.195 * S * 0.95, 0.03 * scale);
  g.add(shine);
  g.scale.setScalar(scale);
  return g;
}

const up = new THREE.Vector3(0, 1, 0);
const screwObjs = [];
const pickList = [];
function placeScrew(def, scale, pick) {
  let pos = def.pos.slice();
  let normal = def.normal.slice();
  if (def.part.startsWith('fin')) {
    const ang = Math.atan2(def.pos[0], def.pos[2]);
    const tx = -Math.cos(ang);
    const tz = Math.sin(ang);
    pos = [def.pos[0] + tx * 0.1, def.pos[1], def.pos[2] + tz * 0.1];
    normal = [tx, 0.2, tz];
  }
  const n = new THREE.Vector3().fromArray(normal).normalize();
  const mesh = makeScrew(def.color, scale);
  const p = new THREE.Vector3().fromArray(pos).addScaledVector(n, 0.05);
  mesh.position.copy(p);
  mesh.quaternion.setFromUnitVectors(up, n);
  bob.add(mesh);
  if (pick) {
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    sphere.position.copy(mesh.position);
    sphere.userData.screw = pick.index;
    bob.add(sphere);
    pickList.push(sphere);
    screwObjs.push(mesh);
  }
  return mesh;
}
PUZZLE.screws.forEach((s, i) => placeScrew({ ...s }, 1, { index: i }));
for (let i = 0; i < 8; i++) {
  const a = i / 8 * Math.PI * 2 + 0.3;
  const colors = ['pink', 'yellow', 'lime', 'cyan'];
  placeScrew({
    part: 'pad', color: colors[i % 4],
    pos: [Math.sin(a) * 1.05, 0.07, Math.cos(a) * 1.05],
    normal: [0, 1, 0],
  }, 0.72, null);
}

const starMat = new THREE.SpriteMaterial({ map: starTex(), transparent: true, depthWrite: false, opacity: 0.85 });
const stars = [];
for (let i = 0; i < 16; i++) {
  const s = new THREE.Sprite(starMat);
  const a = Math.random() * Math.PI * 2;
  const r = 1.6 + Math.random() * 1.8;
  s.position.set(Math.sin(a) * r, 0.4 + Math.random() * 2.6, Math.cos(a) * r);
  const sc = 0.12 + Math.random() * 0.16;
  s.scale.set(sc, sc, sc);
  s.userData.phase = Math.random() * Math.PI * 2;
  scene.add(s);
  stars.push(s);
}

let state = createState();
const solution = solve();
if (!solution) errors.push('puzzle has no solution');

const ray = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let ptr = null;
let previewIds = [];
let returnAt = 0;
let won = false;
let launching = false;
const flies = [];
const motes = [];
let shake = 0;
const camBase = new THREE.Vector3();
let tipTimer = 0;

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
    if (m.material.userData.baseOpacity == null) m.material.userData.baseOpacity = m.material.opacity;
    m.material.transparent = o < 0.98 || m.material.userData.baseOpacity < 0.98;
    m.material.opacity = m.material.userData.baseOpacity * o;
    m.material.depthWrite = o > 0.9 && m.material.userData.baseOpacity > 0.9;
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
  const ndc = new THREE.Vector3(x, y, 0.4).unproject(camera);
  const dir = ndc.sub(camera.position);
  const dist = Math.min(5.5, dir.length());
  return camera.position.clone().add(dir.normalize().multiplyScalar(dist));
}

function flyScrew(mesh, el) {
  const start = mesh.position.clone();
  const end = uiTarget(el);
  const mid = start.clone().lerp(end, 0.45);
  mid.y += 0.9;
  const t0 = performance.now();
  flies.push({ mesh, start, mid, end, t0 });
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
  shake = Math.max(shake, 0.25);
}
function applyResult(index, res, animate) {
  const mesh = screwObjs[index];
  if (!animate) {
    mesh.visible = false;
    res.fell.forEach(hidePart);
  } else {
    const el = res.dest === 'box'
      ? boxesEl.children[res.k]?.querySelectorAll('.hole')[res.slot]
      : slotsEl.children[res.k];
    if (el) flyScrew(mesh, el);
    else mesh.visible = false;
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
  core.position.set(0, 0, 0);
  winEl.classList.remove('show');
  document.getElementById('bannerText').textContent = '点彩色螺丝，拆开火箭';
  screwObjs.forEach(m => { m.visible = true; m.scale.setScalar(1); m.userData.base && m.position.copy(m.userData.base); });
  // positions were set at build; flying may have moved them. Store once.
  Object.values(parts).forEach(p => {
    p.gone = false;
    p.falling = null;
    p.obj.visible = true;
    p.obj.position.copy(p.base);
    p.obj.rotation.set(0, p.obj.rotation.y, 0);
    p.obj.scale.setScalar(1);
    p.obj.traverse(m => {
      if (!m.material) return;
      const base = m.material.userData.baseOpacity;
      if (base != null) m.material.opacity = base;
      m.material.transparent = (base != null ? base : m.material.opacity) < 0.98;
      m.material.depthWrite = !m.material.transparent;
    });
  });
  flies.length = 0;
  renderHUD();
}
screwObjs.forEach(m => { m.userData.base = m.position.clone(); });

function jumpTo(n) {
  resetAll();
  const limit = Math.max(0, Math.min(n, solution.length));
  for (let s = 0; s < limit; s++) {
    const res = doMove(state, solution[s]);
    if (!res) throw new Error('move failed at ' + s);
    screwObjs[solution[s]].visible = false;
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

function frame() {
  const w = view.clientWidth || 1;
  const h = view.clientHeight || 1;
  camera.aspect = w / h;
  camera.fov = 30;
  const dist = 6.45;
  const yaw = -0.58;
  const pitch = 0.42;
  const target = new THREE.Vector3(0, 1.28, 0);
  camBase.set(
    target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
    target.y + Math.sin(pitch) * dist,
    target.z + Math.cos(yaw) * Math.cos(pitch) * dist
  );
  camera.position.copy(camBase);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(w, h, false);
}
addEventListener('resize', frame);
frame();
spin.rotation.y = HOME_YAW;
renderHUD();

function pick(e) {
  const r = view.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  ray.setFromCamera(pointer, camera);
  const hits = ray.intersectObjects(pickList, false);
  return hits.length ? hits[0].object.userData.screw : -1;
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

const clock = new THREE.Clock();
let tAll = 0;
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(0.033, clock.getDelta());
  tAll += dt;
  const now = performance.now();
  if (!ptr && now > returnAt && !launching) {
    spin.rotation.y += (HOME_YAW - spin.rotation.y) * 0.04;
    spin.rotation.x += (0 - spin.rotation.x) * 0.05;
  }
  bob.position.y = Math.sin(tAll * 1.5) * 0.028;
  flame.scale.y = 0.85 + Math.sin(tAll * 18) * 0.18;
  flameCore.scale.y = 0.8 + Math.sin(tAll * 22 + 1) * 0.2;
  nozzleLight.intensity = 0.75 + Math.sin(tAll * 16) * 0.25;
  stars.forEach(s => { s.material.opacity = 0.45 + Math.sin(tAll * 2.2 + s.userData.phase) * 0.4; });
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
    f.mesh.rotateY(0.35);
    f.mesh.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.2);
    if (i % 1 === 0 && Math.random() < 0.7) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 0.8, toneMapped: false }));
      m.position.copy(f.mesh.position);
      scene.add(m);
      motes.push(m);
    }
    if (t >= 1) {
      f.mesh.visible = false;
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
    p.obj.rotation.z += dt * 2.2;
    p.obj.rotation.x += dt;
    const fade = 1 - e;
    p.obj.traverse(m => { if (m.material) { m.material.transparent = true; m.material.opacity = fade; m.material.depthWrite = false; } });
    if (p.falling >= 1) p.obj.visible = false;
  });
  if (launching) {
    core.position.y += dt * (1.2 + core.position.y * 0.8);
    flame.scale.y = 1.4 + Math.sin(tAll * 30) * 0.3;
  }
  if (shake > 0) {
    shake = Math.max(0, shake - dt);
    camera.position.copy(camBase).add(new THREE.Vector3((Math.random() - 0.5) * shake * 0.15, (Math.random() - 0.5) * shake * 0.1, 0));
  } else camera.position.copy(camBase);
  if (tipTimer && now > tipTimer) { tipEl.classList.remove('show'); tipTimer = 0; }
  renderer.render(scene, camera);
}
tick();

window.__demo = {
  ready: true,
  errors,
  solution,
  get won() { return won; },
  get left() { return state.removed.filter(r => !r).length; },
  jumpTo(n) { jumpTo(n); renderer.render(scene, camera); return { left: state.removed.filter(r => !r).length, won }; },
  preview(i) { startPreview(i); return previewIds.slice(); },
  clearPreview() { endPreview(); return true; },
  launch() { startLaunch(); return true; },
};
if (errors.length) {
  errEl.style.display = 'block';
  errEl.textContent = errors.join('\n');
}
