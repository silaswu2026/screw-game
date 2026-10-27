// Original procedural characters. Organic shells (SDF / lathe / extrude),
// not stacked boxes. Anchors stay in models.js so screws still land.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { sculptMesh } from './sculpt.js';

const cache = new Map();
const geoCache = new Map();

function col(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}
const sph = (p, r, color, k = 0.16, blend = 0.09) => ({ t: 'sph', p, r, col: col(color), k, blend });
const ell = (p, r, color, k = 0.18, blend = 0.09) => ({ t: 'ell', p, r, col: col(color), k, blend });
const cap = (a, b, r, color, k = 0.16, blend = 0.09) => ({ t: 'cap', a, b, r, col: col(color), k, blend });
const subE = (p, r, k = 0.05) => ({ t: 'ell', p, r, k });

function cachedSculpt(name, desc) {
  if (!geoCache.has(name)) geoCache.set(name, sculptMesh(desc));
  return geoCache.get(name);
}

function plush(opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: opts.color ?? 0xffffff,
    vertexColors: !!opts.vertexColors,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0,
    clearcoat: opts.clearcoat ?? 0.28,
    clearcoatRoughness: opts.clearcoatRoughness ?? 0.4,
    sheen: opts.sheen ?? 0.9,
    sheenRoughness: opts.sheenRoughness ?? 0.42,
    sheenColor: new THREE.Color(opts.sheenColor ?? 0xfff3e8),
    envMapIntensity: opts.env ?? 0.8,
    emissive: new THREE.Color(opts.emissive ?? 0x000000),
    emissiveIntensity: opts.ei ?? 0,
  });
}
function candy(color, opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: opts.roughness ?? 0.32,
    metalness: opts.metalness ?? 0.02,
    clearcoat: opts.clearcoat ?? 0.72,
    clearcoatRoughness: opts.clearcoatRoughness ?? 0.22,
    sheen: opts.sheen ?? 0.35,
    sheenRoughness: 0.35,
    sheenColor: new THREE.Color(opts.sheenColor ?? 0xfff7ef),
    envMapIntensity: opts.env ?? 1.05,
    emissive: new THREE.Color(opts.emissive ?? 0x000000),
    emissiveIntensity: opts.ei ?? 0,
    vertexColors: !!opts.vertexColors,
  });
}
function glass(color, transmission = 0.88) {
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.04, metalness: 0, transmission, thickness: 0.55,
    ior: 1.45, clearcoat: 1, clearcoatRoughness: 0.06, transparent: true,
    envMapIntensity: 1.25, attenuationColor: new THREE.Color(color), attenuationDistance: 1.4,
  });
}
function shell(group, geo, material, outline, thickness = 0.02) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  if (outline) {
    const g = geo.clone();
    g.userData.shared = true;
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, p.getX(i) + n.getX(i) * thickness, p.getY(i) + n.getY(i) * thickness, p.getZ(i) + n.getZ(i) * thickness);
    }
    const o = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: outline, side: THREE.BackSide, toneMapped: false, depthWrite: false,
    }));
    o.userData.noShadow = true;
    o.castShadow = false;
    o.receiveShadow = false;
    group.add(o);
  }
  return mesh;
}

function eye(r, iris) {
  const g = new THREE.Group();
  const sclera = new THREE.Mesh(
    new THREE.SphereGeometry(r, 28, 18),
    new THREE.MeshPhysicalMaterial({
      color: 0xfffdfb, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.08, metalness: 0, envMapIntensity: 1.15,
    })
  );
  sclera.scale.set(1.02, 1.1, 0.58);
  g.add(sclera);
  const irisM = new THREE.Mesh(
    new THREE.SphereGeometry(r * 0.56, 20, 14),
    new THREE.MeshPhysicalMaterial({
      color: iris, roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.1, metalness: 0.06, envMapIntensity: 1,
    })
  );
  irisM.position.z = r * 0.4;
  irisM.scale.set(1, 1.14, 0.48);
  g.add(irisM);
  const pupil = new THREE.Mesh(
    new THREE.SphereGeometry(r * 0.28, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0x120e0c, toneMapped: false })
  );
  pupil.position.z = r * 0.58;
  pupil.scale.set(1, 1.2, 0.35);
  g.add(pupil);
  const hi = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const hl = new THREE.Mesh(new THREE.SphereGeometry(r * 0.15, 8, 6), hi);
  hl.position.set(r * 0.2, r * 0.28, r * 0.66);
  g.add(hl);
  const hl2 = new THREE.Mesh(new THREE.SphereGeometry(r * 0.07, 8, 6), hi);
  hl2.position.set(-r * 0.16, -r * 0.06, r * 0.64);
  g.add(hl2);
  g.traverse(o => { o.castShadow = false; o.receiveShadow = false; o.userData.noShadow = true; });
  return g;
}
function placeEye(parent, x, y, z, r, iris, lidColor) {
  const e = eye(r, iris);
  e.position.set(x, y, z);
  parent.add(e);
  if (lidColor != null) {
    // Thin brow cap so the eye stays open and the catchlight reads.
    const lid = new THREE.Mesh(
      new THREE.SphereGeometry(r * 1.12, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.38),
      plush({ color: lidColor, roughness: 0.6, clearcoat: 0.15, sheen: 0.8 })
    );
    lid.position.set(x, y + r * 0.82, z - r * 0.08);
    lid.rotation.x = -0.7;
    lid.scale.set(1.18, 0.62, 0.55);
    lid.castShadow = false;
    parent.add(lid);
  }
}
function blush(parent, x, y, z, s = 0.11) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(s, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xff7d95, transparent: true, opacity: 0.42, depthWrite: false, toneMapped: false })
  );
  m.position.set(x, y, z);
  m.scale.set(1.35, 0.72, 0.4);
  m.userData.noShadow = true;
  parent.add(m);
}
function nose(parent, x, y, z, s, color) {
  const n = new THREE.Mesh(
    new THREE.SphereGeometry(s, 18, 14),
    candy(color, { roughness: 0.38, clearcoat: 0.65, sheen: 0.4 })
  );
  n.position.set(x, y, z);
  n.scale.set(1.15, 0.82, 0.85);
  n.castShadow = false;
  parent.add(n);
  const dot = new THREE.MeshBasicMaterial({ color: 0x4a3030, toneMapped: false });
  for (const sx of [-0.38, 0.38]) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(s * 0.22, 8, 6), dot);
    d.position.set(x + sx * s, y - s * 0.12, z + s * 0.55);
    d.userData.noShadow = true;
    parent.add(d);
  }
}
function smile(parent, x, y, z, w = 0.16, color = 0x5a3a38) {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-w, 0, 0),
    new THREE.Vector3(0, -w * 0.55, 0),
    new THREE.Vector3(w, 0, 0)
  );
  const m = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 14, w * 0.09, 6, false),
    new THREE.MeshBasicMaterial({ color, toneMapped: false })
  );
  m.position.set(x, y, z);
  m.userData.noShadow = true;
  parent.add(m);
}

function earChain(sign, fur, pink) {
  const s = sign;
  return [
    ell([s * 0.36, 1.18, 0.10], [0.18, 0.16, 0.12], fur, 0.1, 0.06),
    ell([s * 0.40, 1.40, 0.08], [0.13, 0.15, 0.09], fur, 0.08, 0.05),
    ell([s * 0.42, 1.58, 0.05], [0.07, 0.11, 0.06], fur, 0.06, 0.04),
    ell([s * 0.40, 1.40, 0.14], [0.07, 0.12, 0.045], pink, 0.05, 0.035),
  ];
}

function buildCat() {
  const g = new THREE.Group();
  const fur = 0xf0a56a, cream = 0xfff1dc, pink = 0xffb0c2;
  const geo = cachedSculpt('cat', {
    step: 0.04,
    adds: [
      ell([0, -0.22, 0.02], [0.90, 0.66, 0.64], fur, 0.26, 0.1),
      ell([0, -0.58, -0.02], [0.72, 0.40, 0.52], fur, 0.2, 0.08),
      ell([0, 0.82, 0.18], [0.70, 0.64, 0.58], fur, 0.24, 0.1),
      ell([-0.38, 0.64, 0.40], [0.24, 0.20, 0.18], fur, 0.12, 0.06),
      ell([0.38, 0.64, 0.40], [0.24, 0.20, 0.18], fur, 0.12, 0.06),
      ell([0, 0.56, 0.62], [0.28, 0.18, 0.20], cream, 0.12, 0.05),
      ell([0, -0.28, 0.46], [0.42, 0.36, 0.24], cream, 0.14, 0.055),
      ...earChain(-1, fur, pink),
      ...earChain(1, fur, pink),
      cap([-0.62, 0.02, 0.12], [-1.02, -0.32, 0.22], 0.20, fur, 0.14),
      cap([0.62, 0.02, 0.12], [1.02, -0.32, 0.22], 0.20, fur, 0.14),
      sph([-0.98, -0.38, 0.30], 0.13, cream, 0.08, 0.04),
      sph([0.98, -0.38, 0.30], 0.13, cream, 0.08, 0.04),
      cap([-0.40, -0.78, 0.16], [-0.44, -1.22, 0.22], 0.18, fur, 0.12),
      cap([0.40, -0.78, 0.16], [0.44, -1.22, 0.22], 0.18, fur, 0.12),
      cap([-0.36, -0.78, -0.16], [-0.38, -1.16, -0.12], 0.16, fur, 0.12),
      cap([0.36, -0.78, -0.16], [0.38, -1.16, -0.12], 0.16, fur, 0.12),
      sph([-0.44, -1.26, 0.28], 0.13, cream, 0.08, 0.04),
      sph([0.44, -1.26, 0.28], 0.13, cream, 0.08, 0.04),
      cap([0.05, -0.42, -0.42], [0.28, -0.15, -0.82], 0.11, fur, 0.1),
      cap([0.28, -0.15, -0.82], [0.08, 0.28, -0.92], 0.10, fur, 0.1),
      sph([0.05, 0.40, -0.88], 0.12, fur, 0.08),
    ],
    subs: [
      subE([-0.24, 0.90, 0.68], [0.115, 0.135, 0.08], 0.045),
      subE([0.24, 0.90, 0.68], [0.115, 0.135, 0.08], 0.045),
    ],
  });
  shell(g, geo, plush({ vertexColors: true, sheenColor: 0xffe2c4 }), 0x5a3a32, 0.02);
  placeEye(g, -0.24, 0.90, 0.70, 0.125, 0x4a3428, fur);
  placeEye(g, 0.24, 0.90, 0.70, 0.125, 0x4a3428, fur);
  blush(g, -0.42, 0.70, 0.62, 0.10);
  blush(g, 0.42, 0.70, 0.62, 0.10);
  nose(g, 0, 0.70, 0.80, 0.07, 0xff8fa3);
  smile(g, 0, 0.56, 0.80, 0.11);
  return g;
}

function buildBear() {
  const g = new THREE.Group();
  const fur = 0xc48862, cream = 0xfff0dc, inner = 0xf0c8a8;
  const geo = cachedSculpt('bear', {
    step: 0.04,
    adds: [
      ell([0, -0.28, 0.02], [0.86, 0.70, 0.66], fur, 0.28, 0.11),
      ell([0, 0.95, 0.12], [0.72, 0.64, 0.62], fur, 0.26, 0.1),
      ell([0, 0.72, 0.55], [0.34, 0.26, 0.28], cream, 0.14, 0.06),
      ell([0, -0.32, 0.48], [0.46, 0.42, 0.26], cream, 0.16, 0.06),
      sph([-0.58, 1.58, 0.08], 0.26, fur, 0.12, 0.06),
      sph([0.58, 1.58, 0.08], 0.26, fur, 0.12, 0.06),
      sph([-0.58, 1.58, 0.16], 0.14, inner, 0.08, 0.04),
      sph([0.58, 1.58, 0.16], 0.14, inner, 0.08, 0.04),
      cap([-0.55, 0.05, 0.1], [-0.95, -0.45, 0.2], 0.22, fur, 0.14),
      cap([0.55, 0.05, 0.1], [0.95, -0.45, 0.2], 0.22, fur, 0.14),
      cap([-0.38, -0.85, 0.16], [-0.42, -1.28, 0.22], 0.20, fur, 0.12),
      cap([0.38, -0.85, 0.16], [0.42, -1.28, 0.22], 0.20, fur, 0.12),
      cap([-0.34, -0.85, -0.18], [-0.36, -1.22, -0.14], 0.18, fur, 0.12),
      cap([0.34, -0.85, -0.18], [0.36, -1.22, -0.14], 0.18, fur, 0.12),
      sph([-0.42, -1.32, 0.28], 0.15, cream, 0.08),
      sph([0.42, -1.32, 0.28], 0.15, cream, 0.08),
      sph([0, -0.35, -0.62], 0.16, cream, 0.1),
    ],
    subs: [
      subE([-0.28, 1.08, 0.62], [0.11, 0.125, 0.08], 0.04),
      subE([0.28, 1.08, 0.62], [0.11, 0.125, 0.08], 0.04),
    ],
  });
  shell(g, geo, plush({ vertexColors: true, sheenColor: 0xf3d2b4, roughness: 0.58 }), 0x5c4034, 0.022);
  placeEye(g, -0.28, 1.08, 0.64, 0.118, 0x3a2a22, fur);
  placeEye(g, 0.28, 1.08, 0.64, 0.118, 0x3a2a22, fur);
  blush(g, -0.46, 0.88, 0.58, 0.11);
  blush(g, 0.46, 0.88, 0.58, 0.11);
  nose(g, 0, 0.78, 0.82, 0.09, 0x4a342c);
  smile(g, 0, 0.62, 0.78, 0.12, 0x4a342c);
  return g;
}

function buildRobot() {
  const g = new THREE.Group();
  const mint = 0x8fd9cb, dark = 0x4d6274, yellow = 0xffc15e, belly = 0xdff7f2;
  const geo = cachedSculpt('robot', {
    step: 0.04,
    adds: [
      ell([0, -0.12, 0.0], [0.74, 0.82, 0.52], mint, 0.16, 0.08),
      ell([0, -0.15, 0.28], [0.42, 0.48, 0.22], belly, 0.12, 0.05),
      ell([0, 1.18, 0.02], [0.54, 0.44, 0.48], mint, 0.14, 0.07),
      cap([-0.58, 0.22, 0.02], [-1.15, -0.05, 0.08], 0.15, yellow, 0.1),
      cap([0.58, 0.22, 0.02], [1.15, -0.05, 0.08], 0.15, yellow, 0.1),
      sph([-1.22, -0.12, 0.1], 0.15, yellow, 0.08),
      sph([1.22, -0.12, 0.1], 0.15, yellow, 0.08),
      cap([-0.28, -0.82, 0.02], [-0.32, -1.32, 0.06], 0.18, dark, 0.1),
      cap([0.28, -0.82, 0.02], [0.32, -1.32, 0.06], 0.18, dark, 0.1),
      ell([-0.32, -1.38, 0.1], [0.22, 0.12, 0.28], dark, 0.08, 0.04),
      ell([0.32, -1.38, 0.1], [0.22, 0.12, 0.28], dark, 0.08, 0.04),
      cap([0.22, 1.55, -0.05], [0.34, 2.05, -0.08], 0.045, dark, 0.06),
      sph([0.34, 2.12, -0.08], 0.09, 0xff6d62, 0.05, 0.03),
    ],
    subs: [
      subE([0, 1.20, 0.42], [0.34, 0.14, 0.12], 0.04),
    ],
  });
  shell(g, geo, candy(0xffffff, { vertexColors: true, roughness: 0.28, clearcoat: 0.85, clearcoatRoughness: 0.18, sheen: 0.15, env: 1.05 }), 0x2c3a44, 0.018);
  const visor = new THREE.Mesh(
    new RoundedBoxGeometry(0.62, 0.26, 0.12, 4, 0.08),
    glass(0x16323a, 0.55)
  );
  visor.position.set(0, 1.20, 0.46);
  g.add(visor);
  for (const x of [-0.16, 0.16]) {
    const e = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 16, 12),
      new THREE.MeshPhysicalMaterial({
        color: 0xd9fbff, emissive: 0x7ef6ff, emissiveIntensity: 1.4, roughness: 0.15, clearcoat: 1, metalness: 0.1,
      })
    );
    e.position.set(x, 1.20, 0.50);
    e.scale.set(1, 1.05, 0.55);
    g.add(e);
    const hl = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
    );
    hl.position.set(x + 0.02, 1.23, 0.55);
    hl.userData.noShadow = true;
    g.add(hl);
  }
  const mouth = new THREE.Mesh(
    new RoundedBoxGeometry(0.22, 0.045, 0.04, 2, 0.02),
    new THREE.MeshBasicMaterial({ color: 0xffb35a, toneMapped: false })
  );
  mouth.position.set(0, 0.98, 0.50);
  g.add(mouth);
  return g;
}

function wheel(x, z) {
  const g = new THREE.Group();
  g.position.set(x, -0.82, z);
  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.40, 0.40, 0.24, 32),
    new THREE.MeshPhysicalMaterial({ color: 0x2c2c32, roughness: 0.72, metalness: 0.05, clearcoat: 0.15, envMapIntensity: 0.4 })
  );
  tire.rotation.x = Math.PI / 2;
  tire.castShadow = true;
  g.add(tire);
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.26, 24),
    new THREE.MeshPhysicalMaterial({ color: 0xf4f7fb, roughness: 0.28, metalness: 0.55, clearcoat: 0.6, envMapIntensity: 1 })
  );
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  const hub = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 16, 12),
    candy(0xffd54a, { roughness: 0.3, metalness: 0.35, clearcoat: 0.8, sheen: 0 })
  );
  hub.position.z = Math.sign(z) * 0.12;
  g.add(hub);
  return g;
}

function buildCar() {
  const g = new THREE.Group();
  const paint = 0xff7d52, shade = 0xff6a40;
  const geo = cachedSculpt('car', {
    step: 0.045,
    adds: [
      ell([0.05, -0.42, 0], [1.28, 0.34, 0.70], paint, 0.22, 0.1),
      ell([0.95, -0.28, 0], [0.55, 0.30, 0.62], paint, 0.16, 0.07),
      ell([-1.05, -0.40, 0], [0.48, 0.30, 0.60], shade, 0.16, 0.07),
      ell([-0.95, -0.55, 0.42], [0.28, 0.16, 0.22], paint, 0.1),
      ell([0.95, -0.55, 0.42], [0.28, 0.16, 0.22], paint, 0.1),
      ell([-0.95, -0.55, -0.42], [0.28, 0.16, 0.22], paint, 0.1),
      ell([0.95, -0.55, -0.42], [0.28, 0.16, 0.22], paint, 0.1),
      ell([-0.12, 0.38, 0], [0.62, 0.30, 0.50], paint, 0.14, 0.06),
    ],
  });
  shell(g, geo, candy(0xffffff, { vertexColors: true, roughness: 0.22, clearcoat: 0.95, clearcoatRoughness: 0.14, sheen: 0.12, metalness: 0.06, env: 1.15 }), 0x6a3228, 0.016);
  const win = new THREE.Mesh(
    new THREE.SphereGeometry(0.58, 36, 24),
    glass(0xd7f3ff, 0.86)
  );
  win.scale.set(1.42, 0.46, 0.88);
  win.position.set(-0.12, 0.30, 0);
  g.add(win);
  for (const z of [-0.40, 0.40]) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 16, 12),
      new THREE.MeshPhysicalMaterial({
        color: 0xfff6d2, emissive: 0xffe7a0, emissiveIntensity: 0.7, roughness: 0.2, clearcoat: 1, metalness: 0.05,
      })
    );
    lamp.scale.set(0.7, 0.85, 1);
    lamp.position.set(1.28, -0.30, z);
    g.add(lamp);
    const tail = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 10),
      new THREE.MeshPhysicalMaterial({ color: 0xff5a62, emissive: 0xff3344, emissiveIntensity: 0.55, roughness: 0.3, clearcoat: 0.8 })
    );
    tail.position.set(-1.32, -0.32, z);
    g.add(tail);
  }
  const bumper = new THREE.Mesh(
    new RoundedBoxGeometry(0.18, 0.16, 1.05, 3, 0.06),
    candy(0xfff3ea, { roughness: 0.35, clearcoat: 0.5, sheen: 0.2 })
  );
  bumper.position.set(1.32, -0.52, 0);
  g.add(bumper);
  for (const x of [-0.95, 0.95]) for (const z of [-0.78, 0.78]) g.add(wheel(x, z));
  return g;
}

function frostingTier(radius, height, color, drips) {
  const seg = 72;
  const geo = new THREE.CylinderGeometry(radius * 0.97, radius, height, seg, 12, false);
  const pos = geo.attributes.position;
  const half = height / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ang = Math.atan2(z, x);
    const ny = (y + half) / height;
    const radial = Math.hypot(x, z);
    const lip = Math.exp(-((ny - 0.9) ** 2) * 40) * radius * 0.045;
    const wave = Math.pow(Math.max(0, Math.cos(ang * drips)), 3);
    const drip = wave * Math.pow(Math.max(0, 1 - ny), 1.35) * radius * 0.07;
    const dome = ny > 0.97 ? (1 - Math.min(1, radial / radius)) * height * 0.08 : 0;
    const s = 1 + (lip + drip) / Math.max(radius, 0.001);
    pos.setXYZ(i, x * s, y + dome, z * s);
  }
  geo.computeVertexNormals();
  geo.userData.shared = true;
  const mesh = new THREE.Mesh(geo, candy(color, { roughness: 0.4, clearcoat: 0.45, sheen: 0.85, sheenColor: 0xfff8f2 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildCakeClean() {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(1.18, 1.24, 0.09, 56),
    candy(0xfffaf4, { roughness: 0.32, clearcoat: 0.55, sheen: 0.25 })
  );
  plate.position.y = -1.30;
  plate.receiveShadow = true;
  plate.castShadow = true;
  g.add(plate);
  const tiers = [
    { r: 1.06, h: 0.88, y: -0.76, c: 0xfff3e2, d: 7 },
    { r: 0.78, h: 0.74, y: 0.10, c: 0xffc9d6, d: 6 },
    { r: 0.48, h: 0.50, y: 0.78, c: 0xc48460, d: 5 },
  ];
  for (const t of tiers) {
    const m = frostingTier(t.r, t.h, t.c, t.d);
    m.position.y = t.y;
    g.add(m);
    const geo = m.geometry;
    const og = geo.clone();
    og.userData.shared = true;
    const p = og.attributes.position, n = og.attributes.normal;
    const th = 0.012;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * th, p.getY(i) + n.getY(i) * th, p.getZ(i) + n.getZ(i) * th);
    const o = new THREE.Mesh(og, new THREE.MeshBasicMaterial({ color: 0x6e463c, side: THREE.BackSide, toneMapped: false, depthWrite: false }));
    o.position.y = t.y;
    o.userData.noShadow = true;
    g.add(o);
  }
  // cream pearls
  const pearls = [[0.95, -0.4, 0.35], [-0.7, -0.42, 0.75], [0.2, -0.4, 1.0], [-0.95, -0.42, -0.2], [0.55, -0.4, -0.85]];
  for (const [x, y, z] of pearls) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), candy(0xfffdf8, { roughness: 0.35, clearcoat: 0.5, sheen: 0.6 }));
    p.position.set(x, y, z);
    p.castShadow = true;
    g.add(p);
  }
  // dollops on middle tier
  for (const [x, z] of [[0.55, 0.45], [-0.5, 0.4], [0.15, -0.62], [-0.35, -0.4]]) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), candy(0xfff6ea, { roughness: 0.42, sheen: 0.8, clearcoat: 0.3 }));
    d.position.set(x, 0.42, z);
    d.scale.set(1, 0.75, 1);
    g.add(d);
  }
  const cherry = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 20, 16),
    candy(0xff4d6a, { roughness: 0.28, clearcoat: 0.9, sheen: 0.2, emissive: 0xff3355, ei: 0.12 })
  );
  cherry.position.set(0, 1.18, 0.02);
  cherry.castShadow = true;
  g.add(cherry);
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.02, 0.28, 8),
    candy(0x3e8f4a, { roughness: 0.55, clearcoat: 0.2, sheen: 0.2 })
  );
  stem.position.set(0.04, 1.38, 0);
  stem.rotation.z = -0.5;
  g.add(stem);
  const leaf = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 12, 8),
    candy(0x67b56a, { roughness: 0.45, sheen: 0.4, clearcoat: 0.3 })
  );
  leaf.position.set(0.12, 1.48, 0);
  leaf.scale.set(1.8, 0.45, 0.7);
  leaf.rotation.z = -0.6;
  g.add(leaf);
  // seeded sprinkles
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const sprinkleMat = [0xff6b8a, 0xffd15c, 0x7dce8a, 0x8eb6ff].map(c => candy(c, { roughness: 0.35, clearcoat: 0.6, sheen: 0.2 }));
  for (let i = 0; i < 18; i++) {
    const ang = rnd() * Math.PI * 2;
    const rad = 0.12 + rnd() * 0.55;
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.07, 3, 6), sprinkleMat[i % 4]);
    m.position.set(Math.cos(ang) * rad, 0.46 + rnd() * 0.02, Math.sin(ang) * rad);
    m.rotation.set(rnd(), rnd(), rnd());
    g.add(m);
  }
  return g;
}

function paintStripes(geo, bands) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  let yMin = 1e9, yMax = -1e9;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }
  const span = yMax - yMin || 1;
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - yMin) / span;
    let c = bands[0].c;
    for (const b of bands) if (t >= b.at) c = b.c;
    colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function buildPopsicle() {
  const g = new THREE.Group();
  const w = 1.45, h = 2.05, rad = 0.42;
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
    depth: 0.42, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1,
    bevelSegments: 6, curveSegments: 12,
  });
  geo.translate(0, 0, -0.33);
  geo.computeVertexNormals();
  paintStripes(geo, [
    { at: 0, c: col(0x8fd9c4) },
    { at: 0.28, c: col(0xffe3a0) },
    { at: 0.42, c: col(0x8fd9c4) },
    { at: 0.62, c: col(0xffb7c8) },
    { at: 0.78, c: col(0x7ed0bb) },
  ]);
  geo.userData.shared = true;
  shell(g, geo, candy(0xffffff, {
    vertexColors: true, roughness: 0.22, clearcoat: 0.85, clearcoatRoughness: 0.12,
    sheen: 0.25, metalness: 0.02, env: 1.1,
  }), 0x3d6b62, 0.016);
  g.children[0].position.y = 0.32;
  g.children[1].position.y = 0.32;
  // bite-free highlight drip
  const drip = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 14, 10),
    candy(0xffffff, { roughness: 0.15, clearcoat: 1, sheen: 0, transmission: 0.15 })
  );
  drip.position.set(0.28, 0.85, 0.32);
  drip.scale.set(0.7, 1.1, 0.45);
  g.add(drip);
  const stick = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.11, 0.85, 6, 12),
    new THREE.MeshPhysicalMaterial({ color: 0xe0b07a, roughness: 0.72, metalness: 0, clearcoat: 0.08, sheen: 0.15, sheenColor: new THREE.Color(0xf0d2a8) })
  );
  stick.position.set(0, -1.22, 0);
  stick.castShadow = true;
  g.add(stick);
  return g;
}

function latheMesh(profile, segs, material, outline) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, segs);
  geo.computeVertexNormals();
  geo.userData.shared = true;
  const g = new THREE.Group();
  shell(g, geo, material, outline, 0.016);
  return g;
}

function buildRocket() {
  const g = new THREE.Group();
  const profile = [
    [0.02, 2.08], [0.20, 1.90], [0.42, 1.62], [0.56, 1.32],
    [0.60, 1.05], [0.58, 0.35], [0.60, -0.35], [0.56, -0.85],
    [0.42, -1.15], [0.30, -1.32], [0.02, -1.38],
  ];
  const body = latheMesh(profile, 56, candy(0xfff8f1, { roughness: 0.3, clearcoat: 0.75, sheen: 0.2 }), 0x3a3550);
  // paint nose + bands via vertex colors on the lathe
  const geo = body.children[0].geometry;
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const white = col(0xfff7f1), red = col(0xff6d62), band = col(0x8a74ff);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    let c = white;
    if (y > 1.22) c = red;
    else if ((y > 0.55 && y < 0.72) || (y > -0.28 && y < -0.12)) c = band;
    colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  body.children[0].material = candy(0xffffff, { vertexColors: true, roughness: 0.28, clearcoat: 0.8, sheen: 0.15, env: 1.05 });
  g.add(body);
  // window
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.035, 10, 28),
    candy(0x5c6d80, { roughness: 0.35, metalness: 0.4, clearcoat: 0.5, sheen: 0 })
  );
  ring.position.set(0, 0.32, 0.56);
  g.add(ring);
  const win = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 16), glass(0xbff6ff, 0.8));
  win.scale.set(1, 1, 0.55);
  win.position.set(0, 0.32, 0.56);
  g.add(win);
  // fins
  const finMat = candy(0xff6d62, { roughness: 0.32, clearcoat: 0.6, sheen: 0.15 });
  const finShape = new THREE.Shape();
  finShape.moveTo(0.42, -0.35);
  finShape.lineTo(0.98, -1.15);
  finShape.lineTo(0.48, -1.15);
  finShape.lineTo(0.40, -0.7);
  finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
  finGeo.translate(0, 0, -0.04);
  finGeo.userData.shared = true;
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(finGeo, finMat);
    f.rotation.y = i * Math.PI / 2;
    f.castShadow = true;
    g.add(f);
  }
  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.32, 0.22, 28),
    new THREE.MeshPhysicalMaterial({ color: 0x4e5966, roughness: 0.4, metalness: 0.65, clearcoat: 0.3, envMapIntensity: 0.8 })
  );
  nozzle.position.y = -1.32;
  g.add(nozzle);
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.55, 20),
    new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false })
  );
  flame.position.y = -1.68;
  flame.rotation.x = Math.PI;
  flame.userData.anim = 'flame';
  flame.userData.noShadow = true;
  g.add(flame);
  const core = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.38, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff2c8, toneMapped: false })
  );
  core.position.y = -1.62;
  core.rotation.x = Math.PI;
  core.userData.anim = 'flame';
  core.userData.noShadow = true;
  g.add(core);
  return g;
}

function buildUfo() {
  const g = new THREE.Group();
  const profile = [
    [0.02, 0.42], [0.40, 0.36], [0.85, 0.26], [1.25, 0.20],
    [1.62, 0.12], [1.88, 0.02], [1.72, -0.08], [1.20, -0.16],
    [0.55, -0.22], [0.02, -0.26],
  ];
  const saucer = latheMesh(profile, 72, candy(0xd5d0ff, {
    roughness: 0.28, clearcoat: 0.85, clearcoatRoughness: 0.16, sheen: 0.25, metalness: 0.08, env: 1.1,
  }), 0x2a2448);
  g.add(saucer);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    glass(0xd9fbff, 0.9)
  );
  dome.position.y = 0.16;
  g.add(dome);
  const pilot = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 12),
    new THREE.MeshPhysicalMaterial({
      color: 0xb8f5b0, emissive: 0x7dE87a, emissiveIntensity: 0.8, roughness: 0.35, clearcoat: 0.4,
    })
  );
  pilot.position.set(0, 0.48, 0.12);
  g.add(pilot);
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: 0x16301a, toneMapped: false }));
  eyeL.position.set(-0.07, 0.52, 0.28);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.07;
  g.add(eyeL); g.add(eyeR);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 12, 10),
      new THREE.MeshPhysicalMaterial({
        color: i % 2 ? 0xffd0e0 : 0xfff3c4,
        emissive: i % 2 ? 0xff7aa2 : 0xffd56a,
        emissiveIntensity: 0.7, roughness: 0.25, clearcoat: 0.8,
      })
    );
    lamp.position.set(Math.cos(a) * 1.72, 0.04, Math.sin(a) * 1.72);
    lamp.userData.anim = 'lamp';
    lamp.userData.phase = i;
    g.add(lamp);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const leg = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.045, 0.42, 4, 8),
      candy(0x8d86c9, { roughness: 0.35, metalness: 0.2, clearcoat: 0.4, sheen: 0.1 })
    );
    leg.position.set(Math.cos(a) * 0.95, -0.42, Math.sin(a) * 0.95);
    g.add(leg);
    const foot = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 14, 10),
      candy(0xffd56a, { roughness: 0.3, metalness: 0.25, clearcoat: 0.7, sheen: 0, emissive: 0xffc107, ei: 0.15 })
    );
    foot.position.set(Math.cos(a) * 0.95, -0.68, Math.sin(a) * 0.95);
    g.add(foot);
  }
  return g;
}

const builders = {
  cat: buildCat, bear: buildBear, robot: buildRobot, car: buildCar,
  cake: buildCakeClean, popsicle: buildPopsicle, rocket: buildRocket, ufo: buildUfo,
};

export function buildCharacter(key) {
  if (!cache.has(key)) {
    const g = (builders[key] || builders.cat)();
    g.traverse(o => { if (o.geometry) o.geometry.userData.shared = true; });
    cache.set(key, g);
  }
  return cache.get(key).clone(true);
}
