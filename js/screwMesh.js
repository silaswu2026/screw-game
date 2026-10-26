// High-detail Disney-polished screw mesh (code-authored; matches assets/screw.glb topology).
// Axis: local +Z is outward (head faces +Z, shaft goes toward -Z).
import * as THREE from 'three';

const _geoCache = {};

function latheXY(profile, segments = 48) {
  // profile: array of [x=radius, y=alongAxis] — we build along Y then rotate to Z
  const pts = profile.map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, segments);
  g.rotateX(Math.PI / 2); // Y -> Z
  return g;
}

/** Helical thread as a TubeGeometry along a helix (shaft along -Z from z0 to z1). */
function helixThreadGeo({ radius = 0.050, tube = 0.013, z0 = -0.02, z1 = -0.34, turns = 7.0, tubular = 200, radial = 8 } = {}) {
  class Helix extends THREE.Curve {
    constructor() { super(); }
    getPoint(t, optionalTarget = new THREE.Vector3()) {
      const z = z0 + (z1 - z0) * t;
      const a = t * turns * Math.PI * 2;
      return optionalTarget.set(Math.cos(a) * radius, Math.sin(a) * radius, z);
    }
  }
  return new THREE.TubeGeometry(new Helix(), tubular, tube, radial, false);
}

/** Phillips / cruciform recess cutters (visual inset boxes). */
function phillipsSlots() {
  const g = new THREE.Group();
  const dark = new THREE.MeshPhysicalMaterial({
    color: 0x1a1a22, roughness: 0.55, metalness: 0.15, clearcoat: 0.2
  });
  const arm = (rotZ) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.022, 0.028), dark);
    m.position.z = 0.078;
    m.rotation.z = rotZ;
    // slight bevel feel via second thinner cross
    const m2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.02), dark.clone());
    m2.position.z = 0.088;
    m2.rotation.z = rotZ;
    g.add(m, m2);
  };
  arm(0); arm(Math.PI / 2);
  // center dimple
  const dimple = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 12, 10),
    dark
  );
  dimple.position.z = 0.072;
  dimple.scale.set(1, 1, 0.55);
  g.add(dimple);
  return g;
}

function candyPhysical(color, opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: opts.metalness ?? 0.92,
    roughness: opts.roughness ?? 0.28,
    clearcoat: opts.clearcoat ?? 0.55,
    clearcoatRoughness: opts.clearcoatRoughness ?? 0.22,
    reflectivity: 0.9,
    envMapIntensity: opts.envMapIntensity ?? 1.15,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.ei ?? 0,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
  });
}

/** Shared geometries (built once). */
export function getScrewGeometries() {
  if (_geoCache.head) return _geoCache;
  // Head profile: flange washer → bevel → dome crown (radius, along-Y before rotate)
  // y=0 at washer mid; positive y = toward crown tip
  const headProfile = [
    [0.0, -0.018],
    [0.105, -0.018],
    [0.125, -0.012],
    [0.148, -0.004],   // wide washer flange
    [0.152, 0.012],
    [0.138, 0.022],
    [0.122, 0.034],
    [0.108, 0.048],    // tall candy dome
    [0.085, 0.068],
    [0.055, 0.082],
    [0.028, 0.090],
    [0.0, 0.092],
  ];
  _geoCache.head = latheXY(headProfile, 56);
  _geoCache.head.computeVertexNormals();

  // Thin chrome washer ring highlight under flange
  const washerProfile = [
    [0.112, -0.022],
    [0.155, -0.022],
    [0.160, -0.008],
    [0.150, 0.006],
    [0.112, 0.006],
    [0.112, -0.022],
  ];
  _geoCache.washer = latheXY(washerProfile, 48);

  // Shaft core (steel)
  _geoCache.shaft = new THREE.CylinderGeometry(0.044, 0.038, 0.34, 28);
  _geoCache.shaft.rotateX(Math.PI / 2);
  _geoCache.shaft.translate(0, 0, -0.18);

  // Tip
  _geoCache.tip = new THREE.ConeGeometry(0.038, 0.06, 20);
  _geoCache.tip.rotateX(Math.PI / 2);
  _geoCache.tip.translate(0, 0, -0.375);

  // Helical thread ridges
  _geoCache.thread = helixThreadGeo();

  // Soft specular catch disc (subtle)
  _geoCache.shine = new THREE.CircleGeometry(0.04, 20);

  // Invisible hit sphere
  _geoCache.hit = new THREE.SphereGeometry(0.22, 12, 10);

  return _geoCache;
}

/**
 * Build a polished cartoon screw.
 * @param {string|number} colorNameOrHex
 * @returns {{ group: THREE.Group, head: THREE.Mesh, hit: THREE.Mesh }}
 */
export function makeDetailedScrew(colorNameOrHex, colorMap) {
  const geos = getScrewGeometries();
  const g = new THREE.Group();
  const col = typeof colorNameOrHex === 'number'
    ? colorNameOrHex
    : (colorMap?.[colorNameOrHex] ?? 0xff6b6b);

  const headMat = candyPhysical(col, {
    metalness: 0.88, roughness: 0.26, clearcoat: 0.7, clearcoatRoughness: 0.18,
    emissive: col, ei: 0.06, envMapIntensity: 1.25
  });
  const steelMat = candyPhysical(0xb8bec8, {
    metalness: 0.95, roughness: 0.32, clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 1.1
  });
  const threadMat = candyPhysical(0x9aa3b0, {
    metalness: 0.92, roughness: 0.38, clearcoat: 0.25, envMapIntensity: 1.0
  });

  const head = new THREE.Mesh(geos.head, headMat);
  head.castShadow = true; head.receiveShadow = true;

  const washer = new THREE.Mesh(geos.washer, candyPhysical(col, {
    metalness: 0.9, roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.12, envMapIntensity: 1.35
  }));
  washer.castShadow = true;

  const shaft = new THREE.Mesh(geos.shaft, steelMat);
  const tip = new THREE.Mesh(geos.tip, steelMat);
  const thread = new THREE.Mesh(geos.thread, threadMat);
  thread.castShadow = true;

  const shine = new THREE.Mesh(
    geos.shine,
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, depthWrite: false })
  );
  shine.position.set(-0.032, 0.038, 0.094);

  const slots = phillipsSlots();

  const hit = new THREE.Mesh(geos.hit, new THREE.MeshBasicMaterial({ visible: false }));

  g.add(head, washer, shaft, tip, thread, shine, slots, hit);
  return { group: g, head, hit, headMat, washer };
}

/** Dispose shared geos (rare). */
export function disposeScrewGeometries() {
  Object.values(_geoCache).forEach(g => g.dispose?.());
  for (const k of Object.keys(_geoCache)) delete _geoCache[k];
}
