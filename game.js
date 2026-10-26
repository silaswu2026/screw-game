import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as G from './logic.js';
import { THEMES } from './themes.js';
import { MODELS } from './models.js';
import { sfx, buzz, unlock, fx } from './audio.js';

const COLORS = { red:0xff6b6b, blue:0x4dabf7, yellow:0xffd43b, green:0x51cf66, purple:0xb197fc, orange:0xff922b };
const ITEMS = {
  hammer:{ icon:'🔨', name:'锤子', price:30, desc:'敲掉任意一颗螺丝，被挡住的也行。' },
  slot:  { icon:'➕', name:'+1格', price:40, desc:'本关暂存区多一个格子。' },
  magnet:{ icon:'🧲', name:'磁铁', price:60, desc:'把当前盒子颜色的螺丝直接吸进盒子。' },
  undo:  { icon:'↩️', name:'撤销', price:20, desc:'撤回上一步。' },
  revive:{ icon:'💗', name:'复活', price:50, desc:'暂存区满了时：清空3格继续玩。' },
};
const PT = 0.16;
const $ = id => document.getElementById(id);

// ---------- save ----------
const today = () => new Date().toISOString().slice(0,10);
let save = JSON.parse(localStorage.getItem('sb3d') || 'null') || { coins:100, unlocked:1, stars:{}, items:{hammer:0,slot:0,magnet:0,undo:0,revive:0}, lastDaily:'' };
save.collection = save.collection || {}; save.theme = save.theme || null;
if (save.sound===undefined) save.sound=true; if (save.vibe===undefined) save.vibe=true;
fx.sound=save.sound; fx.vibe=save.vibe;
const persist = () => localStorage.setItem('sb3d', JSON.stringify(save));
function toast(msg, ms=1600){ const t=$('toast'); t.innerHTML=msg; t.classList.add('on'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('on'),ms); }
function updateCoins(){ document.querySelectorAll('.cv').forEach(e=>e.textContent=save.coins); }
if (save.lastDaily !== today()){ save.lastDaily = today(); save.coins += 25; persist(); setTimeout(()=>toast('🎁 每日登录奖励！<br>+25 💖'),400); }
addEventListener('pointerdown', unlock, { capture:true });
document.addEventListener('click', e=>{ if (e.target.closest('button')) sfx.tapUI(); }, true);

// ---------- three ----------
const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth/innerHeight, 0.1, 100);
scene.add(new THREE.HemisphereLight(0xffffff, 0xd8e6f0, 1.1));
const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(3,6,5); scene.add(dl);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.enablePan = false; controls.rotateSpeed = 0.8;
let modelRadius = 2.2;
function fitCamera(){
  const a=innerWidth/innerHeight, vh=THREE.MathUtils.degToRad(camera.fov/2), hh=Math.atan(Math.tan(vh)*a);
  const d = modelRadius/Math.sin(Math.min(vh,hh))*0.86;
  camera.position.set(1,0.75,1.4).setLength(d); controls.minDistance=d*0.6; controls.maxDistance=d*1.6;
}
addEventListener('resize', ()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });

// toon look: 3-step gradient + inverted-hull soft outlines
const grad = new THREE.DataTexture(new Uint8Array([110,110,110,255, 190,190,190,255, 255,255,255,255]), 3, 1);
grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
const toonCache = {};
const toon = c => toonCache[c] || (toonCache[c] = new THREE.MeshToonMaterial({ color:c, gradientMap:grad }));
const outlineMat = new THREE.MeshBasicMaterial({ color:0x5b4a44, side:THREE.BackSide });
function outline(mesh, s=1.045){ const o=new THREE.Mesh(mesh.geometry, outlineMat); o.scale.setScalar(s); o.raycast=()=>{}; mesh.add(o); return mesh; }

const headGeo = new THREE.CylinderGeometry(0.13,0.15,0.09,14); headGeo.rotateX(Math.PI/2);
const domeGeo = new THREE.SphereGeometry(0.13,14,6,0,Math.PI*2,0,Math.PI/2); domeGeo.rotateX(Math.PI/2); domeGeo.scale(1,1,0.45); domeGeo.translate(0,0,0.045);
const shaftGeo = new THREE.CylinderGeometry(0.045,0.045,0.32,6); shaftGeo.rotateX(Math.PI/2); shaftGeo.translate(0,0,-0.16);
const slotGeo = new THREE.BoxGeometry(0.16,0.035,0.02);
const hitGeo = new THREE.SphereGeometry(0.27,8,6);
const hitMat = new THREE.MeshBasicMaterial({ visible:false });
const slotMat = new THREE.MeshBasicMaterial({ color:0xffffff });
const screwOutline = new THREE.MeshBasicMaterial({ color:0x4a3b35, side:THREE.BackSide });

function plateGeo(shape,w,h){
  const b=0.035, W=Math.max(w-2*b,0.05), Hh=Math.max(h-2*b,0.05), s=new THREE.Shape();
  if (shape==='disc'){ s.absellipse(0,0,W/2,Hh/2,0,Math.PI*2); }
  else if (shape==='tri'){ s.moveTo(-W/2,-Hh/2); s.lineTo(W/2,-Hh/2); s.quadraticCurveTo(W*0.08,Hh*0.42,0,Hh/2); s.quadraticCurveTo(-W*0.08,Hh*0.42,-W/2,-Hh/2); }
  else if (shape==='fin'){ s.moveTo(-W/2,-Hh/2); s.lineTo(W/2,-Hh/2); s.quadraticCurveTo(0,0,-W/2,Hh/2); s.lineTo(-W/2,-Hh/2); }
  else { const r=Math.min(0.12,W/3,Hh/3); s.moveTo(-W/2+r,-Hh/2); s.lineTo(W/2-r,-Hh/2); s.quadraticCurveTo(W/2,-Hh/2,W/2,-Hh/2+r); s.lineTo(W/2,Hh/2-r); s.quadraticCurveTo(W/2,Hh/2,W/2-r,Hh/2); s.lineTo(-W/2+r,Hh/2); s.quadraticCurveTo(-W/2,Hh/2,-W/2,Hh/2-r); s.lineTo(-W/2,-Hh/2+r); s.quadraticCurveTo(-W/2,-Hh/2,-W/2+r,-Hh/2); }
  const g=new THREE.ExtrudeGeometry(s,{ depth:PT-2*b, bevelEnabled:true, bevelThickness:b, bevelSize:b, bevelSegments:2, curveSegments:10 });
  g.center(); g.userData.own=true; return g;
}
function partGeo(p){
  const s=p.s; let g;
  if (p.t==='rbox') g=new RoundedBoxGeometry(s[0],s[1],s[2],3,p.rad??Math.min(0.22,Math.min(...s)*0.2));
  else if (p.t==='cyl') g=new THREE.CylinderGeometry(s[0],s[0],s[1],16);
  else if (p.t==='cap') g=new THREE.CapsuleGeometry(s[0],s[1],4,10);
  else if (p.t==='sph') g=new THREE.SphereGeometry(s[0],16,12);
  else if (p.t==='wheel'){ g=new THREE.CylinderGeometry(s[0],s[0],s[1],20); g.rotateX(Math.PI/2); }
  else if (p.t==='cone') g=new THREE.ConeGeometry(s[0],s[1],s[2]||12);
  else if (p.t==='saucer') g=new THREE.CylinderGeometry(s[0],s[0]*0.8,s[1],32);
  else if (p.t==='dome') g=new THREE.SphereGeometry(s[0],20,10,0,Math.PI*2,0,Math.PI/2);
  g.userData.own=true; return g;
}

// confetti / debris pool
const bitGeo = new THREE.BoxGeometry(0.08,0.08,0.02);
const bits = [];
function burst(pos, colors, count=14, speed=3){
  for (let k=0;k<count;k++){
    const m=new THREE.Mesh(bitGeo, toon(colors[k%colors.length])); m.position.copy(pos);
    m.userData={ v:new THREE.Vector3(Math.random()-.5, Math.random()*0.8+0.4, Math.random()-.5).multiplyScalar(speed), av:Math.random()*12, t:0 };
    scene.add(m); bits.push(m);
  }
}

// ---------- level state ----------
let model={name:''}, n=1, L, st, root, coreMeshes=[], anchorGroups, plateVis, screwVis, falling=[], flying=[], history=[], playing=false, used=0, hammerArmed=false;
let shownCleared=0, combo=0, lastClearT=-9;

function startLevel(num){
  hideModal(); hideReveal(); n=num;
  const th=THEMES[save.theme||'pets']; model=th.models[(n-1)%th.models.length]; const M=MODELS[model.m];
  L=G.makeLevel(n, model.m, M); st=G.initState(L); history=[]; used=0; hammerArmed=false; playing=true; shownCleared=0; combo=0;
  if (root){ scene.remove(root); root.traverse(o=>{ if(o.geometry && o.geometry.userData.own) o.geometry.dispose(); }); }
  falling.forEach(f=>scene.remove(f.m)); flying.forEach(f=>scene.remove(f.v.group)); bits.forEach(b=>scene.remove(b)); bits.length=0; falling=[]; flying=[];
  root=new THREE.Group(); scene.add(root); coreMeshes=[];
  for (const p of M.core){ const m=outline(new THREE.Mesh(partGeo(p), toon(p.c))); m.position.set(...p.p); if(p.r) m.rotation.set(...p.r); root.add(m); coreMeshes.push(m); }
  anchorGroups={};
  for (const a of M.anchors){ const g=new THREE.Group(); g.position.set(...a.p); g.rotation.set(...a.r); root.add(g); anchorGroups[a.id]=g; }
  plateVis = L.plates.map((p,pi)=>{
    const m=outline(new THREE.Mesh(plateGeo(p.shape,p.w,p.h), toon(th.plates[(pi*5+p.layer)%th.plates.length])), 1.035);
    m.position.set(p.x,p.y,PT/2+p.layer*PT); anchorGroups[p.side].add(m);
    return { m, parent:anchorGroups[p.side], pos:m.position.clone(), rot:m.rotation.clone(), attached:true };
  });
  screwVis = L.screws.map((s,i)=>{
    const g=new THREE.Group(); g.position.set(s.lx,s.ly,PT*(s.layer+1)+0.045); anchorGroups[s.side].add(g);
    const hit=new THREE.Mesh(hitGeo,hitMat); hit.userData.i=i; g.add(hit);
    const mat=toon(COLORS[s.color]);
    const head=new THREE.Mesh(headGeo,mat); g.add(head);
    const ho=new THREE.Mesh(headGeo,screwOutline); ho.scale.setScalar(1.12); ho.raycast=()=>{}; head.add(ho);
    head.add(new THREE.Mesh(domeGeo,mat)); head.add(new THREE.Mesh(shaftGeo,mat));
    const a=new THREE.Mesh(slotGeo,slotMat); a.position.z=0.1; a.rotation.z=(i*1.7)%3; head.add(a);
    const b=a.clone(); b.rotation.z+=Math.PI/2; head.add(b);
    head.scale.setScalar(0.85);
    return { group:g, head, hit, parent:anchorGroups[s.side], pos:g.position.clone(), onObj:true, shake:0 };
  });
  // centre model and fit camera
  const box=new THREE.Box3().setFromObject(root), c=box.getCenter(new THREE.Vector3()), sph=box.getBoundingSphere(new THREE.Sphere());
  root.position.sub(c); modelRadius=sph.radius; controls.target.set(0,0,0);
  fitCamera(); controls.update();
  $('lvl').innerHTML=`第${n}关 · ${model.name}`+(L.hard?'<span class="badge">困难</span>':'');
  $('hand').style.display='none';
  const tips={1:'点一下螺丝，它会飞进同色盒子！✨',2:'拖动可以旋转模型，找找别的螺丝 🌀',3:'颜色不对的螺丝会进暂存区，别让它满了！',4:'被板子压住的螺丝拧不动，先拆上面的板子！'};
  $('tip').textContent = tips[n] || (L.hard ? (n>=15?'超难关卡！想好再拧 💜 奖励翻倍':'困难关卡！爱心奖励翻倍 💜') : '');
  showScreen('hud'); renderUI(); renderItems();
}

// ---------- UI ----------
const hex = c => '#'+COLORS[c].toString(16).padStart(6,'0');
function renderUI(){
  const be=$('boxes'); be.innerHTML='';
  st.boxes.forEach((b,i)=>{
    const d=document.createElement('div'); d.className='box'; d.id='box'+i;
    d.style.background = b ? hex(b.color) : '#fff6';
    for(let k=0;k<G.BOX_SLOTS;k++){ const s=document.createElement('div'); const f=b&&k<b.n; s.className='slot'+(f?' f':''); if(f) s.style.background=hex(b.color); d.appendChild(s); }
    be.appendChild(d);
  });
  const bu=$('buf'); bu.innerHTML=''; bu.classList.toggle('warn', st.buffer.length>=st.bufCap-1 && playing);
  for(let k=0;k<st.bufCap;k++){ const s=document.createElement('div'); s.id='buf'+k; s.className='slot'+(st.buffer[k]?' f':''); if(st.buffer[k]) s.style.background=hex(st.buffer[k]); bu.appendChild(s); }
  updateCoins();
}
function renderItems(){
  const el=$('items'); el.innerHTML='';
  if (n<4) return;
  for (const k of ['hammer','slot','magnet','undo']){
    const it=ITEMS[k], c=save.items[k];
    const b=document.createElement('button'); b.className='item'+(k==='hammer'&&hammerArmed?' armed':'');
    b.innerHTML=`${it.icon}<small>${c>0?it.name:it.price+'💖'}</small>`+(c>0?`<span class="cnt">${c}</span>`:'');
    b.onclick=()=>useItem(k); el.appendChild(b);
  }
}
function pay(k){
  if (save.items[k]>0) save.items[k]--;
  else if (save.coins>=ITEMS[k].price) save.coins-=ITEMS[k].price;
  else { toast('爱心币不够啦 💖'); return false; }
  used++; persist(); updateCoins(); return true;
}
function useItem(k){
  if (!playing || flying.length) return;
  if (k==='hammer'){ hammerArmed=!hammerArmed; if(hammerArmed) toast('🔨 点任意螺丝！',1000); renderItems(); return; }
  if (k==='slot'){ if (st.bufCap>=L.buf+2) return toast('暂存区已经最大啦'); if(!pay(k)) return; history.push(G.clone(st)); st.bufCap++; sfx.pop(); renderUI(); }
  if (k==='magnet'){
    const targets=[];
    for (const b of st.boxes) if (b){ let need=G.BOX_SLOTS-b.n; L.screws.forEach((s,i)=>{ if(need>0 && !st.removed[i] && s.color===b.color && !targets.includes(i)){ targets.push(i); need--; } }); }
    if (!targets.length) return toast('没有可吸的螺丝');
    if (!pay(k)) return; history.push(G.clone(st));
    for (const i of targets){ const bi=st.boxes.findIndex(b=>b&&b.color===L.screws[i].color&&b.n<G.BOX_SLOTS); if(bi<0) continue; st.boxes[bi].n++; st.removed[i]=true; flyScrew(i,'box'+bi); }
    G.settle(st); sfx.turn(); sync();
  }
  if (k==='undo'){ if(!history.length) return toast('没有可撤销的步骤'); if(!pay(k)) return; st=history.pop(); shownCleared=st.cleared||0; sync(); renderUI(); }
  renderItems();
}
function tapScrew(i){
  if (!playing || st.removed[i]) return;
  const ham=hammerArmed;
  if (!ham && G.isBlocked(L,st,i)){ screwVis[i].shake=0.4; sfx.blocked(); buzz(30); if(n>=4) $('tip').textContent='🔒 这颗螺丝被板子压住了！'; return; }
  if (ham && !pay('hammer')){ hammerArmed=false; renderItems(); return; }
  const snap=G.clone(st);
  const res=G.doMove(L,st,i,ham);
  if (!res){ if(ham){ save.items.hammer++; used--; persist(); } return; }
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
    if (!att && pv.attached){ pv.attached=false; const wp=new THREE.Vector3(); pv.m.getWorldPosition(wp); scene.attach(pv.m);
      const out=wp.clone().sub(root.position).normalize();
      falling.push({ m:pv.m, v:out.multiplyScalar(2.6).add(new THREE.Vector3(0,2.4,0)), av:new THREE.Vector3(Math.random()*7-3.5,Math.random()*7-3.5,Math.random()*7-3.5), t:0, thud:false });
      burst(wp, [pv.m.material.color.getHex(), 0xffffff, ...th.plates.slice(0,2), 0xffd43b], 12, 2.6);
      sfx.pop(); setTimeout(()=>sfx.thud(), 380); buzz(18); }
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
  if (combo>=2){ const c=$('combo'); c.textContent = combo>=4?'神了！':combo===3?'太棒了！':'不错！'; c.dataset.lv=Math.min(combo,4);
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
  burst(new THREE.Vector3(0,0,0), Object.values(COLORS), 40, 4.5);
  revealT=setTimeout(()=>{ win(); }, 2600);
}
function hideReveal(){ clearTimeout(revealT); $('reveal').classList.add('hidden'); }
$('rvFig').onclick=e=>{ e.stopPropagation(); jump($('rvFig')); };
function win(){
  hideReveal();
  const stars=used===0?3:used<=2?2:1, bonus=used===0?10:0, gain=L.reward+bonus;
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
  $('ovs').textContent = n>=4 ? '复活可以清空3格，继续挑战。' : '换个顺序试试！';
  const b=[];
  if (n>=4) b.push([`💗 复活（${save.items.revive>0?'拥有 '+save.items.revive:ITEMS.revive.price+' 💖'}）`, ()=>{
    if(!pay('revive')) return; history=[]; st.stash.push(...st.buffer.splice(0,3)); G.settle(st); shownCleared=st.cleared||0; playing=true; hideModal(); renderUI(); renderItems(); }]);
  b.push(['↻ 重试', ()=>startLevel(n), 'alt'], ['🗺️ 地图', openMap, 'gray']);
  btns(b);
}
function btns(list){ const e=$('ovBtns'); e.innerHTML=''; for(const [t,f,c] of list){ const b=document.createElement('button'); b.className='btn '+(c||''); b.textContent=t; b.onclick=()=>{ hideModal(); f(); }; e.appendChild(b);} $('ov').classList.remove('hidden'); updateCoins(); }
function hideModal(){ $('ov').classList.add('hidden'); }

// ---------- map / shop ----------
function showScreen(s){ $('map').classList.toggle('hidden', s!=='map'); $('hud').classList.toggle('hidden', s!=='hud'); renderer.domElement.style.visibility = s==='hud'?'visible':'hidden'; }
function openMap(){
  playing=false; hideModal(); hideReveal(); showScreen('map'); updateCoins();
  const p=$('path'); p.innerHTML='';
  for (let i=1;i<=G.LEVEL_COUNT;i++){
    const d=document.createElement('div'), lock=i>save.unlocked, hard=i%5===0, s=save.stars[i]||0;
    d.className='node'+(lock?' lock':'')+(hard?' hard':'')+(i===save.unlocked?' cur':'');
    d.style.marginLeft=(Math.sin(i*1.1)*120)+'px';
    d.innerHTML=(hard?'<span class="hb">困难</span>':'')+(lock?'🔒':i)+`<span class="st">${lock?'':'⭐'.repeat(s)+'☆'.repeat(3-s)}</span>`;
    d.dataset.n=i; if(!lock) d.onclick=()=>startLevel(i);
    p.appendChild(d);
  }
  const cur=p.querySelector('.cur'); if(cur) cur.scrollIntoView({block:'center'});
}
function openShop(){
  const l=$('shopList'); l.innerHTML='';
  for (const k in ITEMS){ const it=ITEMS[k];
    const r=document.createElement('div'); r.className='srow';
    r.innerHTML=`<div class="ic">${it.icon}</div><div class="d"><b>${it.name}</b> ×${save.items[k]}<br>${it.desc}</div>`;
    const b=document.createElement('button'); b.className='btn small'; b.textContent=it.price+' 💖';
    b.onclick=()=>{ if(save.coins<it.price) return toast('爱心币不够啦 💖'); save.coins-=it.price; save.items[k]++; persist(); updateCoins(); openShop(); toast(`${it.icon} +1 ${it.name}`,900); };
    r.appendChild(b); l.appendChild(r);
  }
  updateCoins(); $('shop').classList.remove('hidden');
}

// ---------- themes / settings / collection ----------
function applyTheme(){
  const th=THEMES[save.theme||'pets']; const r=document.documentElement;
  for (const k in th.css) r.style.setProperty(k, th.css[k]);
  document.body.dataset.theme = save.theme||'pets';
  const bg=$('bgDeco'); bg.innerHTML='';
  for (let i=0;i<14;i++){ const e=document.createElement('span'); e.textContent=th.bgEmoji[i%th.bgEmoji.length];
    e.style.left=(i*37%100)+'%'; e.style.top=(i*53%100)+'%'; e.style.fontSize=(18+i*7%22)+'px'; e.style.animationDelay=(-i*1.3)+'s'; bg.appendChild(e); }
}
function openThemePicker(first){
  const l=$('themeList'); l.innerHTML='';
  $('themeTitle').textContent = first ? '选择你喜欢的主题' : '切换主题';
  $('themeSub').textContent = first ? '随时可以在设置里更换，进度和爱心币通用' : '进度和爱心币在所有主题间通用';
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
      t.figures.map((f,i)=>col.includes(i)?`<div class="fg">${f[0]}<small>${f[1]}</small></div>`:`<div class="fg no">❓<small>第${i+1}/${i+11}关</small></div>`).join('')+'</div>';
    l.appendChild(sec); total+=t.figures.length; got+=col.length; }
  $('colSum').textContent=`已收集 ${got}/${total}`;
  $('collection').classList.remove('hidden');
}
$('openSettings').onclick=()=>$('settings').classList.remove('hidden');
$('closeSettings').onclick=()=>$('settings').classList.add('hidden');
$('setTheme').onclick=()=>{ $('settings').classList.add('hidden'); openThemePicker(false); };
$('setReset').onclick=()=>{ if(confirm('确定要清除所有进度吗？')){ localStorage.removeItem('sb3d'); location.reload(); } };
$('themeClose').onclick=()=>$('themePick').classList.add('hidden');
$('openCol').onclick=openCollection; $('closeCol').onclick=()=>$('collection').classList.add('hidden');
$('openShop').onclick=openShop; $('closeShop').onclick=()=>$('shop').classList.add('hidden');
$('toMap').onclick=openMap; $('restart').onclick=()=>startLevel(n);
// sound / vibration toggles
function renderToggles(){ $('tgSound').textContent='🔊 音效：'+(save.sound?'开':'关'); $('tgVibe').textContent='📳 震动：'+(save.vibe?'开':'关');
  $('tgSound').classList.toggle('gray',!save.sound); $('tgVibe').classList.toggle('gray',!save.vibe); }
$('tgSound').onclick=()=>{ save.sound=!save.sound; fx.sound=save.sound; persist(); renderToggles(); };
$('tgVibe').onclick=()=>{ save.vibe=!save.vibe; fx.vibe=save.vibe; persist(); renderToggles(); buzz(30); };
renderToggles();
$('reveal').onclick=()=>{ win(); };

// ---------- input: tap vs drag ----------
const ray=new THREE.Raycaster(), ndc=new THREE.Vector2(); let down=null, multi=0;
const cv=renderer.domElement;
cv.addEventListener('pointerdown', e=>{ multi++; down = e.isPrimary && multi===1 ? {x:e.clientX,y:e.clientY,t:performance.now()} : null; });
addEventListener('pointercancel', ()=>{ multi=Math.max(0,multi-1); down=null; });
cv.addEventListener('pointerup', e=>{
  multi=Math.max(0,multi-1);
  if (!down) return; const moved=Math.hypot(e.clientX-down.x,e.clientY-down.y), dt=performance.now()-down.t; down=null;
  if (moved>10 || dt>450) return; // rotate drag, not a tap
  ndc.set(e.clientX/innerWidth*2-1, -(e.clientY/innerHeight)*2+1); ray.setFromCamera(ndc,camera);
  const targets=coreMeshes.slice(); screwVis.forEach(v=>{ if(v.onObj) targets.push(v.hit); });
  const hits=ray.intersectObjects(targets,false);
  if (hits.length && hits[0].object.userData.i!==undefined) tapScrew(hits[0].object.userData.i);
});

// ---------- tutorial hand ----------
const tmpV=new THREE.Vector3(), tmpN=new THREE.Vector3(), camDir=new THREE.Vector3(), tmpQ=new THREE.Quaternion();
function updateHand(){
  const h=$('hand');
  if (n>3 || !playing || flying.length){ h.style.display='none'; return; }
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
      const sq=Math.sin(k*Math.PI); g.scale.set(1+0.25*sq,1+0.25*sq,1-0.45*sq+0.6*k); } // squash then stretch while unscrewing
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
// test hooks
window.__game = { openThemePicker, openCollection, setTheme:k=>{save.theme=k;persist();applyTheme();}, startLevel, tap:tapScrew, get L(){return L;}, get st(){return st;}, get playing(){return playing;}, get save(){return save;}, openShop, openMap,
  isWin:()=>G.isWin(L,st), isLose:()=>G.isLose(L,st), flying:()=>flying.length, winNow:()=>win(), openSettings:()=>$('openSettings').click() };
