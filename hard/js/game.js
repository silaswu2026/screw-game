import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as G from './logic.js';
import { THEMES } from '../../js/themes.js';
import { MODELS } from '../../js/models.js';
import { buildCharacter } from '../../js/characters.js';
import { makeDetailedScrew } from '../../js/screwMesh.js';
import { sfx, buzz, unlock, fx } from './audio.js';

const SAVE_KEY = 'screwHardV1';
const TPL_KEY = 'screwHardTpl';
const FORCE_KEY = 'screwHardTplForce';
const $ = id => document.getElementById(id);
const MODES = ['', '困难', '陷阱', '徽章'];

const SKINS = [
  { id: 'classic', name: '经典螺丝' },
  { id: 'star', name: '星星螺丝' },
  { id: 'heart', name: '爱心螺丝' },
  { id: 'candy', name: '糖果螺丝' },
];

function loadSave() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { s = null; }
  s = s || {};
  s.coins = s.coins || 0;
  s.unlocked = Object.assign({ 1: 1, 2: 1, 3: 1 }, s.unlocked || {});
  s.stars = s.stars || {};
  s.badges = s.badges || 0;
  s.totalBadges = s.totalBadges || 0;
  s.skins = s.skins && s.skins.length ? s.skins : ['classic'];
  s.skin = s.skin || 'classic';
  s.items = Object.assign({ undo: 0, slot: 0 }, s.items || {});
  s.tut = s.tut || {};
  if (s.sound === undefined) s.sound = true;
  if (s.vibe === undefined) s.vibe = true;
  s.theme = s.theme || 'pets';
  return s;
}
let save = loadSave();
fx.sound = save.sound;
fx.vibe = save.vibe;
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }

function resolveTemplate() {
  const q = new URLSearchParams(location.search).get('t');
  if (q === '1' || q === '2' || q === '3') {
    localStorage.setItem(TPL_KEY, q);
    return Number(q);
  }
  const force = localStorage.getItem(FORCE_KEY);
  if (force === '1' || force === '2' || force === '3') {
    localStorage.removeItem(FORCE_KEY);
    localStorage.setItem(TPL_KEY, force);
    return Number(force);
  }
  const last = Number(localStorage.getItem(TPL_KEY) || '0');
  const next = last >= 1 && last <= 3 ? (last % 3) + 1 : 1;
  localStorage.setItem(TPL_KEY, String(next));
  return next;
}
let template = resolveTemplate();

function cycleTemplate() {
  const next = String(template % 3 + 1);
  localStorage.setItem(FORCE_KEY, next);
  const url = new URL(location.href);
  url.searchParams.delete('t');
  location.href = url.pathname + url.search + url.hash;
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('on'), 1500);
}
function flash() {
  const f = $('flash');
  f.classList.add('on');
  setTimeout(() => f.classList.remove('on'), 180);
}

// ---------- three ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (err) {
  renderer = { domElement: document.createElement('canvas'), setPixelRatio() {}, setSize() {}, setAnimationLoop() {}, render() {}, isWebGLRenderer: false };
}
if (renderer.setPixelRatio) renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
if (renderer.setSize) renderer.setSize(innerWidth, innerHeight);
if (renderer.outputColorSpace !== undefined) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
}
if (renderer.shadowMap) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
renderer.domElement.style.visibility = 'hidden';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / Math.max(1, innerHeight), 0.1, 80);
camera.position.set(0, 1.5, 7.2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 3.6;
controls.maxDistance = 13;
controls.minPolarAngle = 0.25;
controls.maxPolarAngle = Math.PI * 0.96;
controls.target.set(0, 0.15, 0);

try {
  if (renderer.isWebGLRenderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
    pmrem.dispose();
  }
} catch (e) { /* lights are enough */ }

scene.add(new THREE.HemisphereLight(0xfff4e6, 0xb7c9ea, 0.7));
const key = new THREE.DirectionalLight(0xfff7ee, 1.35);
key.position.set(3, 7, 5);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
scene.add(key);
const rim = new THREE.DirectionalLight(0xffe1c4, 0.7);
rim.position.set(-3, 4, -4);
scene.add(rim);

const root = new THREE.Group();
scene.add(root);
const ray = new THREE.Raycaster();
const clock = new THREE.Clock();

let plateVis = [], screwVis = [], falling = [], flying = [], bits = [];
let L = null, st = null, n = 1, playing = false, history = [], hold = null;
let pending = null, chestQueued = false, chestReward = null;
const tmp = new THREE.Vector3();

function theme() { return THEMES[save.theme] || THEMES.pets; }
function applyTheme() {
  const th = theme();
  const rootCss = document.documentElement;
  for (const k in th.css) rootCss.style.setProperty(k, th.css[k]);
  document.body.dataset.theme = save.theme;
  const sc = th.scene || THEMES.pets.scene;
  if (renderer.setClearColor) renderer.setClearColor(sc.clear || sc.skyBot || 0xd5eef8, 1);
  scene.background = new THREE.Color(sc.skyBot || 0xd5eef8);
  scene.fog = new THREE.Fog(sc.fog || 0xd5eef6, 12, 32);
}
function modelKeyFor(level) {
  const models = theme().models;
  return models[(level - 1) % models.length].m;
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / Math.max(1, innerHeight);
  camera.updateProjectionMatrix();
  if (renderer.setSize) renderer.setSize(innerWidth, innerHeight);
});
document.addEventListener('pointerdown', () => unlock(), { passive: true });

function plateGeo(w, h) {
  const rad = Math.min(0.07, w * 0.18, h * 0.18);
  let g;
  try { g = new RoundedBoxGeometry(Math.max(0.12, w), Math.max(0.12, h), 0.14, 2, rad); }
  catch (e) { g = new THREE.BoxGeometry(Math.max(0.12, w), Math.max(0.12, h), 0.14); }
  g.userData.disposeGeo = true;
  return g;
}

function drawIcon(kind) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  if (kind === 'bomb') {
    g.fillStyle = '#ff7a3c';
    g.fillRect(78, 18, 8, 28);
    g.beginPath(); g.arc(92, 18, 8, 0, Math.PI * 2); g.fillStyle = '#ffd23a'; g.fill();
    g.beginPath(); g.arc(58, 74, 36, 0, Math.PI * 2); g.fillStyle = '#2a2d34'; g.fill();
    g.beginPath(); g.arc(46, 62, 8, 0, Math.PI * 2); g.fillStyle = '#ffffffaa'; g.fill();
  } else {
    g.fillStyle = '#f7f8fb';
    g.beginPath(); g.arc(64, 64, 46, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1c1f26';
    g.fillRect(28, 56, 72, 16);
  }
  const tex = new THREE.CanvasTexture(c);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(0.46, 0.46, 1);
  sp.position.set(0, 0.32, 0.16);
  sp.userData.icon = true;
  return sp;
}

function addSkin(group, skin) {
  const prev = group.getObjectByName('skin');
  if (prev) group.remove(prev);
  if (!skin || skin === 'classic') return;
  const g = new THREE.Group();
  g.name = 'skin';
  if (skin === 'star') {
    const m = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.045, 0),
      new THREE.MeshBasicMaterial({ color: 0xffd84d })
    );
    m.position.set(0, 0, 0.16);
    g.add(m);
  } else if (skin === 'heart') {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff6b9a })
    );
    m.position.set(0.06, 0.02, 0.15);
    g.add(m);
  } else if (skin === 'candy') {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(0.09, 0.012, 6, 18),
      new THREE.MeshBasicMaterial({ color: 0x7bdff2 })
    );
    m.position.z = 0.12;
    g.add(m);
  }
  group.add(g);
}

function decorateScrew(built, screw) {
  const { group, head } = built;
  if (screw.kind === 'bomb') {
    head.material.color.setHex(0x2a2d34);
    head.material.emissive = new THREE.Color(0x661111);
    head.material.emissiveIntensity = 0.4;
    if (built.washer && built.washer.material) {
      built.washer.material.color.setHex(0x3a1518);
      built.washer.material.emissive = new THREE.Color(0xaa2222);
      built.washer.material.emissiveIntensity = 0.5;
    }
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8), new THREE.MeshBasicMaterial({ color: 0xff5a3c }));
    fuse.position.set(0.08, 0.08, 0.12);
    fuse.rotation.z = -0.6;
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd23a }));
    spark.position.set(0.12, 0.14, 0.14);
    group.add(fuse, spark, drawIcon('bomb'));
    return;
  }
  if (screw.kind === 'minus') {
    head.material.color.setHex(0xf4f6fb);
    head.material.emissive = new THREE.Color(0x222222);
    head.material.emissiveIntensity = 0.05;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.028, 0.02), new THREE.MeshBasicMaterial({ color: 0x1c1f26 }));
    bar.position.set(0, 0, 0.15);
    group.add(bar, drawIcon('minus'));
    return;
  }
  if (screw.badge) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.15, 0.016, 8, 28),
      new THREE.MeshStandardMaterial({ color: 0xffc940, metalness: 0.75, roughness: 0.22, emissive: 0xffb020, emissiveIntensity: 0.65 })
    );
    ring.position.z = 0.16;
    ring.name = 'badgeRing';
    group.add(ring);
  }
  addSkin(group, save.skin);
}

function paintSkins() {
  if (!L) return;
  screwVis.forEach((v, i) => {
    const s = L.screws[i];
    if (!s || s.kind !== 'goal') return;
    addSkin(v.group, save.skin);
  });
}

function clearScene() {
  while (root.children.length) {
    const c = root.children[0];
    root.remove(c);
    c.traverse?.(o => {
      if (o.geometry && o.geometry.userData.disposeGeo) o.geometry.dispose();
      const mats = o.material ? [].concat(o.material) : [];
      mats.forEach(m => { if (m.map && o.userData.icon) m.map.dispose(); });
    });
  }
  falling.forEach(f => scene.remove(f.m));
  flying.forEach(f => scene.remove(f.v.group));
  bits.forEach(b => scene.remove(b));
  falling = []; flying = []; bits = [];
  plateVis = []; screwVis = [];
  endHold();
}

function buildLevel(level, modelKey) {
  clearScene();
  L = level;
  const model = MODELS[modelKey];
  const th = theme();
  try {
    const character = buildCharacter(modelKey);
    character.traverse(o => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    root.add(character);
  } catch (err) {
    window.__charErr = String(err && (err.message || err));
    const stand = new THREE.Mesh(new THREE.SphereGeometry(0.7, 24, 16), new THREE.MeshStandardMaterial({ color: 0xf6c48b, roughness: 0.5 }));
    stand.userData.disposeGeo = true;
    root.add(stand);
  }
  const pivots = {};
  model.anchors.forEach(a => {
    const p = new THREE.Group();
    p.position.fromArray(a.p);
    if (a.r) p.rotation.fromArray(a.r);
    root.add(p);
    pivots[a.id] = p;
  });
  L.plates.forEach((p, pi) => {
    const parent = pivots[p.side] || root;
    const color = th.plates[pi % th.plates.length];
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.04 });
    const m = new THREE.Mesh(plateGeo(p.w, p.h), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    m.position.set(p.x, p.y, 0.1 + p.layer * 0.22);
    m.userData.plate = pi;
    parent.add(m);
    plateVis[pi] = { m, parent, pos: m.position.clone(), rot: m.rotation.clone(), attached: true };
  });
  L.screws.forEach((s, i) => {
    const parent = pivots[s.side] || root;
    const built = makeDetailedScrew(s.color || (s.kind === 'bomb' ? 0x222222 : 0xf5f5f5), G.COLOR_NUM);
    decorateScrew(built, s);
    const pl = L.plates[s.plate];
    const z = 0.1 + pl.layer * 0.22 + 0.14;
    built.group.position.set(s.lx, s.ly, z);
    built.hit.userData.screw = i;
    parent.add(built.group);
    screwVis[i] = { group: built.group, head: built.head, hit: built.hit, parent, pos: built.group.position.clone(), onObj: true, shake: 0, kind: s.kind };
  });
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(center);
  root.position.y += 0.05;
  controls.target.set(0, 0.1, 0);
  camera.position.set(0.4, 1.6, 7.0);
  controls.update();
}

function show(which) {
  $('map').classList.toggle('hidden', which !== 'map');
  $('hud').classList.toggle('hidden', which !== 'hud');
  renderer.domElement.style.visibility = which === 'hud' ? 'visible' : 'hidden';
}

function renderHUD() {
  if (!st || !L) return;
  const hearts = [];
  for (let i = 0; i < L.hearts; i++) hearts.push(i < st.hearts ? '❤️' : '🤍');
  $('hearts').textContent = hearts.join('');
  $('steps').textContent = '步 ' + st.steps + '/' + st.stepLimit;
  $('lvl').textContent = '第' + n + '关 · ' + MODES[template];
  $('coins').textContent = '💖 ' + save.coins;
  $('badgeCount').textContent = String(save.badges || 0);
  $('badgePill').classList.toggle('hidden', template !== 3);
  const be = $('boxes');
  be.innerHTML = '';
  st.boxes.forEach((b, i) => {
    const d = document.createElement('div');
    d.className = 'box';
    d.id = 'box' + i;
    d.style.background = b ? G.COLOR_HEX[b.color] : '#ffffff66';
    for (let k = 0; k < G.BOX_SLOTS; k++) {
      const s = document.createElement('div');
      const on = b && k < b.n;
      s.className = 'slot' + (on ? ' f' : '');
      if (on) s.style.background = G.COLOR_HEX[b.color];
      d.appendChild(s);
    }
    be.appendChild(d);
  });
  const bu = $('buf');
  bu.innerHTML = '';
  const colors = G.bufferColors(st);
  bu.classList.toggle('warn', colors.length >= st.bufCap - 1 && colors.length > 0);
  for (let k = 0; k < st.bufCap; k++) {
    const s = document.createElement('div');
    s.id = 'buf' + k;
    const held = st.buffer[k] && typeof st.buffer[k] === 'object' && st.buffer[k].hold;
    s.className = 'slot' + (colors[k] ? ' f' : '') + (held ? ' held' : '');
    if (colors[k]) s.style.background = G.COLOR_HEX[colors[k]] || '#ccc';
    bu.appendChild(s);
  }
  renderItems();
}

function renderItems() {
  const el = $('items');
  el.innerHTML = '';
  const add = (label, count, fn) => {
    if (!count) return;
    const b = document.createElement('button');
    b.className = 'item';
    b.type = 'button';
    b.textContent = label + ' ' + count;
    b.onclick = fn;
    el.appendChild(b);
  };
  add('撤销', save.items.undo, () => {
    if (!playing || !history.length || flying.length) return toast('现在不能撤销');
    if (save.items.undo <= 0) return;
    save.items.undo--;
    persist();
    st = history.pop();
    sync();
    renderHUD();
    sfx.ui();
  });
  add('加一格', save.items.slot, () => {
    if (!playing) return;
    if (st.bufCap >= L.buf + 2) return toast('暂存已经最大啦');
    save.items.slot--;
    persist();
    history.push(G.clone(st));
    st.bufCap++;
    renderHUD();
    sfx.pop();
  });
}

function modeBlurb() {
  if (template === 2) return '陷阱模式：黑色炸弹拧了会失败。白色减号会把盒子里的螺丝挤回暂存，暂存满了就输。';
  if (template === 3) return '徽章模式：金边螺丝藏着徽章。集满 10 个打开小宝箱，进度会记住。';
  return '困难模式：颜色更多，盒子只有两个。被挡住的螺丝、现在消不掉的颜色，都会掉心。步数用完也会输。';
}

function openMap() {
  playing = false;
  pending = null;
  show('map');
  $('tplBtn').textContent = '模式 ' + template + '/3 · ' + MODES[template];
  $('tplBtn2').textContent = MODES[template];
  $('modeBlurb').textContent = modeBlurb();
  $('meta').textContent = '💖 ' + save.coins + (template === 3 ? '    🏅 ' + (save.badges || 0) + '/10' : '') + '    皮肤 ' + (SKINS.find(s => s.id === save.skin)?.name || '经典');
  $('soundBtn').textContent = save.sound ? '音效开' : '音效关';
  const host = $('path');
  host.innerHTML = '';
  const unlocked = save.unlocked[template] || 1;
  for (let i = G.LEVEL_COUNT; i >= 1; i--) {
    const par = G.levelParams(i, template);
    const d = document.createElement('button');
    d.type = 'button';
    const lock = i > unlocked;
    const stars = save.stars[template + '-' + i] || 0;
    d.className = 'node' + (lock ? ' lock' : '') + (i === unlocked ? ' cur' : '');
    d.innerHTML = (lock ? '🔒' : i) + '<small>' + par.colors + '色 · ' + par.layers + '层</small>' +
      (lock ? '' : '<span class="st">' + '⭐'.repeat(stars) + '☆'.repeat(3 - stars) + '</span>');
    if (!lock) d.onclick = () => startLevel(i);
    host.appendChild(d);
  }
  const cur = host.querySelector('.cur');
  if (cur) cur.scrollIntoView({ block: 'center' });
  if (!save.tut[template]) showTutorial();
}

function showTutorial() {
  const title = template === 2 ? '小心两种螺丝' : template === 3 ? '收集徽章' : '困难模式怎么玩';
  let body = '';
  if (template === 1) {
    body = '<ol class="rules"><li>只有露在外面的螺丝才能拧。盖住的要点开上面那层。</li><li>上面只有两个盒子。三个同色排满就消掉。</li><li>对不上的颜色会掉进下面的暂存。暂存满了就输。</li><li>点到盖住的螺丝，或把现在消不掉的颜色塞进暂存，会掉一颗心。心没了就输。</li><li>每关有步数。步数用完也输。</li></ol>';
  } else if (template === 2) {
    body = '<ol class="rules"><li>💣 黑色、会轻轻跳动的是炸弹螺丝。拧到它会砰地一下，直接失败。过关完全用不到它。</li><li>➖ 白色、写着减号的螺丝。拧下来后，最满的盒子会掉出一颗，挤回暂存。暂存满了就会输。</li><li>有的关卡必须拧减号，才能看到里面的螺丝。等暂存还有空位再拧。</li><li>其他规则和困难模式一样：两格盒子、爱心和步数。</li></ol>';
  } else {
    body = '<ol class="rules"><li>金边螺丝里藏着一枚徽章。拧下来，徽章会飞进计数器。</li><li>集满 10 个就打开小宝箱。可能是金币、螺丝皮肤，或者撤销、加一格暂存。</li><li>打开之后计数从 0 再开始。徽章会一直记住，换关也不丢。</li><li>玩法和困难模式一样。</li></ol>';
  }
  openModal(title, body, [['知道啦', () => { save.tut[template] = 1; persist(); hideModal(); }]]);
}

function openModal(title, html, buttons) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = html;
  const box = $('modalBtns');
  box.innerHTML = '';
  for (const [label, fn, alt] of buttons) {
    const b = document.createElement('button');
    b.className = 'btn' + (alt ? ' alt' : '');
    b.type = 'button';
    b.textContent = label;
    b.onclick = () => fn();
    box.appendChild(b);
  }
  $('modal').classList.remove('hidden');
}
function hideModal() { $('modal').classList.add('hidden'); }

function startLevel(level) {
  unlock();
  n = level;
  history = [];
  pending = null;
  chestQueued = false;
  hideModal();
  $('chest').classList.add('hidden');
  const mk = modelKeyFor(level);
  try { L = G.makeLevel(level, mk, MODELS[mk], template); }
  catch (e) { toast('这一关装不上'); window.__levelErr = String(e.message || e); return; }
  st = G.initState(L);
  buildLevel(L, mk);
  show('hud');
  playing = true;
  const back = L.screws.some(s => s.back);
  $('tip').textContent = back ? '拖一拖可以转到后面。盖住的螺丝先别点。' : (level <= 2 ? '先拧露出来、颜色对得上的螺丝。' : '');
  renderHUD();
  if (level === 1 && template === 2 && !save.tut[2]) showTutorial();
  if (level === 1 && template === 3 && !save.tut[3]) showTutorial();
}

function endHold() {
  if (!hold) return;
  hold.forEach(pi => {
    const pv = plateVis[pi];
    if (!pv || !pv.attached) return;
    pv.m.material.transparent = false;
    pv.m.material.opacity = 1;
    pv.m.material.depthWrite = true;
  });
  hold = null;
}
function startHold(i) {
  endHold();
  if (!playing || st.removed[i]) return;
  const plates = G.coveringPlates(L, st, i);
  plates.forEach(pi => {
    const pv = plateVis[pi];
    if (!pv || !pv.attached) return;
    pv.m.material.transparent = true;
    pv.m.material.opacity = 0.22;
    pv.m.material.depthWrite = false;
  });
  if (plates.length) {
    hold = plates;
    $('tip').textContent = '松开后再点露出来的那颗';
  }
}

function slotWorld(el) {
  if (!el) return camera.position.clone().add(new THREE.Vector3(0, 0.2, -1));
  const r = el.getBoundingClientRect();
  const v = new THREE.Vector3((r.left + r.width / 2) / innerWidth * 2 - 1, -((r.top + r.height / 2) / innerHeight) * 2 + 1, 0.5).unproject(camera);
  return camera.position.clone().add(v.sub(camera.position).normalize().multiplyScalar(3.2));
}

function flyScrew(i, el) {
  const v = screwVis[i];
  if (!v || !v.onObj) return;
  v.onObj = false;
  const wp = new THREE.Vector3();
  v.group.getWorldPosition(wp);
  scene.attach(v.group);
  const to = el ? slotWorld(el) : wp.clone().add(new THREE.Vector3(0, 1.2, 0.2));
  flying.push({ v, t: 0, from: wp.clone(), to, up: wp.clone().add(new THREE.Vector3(0, 0.45, 0.35)) });
}

function burst(pos, color) {
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color }));
    m.position.copy(pos);
    m.userData = { t: 0, v: new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2) };
    scene.add(m);
    bits.push(m);
  }
}

function sync() {
  L.plates.forEach((p, pi) => {
    const pv = plateVis[pi];
    if (!pv) return;
    const att = p.screws.some(i => !st.removed[i]);
    if (!att && pv.attached) {
      pv.attached = false;
      const wp = new THREE.Vector3();
      pv.m.getWorldPosition(wp);
      scene.attach(pv.m);
      falling.push({ m: pv.m, v: wp.clone().sub(root.position).normalize().multiplyScalar(1.6).add(new THREE.Vector3(0, 2, 0)), t: 0 });
      sfx.pop();
    } else if (att && !pv.attached) {
      pv.attached = true;
      falling = falling.filter(f => f.m !== pv.m);
      pv.parent.attach(pv.m);
      pv.m.position.copy(pv.pos);
      pv.m.rotation.copy(pv.rot);
    }
  });
  L.screws.forEach((s, i) => {
    const v = screwVis[i];
    if (!v) return;
    if (st.removed[i] && v.onObj) {
      v.onObj = false;
      v.group.visible = false;
    } else if (!st.removed[i] && !v.onObj) {
      flying = flying.filter(f => f.v !== v);
      v.onObj = true;
      v.parent.attach(v.group);
      v.group.position.copy(v.pos);
      v.group.rotation.set(0, 0, 0);
      v.group.scale.setScalar(1);
      v.group.visible = true;
    }
  });
}

function flyBadge(i) {
  const v = screwVis[i];
  if (!v) return;
  v.group.getWorldPosition(tmp);
  tmp.project(camera);
  const el = document.createElement('div');
  el.id = 'badgeFly';
  el.textContent = '🏅';
  const x = (tmp.x + 1) / 2 * innerWidth;
  const y = (1 - tmp.y) / 2 * innerHeight;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  document.body.appendChild(el);
  const pill = $('badgePill').getBoundingClientRect();
  requestAnimationFrame(() => {
    el.style.left = (pill.left + pill.width / 2) + 'px';
    el.style.top = (pill.top + pill.height / 2) + 'px';
    el.style.opacity = '0.2';
  });
  setTimeout(() => el.remove(), 600);
  sfx.badge();
}

function giveBadge(i) {
  save.badges = (save.badges || 0) + 1;
  save.totalBadges = (save.totalBadges || 0) + 1;
  if (save.badges >= 10) {
    save.badges = 0;
    save.chests = (save.chests || 0) + 1;
    chestReward = rollReward();
    chestQueued = true;
    setTimeout(() => {
      if (!chestQueued) return;
      chestQueued = false;
      showChest();
    }, 450);
  }
  persist();
  flyBadge(i);
  renderHUD();
}

function rollReward() {
  const locked = SKINS.filter(s => s.id !== 'classic' && !save.skins.includes(s.id));
  const bag = ['coins', 'coins', 'undo', 'slot'];
  if (locked.length) bag.push('skin', 'skin');
  const pick = bag[Math.floor(Math.random() * bag.length)];
  if (pick === 'skin') {
    const s = locked[Math.floor(Math.random() * locked.length)];
    save.skins.push(s.id);
    save.skin = s.id;
    return { art: '✨', title: s.name, text: '接下来的螺丝会带上这个样子。' };
  }
  if (pick === 'undo') {
    save.items.undo += 1;
    return { art: '↩️', title: '撤销 ×1', text: '点错了可以退回一步。' };
  }
  if (pick === 'slot') {
    save.items.slot += 1;
    return { art: '➕', title: '暂存加一格', text: '在关卡里点一下，就能多一个暂存位。' };
  }
  const amount = 12 + Math.floor(Math.random() * 24);
  save.coins += amount;
  return { art: '💖', title: '金币 +' + amount, text: '收进小金库啦。' };
}

function showChest() {
  const r = chestReward || { art: '🎁', title: '小礼物', text: '' };
  $('chestArt').textContent = r.art;
  $('chestTitle').textContent = r.title;
  $('chestText').textContent = r.text;
  $('chest').classList.remove('hidden');
  sfx.chest();
  buzz(20);
}
function closeChest() {
  $('chest').classList.add('hidden');
  chestReward = null;
  paintSkins();
  renderHUD();
  afterMotion();
}

function noteEnd(res) {
  if (G.isWin(L, st)) { playing = false; pending = 'win'; return; }
  if (res && res.lose) {
    playing = false;
    pending = res.reason === 'bomb' ? 'bomb' : res.reason === 'minus-full' ? 'minus' : res.reason === 'buffer' ? 'buffer' : (st.hearts <= 0 ? 'heart' : 'steps');
  }
}

function afterMotion() {
  if (flying.length) return;
  if (chestQueued) { chestQueued = false; showChest(); return; }
  if (!$('chest').classList.contains('hidden')) return;
  if (pending === 'win') { pending = null; win(); }
  else if (pending) { const why = pending; pending = null; lose(why); }
}

function tapScrew(i) {
  if (!playing || i == null || !st || st.removed[i] || flying.length) return;
  endHold();
  const snap = G.clone(st);
  const res = G.tap(L, st, i);
  if (res.reason === 'gone') return;
  if (res.reason === 'blocked') {
    history.push(snap);
    if (screwVis[i]) screwVis[i].shake = 0.35;
    sfx.blocked(); sfx.hurt(); buzz(30); flash();
    $('hearts').classList.add('hurt');
    setTimeout(() => $('hearts').classList.remove('hurt'), 360);
    $('tip').textContent = '这颗还被盖着，掉了一颗心';
    renderHUD();
    noteEnd(res);
    afterMotion();
    return;
  }
  history.push(snap);
  if (history.length > 40) history.shift();
  if (res.reason === 'bomb') {
    sfx.boom(); buzz([40, 30, 40]); flash();
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 450);
    if (screwVis[i]) {
      const wp = new THREE.Vector3();
      screwVis[i].group.getWorldPosition(wp);
      burst(wp, 0xff5a3c);
      screwVis[i].onObj = false;
      screwVis[i].group.visible = false;
    }
    $('tip').textContent = '炸弹爆开了';
    renderHUD();
    noteEnd(res);
    setTimeout(afterMotion, 420);
    return;
  }
  if (res.reason === 'buffer' || res.reason === 'minus-full') {
    sfx.lose();
    renderHUD();
    noteEnd(res);
    afterMotion();
    return;
  }
  if (res.dest === 'minus') {
    sfx.minus(); buzz(12);
    flyScrew(i, null);
    if (res.pushed) {
      $('tip').textContent = '减号把一颗螺丝挤回暂存了';
      flash();
    } else $('tip').textContent = '盒子是空的，减号这次没挤掉螺丝';
    sync();
    renderHUD();
    noteEnd(res);
    return;
  }
  sfx.turn(); buzz(10);
  const el = res.dest === 'box' ? $('box' + res.k) : $('buf');
  flyScrew(i, el);
  if (res.badge) giveBadge(i);
  if (res.bad) {
    sfx.hurt(); flash(); buzz(24);
    $('tip').textContent = '这个颜色现在消不掉，掉了一颗心';
    $('hearts').classList.add('hurt');
    setTimeout(() => $('hearts').classList.remove('hurt'), 360);
  } else if (res.dest === 'buf') {
    $('tip').textContent = '先寄存在暂存里，下一格盒子就是它';
  }
  sync();
  renderHUD();
  noteEnd(res);
}

function win() {
  playing = false;
  sfx.win();
  const perfect = st.hearts === L.hearts && st.steps === L.solution.length;
  const stars = perfect ? 3 : st.hearts >= 2 ? 2 : 1;
  const key = template + '-' + n;
  save.stars[key] = Math.max(save.stars[key] || 0, stars);
  save.unlocked[template] = Math.max(save.unlocked[template] || 1, Math.min(G.LEVEL_COUNT, n + 1));
  const gain = 8 + n;
  save.coins += gain;
  persist();
  const next = n < G.LEVEL_COUNT;
  openModal(
    '拆完啦',
    '<div style="font-size:32px;margin:6px 0">' + '⭐'.repeat(stars) + '☆'.repeat(3 - stars) + '</div><p>爱心还剩 ' + st.hearts + ' 颗 · 用了 ' + st.steps + ' 步<br>+' + gain + ' 金币</p>',
    next
      ? [['下一关', () => { hideModal(); startLevel(n + 1); }], ['回地图', () => { hideModal(); openMap(); }, true]]
      : [['回地图', () => { hideModal(); openMap(); }]]
  );
  renderHUD();
}

function lose(why) {
  playing = false;
  sfx.lose();
  const text = {
    bomb: '炸弹螺丝炸开了。这种黑色的不要拧。',
    minus: '减号把螺丝挤回来时，暂存已经满了。',
    buffer: '暂存排满了，这颗螺丝放不下。',
    heart: '心心用完了。盖住的、现在消不掉的，先别点。',
    steps: '步数用完了。',
    blocked: '心心用完了。',
  }[why] || '这局没过去。';
  openModal('再试一次', '<p>' + text + '</p>', [
    ['重试', () => { hideModal(); startLevel(n); }],
    ['回地图', () => { hideModal(); openMap(); }, true],
  ]);
}

function pickAt(x, y) {
  if (!L) return null;
  const ndc = new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const targets = [];
  screwVis.forEach(v => { if (v.onObj) targets.push(v.hit); });
  plateVis.forEach(pv => { if (pv.attached) targets.push(pv.m); });
  const hits = ray.intersectObjects(targets, false);
  if (!hits.length) return null;
  const o = hits[0].object;
  if (o.userData.screw != null) return o.userData.screw;
  if (o.userData.plate != null) {
    const pi = o.userData.plate;
    const own = L.plates[pi].screws.find(i => !st.removed[i]);
    if (own != null && !G.isBlocked(L, st, own)) return own;
    const p = L.plates[pi];
    let best = null, bestD = 1e9;
    L.screws.forEach((s, i) => {
      if (st.removed[i] || s.side !== p.side || s.layer >= p.layer) return;
      if (Math.abs(s.lx - p.x) < p.w / 2 + 0.2 && Math.abs(s.ly - p.y) < p.h / 2 + 0.2) {
        const d = Math.hypot(s.lx - p.x, s.ly - p.y);
        if (d < bestD) { bestD = d; best = i; }
      }
    });
    return best != null ? best : (own ?? null);
  }
  return null;
}

let down = null, pointers = 0, holdTimer = null;
const cv = renderer.domElement;
cv.addEventListener('pointerdown', e => {
  pointers++;
  if (!e.isPrimary) return;
  down = { x: e.clientX, y: e.clientY, screw: null, hold: false };
  if (!playing) return;
  const si = pickAt(e.clientX, e.clientY);
  down.screw = si;
  clearTimeout(holdTimer);
  if (si != null) {
    holdTimer = setTimeout(() => {
      if (!down || down.screw !== si) return;
      down.hold = true;
      startHold(si);
      controls.enabled = false;
    }, 280);
  }
});
addEventListener('pointermove', e => {
  if (!down) return;
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12 && !down.hold) {
    clearTimeout(holdTimer);
    down.screw = null;
  }
});
addEventListener('pointerup', e => {
  pointers = Math.max(0, pointers - 1);
  clearTimeout(holdTimer);
  controls.enabled = true;
  if (!down || !e.isPrimary) { down = null; return; }
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const wasHold = down.hold;
  const si = down.screw;
  down = null;
  endHold();
  if (wasHold || moved > 12) return;
  if (si != null) tapScrew(si);
});
addEventListener('pointercancel', () => {
  pointers = 0;
  clearTimeout(holdTimer);
  endHold();
  controls.enabled = true;
  down = null;
});

function updateHand() {
  const h = $('hand');
  if (!playing || !L || n > 2 || template !== 1 || flying.length || hold) { h.style.display = 'none'; return; }
  const open = st.boxes.filter(Boolean).map(b => b.color);
  const free = G.freeScrews(L, st).filter(i => L.screws[i].kind === 'goal' && open.includes(L.screws[i].color));
  const i = free[0];
  if (i == null) { h.style.display = 'none'; return; }
  screwVis[i].group.getWorldPosition(tmp).project(camera);
  if (tmp.z > 1) { h.style.display = 'none'; return; }
  h.style.display = 'block';
  h.style.left = ((tmp.x + 1) / 2 * innerWidth) + 'px';
  h.style.top = ((1 - tmp.y) / 2 * innerHeight) + 'px';
}

renderer.setAnimationLoop(() => {
  let dt = 0.016;
  try { dt = Math.min(clock.getDelta(), 0.05); }
  catch (err) { window.__loopErr = String(err && err.message || err); return; }
  if ($('hud').classList.contains('hidden')) return;
  controls.update();
  const t = performance.now() * 0.001;
  for (let i = falling.length - 1; i >= 0; i--) {
    const f = falling[i];
    f.t += dt;
    f.v.y -= 9 * dt;
    f.m.position.addScaledVector(f.v, dt);
    f.m.rotation.x += dt * 2;
    f.m.rotation.z += dt;
    if (f.t > 2.2) { scene.remove(f.m); falling.splice(i, 1); }
  }
  let landed = false;
  for (let i = flying.length - 1; i >= 0; i--) {
    const f = flying[i];
    f.t += dt;
    const k = Math.min(f.t / 0.45, 1);
    const e = k * k * (3 - 2 * k);
    f.v.group.position.lerpVectors(f.from, f.up, Math.min(1, k * 1.4));
    if (k > 0.35) f.v.group.position.lerpVectors(f.up, f.to, (k - 0.35) / 0.65);
    f.v.group.rotation.z += dt * 8;
    const s = 1 - 0.4 * e;
    f.v.group.scale.setScalar(Math.max(0.2, s));
    if (k >= 1) { scene.remove(f.v.group); flying.splice(i, 1); landed = true; }
  }
  if (landed) {
    if (st && (st.cleared || 0) > (renderHUD._cl || 0)) { sfx.chime(); renderHUD._cl = st.cleared; }
    renderHUD();
    afterMotion();
  }
  for (let i = bits.length - 1; i >= 0; i--) {
    const b = bits[i];
    b.userData.t += dt;
    b.userData.v.y -= 6 * dt;
    b.position.addScaledVector(b.userData.v, dt);
    if (b.userData.t > 0.8) { scene.remove(b); bits.splice(i, 1); }
  }
  screwVis.forEach(v => {
    if (v.shake > 0) {
      v.shake -= dt;
      v.head.position.x = Math.sin(v.shake * 60) * 0.04;
    } else if (v.head.position.x) v.head.position.x = 0;
    if (v.kind === 'bomb' && v.onObj) {
      const s = 1 + Math.sin(t * 7) * 0.08;
      v.group.scale.setScalar(s);
    }
    const ring = v.group.getObjectByName('badgeRing');
    if (ring && v.onObj) ring.rotation.z = t * 1.5;
  });
  updateHand();
  if (renderer.render) renderer.render(scene, camera);
});

$('tplBtn').onclick = cycleTemplate;
$('tplBtn2').onclick = cycleTemplate;
$('toMap').onclick = openMap;
$('restart').onclick = () => startLevel(n);
$('helpBtn').onclick = showTutorial;
$('themeBtn').onclick = () => {
  const keys = Object.keys(THEMES);
  const i = Math.max(0, keys.indexOf(save.theme));
  save.theme = keys[(i + 1) % keys.length];
  persist();
  applyTheme();
  openMap();
  toast(theme().name);
};
$('soundBtn').onclick = () => {
  save.sound = !save.sound;
  fx.sound = save.sound;
  persist();
  $('soundBtn').textContent = save.sound ? '音效开' : '音效关';
  if (save.sound) sfx.ui();
};
$('chestOk').onclick = closeChest;

applyTheme();
openMap();

window.__game = {
  G, THEMES, MODELS,
  startLevel, openMap, tap: tapScrew, cycleTemplate,
  get template() { return template; },
  get L() { return L; },
  get st() { return st; },
  get playing() { return playing; },
  get save() { return save; },
  get n() { return n; },
  setTemplate(t) {
    template = t;
    localStorage.setItem(TPL_KEY, String(t));
    openMap();
  },
  autoWin(level) {
    startLevel(level);
    if (!L || !L.solution) throw new Error('no level');
    for (const i of L.solution) {
      const r = G.tap(L, st, i);
      if (!r.ok || r.lose) throw new Error((r.reason || 'lose') + ' at ' + i);
    }
    sync();
    renderHUD();
    if (!G.isWin(L, st)) throw new Error('not win');
    playing = false;
    return true;
  },
};
