import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as G from './logic.js';
import { THEMES } from './themes.js';
import { MODELS } from './models.js';
import { sfx, buzz, unlock, fx } from './audio.js';
import { makeDetailedScrew } from './screwMesh.js';

const COLORS = { red:0xff6b6b, blue:0x4dabf7, yellow:0xffd43b, green:0x51cf66, purple:0xb197fc, orange:0xff922b };
const COLOR_HEX = { red:'#ff6b6b', blue:'#4dabf7', yellow:'#ffd43b', green:'#51cf66', purple:'#b197fc', orange:'#ff922b' };
const ITEMS = {
  hammer:{ icon:'🔨', name:'锤子', desc:'敲掉任意一颗螺丝（含被挡住的）。' },
  slot:  { icon:'➕', name:'+1格', desc:'本关暂存区多一个格子。' },
  magnet:{ icon:'🧲', name:'磁铁', desc:'把当前盒子颜色的螺丝直接吸进盒子。' },
  undo:  { icon:'↩️', name:'撤销', desc:'撤回上一步。' },
  revive:{ icon:'💗', name:'复活', desc:'暂存区满了时：清空3格继续玩。' },
};
const HOLD_MS = 280;
const PT = 0.18;
const SAVE_KEY = 'lscc3d';
const $ = id => document.getElementById(id);
const hex = c => COLOR_HEX[c] || '#fff';

// ---------- save (ads-first; soft currency is light daily bonus only) ----------
const today = () => {
  const d = new Date();
  const z = new Date(d.getTime() + 8*3600*1000); // Asia/Shanghai day
  return z.toISOString().slice(0,10);
};
let save = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') || {
  coins:40, unlocked:1, stars:{}, items:{hammer:1,slot:1,magnet:0,undo:1,revive:0},
  lastDaily:'', collection:{}, theme:null, sound:true, vibe:true
};
save.collection = save.collection || {};
save.items = Object.assign({hammer:0,slot:0,magnet:0,undo:0,revive:0}, save.items||{});
if (save.sound===undefined) save.sound=true;
if (save.vibe===undefined) save.vibe=true;
fx.sound=save.sound; fx.vibe=save.vibe;
const persist = () => localStorage.setItem(SAVE_KEY, JSON.stringify(save));
function toast(msg, ms=1600){ const t=$('toast'); t.innerHTML=msg; t.classList.add('on'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('on'),ms); }
function updateCoins(){ document.querySelectorAll('.cv').forEach(e=>e.textContent=save.coins); }
if (save.lastDaily !== today()){ save.lastDaily = today(); save.coins += 15; persist(); setTimeout(()=>toast('🎁 每日登录 +15 💖（轻量软货币）',2000), 400); }

// ---------- three.js scene (fairy-tale lighting) ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:'high-performance' });
} catch (err) {
  console.error(err);
  const d=document.createElement('div'); d.style.cssText='position:fixed;inset:0;z-index:99;display:flex;align-items:center;justify-content:center;background:#fff6e8;padding:24px;text-align:center;font-weight:800';
  d.innerHTML='无法创建 WebGL 上下文<br><small style="font-weight:600;opacity:.7">请换用支持 WebGL 的浏览器或设备</small>';
  document.body.appendChild(d);
  // stub so UI still mounts for non-3D flows / tests
  renderer = { domElement:document.createElement('canvas'), setPixelRatio(){}, setSize(){}, setAnimationLoop(){}, render(){}, get context(){return null;} };
}
renderer.setPixelRatio?.(Math.min(devicePixelRatio, 2));
renderer.setSize?.(innerWidth, innerHeight);
if (renderer.outputColorSpace!==undefined){ renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.22; }
if (renderer.shadowMap){ renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
if (renderer.domElement){ renderer.domElement.style.visibility = 'hidden'; document.body.appendChild(renderer.domElement); }

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth/innerHeight, 0.1, 80);
camera.position.set(0, 1.6, 7.2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.enablePan = false; controls.minDistance = 4; controls.maxDistance = 12;
controls.maxPolarAngle = Math.PI*0.82; controls.target.set(0,0.2,0);

// Soft studio environment (PMREM) so metallic screws catch Disney-polished highlights
let envRT = null;
try {
  if (renderer.isWebGLRenderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    envRT = pmrem.fromScene(new RoomEnvironment(renderer), 0.04);
    scene.environment = envRT.texture;
    pmrem.dispose();
  }
} catch (e) { console.warn('PMREM env skipped', e); }

const hemi = new THREE.HemisphereLight(0xfff2e0, 0xb8d4ff, 0.55);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff5e6, 1.35);
key.position.set(3.5, 7, 4);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 1; key.shadow.camera.far = 24;
key.shadow.camera.left = -6; key.shadow.camera.right = 6;
key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
key.shadow.bias = -0.00025; key.shadow.normalBias = 0.02;
scene.add(key);
const fill = new THREE.DirectionalLight(0xa8c8ff, 0.42);
fill.position.set(-4, 2, -2); scene.add(fill);
const rim = new THREE.DirectionalLight(0xffd9b0, 0.55);
rim.position.set(-2, 3, 5); scene.add(rim);
const sparkle = new THREE.PointLight(0xffffff, 0.35, 12, 2);
sparkle.position.set(1.2, 2.8, 3.5); scene.add(sparkle);

const root = new THREE.Group(); scene.add(root);
let coreMeshes=[], plateVis=[], screwVis=[], falling=[], flying=[], bits=[];
let L=null, st=null, n=1, playing=false, history=[], used=0, hammerArmed=false;
let combo=0, lastClearT=0, shownCleared=0;
let holdPreview=null; // { screw, plates:[], t0 }
let pointerHold=null;

addEventListener('resize', ()=>{
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
document.addEventListener('pointerdown', ()=>unlock(), {once:false, passive:true});

// ---------- materials helpers (Disney-polished candy / chrome) ----------
function softMat(color, opts={}){
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: opts.roughness ?? 0.38,
    metalness: opts.metalness ?? 0.06,
    clearcoat: opts.clearcoat ?? 0.45,
    clearcoatRoughness: opts.clearcoatRoughness ?? 0.28,
    sheen: opts.sheen ?? 0.35,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color(color),
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.ei ?? 0,
    envMapIntensity: opts.envMapIntensity ?? 0.85,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    flatShading: false
  });
}
function plateMat(color){
  // Painted wooden / plastic board — slight clearcoat, low metal
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.42,
    metalness: 0.04,
    clearcoat: 0.55,
    clearcoatRoughness: 0.32,
    sheen: 0.25,
    sheenColor: new THREE.Color(0xfff5e8),
    envMapIntensity: 0.7,
  });
}
function makeGeo(part){
  const t=part.t, s=part.s;
  if (t==='rbox') return new RoundedBoxGeometry(s[0],s[1],s[2], 6, part.rad??0.16);
  if (t==='sph') return new THREE.SphereGeometry(s[0], 32, 24);
  if (t==='cyl') return new THREE.CylinderGeometry(s[0],s[0],s[1], 28);
  if (t==='cap') return new THREE.CapsuleGeometry(s[0], s[1], 8, 16);
  if (t==='cone') return new THREE.ConeGeometry(s[0], s[1], s[2]||20);
  if (t==='wheel'){ const g=new THREE.CylinderGeometry(s[0],s[0],s[1], 28); g.rotateZ(Math.PI/2); return g; }
  if (t==='saucer'){ const g=new THREE.SphereGeometry(1, 36, 20); g.scale(s[0], s[1], s[0]); return g; }
  if (t==='dome') return new THREE.SphereGeometry(s[0], 32, 16, 0, Math.PI*2, 0, Math.PI/2);
  return new RoundedBoxGeometry(0.4,0.4,0.4, 4, 0.12);
}
function plateGeo(shape,w,h){
  if (shape==='disc'){
    // Thick painted disc with slight rim bevel via lathe-like cylinder + torus feel
    const r = Math.min(w,h)/2;
    const g = new THREE.CylinderGeometry(r, r*0.98, PT, 40);
    return g;
  }
  if (shape==='tri' || shape==='fin'){
    const sh=new THREE.Shape();
    sh.moveTo(0, h/2); sh.lineTo(-w/2, -h/2); sh.lineTo(w/2, -h/2); sh.closePath();
    const g=new THREE.ExtrudeGeometry(sh, {depth:PT, bevelEnabled:true, bevelThickness:0.035, bevelSize:0.035, bevelSegments:3});
    g.translate(0,0,-PT/2); return g;
  }
  // Beveled rectangular board (not a flat box)
  const sh=new THREE.Shape();
  const hw=w/2, hh=h/2, r=Math.min(0.1, w*0.12, h*0.12);
  sh.moveTo(-hw+r, -hh);
  sh.lineTo(hw-r, -hh); sh.quadraticCurveTo(hw,-hh, hw,-hh+r);
  sh.lineTo(hw, hh-r); sh.quadraticCurveTo(hw,hh, hw-r,hh);
  sh.lineTo(-hw+r, hh); sh.quadraticCurveTo(-hw,hh, -hw,hh-r);
  sh.lineTo(-hw, -hh+r); sh.quadraticCurveTo(-hw,-hh, -hw+r,-hh);
  const g=new THREE.ExtrudeGeometry(sh, {
    depth: PT, bevelEnabled:true, bevelThickness:0.028, bevelSize:0.028, bevelSegments:3
  });
  g.translate(0,0,-PT/2);
  return g;
}
function makeScrew(color){
  return makeDetailedScrew(color, COLORS);
}

// Optional: preload GLB cores (visual refinement); anchors still from MODELS
const gltfCache = {};
const gltfLoader = new GLTFLoader();
function loadModelGltf(key){
  if (gltfCache[key]) return gltfCache[key];
  gltfCache[key] = new Promise(res=>{
    gltfLoader.load(`assets/${key}.glb`, (gltf)=>{
      gltf.scene.traverse(o=>{
        if (o.isMesh){
          o.castShadow = true; o.receiveShadow = true;
          // Upgrade shipped materials toward candy plastic
          if (o.material){
            const c = o.material.color ? o.material.color.getHex() : 0xffffff;
            o.material = softMat(c, {roughness:0.4, metalness:0.08, clearcoat:0.5, envMapIntensity:0.9});
          }
        }
      });
      res(gltf.scene);
    }, undefined, ()=>res(null));
  });
  return gltfCache[key];
}
// Kick off preloads (non-blocking)
['cat','bear','robot','car','cake','popsicle','rocket','ufo'].forEach(k=>loadModelGltf(k));

function clearScene(){
  while(root.children.length){ const c=root.children[0]; root.remove(c); c.traverse?.(o=>{ if(o.geometry) o.geometry.dispose?.(); }); }
  falling.forEach(f=>scene.remove(f.m)); flying.forEach(f=>scene.remove(f.v.group)); bits.forEach(b=>scene.remove(b));
  falling=[]; flying=[]; bits=[]; coreMeshes=[]; plateVis=[]; screwVis=[];
  endHoldPreview();
}

function buildLevel(level, modelKey){
  clearScene();
  L = level; const model = MODELS[modelKey];
  const th = THEMES[save.theme||'pets'];
  // soft ground shadow disc
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 48),
    new THREE.MeshStandardMaterial({ color:0x1a1420, transparent:true, opacity:0.18, roughness:1, metalness:0 })
  );
  ground.rotation.x = -Math.PI/2; ground.position.y = -1.85;
  ground.receiveShadow = true; root.add(ground);

  // Prefer refined procedural core (RoundedBox + high segs); GLB is shipped for asset pipeline / future swap
  model.core.forEach(part=>{
    const mesh = new THREE.Mesh(makeGeo(part), softMat(part.c, {
      roughness: 0.44, metalness: 0.05, clearcoat: 0.55, clearcoatRoughness: 0.3, envMapIntensity: 0.9
    }));
    mesh.position.fromArray(part.p);
    if (part.r) mesh.rotation.fromArray(part.r);
    mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh); coreMeshes.push(mesh);
  });

  const anchors = {};
  model.anchors.forEach(a=>{
    const pivot = new THREE.Group();
    pivot.position.fromArray(a.p);
    if (a.r) pivot.rotation.fromArray(a.r);
    root.add(pivot); anchors[a.id]=pivot;
  });

  L.plates.forEach((p,pi)=>{
    const parent = anchors[p.side] || root;
    const col = th.plates[pi % th.plates.length];
    const mat = plateMat(col);
    const geo = plateGeo(p.shape, p.w, p.h);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    // layering: push outward so front plates sit in front of back screws
    m.position.set(p.x, p.y, PT/2 + 0.01 + p.layer * (PT + 0.04));
    if (p.shape==='disc') m.rotation.x = Math.PI/2;
    parent.add(m);
    plateVis[pi] = { m, parent, pos:m.position.clone(), rot:m.rotation.clone(), attached:true, baseOpacity:1, mat };
  });

  L.screws.forEach((s,i)=>{
    const parent = anchors[s.side] || root;
    const {group, head, hit} = makeScrew(s.color);
    // screw sits on its plate face; lower layer slightly recessed when covered
    const pl = L.plates[s.plate];
    const z = PT/2 + 0.01 + pl.layer * (PT + 0.04) + 0.095;
    group.position.set(s.lx, s.ly, z);
    hit.userData.i = i;
    parent.add(group);
    screwVis[i] = { group, head, hit, parent, pos:group.position.clone(), onObj:true, shake:0, color:s.color };
  });

  // frame model
  const box = new THREE.Box3().setFromObject(root);
  const c = box.getCenter(new THREE.Vector3());
  root.position.sub(c);
  root.position.y += 0.15;
  controls.target.set(0, 0.15, 0);
  camera.position.set(0, 1.5, 7.0);
  controls.update();
}

function burst(pos, cols, n=10, speed=2){
  for (let i=0;i<n;i++){
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.06+Math.random()*0.05, 8, 6),
      new THREE.MeshBasicMaterial({ color: cols[i%cols.length] })
    );
    m.position.copy(pos);
    m.userData = { t:0, v:new THREE.Vector3((Math.random()-.5)*speed,(Math.random()*.6+.4)*speed,(Math.random()-.5)*speed), av:(Math.random()-.5)*8 };
    scene.add(m); bits.push(m);
  }
}

// ---------- hold-preview (Screwdom-style see-through) ----------
function endHoldPreview(){
  if (!holdPreview) return;
  holdPreview.plates.forEach(pi=>{
    const pv = plateVis[pi]; if (!pv || !pv.attached) return;
    pv.mat.transparent = false; pv.mat.opacity = 1; pv.mat.depthWrite = true; pv.mat.needsUpdate = true;
  });
  if (holdPreview.screw!=null && screwVis[holdPreview.screw]){
    screwVis[holdPreview.screw].head.scale.setScalar(1);
  }
  // dim overlay on other screws reset
  screwVis.forEach(v=>{ if (v.onObj) v.group.traverse(o=>{ if (o.isMesh && o.material && o.material.opacity!=null && o!==v.hit) { /* keep */ } }); });
  holdPreview = null;
  $('holdHint').classList.add('hidden');
  // restore all plate opacities
  plateVis.forEach(pv=>{
    if (!pv.attached) return;
    pv.mat.transparent = false; pv.mat.opacity = 1; pv.mat.depthWrite = true;
  });
}

function startHoldPreview(screwIdx){
  endHoldPreview();
  if (!playing || !L || st.removed[screwIdx]) return;
  const cover = G.coveringPlates(L, st, screwIdx);
  // Also: if tapping a free screw, still lightly ghost higher plates on same side for teaching
  const s = L.screws[screwIdx];
  const sameSideHigher = [];
  L.plates.forEach((p,pi)=>{
    if (p.side===s.side && p.layer>s.layer && G.plateAttached(L,st,pi)) sameSideHigher.push(pi);
  });
  const plates = cover.length ? cover : sameSideHigher.slice(0, 2);
  if (!plates.length && !G.isBlocked(L,st,screwIdx)){
    // show a gentle tip anyway on first levels
    if (n<=5){ $('holdHint').textContent='这颗可以拧开 · 点一下'; $('holdHint').classList.remove('hidden'); }
    holdPreview = { screw:screwIdx, plates:[], t0:performance.now() };
    if (screwVis[screwIdx]) screwVis[screwIdx].head.scale.setScalar(1.15);
    return;
  }
  plates.forEach(pi=>{
    const pv = plateVis[pi]; if (!pv || !pv.attached) return;
    pv.mat.transparent = true; pv.mat.opacity = 0.22; pv.mat.depthWrite = false; pv.mat.needsUpdate = true;
  });
  // dim non-related front plates slightly
  plateVis.forEach((pv,pi)=>{
    if (!pv.attached || plates.includes(pi)) return;
    if (L.plates[pi].side===s.side && L.plates[pi].layer>=s.layer){
      pv.mat.transparent = true; pv.mat.opacity = 0.55; pv.mat.depthWrite = false;
    }
  });
  if (screwVis[screwIdx]) screwVis[screwIdx].head.scale.setScalar(1.2);
  holdPreview = { screw:screwIdx, plates, t0:performance.now() };
  $('holdHint').textContent = cover.length ? '👀 半透明预览 · 松开后点一下可拧（若已露出）' : '👀 长按预览层叠';
  $('holdHint').classList.remove('hidden');
  buzz(8);
}

function pickScrewAt(clientX, clientY){
  const ndc = new THREE.Vector2(clientX/innerWidth*2-1, -(clientY/innerHeight)*2+1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  const targets = [];
  screwVis.forEach(v=>{ if (v.onObj) targets.push(v.hit); });
  // also allow hitting covering plates → find nearest screw under
  plateVis.forEach((pv,pi)=>{ if (pv.attached){ pv.m.userData.plate=pi; targets.push(pv.m); } });
  const hits = ray.intersectObjects(targets, false);
  if (!hits.length) return null;
  const o = hits[0].object;
  if (o.userData.i!==undefined) return o.userData.i;
  if (o.userData.plate!==undefined){
    // find a blocked screw under this plate
    const pi = o.userData.plate; const p = L.plates[pi];
    let best=null, bestD=1e9;
    L.screws.forEach((s,i)=>{
      if (st.removed[i] || s.side!==p.side || s.layer>=p.layer) return;
      if (Math.abs(s.lx-p.x)<p.w/2+0.12 && Math.abs(s.ly-p.y)<p.h/2+0.12){
        const d = Math.hypot(s.lx-p.x, s.ly-p.y);
        if (d<bestD){ bestD=d; best=i; }
      }
    });
    // fallback: any screw on this plate
    if (best==null && p.screws) best = p.screws.find(i=>!st.removed[i]) ?? null;
    return best;
  }
  return null;
}

// ---------- level start / UI ----------
function modelForLevel(lv){
  const th = THEMES[save.theme||'pets'];
  const m = th.models[(lv-1) % th.models.length];
  return m.m;
}
function startLevel(lv){
  unlock(); n=lv; used=0; history=[]; hammerArmed=false; combo=0; shownCleared=0; playing=false;
  hideModal(); hideReveal(); endHoldPreview();
  const mk = modelForLevel(lv);
  try { L = G.makeLevel(lv, mk, MODELS[mk]); }
  catch(e){ toast('关卡生成失败: '+e.message); console.error(e); return; }
  st = G.initState(L);
  buildLevel(L, mk);
  showScreen('hud');
  $('lvl').innerHTML = `第${lv}关` + (L.hard?'<span class="badge">困难</span>':'') + (L.layers?`<span class="badge">层×${L.layers}</span>`:'');
  $('tip').textContent = lv<=2 ? '点彩色螺丝拧下来 · 长按可透视挡住的层' : (lv<=5 ? '长按螺丝或挡板 → 半透明预览' : '');
  renderUI(); renderItems();
  playing = true;
  setTimeout(()=>{ if(lv===1) toast('👆 点螺丝拧下 · 长按看后面', 2500); }, 300);
}

function renderUI(){
  if (!st) return;
  const be=$('boxes'); be.innerHTML='';
  st.boxes.forEach((b,i)=>{
    const d=document.createElement('div'); d.className='box'; d.id='box'+i;
    d.style.background = b ? hex(b.color) : '#fff6';
    for(let k=0;k<G.BOX_SLOTS;k++){
      const s=document.createElement('div'); const f=b&&k<b.n;
      s.className='slot'+(f?' f':''); if(f) s.style.background=hex(b.color); d.appendChild(s);
    }
    be.appendChild(d);
  });
  const bu=$('buf'); bu.innerHTML=''; bu.classList.toggle('warn', st.buffer.length>=st.bufCap-1 && playing);
  for(let k=0;k<st.bufCap;k++){
    const s=document.createElement('div'); s.id='buf'+k; s.className='slot'+(st.buffer[k]?' f':'');
    if(st.buffer[k]) s.style.background=hex(st.buffer[k]); bu.appendChild(s);
  }
  updateCoins();
}
function renderItems(){
  const el=$('items'); el.innerHTML='';
  // ad button always
  const ad=document.createElement('button'); ad.className='item ad';
  ad.innerHTML=`📺<small>看广告</small>`; ad.onclick=()=>openAdProps(); el.appendChild(ad);
  if (n<3) return;
  for (const k of ['hammer','slot','magnet','undo']){
    const it=ITEMS[k], c=save.items[k]||0;
    const b=document.createElement('button'); b.className='item'+(k==='hammer'&&hammerArmed?' armed':'');
    b.innerHTML=`${it.icon}<small>${c>0?it.name:'广告+'}</small>`+(c>0?`<span class="cnt">${c}</span>`:'');
    b.onclick=()=>{ if(c>0) useItem(k); else watchAd(k); };
    el.appendChild(b);
  }
}

function consumeItem(k){
  if ((save.items[k]||0)<=0) return false;
  save.items[k]--; used++; persist(); return true;
}
function useItem(k){
  if (!playing || flying.length) return;
  if (k==='hammer'){ hammerArmed=!hammerArmed; if(hammerArmed) toast('🔨 点任意螺丝！',1000); renderItems(); return; }
  if (k==='slot'){ if (st.bufCap>=L.buf+2) return toast('暂存区已经最大啦'); if(!consumeItem(k)) return watchAd(k); history.push(G.clone(st)); st.bufCap++; sfx.pop(); renderUI(); }
  if (k==='magnet'){
    const targets=[];
    for (const b of st.boxes) if (b){ let need=G.BOX_SLOTS-b.n; L.screws.forEach((s,i)=>{ if(need>0 && !st.removed[i] && s.color===b.color && !targets.includes(i)){ targets.push(i); need--; } }); }
    if (!targets.length) return toast('没有可吸的螺丝');
    if (!consumeItem(k)) return watchAd(k); history.push(G.clone(st));
    for (const i of targets){ const bi=st.boxes.findIndex(b=>b&&b.color===L.screws[i].color&&b.n<G.BOX_SLOTS); if(bi<0) continue; st.boxes[bi].n++; st.removed[i]=true; flyScrew(i,'box'+bi); }
    G.settle(st); sfx.turn(); sync();
  }
  if (k==='undo'){ if(!history.length) return toast('没有可撤销的步骤'); if(!consumeItem(k)) return watchAd(k); st=history.pop(); shownCleared=st.cleared||0; sync(); renderUI(); }
  renderItems();
}

function tapScrew(i){
  if (!playing || st.removed[i]) return;
  const ham=hammerArmed;
  if (!ham && G.isBlocked(L,st,i)){ screwVis[i].shake=0.4; sfx.blocked(); buzz(30); $('tip').textContent='🔒 被挡住了 · 长按可透视'; return; }
  if (ham && !consumeItem('hammer')){ hammerArmed=false; renderItems(); toast('请先看广告获得锤子'); return; }
  const snap=G.clone(st);
  const res=G.doMove(L,st,i,ham);
  if (!res){ if(ham){ save.items.hammer=(save.items.hammer||0)+1; used--; persist(); } return; }
  hammerArmed=false; history.push(snap); if(history.length>30) history.shift();
  sfx.turn(); buzz(12);
  flyScrew(i, res.dest==='box'?'box'+res.k:'buf'+res.k);
  sync(); renderItems();
}

function slotWorld(el){
  const r=el.getBoundingClientRect();
  const v=new THREE.Vector3((r.left+r.width/2)/innerWidth*2-1, -((r.top+r.height/2)/innerHeight*2-1), 0.5).unproject(camera);
  return camera.position.clone().add(v.sub(camera.position).normalize().multiplyScalar(3.5));
}
function flyScrew(i, elId){
  const v=screwVis[i]; if(!v.onObj) return; v.onObj=false;
  const wp=new THREE.Vector3(), wq=new THREE.Quaternion(); v.group.getWorldPosition(wp); v.group.getWorldQuaternion(wq);
  scene.attach(v.group);
  const el=$(elId)||$('boxes');
  flying.push({ v, t:0, from:wp.clone(), out:wp.clone().add(new THREE.Vector3(0,0,0.6).applyQuaternion(wq)), to:slotWorld(el) });
}
function sync(){
  const th=THEMES[save.theme||'pets'];
  L.plates.forEach((p,pi)=>{
    const pv=plateVis[pi], att=G.plateAttached(L,st,pi);
    if (!att && pv.attached){
      pv.attached=false; const wp=new THREE.Vector3(); pv.m.getWorldPosition(wp); scene.attach(pv.m);
      const out=wp.clone().sub(root.position).normalize();
      falling.push({ m:pv.m, v:out.multiplyScalar(2.6).add(new THREE.Vector3(0,2.4,0)), av:new THREE.Vector3(Math.random()*7-3.5,Math.random()*7-3.5,Math.random()*7-3.5), t:0 });
      burst(wp, [pv.m.material.color.getHex(), 0xffffff, ...th.plates.slice(0,2), 0xffd43b], 12, 2.6);
      sfx.pop(); setTimeout(()=>sfx.thud(), 380); buzz(18);
    }
    if (att && !pv.attached){ pv.attached=true; falling=falling.filter(f=>f.m!==pv.m); pv.parent.add(pv.m); pv.m.position.copy(pv.pos); pv.m.rotation.copy(pv.rot); }
  });
  L.screws.forEach((s,i)=>{ const v=screwVis[i];
    if (!st.removed[i] && !v.onObj){ flying=flying.filter(f=>f.v!==v); v.onObj=true; v.parent.add(v.group); v.group.position.copy(v.pos); v.group.rotation.set(0,0,0); v.group.scale.setScalar(1); }
  });
}
function boxCleared(){
  const now=performance.now()/1000;
  combo = now-lastClearT<2.6 ? combo+1 : 1; lastClearT=now;
  sfx.chime(combo); buzz([25,40,25]);
  $('boxes').classList.remove('flash'); void $('boxes').offsetWidth; $('boxes').classList.add('flash');
  if (combo>=2){ const c=$('combo'); c.textContent = combo>=4?'神了！':combo===3?'太棒了！':'不错！';
    c.classList.remove('on'); void c.offsetWidth; c.classList.add('on'); }
}
function checkEnd(){
  const cl=st.cleared||0; while (shownCleared<cl){ shownCleared++; boxCleared(); }
  renderUI();
  if (flying.length || !playing) return;
  if (G.isWin(L,st)){ playing=false; setTimeout(reveal,700); }
  else if (G.isLose(L,st)){ playing=false; sfx.lose(); buzz([60,40,60]); setTimeout(lose,350); }
}

// ---------- reveal + results ----------
let revealT=null;
function figInfo(){ const tk=save.theme||'pets', th=THEMES[tk], fi=(n-1)%th.figures.length; return {tk,th,fi,f:th.figures[fi]}; }
function jump(el){ el.classList.remove('jump'); void el.offsetWidth; el.classList.add('jump'); sfx.boing(); buzz(15); }
function reveal(){
  const {f}=figInfo(); const r=$('reveal');
  $('rvFig').textContent=f[0]; $('rvName').textContent=f[1];
  const sp=$('rvSpark'); sp.innerHTML='';
  for (let k=0;k<16;k++){ const s=document.createElement('span'); s.textContent=k%3?'✨':'⭐'; const a=k/16*Math.PI*2, d=90+(k%4)*25;
    s.style.setProperty('--dx',Math.cos(a)*d+'px'); s.style.setProperty('--dy',Math.sin(a)*d+'px'); s.style.animationDelay=(k%4)*0.05+'s'; sp.appendChild(s); }
  r.classList.remove('hidden'); r.classList.remove('show'); void r.offsetWidth; r.classList.add('show');
  sfx.jingle(); buzz([30,50,30,50,80]);
  burst(new THREE.Vector3(0,0.5,0), Object.values(COLORS), 36, 4.2);
  revealT=setTimeout(()=>{ win(); }, 2400);
}
function hideReveal(){ clearTimeout(revealT); $('reveal').classList.add('hidden'); }
$('rvFig').onclick=e=>{ e.stopPropagation(); jump($('rvFig')); };
function win(){
  hideReveal();
  const stars=used===0?3:used<=2?2:1, bonus=used===0?8:0, gain=L.reward+bonus;
  save.coins+=gain; save.stars[n]=Math.max(save.stars[n]||0,stars); save.unlocked=Math.max(save.unlocked, Math.min(n+1,G.LEVEL_COUNT));
  const {tk,th,fi}=figInfo(), col=(save.collection[tk]=save.collection[tk]||[]);
  const newFig=!col.includes(fi); if(newFig) col.push(fi); persist();
  $('ovt').textContent = n===G.LEVEL_COUNT ? '全部通关！🎉' : '拆完啦！🎉';
  $('ovStars').textContent='⭐'.repeat(stars)+'☆'.repeat(3-stars);
  $('ovs').innerHTML=`+${L.reward} 💖${L.hard?'（困难×2）':''}${bonus?`<br>+${bonus} 💖 未用道具奖励`:''}<div class="fig" id="ovFig">${th.figures[fi][0]}</div>${newFig?'获得新手办：':'已收藏：'}${th.figures[fi][1]}`;
  btns([[n<G.LEVEL_COUNT?'下一关 ▶':'返回地图', ()=> n<G.LEVEL_COUNT?startLevel(n+1):openMap()], ['🗺️ 地图', openMap, 'alt']]);
  $('ovFig').onclick=()=>jump($('ovFig'));
}
function lose(){
  $('ovt').textContent='哎呀！暂存区满了 😿'; $('ovStars').textContent='';
  $('ovs').textContent = '可以看广告复活，或重试。';
  const b=[];
  b.push(['📺 看广告复活', ()=>watchAd('revive', ()=>{
    history=[]; st.stash.push(...st.buffer.splice(0,3)); G.settle(st); shownCleared=st.cleared||0; playing=true; hideModal(); renderUI(); renderItems(); toast('💗 复活成功！');
  })]);
  if ((save.items.revive||0)>0) b.push([`💗 使用复活 ×${save.items.revive}`, ()=>{
    if(!consumeItem('revive')) return; history=[]; st.stash.push(...st.buffer.splice(0,3)); G.settle(st); shownCleared=st.cleared||0; playing=true; hideModal(); renderUI(); renderItems();
  }]);
  b.push(['↻ 重试', ()=>startLevel(n), 'alt'], ['🗺️ 地图', openMap, 'gray']);
  btns(b);
}
function btns(list){ const e=$('ovBtns'); e.innerHTML=''; for(const [t,f,c] of list){ const b=document.createElement('button'); b.className='btn '+(c||''); b.textContent=t; b.onclick=()=>{ hideModal(); f(); }; e.appendChild(b);} $('ov').classList.remove('hidden'); updateCoins(); }
function hideModal(){ $('ov').classList.add('hidden'); }

// ---------- ads monetization ----------
let adTimer=null, adPending=null;
function openAdProps(){
  const l=$('adList'); l.innerHTML='';
  for (const k of Object.keys(ITEMS)){
    const it=ITEMS[k];
    const r=document.createElement('div'); r.className='srow';
    r.innerHTML=`<div class="ic">${it.icon}</div><div class="d"><b>${it.name}</b> ×${save.items[k]||0}<br>${it.desc}</div>`;
    const b=document.createElement('button'); b.className='btn small'; b.textContent='📺 看广告 +1';
    b.onclick=()=>{ $('adProps').classList.add('hidden'); watchAd(k); };
    r.appendChild(b); l.appendChild(r);
  }
  $('adProps').classList.remove('hidden');
}
$('closeAdProps').onclick=()=>$('adProps').classList.add('hidden');
$('openAdProps').onclick=openAdProps;

function watchAd(itemKey, onDone){
  adPending = { itemKey, onDone };
  const secs = 3 + Math.floor(Math.random()*3); // 3–5s
  $('adArt').textContent = ['🎬','🍿','📺','✨','🎮'][Math.floor(Math.random()*5)];
  $('adTitle').textContent = '模拟广告播放中…';
  $('adCount').textContent = String(secs);
  $('adSkip').classList.add('hidden');
  $('adClaim').classList.add('hidden');
  $('adView').classList.remove('hidden');
  let left = secs;
  clearInterval(adTimer);
  adTimer = setInterval(()=>{
    left--;
    if (left>0){ $('adCount').textContent = String(left); $('adTitle').textContent = `广告 ${left}`; }
    else {
      clearInterval(adTimer);
      $('adCount').textContent = '✓';
      $('adTitle').textContent = '广告播放完毕';
      $('adClaim').classList.remove('hidden');
      $('adSkip').classList.add('hidden');
    }
  }, 1000);
  // allow skip after 1s for testing
  setTimeout(()=>$('adSkip').classList.remove('hidden'), 900);
}
function grantAdReward(){
  $('adView').classList.add('hidden');
  if (!adPending) return;
  const { itemKey, onDone } = adPending; adPending=null;
  if (onDone){ onDone(); sfx.adDing(); return; }
  save.items[itemKey] = (save.items[itemKey]||0)+1; persist();
  sfx.adDing(); buzz(20); toast(`${ITEMS[itemKey].icon} 获得 ${ITEMS[itemKey].name} ×1`);
  renderItems(); updateCoins();
}
$('adClaim').onclick=grantAdReward;
$('adSkip').onclick=()=>{ clearInterval(adTimer); $('adCount').textContent='✓'; $('adTitle').textContent='（测试）已跳过'; $('adClaim').classList.remove('hidden'); $('adSkip').classList.add('hidden'); };

// ---------- map / themes / settings / collection ----------
function showScreen(s){ $('map').classList.toggle('hidden', s!=='map'); $('hud').classList.toggle('hidden', s!=='hud'); renderer.domElement.style.visibility = s==='hud'?'visible':'hidden'; }
function openMap(){
  playing=false; hideModal(); hideReveal(); endHoldPreview(); showScreen('map'); updateCoins();
  const p=$('path'); p.innerHTML='';
  for (let i=1;i<=G.LEVEL_COUNT;i++){
    const d=document.createElement('div'), lock=i>save.unlocked, hard=i%5===0, s=save.stars[i]||0;
    d.className='node'+(lock?' lock':'')+(hard?' hard':'')+(i===save.unlocked?' cur':'');
    d.style.marginLeft=(Math.sin(i*1.1)*110)+'px';
    d.innerHTML=(hard?'<span class="hb">困难</span>':'')+(lock?'🔒':i)+`<span class="st">${lock?'':'⭐'.repeat(s)+'☆'.repeat(3-s)}</span>`;
    if(!lock) d.onclick=()=>startLevel(i);
    p.appendChild(d);
  }
  const cur=p.querySelector('.cur'); if(cur) cur.scrollIntoView({block:'center'});
}
function applyTheme(){
  const th=THEMES[save.theme||'pets']; const r=document.documentElement;
  for (const k in th.css) r.style.setProperty(k, th.css[k]);
  document.body.dataset.theme = save.theme||'pets';
  const bg=$('bgDeco'); bg.innerHTML='';
  for (let i=0;i<14;i++){ const e=document.createElement('span'); e.textContent=th.bgEmoji[i%th.bgEmoji.length];
    e.style.left=(i*37%100)+'%'; e.style.top=(i*53%100)+'%'; e.style.fontSize=(18+i*7%22)+'px'; e.style.animationDelay=(-i*1.3)+'s'; bg.appendChild(e); }
  // adjust lights for space theme
  if (save.theme==='space'){ hemi.color.set(0xc8b8ff); hemi.groundColor.set(0x1a3050); key.color.set(0xe8e0ff); }
  else { hemi.color.set(0xfff2e0); hemi.groundColor.set(0xb8d4ff); key.color.set(0xfff5e6); }
}
function openThemePicker(first){
  const l=$('themeList'); l.innerHTML='';
  $('themeTitle').textContent = first ? '选择你喜欢的主题' : '切换主题';
  $('themeSub').textContent = first ? '随时可以在设置里更换，进度通用' : '进度和软货币在所有主题间通用';
  for (const k in THEMES){ const t=THEMES[k];
    const c=document.createElement('button'); c.className='tcard'+(save.theme===k?' sel':''); c.dataset.k=k;
    c.style.background=t.css['--bg']; c.innerHTML=`<div class="tic">${t.icon}</div><b>${t.name}</b><small>${t.desc}</small><div class="tfig">${t.figures.slice(0,4).map(f=>f[0]).join('')}</div>`;
    c.onclick=()=>{ save.theme=k; persist(); applyTheme(); $('themePick').classList.add('hidden'); openMap(); toast(`${t.icon} 已切换到「${t.name}」`,1200); };
    l.appendChild(c); }
  $('themeClose').classList.toggle('hidden', !!first);
  $('themePick').classList.remove('hidden');
}
function openCollection(){
  const l=$('colList'); l.innerHTML='';
  let total=0, got=0;
  for (const k in THEMES){ const t=THEMES[k], col=save.collection[k]||[];
    const sec=document.createElement('div'); sec.className='shelf';
    sec.innerHTML=`<h3>${t.icon} ${t.name} <small>${col.length}/${t.figures.length}</small></h3><div class="row">`+
      t.figures.map((f,i)=>col.includes(i)?`<div class="fg">${f[0]}<small>${f[1]}</small></div>`:`<div class="fg no">❓<small>第${i+1}关</small></div>`).join('')+'</div>';
    l.appendChild(sec); total+=t.figures.length; got+=col.length; }
  $('colSum').textContent=`已收集 ${got}/${total}`;
  $('collection').classList.remove('hidden');
}
$('openSettings').onclick=()=>$('settings').classList.remove('hidden');
$('closeSettings').onclick=()=>$('settings').classList.add('hidden');
$('setTheme').onclick=()=>{ $('settings').classList.add('hidden'); openThemePicker(false); };
$('setReset').onclick=()=>{ if(confirm('确定要清除所有进度吗？')){ localStorage.removeItem(SAVE_KEY); location.reload(); } };
$('themeClose').onclick=()=>$('themePick').classList.add('hidden');
$('openCol').onclick=openCollection; $('closeCol').onclick=()=>$('collection').classList.add('hidden');
$('toMap').onclick=openMap; $('restart').onclick=()=>startLevel(n);
function renderToggles(){ $('tgSound').textContent='🔊 音效：'+(save.sound?'开':'关'); $('tgVibe').textContent='📳 震动：'+(save.vibe?'开':'关');
  $('tgSound').classList.toggle('gray',!save.sound); $('tgVibe').classList.toggle('gray',!save.vibe); }
$('tgSound').onclick=()=>{ save.sound=!save.sound; fx.sound=save.sound; persist(); renderToggles(); };
$('tgVibe').onclick=()=>{ save.vibe=!save.vibe; fx.vibe=save.vibe; persist(); renderToggles(); buzz(30); };
renderToggles();
$('reveal').onclick=()=>{ win(); };

// ---------- input: tap vs hold vs drag ----------
let down=null, multi=0, holdTimer=null;
const cv=renderer.domElement;
cv.addEventListener('pointerdown', e=>{
  multi++;
  if (!(e.isPrimary && multi===1)) { down=null; return; }
  down = {x:e.clientX,y:e.clientY,t:performance.now(), screw:null, preview:false};
  if (!playing) return;
  const si = pickScrewAt(e.clientX, e.clientY);
  down.screw = si;
  clearTimeout(holdTimer);
  if (si!=null){
    holdTimer = setTimeout(()=>{
      if (!down || down.screw!==si) return;
      down.preview = true;
      startHoldPreview(si);
      controls.enabled = false;
    }, HOLD_MS);
  }
});
addEventListener('pointermove', e=>{
  if (!down) return;
  if (Math.hypot(e.clientX-down.x, e.clientY-down.y)>12){
    clearTimeout(holdTimer);
    if (!down.preview) down.screw = null; // became a drag
  }
});
addEventListener('pointercancel', ()=>{ multi=Math.max(0,multi-1); clearTimeout(holdTimer); endHoldPreview(); controls.enabled=true; down=null; });
cv.addEventListener('pointerup', e=>{
  multi=Math.max(0,multi-1);
  clearTimeout(holdTimer);
  controls.enabled = true;
  if (!down) return;
  const moved=Math.hypot(e.clientX-down.x,e.clientY-down.y);
  const wasPreview = down.preview;
  const si = down.screw;
  down=null;
  endHoldPreview();
  if (wasPreview) return; // hold = preview only, not unscrew
  if (moved>12) return;
  if (si!=null) tapScrew(si);
  else {
    // short tap ray again
    const s2 = pickScrewAt(e.clientX, e.clientY);
    if (s2!=null) tapScrew(s2);
  }
});

// ---------- tutorial hand ----------
const tmpV=new THREE.Vector3(), tmpN=new THREE.Vector3(), camDir=new THREE.Vector3(), tmpQ=new THREE.Quaternion();
function updateHand(){
  const h=$('hand');
  if (n>3 || !playing || flying.length || holdPreview){ h.style.display='none'; return; }
  const cols=st.boxes.filter(Boolean).map(b=>b.color);
  const free=G.freeScrews(L,st).filter(i=>{ const v=screwVis[i]; v.group.getWorldPosition(tmpV); tmpN.set(0,0,1).applyQuaternion(v.group.getWorldQuaternion(tmpQ));
    return tmpN.dot(camDir.copy(camera.position).sub(tmpV).normalize())>0.35; });
  const i=free.find(i=>cols.includes(L.screws[i].color)) ?? free[0];
  if (i===undefined){ h.style.display='none'; return; }
  screwVis[i].group.getWorldPosition(tmpV).project(camera);
  h.style.display='block'; h.style.left=((tmpV.x+1)/2*innerWidth)+'px'; h.style.top=((1-tmpV.y)/2*innerHeight)+'px';
}

// ---------- loop ----------
const clock=new THREE.Clock();
renderer.setAnimationLoop(()=>{
  const dt=Math.min(clock.getDelta(),0.05);
  if ($('hud').classList.contains('hidden')) return;
  controls.update();
  for (let i=falling.length-1;i>=0;i--){ const f=falling[i]; f.t+=dt; f.v.y-=9.8*dt; f.m.position.addScaledVector(f.v,dt);
    f.m.rotation.x+=f.av.x*dt; f.m.rotation.y+=f.av.y*dt; f.m.rotation.z+=f.av.z*dt; if (f.t>2.5){ scene.remove(f.m); falling.splice(i,1); } }
  let landed=false;
  for (let i=flying.length-1;i>=0;i--){ const f=flying[i], g=f.v.group; f.t+=dt;
    if (f.t<0.24){ const k=f.t/0.24; g.position.lerpVectors(f.from,f.out,k*k); f.v.head.rotation.z+=dt*40;
      const sq=Math.sin(k*Math.PI); g.scale.set(1+0.25*sq,1+0.25*sq,1-0.45*sq+0.6*k); }
    else { const k=Math.min((f.t-0.24)/0.34,1), e=k*k*(3-2*k); g.position.lerpVectors(f.out,f.to,e); const s=1-0.5*e; g.scale.set(s,s,s*(1+0.4*Math.sin(k*Math.PI)));
      if (k>=1){ scene.remove(g); flying.splice(i,1); landed=true; } } }
  if (landed) checkEnd();
  for (let i=bits.length-1;i>=0;i--){ const b=bits[i], u=b.userData; u.t+=dt; u.v.y-=7*dt; b.position.addScaledVector(u.v,dt); b.rotation.x+=u.av*dt; b.rotation.y+=u.av*0.7*dt;
    b.scale.setScalar(Math.max(0,1-u.t/1.2)); if (u.t>1.2){ scene.remove(b); bits.splice(i,1); } }
  for (const v of screwVis||[]) if (v.shake>0){ v.shake-=dt; v.head.position.x=v.shake>0?Math.sin(v.shake*70)*0.04:0; }
  updateHand();
  renderer.render(scene,camera);
});

applyTheme(); openMap(); if(!save.theme) openThemePicker(true);

// test hooks for headless / parent agent
window.__game = {
  openThemePicker, openCollection, openAdProps, openMap, watchAd, grantAdReward,
  setTheme:k=>{save.theme=k;persist();applyTheme();},
  startLevel, tap:tapScrew, startHoldPreview, endHoldPreview,
  get L(){return L;}, get st(){return st;}, get playing(){return playing;}, get save(){return save;},
  get holdPreview(){return holdPreview;}, get plateVis(){return plateVis;}, get screwVis(){return screwVis;},
  get camera(){return camera;}, get controls(){return controls;}, get scene(){return scene;}, get root(){return root;},
  G, SAVE_KEY,
  autoWin(level){
    // apply solution if present
    startLevel(level);
    const sol = L.solution; if(!sol) throw new Error('no solution');
    for (const i of sol){ if (st.removed[i]) continue; const r=G.doMove(L,st,i); if(!r) throw new Error('solution failed at '+i); }
    sync(); renderUI();
    if (!G.isWin(L,st)) throw new Error('not win after solution');
    playing=false; return true;
  }
};
