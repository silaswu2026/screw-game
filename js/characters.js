// Clean chibi characters. Smooth lathe / capsule silhouettes and drawn faces.
// Not stacked boxes, and not a marching-cubes blob. Anchors stay in models.js.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const cache = new Map();

function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function wrapCute(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float formUp = clamp(vNormal.y * 0.62 + 0.46, 0.0, 1.0);
         float formFace = clamp(-vNormal.z, 0.0, 1.0);
         diffuseColor.rgb *= mix(0.62, 1.16, formUp);
         diffuseColor.rgb *= mix(0.90, 1.10, formFace);`
      )
      .replaceAll(
        'float dotNL = saturate( dot( normal, lightDir ) );',
        'float dotNL = saturate( ( dot( normal, lightDir ) + 0.5 ) / 1.5 );'
      );
  };
  return mat;
}

function plush(color) {
  return wrapCute(new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.38,
    metalness: 0,
    clearcoat: 0.28,
    clearcoatRoughness: 0.42,
    sheen: 0.32,
    sheenRoughness: 0.58,
    sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xfff8f2), 0.7),
    envMapIntensity: 0.42,
  }));
}
function paint(color, opts = {}) {
  return wrapCute(new THREE.MeshPhysicalMaterial({
    color,
    roughness: opts.roughness ?? 0.28,
    metalness: opts.metalness ?? 0.04,
    clearcoat: opts.clearcoat ?? 0.72,
    clearcoatRoughness: opts.clearcoatRoughness ?? 0.18,
    sheen: opts.sheen ?? 0.12,
    sheenRoughness: 0.4,
    sheenColor: new THREE.Color(0xfff8f2),
    envMapIntensity: opts.env ?? 1.0,
    emissive: new THREE.Color(opts.emissive ?? 0x000000),
    emissiveIntensity: opts.ei ?? 0,
  }));
}
function glass(color, transmission = 0.82) {
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.05, metalness: 0, transmission, thickness: 0.45,
    ior: 1.45, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true,
    envMapIntensity: 1.15,
  });
}

function lathe(profile, segs = 72) {
  const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.001), y)), segs);
  geo.computeVertexNormals();
  geo.userData.shared = true;
  return geo;
}
function deform(geo, fn) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const o = fn(p.getX(i), p.getY(i), p.getZ(i));
    p.setXYZ(i, o[0], o[1], o[2]);
  }
  geo.computeVertexNormals();
  return geo;
}
function addOutline(parent, geo, color, thickness = 0.011) {
  const g = geo.clone();
  g.userData.shared = true;
  const p = g.attributes.position;
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i,
      p.getX(i) + n.getX(i) * thickness,
      p.getY(i) + n.getY(i) * thickness,
      p.getZ(i) + n.getZ(i) * thickness);
  }
  const o = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    color, side: THREE.BackSide, toneMapped: false, depthWrite: false,
  }));
  o.userData.noShadow = true;
  o.castShadow = false;
  o.receiveShadow = false;
  parent.add(o);
  return o;
}
function addMesh(parent, geo, mat, outline) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  if (outline) addOutline(parent, geo, outline, 0.012);
  return m;
}

const irisCache = new Map();
function irisTexture(hex) {
  const key = String(hex);
  if (irisCache.has(key)) return irisCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const base = new THREE.Color(hex);
  const deep = base.clone().multiplyScalar(0.42);
  const mid = base.clone().lerp(new THREE.Color(0xffe7c4), 0.38);
  const ring = base.clone().multiplyScalar(0.28);
  const grd = ctx.createRadialGradient(128, 122, 8, 128, 128, 124);
  grd.addColorStop(0, '#120e0c');
  grd.addColorStop(0.16, '#' + deep.getHexString());
  grd.addColorStop(0.34, '#' + mid.getHexString());
  grd.addColorStop(0.62, '#' + base.getHexString());
  grd.addColorStop(0.84, '#' + deep.getHexString());
  grd.addColorStop(1, '#' + ring.getHexString());
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 256, 256);
  ctx.globalAlpha = 0.28;
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    ctx.strokeStyle = i % 2 ? '#fff6ea' : '#3a2418';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(128 + Math.cos(a) * 36, 128 + Math.sin(a) * 36);
    ctx.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  irisCache.set(key, tex);
  return tex;
}
let blushMap;
function blushTexture() {
  if (blushMap) return blushMap;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 68, 6, 64, 64, 60);
  g.addColorStop(0, 'rgba(255, 112, 138, 0.9)');
  g.addColorStop(0.45, 'rgba(255, 140, 158, 0.5)');
  g.addColorStop(1, 'rgba(255, 150, 166, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  blushMap = new THREE.CanvasTexture(c);
  blushMap.colorSpace = THREE.SRGBColorSpace;
  return blushMap;
}

function makeEye(r, iris) {
  const g = new THREE.Group();
  const white = new THREE.Mesh(
    new THREE.SphereGeometry(r, 36, 26),
    new THREE.MeshPhysicalMaterial({
      color: 0xfffdf8, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.08,
      metalness: 0, envMapIntensity: 0.85,
    })
  );
  white.scale.set(1.02, 1.2, 0.58);
  g.add(white);
  const front = r * 0.6;
  const irisM = new THREE.Mesh(
    new THREE.CircleGeometry(r * 0.56, 40),
    new THREE.MeshBasicMaterial({ map: irisTexture(iris), toneMapped: true })
  );
  irisM.position.z = front;
  g.add(irisM);
  const pupil = new THREE.Mesh(
    new THREE.CircleGeometry(r * 0.24, 24),
    new THREE.MeshBasicMaterial({ color: 0x1a120e, toneMapped: false })
  );
  pupil.scale.set(0.82, 1.18, 1);
  pupil.position.z = front + 0.003;
  g.add(pupil);
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const h1 = new THREE.Mesh(new THREE.CircleGeometry(r * 0.15, 16), shine);
  h1.position.set(r * 0.15, r * 0.16, front + 0.006);
  g.add(h1);
  const h2 = new THREE.Mesh(new THREE.CircleGeometry(r * 0.055, 10), shine);
  h2.position.set(-r * 0.13, -r * 0.07, front + 0.006);
  g.add(h2);
  const lid = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-r * 0.95, r * 0.18, front * 0.72),
    new THREE.Vector3(0, r * 0.72, front * 0.95),
    new THREE.Vector3(r * 0.95, r * 0.18, front * 0.72)
  );
  const lidM = new THREE.Mesh(
    new THREE.TubeGeometry(lid, 14, Math.max(0.01, r * 0.05), 5, false),
    new THREE.MeshBasicMaterial({ color: 0x5a301c, toneMapped: false })
  );
  g.add(lidM);
  g.traverse(o => { o.castShadow = false; o.receiveShadow = false; o.userData.noShadow = true; });
  return g;
}
function blush(parent, x, y, z, s = 0.1) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(s * 2.6, s * 1.45),
    new THREE.MeshBasicMaterial({
      map: blushTexture(), transparent: true, depthWrite: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -2,
    })
  );
  m.position.set(x, y, z);
  m.userData.noShadow = true;
  parent.add(m);
}
function whiskers(parent, x, y, z, s) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xd8b4a2, toneMapped: false });
  for (const dy of [-0.045, 0.012, 0.07]) {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(s * 0.18, dy * 0.35, 0.03),
      new THREE.Vector3(s * 0.36, dy, -0.01)
    );
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.012, 4, false), mat);
    m.position.set(x, y, z);
    m.userData.noShadow = true;
    parent.add(m);
  }
}
function pointedEar(outerMat, innerMat) {
  const g = new THREE.Group();
  const outer = deform(lathe([
    [0.012, 0.50], [0.05, 0.40], [0.10, 0.24], [0.17, 0.08], [0.19, -0.02], [0.11, -0.10],
  ], 22), (x, y, z) => [x * 0.76, y, z * 0.36]);
  const shell = new THREE.Mesh(outer, outerMat);
  shell.castShadow = true;
  g.add(shell);
  const inner = deform(lathe([
    [0.008, 0.28], [0.038, 0.18], [0.075, 0.05], [0.08, -0.02],
  ], 16), (x, y, z) => [x * 0.7, y, z * 0.3]);
  const pad = new THREE.Mesh(inner, innerMat);
  pad.scale.set(1.4, 1.28, 1);
  pad.position.set(0, -0.015, 0.05);
  g.add(pad);
  return g;
}
function noseGem(parent, x, y, z, color, s = 0.06) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(s, 18, 14),
    paint(color, { roughness: 0.28, clearcoat: 0.75, clearcoatRoughness: 0.16, sheen: 0.12 })
  );
  m.scale.set(1.22, 0.78, 0.72);
  m.position.set(x, y, z);
  parent.add(m);
  const h = new THREE.Mesh(
    new THREE.SphereGeometry(s * 0.2, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff8f4, toneMapped: false })
  );
  h.position.set(x + s * 0.12, y + s * 0.16, z + s * 0.5);
  h.userData.noShadow = true;
  parent.add(h);
}
let glossMap;
function glossTexture() {
  if (glossMap) return glossMap;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 78, 6, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glossMap = new THREE.CanvasTexture(c);
  return glossMap;
}
function foreheadGloss(parent, x, y, z, w = 0.46, h = 0.24) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      map: glossTexture(), transparent: true, depthWrite: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -1,
    })
  );
  m.position.set(x, y, z);
  m.userData.noShadow = true;
  parent.add(m);
}
function smile(parent, x, y, z, w, color = 0x6a4038) {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-w, 0, 0),
    new THREE.Vector3(0, -w * 0.72, w * 0.15),
    new THREE.Vector3(w, 0, 0)
  );
  const m = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 16, Math.max(0.012, w * 0.07), 6, false),
    new THREE.MeshBasicMaterial({ color, toneMapped: false })
  );
  m.position.set(x, y, z);
  m.userData.noShadow = true;
  parent.add(m);
}

function buildCat() {
  const g = new THREE.Group();
  const fur = plush(0xe8894c);
  const cream = plush(0xfff6ec);
  const pink = plush(0xff8aa3);
  const geo = deform(lathe([
    [0.02, 1.58], [0.32, 1.50], [0.58, 1.30], [0.76, 1.02],
    [0.78, 0.78], [0.60, 0.52], [0.48, 0.36], [0.66, 0.16],
    [0.90, -0.08], [0.98, -0.38], [0.84, -0.72], [0.50, -1.00],
    [0.22, -1.14], [0.02, -1.20],
  ], 80), (x, y, z) => {
    x *= 1.06;
    z *= 0.76;
    z += smoothstep(0.42, 1.05, y) * 0.24;
    const cheek = Math.exp(-((y - 0.78) ** 2) / 0.05) * Math.exp(-((Math.abs(x) - 0.38) ** 2) / 0.05);
    if (z > 0) z += cheek * 0.07;
    return [x, y, z];
  });
  addMesh(g, geo, fur);

  for (const s of [-1, 1]) {
    const ear = pointedEar(fur, pink);
    ear.position.set(s * 0.46, 1.38, 0.06);
    ear.rotation.z = s * -0.22;
    ear.rotation.x = -0.1;
    g.add(ear);
  }
  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.64, 0.042, 12, 40),
    paint(0xd24b6e, { roughness: 0.32, clearcoat: 0.55, sheen: 0.1 })
  );
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 0.48, 0.06);
  g.add(collar);
  const bell = new THREE.Mesh(
    new THREE.SphereGeometry(0.095, 18, 14),
    paint(0xffd56a, { roughness: 0.18, metalness: 0.72, clearcoat: 0.85, sheen: 0 })
  );
  bell.scale.set(1, 0.84, 0.86);
  bell.position.set(0, 0.36, 0.68);
  g.add(bell);
  const slit = new THREE.Mesh(
    new THREE.BoxGeometry(0.016, 0.1, 0.02),
    new THREE.MeshBasicMaterial({ color: 0x6a4818, toneMapped: false })
  );
  slit.position.set(0, 0.34, 0.76);
  slit.userData.noShadow = true;
  g.add(slit);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.46, 28, 20), cream);
  belly.scale.set(1.05, 1.2, 0.42);
  belly.position.set(0, -0.28, 0.52);
  belly.castShadow = true;
  g.add(belly);

  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.3, 28, 20), cream);
  muzzle.scale.set(1.4, 0.82, 0.72);
  muzzle.position.set(0, 0.64, 0.8);
  g.add(muzzle);

  for (const s of [-1, 1]) {
    const e = makeEye(0.2, 0xc47a38);
    e.position.set(s * 0.3, 1.0, 0.74);
    e.rotation.y = s * -0.08;
    g.add(e);
    whiskers(g, s * 0.34, 0.66, 0.9, s);
  }
  noseGem(g, 0, 0.74, 0.96, 0xff7f98, 0.058);
  smile(g, 0, 0.60, 0.94, 0.08, 0x7a4a40);
  blush(g, -0.46, 0.78, 0.78, 0.11);
  blush(g, 0.46, 0.78, 0.78, 0.11);
  foreheadGloss(g, 0, 1.22, 0.72, 0.5, 0.26);

  // short arms and feet, same fur, so the body reads as a plush not a turnip
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.28, 6, 16), fur);
    arm.position.set(s * 0.92, -0.05, 0.18);
    arm.rotation.z = s * 0.9;
    arm.castShadow = true;
    g.add(arm);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), cream);
    paw.position.set(s * 1.02, -0.28, 0.28);
    g.add(paw);
    for (const [dx, dy] of [[0, 0.04], [-0.045, -0.02], [0.045, -0.02]]) {
      const bean = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), pink);
      bean.scale.set(1, 0.7, 0.55);
      bean.position.set(s * 1.02 + dx * s, -0.30 + dy, 0.38);
      g.add(bean);
    }
    for (const z of [0.22, -0.16]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.22, 4, 12), fur);
      leg.position.set(s * 0.40, -1.12, z);
      leg.castShadow = true;
      g.add(leg);
    }
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), cream);
    foot.position.set(s * 0.40, -1.28, 0.26);
    foot.scale.set(1.1, 0.7, 1.2);
    g.add(foot);
  }
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.05, -0.35, -0.48),
    new THREE.Vector3(0.32, -0.05, -0.78),
    new THREE.Vector3(0.12, 0.32, -0.88),
    new THREE.Vector3(-0.08, 0.55, -0.7),
  ]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 24, 0.075, 8, false), fur);
  tail.castShadow = true;
  g.add(tail);
  return g;
}

function buildBear() {
  const g = new THREE.Group();
  const fur = plush(0xb87348);
  const cream = plush(0xfff1df);
  const geo = deform(lathe([
    [0.02, 1.62], [0.36, 1.52], [0.66, 1.28], [0.80, 0.98],
    [0.78, 0.70], [0.58, 0.48], [0.62, 0.28], [0.88, 0.02],
    [0.96, -0.32], [0.82, -0.70], [0.48, -1.02], [0.16, -1.16], [0.02, -1.22],
  ], 80), (x, y, z) => {
    x *= 1.08;
    z *= 0.8;
    z += smoothstep(0.4, 1.05, y) * 0.16;
    return [x, y, z];
  });
  addMesh(g, geo, fur);

  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.24, 28, 20), fur);
    ear.scale.set(1.05, 0.72, 0.55);
    ear.position.set(s * 0.52, 1.5, 0.06);
    ear.castShadow = true;
    g.add(ear);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 14), plush(0xf0a090));
    inner.scale.set(1.05, 0.9, 0.42);
    inner.position.set(s * 0.52, 1.48, 0.18);
    g.add(inner);
  }
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.36, 28, 20), cream);
  snout.scale.set(1.2, 0.78, 0.8);
  snout.position.set(0, 0.7, 0.66);
  g.add(snout);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 18), cream);
  belly.scale.set(1.05, 1.15, 0.4);
  belly.position.set(0, -0.28, 0.5);
  g.add(belly);

  for (const s of [-1, 1]) {
    const e = makeEye(0.17, 0x7a5340);
    e.position.set(s * 0.28, 1.05, 0.78);
    g.add(e);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.26, 5, 14), fur);
    arm.position.set(s * 0.86, -0.02, 0.16);
    arm.rotation.z = s * 0.7;
    arm.castShadow = true;
    g.add(arm);
    for (const z of [0.2, -0.16]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.2, 4, 12), fur);
      leg.position.set(s * 0.38, -1.12, z);
      leg.castShadow = true;
      g.add(leg);
    }
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), cream);
    foot.scale.set(1.15, 0.65, 1.2);
    foot.position.set(s * 0.38, -1.28, 0.24);
    g.add(foot);
  }
  noseGem(g, 0, 0.78, 0.9, 0x4a342c, 0.085);
  smile(g, 0, 0.62, 0.86, 0.1, 0x5a4038);
  blush(g, -0.42, 0.82, 0.66, 0.1);
  blush(g, 0.42, 0.82, 0.66, 0.1);
  foreheadGloss(g, 0, 1.28, 0.7, 0.48, 0.22);
  return g;
}

function buildRobot() {
  const g = new THREE.Group();
  const mint = paint(0x7ed4c6, { roughness: 0.32, clearcoat: 0.55, sheen: 0.15 });
  const dark = paint(0x445868, { roughness: 0.4, metalness: 0.35, clearcoat: 0.3, sheen: 0 });
  const yellow = paint(0xffc15e, { roughness: 0.35, clearcoat: 0.45, sheen: 0.1 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 0.72, 10, 28), mint);
  body.position.y = -0.18;
  body.castShadow = true;
  g.add(body);

  const chest = new THREE.Mesh(
    new RoundedBoxGeometry(0.42, 0.34, 0.06, 3, 0.05),
    paint(0xd8f7f1, { roughness: 0.26, clearcoat: 0.6, sheen: 0.08, metalness: 0.08 })
  );
  chest.position.set(0, 0.02, 0.58);
  g.add(chest);
  const gem = new THREE.Mesh(
    new THREE.CircleGeometry(0.055, 20),
    new THREE.MeshBasicMaterial({ color: 0xffc15e, toneMapped: false })
  );
  gem.position.set(0, 0.02, 0.62);
  gem.userData.noShadow = true;
  g.add(gem);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.52, 36, 28), mint);
  head.scale.set(1.08, 0.92, 0.98);
  head.position.y = 1.16;
  head.castShadow = true;
  g.add(head);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.07, 12, 28), dark);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.68;
  g.add(collar);

  const visor = new THREE.Mesh(new RoundedBoxGeometry(0.78, 0.32, 0.12, 4, 0.1), glass(0x102830, 0.45));
  visor.position.set(0, 1.18, 0.46);
  g.add(visor);
  const bezel = new THREE.Mesh(
    new THREE.TorusGeometry(0.46, 0.018, 8, 32),
    paint(0xe7eef2, { roughness: 0.22, metalness: 0.62, clearcoat: 0.55, sheen: 0 })
  );
  bezel.position.set(0, 1.18, 0.52);
  g.add(bezel);
  for (const x of [-0.18, 0.18]) {
    const e = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 16, 12),
      new THREE.MeshPhysicalMaterial({
        color: 0xe9fdff, emissive: 0x7ef6ff, emissiveIntensity: 1.6, roughness: 0.15, clearcoat: 1,
      })
    );
    e.scale.set(1.15, 1.05, 0.45);
    e.position.set(x, 1.18, 0.54);
    g.add(e);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.105, 0.012, 6, 20),
      paint(0xd5e2ea, { roughness: 0.2, metalness: 0.7, clearcoat: 0.5, sheen: 0 })
    );
    ring.position.set(x, 1.18, 0.545);
    g.add(ring);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    h.position.set(x + 0.03, 1.21, 0.56);
    h.userData.noShadow = true;
    g.add(h);
  }
  const mouth = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.04, 0.03, 2, 0.015), new THREE.MeshBasicMaterial({ color: 0xffb35c, toneMapped: false }));
  mouth.position.set(0, 0.96, 0.52);
  g.add(mouth);

  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.46, 6, 14), yellow);
    arm.position.set(s * 0.86, 0.02, 0.04);
    arm.rotation.z = s * 0.55;
    arm.castShadow = true;
    g.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), yellow);
    hand.position.set(s * 1.12, -0.22, 0.08);
    g.add(hand);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.36, 5, 14), dark);
    leg.position.set(s * 0.28, -1.05, 0.04);
    leg.castShadow = true;
    g.add(leg);
    const foot = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.16, 0.46, 3, 0.06), dark);
    foot.position.set(s * 0.28, -1.36, 0.08);
    g.add(foot);
  }
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.42, 10), dark);
  ant.position.set(0.28, 1.82, -0.04);
  ant.rotation.z = -0.25;
  g.add(ant);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 14, 12),
    new THREE.MeshPhysicalMaterial({ color: 0xff6d62, emissive: 0xff4455, emissiveIntensity: 0.8, roughness: 0.3, clearcoat: 0.6 })
  );
  bulb.position.set(0.34, 2.04, -0.06);
  g.add(bulb);
  return g;
}

function wheel(x, z) {
  const grp = new THREE.Group();
  grp.position.set(x, -0.78, z);
  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.38, 0.22, 32),
    new THREE.MeshPhysicalMaterial({ color: 0x2a2a30, roughness: 0.78, metalness: 0.04, clearcoat: 0.1 })
  );
  tire.rotation.x = Math.PI / 2;
  tire.castShadow = true;
  grp.add(tire);
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.24, 24),
    paint(0xf7f8fb, { roughness: 0.25, metalness: 0.55, clearcoat: 0.6, sheen: 0 })
  );
  rim.rotation.x = Math.PI / 2;
  grp.add(rim);
  const hub = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.016, 8, 18), paint(0xffd54a, { metalness: 0.55, clearcoat: 0.8, sheen: 0 }));
  hub.position.z = Math.sign(z) * 0.13;
  grp.add(hub);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), paint(0xfff6d0, { metalness: 0.35, clearcoat: 0.7, sheen: 0 }));
  cap.position.z = Math.sign(z) * 0.14;
  grp.add(cap);
  return grp;
}

function buildCar() {
  const g = new THREE.Group();
  const bodyMat = paint(0xff7348, { roughness: 0.22, clearcoat: 0.9, clearcoatRoughness: 0.12, sheen: 0.05, metalness: 0.06 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(2.55, 0.62, 1.32, 8, 0.26), bodyMat);
  body.position.set(0.05, -0.4, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new RoundedBoxGeometry(1.28, 0.62, 1.12, 6, 0.16), bodyMat);
  cabin.position.set(-0.18, 0.22, 0);
  cabin.castShadow = true;
  g.add(cabin);
  const belt = new THREE.Mesh(
    new RoundedBoxGeometry(2.32, 0.04, 1.36, 3, 0.018),
    paint(0xfff4ea, { roughness: 0.18, metalness: 0.72, clearcoat: 0.85, sheen: 0 })
  );
  belt.position.set(0.05, -0.22, 0);
  g.add(belt);
  const win = new THREE.Mesh(new RoundedBoxGeometry(1.02, 0.36, 0.98, 4, 0.08), glass(0xd4f2ff, 0.8));
  win.position.set(-0.16, 0.26, 0);
  g.add(win);
  for (const z of [-0.42, 0.42]) {
    const lamp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.08, 20),
      new THREE.MeshPhysicalMaterial({ color: 0xfff6d0, emissive: 0xffe29a, emissiveIntensity: 0.65, roughness: 0.2, clearcoat: 1 })
    );
    lamp.rotation.z = Math.PI / 2;
    lamp.position.set(1.32, -0.32, z);
    g.add(lamp);
    const tail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.06, 16),
      new THREE.MeshPhysicalMaterial({ color: 0xff4d55, emissive: 0xff3344, emissiveIntensity: 0.5, roughness: 0.3, clearcoat: 0.7 })
    );
    tail.rotation.z = Math.PI / 2;
    tail.position.set(-1.22, -0.32, z);
    g.add(tail);
  }
  for (const x of [-0.92, 0.95]) for (const z of [-0.74, 0.74]) g.add(wheel(x, z));
  return g;
}

function cakeTier(radius, height, color) {
  const h = height / 2;
  const geo = lathe([
    [0.01, h],
    [radius * 0.55, h + 0.02],
    [radius * 0.9, h],
    [radius * 1.02, h - 0.06],
    [radius, h * 0.2],
    [radius * 0.98, -h + 0.08],
    [radius * 0.82, -h],
    [0.01, -h],
  ], 64);
  return new THREE.Mesh(geo, paint(color, { roughness: 0.38, clearcoat: 0.4, sheen: 0.7, clearcoatRoughness: 0.3 }));
}

function dripGeo() {
  return lathe([
    [0.008, 0.11], [0.04, 0.07], [0.062, 0.01], [0.048, -0.06], [0.016, -0.12], [0.006, -0.14],
  ], 14);
}

function buildCake() {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.26, 0.08, 48), paint(0xfffaf4, { roughness: 0.3, clearcoat: 0.45, sheen: 0.2 }));
  plate.position.y = -1.28;
  plate.receiveShadow = true;
  g.add(plate);
  const tiers = [
    [1.05, 0.82, -0.78, 0xfff3e0],
    [0.76, 0.7, 0.08, 0xffc9d8],
    [0.46, 0.48, 0.74, 0xc48460],
  ];
  tiers.forEach(([r, h, y, c], i) => {
    const m = cakeTier(r, h, c);
    m.position.y = y;
    m.castShadow = true;
    g.add(m);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + i * 0.4;
      const d = new THREE.Mesh(dripGeo(), paint(c, { roughness: 0.32, sheen: 0.55, clearcoat: 0.35 }));
      d.position.set(Math.cos(a) * r * 0.9, y + h * 0.48, Math.sin(a) * r * 0.9);
      d.scale.setScalar(0.85 + (k % 3) * 0.08);
      g.add(d);
    }
    if (i === 1) {
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + 0.3;
        const pearl = new THREE.Mesh(
          new THREE.SphereGeometry(0.032, 12, 10),
          paint(0xfffaf6, { roughness: 0.14, clearcoat: 0.95, metalness: 0.04, sheen: 0.15 })
        );
        pearl.position.set(Math.cos(a) * (r + 0.02), y - h * 0.22, Math.sin(a) * (r + 0.02));
        g.add(pearl);
      }
    }
  });
  const cherry = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 16), paint(0xff4d68, { roughness: 0.25, clearcoat: 0.9, sheen: 0.15, emissive: 0xff3358, ei: 0.1 }));
  cherry.position.set(0, 1.12, 0.02);
  cherry.castShadow = true;
  g.add(cherry);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.26, 8), paint(0x3d8f48, { roughness: 0.5, clearcoat: 0.2, sheen: 0.15 }));
  stem.position.set(0.03, 1.32, 0);
  stem.rotation.z = -0.45;
  g.add(stem);
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), paint(0x67b56a, { roughness: 0.4, sheen: 0.3, clearcoat: 0.25 }));
  leaf.scale.set(1.8, 0.4, 0.7);
  leaf.position.set(0.12, 1.42, 0);
  leaf.rotation.z = -0.5;
  g.add(leaf);
  return g;
}

function buildPopsicle() {
  const g = new THREE.Group();
  const w = 1.42, h = 2.0, rad = 0.48;
  const shape = new THREE.Shape();
  const hw = w / 2, hh = h / 2;
  shape.moveTo(-hw + rad, -hh);
  shape.lineTo(hw - rad, -hh);
  shape.absarc(hw - rad, -hh + rad, rad, -Math.PI / 2, 0, false);
  shape.lineTo(hw, hh - rad);
  shape.absarc(hw - rad, hh - rad, rad, 0, Math.PI / 2, false);
  shape.lineTo(-hw + rad, hh);
  shape.absarc(-hw + rad, hh - rad, rad, Math.PI / 2, Math.PI, false);
  shape.lineTo(-hw, -hh + rad);
  shape.absarc(-hw + rad, -hh + rad, rad, Math.PI, Math.PI * 1.5, false);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.36, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.12, bevelSegments: 8, curveSegments: 16,
  });
  geo.translate(0, 0, -0.32);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const bands = [[0, 0x7dcebb], [0.3, 0xffe3a3], [0.46, 0x7dcebb], [0.64, 0xffb4c6], [0.8, 0x6ec4b0]];
  let yMin = 1e9, yMax = -1e9;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - yMin) / (yMax - yMin || 1);
    let hex = bands[0][1];
    for (const b of bands) if (t >= b[0]) hex = b[1];
    const c = new THREE.Color(hex);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.userData.shared = true;
  const mat = paint(0xffffff, { roughness: 0.18, clearcoat: 0.85, clearcoatRoughness: 0.1, sheen: 0.2, metalness: 0.02 });
  mat.vertexColors = true;
  const mesh = addMesh(g, geo, mat);
  mesh.position.y = 0.32;
  const stick = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.1, 0.78, 5, 12),
    new THREE.MeshPhysicalMaterial({ color: 0xe4b57e, roughness: 0.7, clearcoat: 0.06, sheen: 0.15, sheenColor: new THREE.Color(0xf3d7b0) })
  );
  stick.position.set(0, -1.18, 0);
  stick.castShadow = true;
  g.add(stick);
  return g;
}

function buildRocket() {
  const g = new THREE.Group();
  const geo = lathe([
    [0.015, 2.05], [0.16, 1.92], [0.38, 1.68], [0.54, 1.38],
    [0.58, 1.1], [0.57, 0.2], [0.58, -0.45], [0.5, -0.95],
    [0.34, -1.22], [0.22, -1.34], [0.015, -1.38],
  ], 64);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const white = new THREE.Color(0xfff7f2), red = new THREE.Color(0xff6a60), band = new THREE.Color(0x8b78ff);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const c = y > 1.28 ? red : (y > 0.42 && y < 0.58) ? band : white;
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = paint(0xffffff, { roughness: 0.26, clearcoat: 0.75, sheen: 0.12 });
  mat.vertexColors = true;
  addMesh(g, geo, mat);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 8, 24), paint(0x5c6d80, { metalness: 0.45, clearcoat: 0.4, sheen: 0 }));
  ring.position.set(0, 0.28, 0.55);
  g.add(ring);
  const win = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), glass(0xc8f6ff, 0.75));
  win.scale.z = 0.5;
  win.position.set(0, 0.28, 0.55);
  g.add(win);
  const finShape = new THREE.Shape();
  finShape.moveTo(0.4, -0.25);
  finShape.lineTo(0.95, -1.12);
  finShape.quadraticCurveTo(0.7, -1.05, 0.46, -0.72);
  finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
  finGeo.translate(0, 0, -0.035);
  finGeo.userData.shared = true;
  const finMat = paint(0xff6a60, { roughness: 0.3, clearcoat: 0.55, sheen: 0.1 });
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(finGeo, finMat);
    f.rotation.y = i * Math.PI / 2;
    f.castShadow = true;
    g.add(f);
  }
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.18, 24), paint(0x4e5968, { metalness: 0.6, roughness: 0.38, clearcoat: 0.25, sheen: 0 }));
  nozzle.position.y = -1.32;
  g.add(nozzle);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 20), new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false }));
  flame.position.y = -1.64;
  flame.rotation.x = Math.PI;
  flame.userData.anim = 'flame';
  flame.userData.noShadow = true;
  g.add(flame);
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 14), new THREE.MeshBasicMaterial({ color: 0xfff3c4, toneMapped: false }));
  core.position.y = -1.58;
  core.rotation.x = Math.PI;
  core.userData.anim = 'flame';
  core.userData.noShadow = true;
  g.add(core);
  return g;
}

function buildUfo() {
  const g = new THREE.Group();
  const geo = lathe([
    [0.02, 0.34], [0.45, 0.30], [0.95, 0.22], [1.35, 0.16],
    [1.7, 0.06], [1.86, -0.01], [1.55, -0.08], [0.7, -0.14], [0.02, -0.16],
  ], 72);
  const mat = paint(0xd2ccff, { roughness: 0.26, clearcoat: 0.8, metalness: 0.06, sheen: 0.15 });
  addMesh(g, geo, mat);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.66, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2), glass(0xe7fbff, 0.88));
  dome.position.y = 0.16;
  g.add(dome);
  const pilot = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 16, 12),
    new THREE.MeshPhysicalMaterial({ color: 0xb6f5ae, emissive: 0x7ee07a, emissiveIntensity: 0.7, roughness: 0.35, clearcoat: 0.35 })
  );
  pilot.position.set(0, 0.42, 0.1);
  g.add(pilot);
  for (const x of [-0.06, 0.06]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0x163018, toneMapped: false }));
    e.position.set(x, 0.46, 0.26);
    g.add(e);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 12, 10),
      new THREE.MeshPhysicalMaterial({
        color: i % 2 ? 0xffd0e2 : 0xfff1c2,
        emissive: i % 2 ? 0xff7aa8 : 0xffd56a,
        emissiveIntensity: 0.65, roughness: 0.25, clearcoat: 0.7,
      })
    );
    lamp.position.set(Math.cos(a) * 1.7, 0.02, Math.sin(a) * 1.7);
    lamp.userData.anim = 'lamp';
    lamp.userData.phase = i;
    g.add(lamp);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.36, 4, 8), paint(0x8d86c9, { metalness: 0.2, clearcoat: 0.35, sheen: 0.05 }));
    leg.position.set(Math.cos(a) * 0.9, -0.36, Math.sin(a) * 0.9);
    g.add(leg);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), paint(0xffd56a, { emissive: 0xffc107, ei: 0.12, clearcoat: 0.6, sheen: 0 }));
    foot.position.set(Math.cos(a) * 0.9, -0.58, Math.sin(a) * 0.9);
    g.add(foot);
  }
  return g;
}

const builders = {
  cat: buildCat, bear: buildBear, robot: buildRobot, car: buildCar,
  cake: buildCake, popsicle: buildPopsicle, rocket: buildRocket, ufo: buildUfo,
};

export function buildCharacter(key) {
  if (!cache.has(key)) {
    const group = (builders[key] || builders.cat)();
    group.traverse(o => { if (o.geometry) o.geometry.userData.shared = true; });
    cache.set(key, group);
  }
  return cache.get(key).clone(true);
}
