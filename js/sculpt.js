// Organic mesher: smooth-union SDFs → marching cubes.
// One watertight shell so characters stop reading as stacked boxes.
import { BufferGeometry, BufferAttribute, Float32BufferAttribute } from 'three';
import { edgeTable, triTable } from './mcTables.js';

const CORNER = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];
// edge → [cornerA, cornerB]
const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function smax(a, b, k) {
  return -smin(-a, -b, k);
}

function sdSphere(px, py, pz, c, r) {
  return Math.hypot(px - c[0], py - c[1], pz - c[2]) - r;
}
function sdEllipsoid(px, py, pz, c, r) {
  const x = (px - c[0]) / r[0], y = (py - c[1]) / r[1], z = (pz - c[2]) / r[2];
  const k0 = Math.hypot(x, y, z);
  const k1 = Math.hypot(x / r[0], y / r[1], z / r[2]);
  if (k1 < 1e-8) return -Math.min(r[0], r[1], r[2]);
  return k0 * (k0 - 1) / k1;
}
function sdCapsule(px, py, pz, a, b, r) {
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2];
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const denom = bax * bax + bay * bay + baz * baz || 1e-8;
  let h = (pax * bax + pay * bay + paz * baz) / denom;
  if (h < 0) h = 0; else if (h > 1) h = 1;
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r;
}
function sdRoundBox(px, py, pz, c, b, rad) {
  const qx = Math.abs(px - c[0]) - b[0] + rad;
  const qy = Math.abs(py - c[1]) - b[1] + rad;
  const qz = Math.abs(pz - c[2]) - b[2] + rad;
  const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0);
  return Math.hypot(mx, my, mz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - rad;
}

function primSdf(p, x, y, z) {
  if (p.t === 'sph') return sdSphere(x, y, z, p.p, p.r);
  if (p.t === 'ell') return sdEllipsoid(x, y, z, p.p, p.r);
  if (p.t === 'cap') return sdCapsule(x, y, z, p.a, p.b, p.r);
  if (p.t === 'rbox') return sdRoundBox(x, y, z, p.p, p.b, p.rad ?? 0.12);
  return 1e9;
}

function sceneSdf(adds, subs, x, y, z) {
  let d = 1e9;
  for (let i = 0; i < adds.length; i++) {
    const p = adds[i];
    d = smin(d, primSdf(p, x, y, z), p.k ?? 0.18);
  }
  for (let i = 0; i < subs.length; i++) {
    const p = subs[i];
    d = smax(d, -primSdf(p, x, y, z), p.k ?? 0.06);
  }
  return d;
}

function colorAt(adds, x, y, z) {
  let r = 0, g = 0, b = 0, wsum = 0;
  for (let i = 0; i < adds.length; i++) {
    const p = adds[i];
    const dist = Math.abs(primSdf(p, x, y, z));
    const w = Math.exp(-dist / (p.blend ?? 0.09));
    const c = p.col;
    r += c[0] * w; g += c[1] * w; b += c[2] * w; wsum += w;
  }
  if (wsum < 1e-6) return adds[0] ? adds[0].col : [1, 1, 1];
  return [r / wsum, g / wsum, b / wsum];
}

function expandBounds(prims, min, max) {
  const grow = (x, y, z, rad) => {
    if (x - rad < min[0]) min[0] = x - rad;
    if (y - rad < min[1]) min[1] = y - rad;
    if (z - rad < min[2]) min[2] = z - rad;
    if (x + rad > max[0]) max[0] = x + rad;
    if (y + rad > max[1]) max[1] = y + rad;
    if (z + rad > max[2]) max[2] = z + rad;
  };
  for (const p of prims) {
    if (p.t === 'sph') grow(p.p[0], p.p[1], p.p[2], p.r);
    else if (p.t === 'ell') {
      grow(p.p[0], p.p[1], p.p[2], 0);
      min[0] = Math.min(min[0], p.p[0] - p.r[0]);
      min[1] = Math.min(min[1], p.p[1] - p.r[1]);
      min[2] = Math.min(min[2], p.p[2] - p.r[2]);
      max[0] = Math.max(max[0], p.p[0] + p.r[0]);
      max[1] = Math.max(max[1], p.p[1] + p.r[1]);
      max[2] = Math.max(max[2], p.p[2] + p.r[2]);
    } else if (p.t === 'cap') {
      grow(p.a[0], p.a[1], p.a[2], p.r);
      grow(p.b[0], p.b[1], p.b[2], p.r);
    } else if (p.t === 'rbox') {
      const rad = Math.max(p.b[0], p.b[1], p.b[2]);
      grow(p.p[0], p.p[1], p.p[2], rad);
    }
  }
}

/**
 * @param {{adds: object[], subs?: object[], step?: number, pad?: number}} desc
 * @returns {BufferGeometry}
 */
export function sculptMesh(desc) {
  const adds = desc.adds || [];
  const subs = desc.subs || [];
  const step0 = desc.step ?? 0.042;
  const pad = desc.pad ?? 0.12;
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  expandBounds(adds, min, max);
  for (let i = 0; i < 3; i++) { min[i] -= pad; max[i] += pad; }

  let step = step0;
  let nx = Math.ceil((max[0] - min[0]) / step);
  let ny = Math.ceil((max[1] - min[1]) / step);
  let nz = Math.ceil((max[2] - min[2]) / step);
  const cellCap = 220000;
  while (nx * ny * nz > cellCap) {
    step *= 1.12;
    nx = Math.ceil((max[0] - min[0]) / step);
    ny = Math.ceil((max[1] - min[1]) / step);
    nz = Math.ceil((max[2] - min[2]) / step);
  }
  nx = Math.max(nx, 2); ny = Math.max(ny, 2); nz = Math.max(nz, 2);

  const sx = nx + 1, sy = ny + 1, sz = nz + 1;
  const field = new Float32Array(sx * sy * sz);
  const idx = (i, j, k) => i + sx * (j + sy * k);
  const sdf = (x, y, z) => sceneSdf(adds, subs, x, y, z);

  for (let k = 0; k < sz; k++) {
    const z = min[2] + k * step;
    for (let j = 0; j < sy; j++) {
      const y = min[1] + j * step;
      for (let i = 0; i < sx; i++) {
        field[idx(i, j, k)] = sdf(min[0] + i * step, y, z);
      }
    }
  }

  const positions = [];
  const colors = [];
  const corners = new Array(8);
  const cornerVal = new Float32Array(8);
  const edgePos = new Array(12);

  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let cube = 0;
        for (let c = 0; c < 8; c++) {
          const cx = i + CORNER[c][0];
          const cy = j + CORNER[c][1];
          const cz = k + CORNER[c][2];
          const v = field[idx(cx, cy, cz)];
          cornerVal[c] = v;
          if (v < 0) cube |= 1 << c;
        }
        const bits = edgeTable[cube];
        if (bits === 0) continue;
        for (let e = 0; e < 12; e++) {
          if (!(bits & (1 << e))) { edgePos[e] = null; continue; }
          const a = EDGES[e][0], b = EDGES[e][1];
          const va = cornerVal[a], vb = cornerVal[b];
          let t = va / (va - vb);
          if (t < 0) t = 0; else if (t > 1) t = 1;
          const ax = i + CORNER[a][0], ay = j + CORNER[a][1], az = k + CORNER[a][2];
          const bx = i + CORNER[b][0], by = j + CORNER[b][1], bz = k + CORNER[b][2];
          edgePos[e] = [
            min[0] + (ax + t * (bx - ax)) * step,
            min[1] + (ay + t * (by - ay)) * step,
            min[2] + (az + t * (bz - az)) * step,
          ];
        }
        const row = cube * 16;
        for (let t = 0; t < 16 && triTable[row + t] !== -1; t += 3) {
          const p0 = edgePos[triTable[row + t]];
          const p1 = edgePos[triTable[row + t + 1]];
          const p2 = edgePos[triTable[row + t + 2]];
          if (!p0 || !p1 || !p2) continue;
          positions.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
          const c0 = colorAt(adds, p0[0], p0[1], p0[2]);
          const c1 = colorAt(adds, p1[0], p1[1], p1[2]);
          const c2 = colorAt(adds, p2[0], p2[1], p2[2]);
          colors.push(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2]);
        }
      }
    }
  }

  const geo = new BufferGeometry();
  if (!positions.length) {
    geo.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 0, 0.01, 0, 0.01, 0], 3));
    geo.setAttribute('normal', new Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    geo.setAttribute('color', new Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
    geo.userData.shared = true;
    return geo;
  }

  // Flip winding if the geometric normal fights the SDF gradient (want outward).
  const ax = positions[3] - positions[0], ay = positions[4] - positions[1], az = positions[5] - positions[2];
  const bx = positions[6] - positions[0], by = positions[7] - positions[1], bz = positions[8] - positions[2];
  const nx0 = ay * bz - az * by, ny0 = az * bx - ax * bz, nz0 = ax * by - ay * bx;
  const gx = sdf(positions[0] + 0.02, positions[1], positions[2]) - sdf(positions[0] - 0.02, positions[1], positions[2]);
  const gy = sdf(positions[0], positions[1] + 0.02, positions[2]) - sdf(positions[0], positions[1] - 0.02, positions[2]);
  const gz = sdf(positions[0], positions[1], positions[2] + 0.02) - sdf(positions[0], positions[1], positions[2] - 0.02);
  const flip = (nx0 * gx + ny0 * gy + nz0 * gz) < 0;
  if (flip) {
    for (let i = 0; i < positions.length; i += 9) {
      const x1 = positions[i + 3], y1 = positions[i + 4], z1 = positions[i + 5];
      positions[i + 3] = positions[i + 6]; positions[i + 4] = positions[i + 7]; positions[i + 5] = positions[i + 8];
      positions[i + 6] = x1; positions[i + 7] = y1; positions[i + 8] = z1;
      const cr = colors[i + 3], cg = colors[i + 4], cb = colors[i + 5];
      colors[i + 3] = colors[i + 6]; colors[i + 4] = colors[i + 7]; colors[i + 5] = colors[i + 8];
      colors[i + 6] = cr; colors[i + 7] = cg; colors[i + 8] = cb;
    }
  }

  const normals = new Float32Array(positions.length);
  const eps = step * 0.55;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    const dx = sdf(x + eps, y, z) - sdf(x - eps, y, z);
    const dy = sdf(x, y + eps, z) - sdf(x, y - eps, z);
    const dz = sdf(x, y, z + eps) - sdf(x, y, z - eps);
    const len = Math.hypot(dx, dy, dz) || 1;
    normals[i] = dx / len; normals[i + 1] = dy / len; normals[i + 2] = dz / len;
  }

  geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute('normal', new BufferAttribute(normals, 3));
  geo.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geo.computeBoundingSphere();
  geo.userData.shared = true;
  geo.userData.tris = positions.length / 9;
  return geo;
}
