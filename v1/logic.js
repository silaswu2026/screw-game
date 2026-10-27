// Pure game logic + procedural level generator + solver (no three.js; runs in node too)
export const COLOR_NAMES = ['red','blue','yellow','green','purple','orange'];
export const BOX_SLOTS = 3;
const SIDES_ORDER = ['F','R','T','L','D','B'];

function rng(seed){ seed = (seed % 2147483646) + 1; return ()=>{ seed = (seed*16807)%2147483647; return (seed-1)/2147483646; }; }
const shuffle=(a,r)=>{ for(let i=a.length-1;i>0;i--){ const j=Math.floor(r()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };

export const LEVEL_COUNT = 20;
export function levelParams(n){ // n = 1..20
  const hard = n%5===0;
  let p;
  if (n<=3) p = { colors:2, anchors:n, layers:0, boxes:2, buf:5, tutorial:true };
  else if (n<=8) p = { colors:3, anchors:[3,3,4,4,5][n-4], layers:n<6?1:2, boxes:3, buf:5, specials:true };
  else if (n<=14) p = { colors:n<12?4:5, anchors:n<12?5:6, layers:n<12?2:3, boxes:3, buf:4, specials:true };
  else p = { colors:6, anchors:99, layers:2, boxes:3, buf:4, specials:true, backSide:true, tight:true };
  if (hard){ p.layers += 1; p.extraPlates = 1; }
  p.hard = hard; p.n = n;
  p.reward = Math.round(10 + 20*(n-1)/(LEVEL_COUNT-1)) * (hard?2:1);
  return p;
}

function platePts(w,h,shape,cnt,r){
  const ix=Math.max(w/2-Math.min(0.22,w/4),0), iy=Math.max(h/2-Math.min(0.22,h/4),0);
  if (cnt===1) return shape==='tri'||shape==='fin' ? [[0,-h*0.15]] : [[0,0]];
  if (shape==='disc'){ const R=Math.min(w,h)*0.3; return cnt===4?[[R,0],[-R,0],[0,R],[0,-R]]:cnt===3?[[0,R],[-R*0.87,-R/2],[R*0.87,-R/2]]:[[-R,0],[R,0]]; }
  if (cnt===4) return [[-ix,-iy],[ix,-iy],[-ix,iy],[ix,iy]];
  if (cnt===3) return [[-ix,iy],[ix,iy],[0,-iy]];
  return r()<.5?[[-ix,iy],[ix,-iy]]:[[ix,iy],[-ix,-iy]];
}
function genLayout(p, r, model){
  const plates=[], screws=[];
  const addPlate=(side,layer,x,y,w,h,cnt,shape='rect')=>{
    const pl={side,layer,x,y,w,h,shape,screws:[]}; const pi=plates.length; plates.push(pl);
    for(const [sx,sy] of platePts(w,h,shape,cnt,r)){ pl.screws.push(screws.length); screws.push({plate:pi,side,layer,lx:x+sx,ly:y+sy}); }
  };
  const normal = model.anchors.filter(a=>!a.special && (p.backSide || !a.back)).slice(0, p.anchors);
  for (const a of normal){
    const big = a.w>=0.85 && a.h>=0.85;
    addPlate(a.id,0,0,0,a.w,a.h, big?4:(a.w*a.h>0.35?2:1), a.shape||'rect');
    if (p.tutorial) continue;
    if (!big && a.w*a.h<0.6) continue;
    for (let l=1;l<=p.layers;l++){
      const cnt = 1 + (l===1 && big && r()<.4?1:0) + (p.extraPlates && l===1 && big?1:0);
      for (let k=0;k<cnt;k++){
        for (let tryN=0; tryN<8; tryN++){
          const w=Math.max(0.45, a.w*(0.4+r()*0.45)), h=Math.max(0.45, a.h*(0.4+r()*0.45));
          if (w>a.w || h>a.h) break;
          const x=(r()*2-1)*(a.w-w)/2, y=(r()*2-1)*(a.h-h)/2;
          const shape = Math.abs(w-h)<0.25 && r()<0.45 ? 'disc' : 'rect';
          const c = w*h>0.75?4:(w*h>0.3?2:1);
          const pts = platePts(w,h,shape,c,r).map(([sx,sy])=>[x+sx,y+sy]);
          const clash = pts.some(([px,py])=>screws.some(q=>q.side===a.id && Math.hypot(q.lx-px,q.ly-py)<0.3));
          if (clash) continue;
          addPlate(a.id,l,x,y,w,h,c,shape); break;
        }
      }
    }
  }
  if (p.specials) for (const a of model.anchors.filter(a=>a.special && (p.backSide || !a.back)))
    addPlate(a.id,0,0,0,a.w,a.h, a.w*a.h>0.3?2:1, a.shape);
  const base=plates.map((q,j)=>j).filter(j=>plates[j].layer===0 && plates[j].w>=0.8); let i=0;
  if (!base.length) base.push(0);
  while (screws.length%3 || screws.length<3*p.colors){ const pi=base[i%base.length]; const pl=plates[pi]; const j=Math.floor(i/base.length), off=[-0.3,0.3,0,-0.15,0.15][j%5]*Math.min(1,pl.w), offy=[0,0,0.22,-0.22,0.22][j%5]*Math.min(1,pl.h); i++;
    pl.screws.push(screws.length); screws.push({plate:pi,side:pl.side,layer:0,lx:pl.x+off,ly:pl.y+offy}); }
  return {plates,screws};
}

const levelCache = {};
export function makeLevel(n, modelKey, model){
  const key=n+'|'+modelKey; if (levelCache[key]) return levelCache[key];
  const p = levelParams(n);
  let best=null;
  for (let attempt=0; attempt<(p.tight?40:80); attempt++){
    const r = rng(n*7919 + attempt*104729 + modelKey.length*31337);
    const {plates,screws} = genLayout(p, r, model);
    const groups = screws.length/3; const cols = COLOR_NAMES.slice(0,p.colors);
    if (groups < p.colors) continue;
    const colorList=[]; for(let g=0;g<groups;g++) for(let k=0;k<3;k++) colorList.push(cols[g%cols.length]);
    shuffle(colorList,r); screws.forEach((s,i)=>s.color=colorList[i]);
    const queue=[]; const cnt={}; colorList.forEach(c=>cnt[c]=(cnt[c]||0)+1);
    for(const c in cnt) for(let k=0;k<cnt[c]/3;k++) queue.push(c);
    shuffle(queue,r);
    const L = { ...p, model:modelKey, plates, screws, queue, seed:attempt };
    if (!p.tight){ const sol = solve(L, rng(attempt+99), p.tutorial?50:400); if (sol){ L.solution=sol; return levelCache[key]=L; } continue; }
    // tight (level 15+): measure how often random-greedy play wins; keep the hardest layout that is still winnable
    const N=200; let wins=0, sol=null; const rr=rng(attempt+7);
    for (let t=0;t<N;t++){ const s=solve(L, rr, 1); if (s){ wins++; sol=sol||s; } }
    if (!sol) continue;
    L.solution=sol; L.winRate=wins/N;
    if (!best || L.winRate<best.winRate) best=L;
    if (L.winRate<=0.25) break;
  }
  if (best) return levelCache[key]=best;
  throw new Error('no solvable layout for level '+n);
}

export function initState(L){
  const st = { removed:L.screws.map(()=>false), boxes:[], queue:L.queue.slice(), buffer:[], stash:[], bufCap:L.buf };
  for(let k=0;k<L.boxes;k++) st.boxes.push(st.queue.length?{color:st.queue.shift(),n:0}:null);
  return st;
}
export const clone = st => JSON.parse(JSON.stringify(st));
export const plateAttached = (L,st,pi) => L.plates[pi].screws.some(i=>!st.removed[i]);
export function isBlocked(L,st,i){
  const s=L.screws[i];
  return L.plates.some((p,pi)=> p.side===s.side && p.layer>s.layer && plateAttached(L,st,pi) &&
    Math.abs(s.lx-p.x) < p.w/2+0.12 && Math.abs(s.ly-p.y) < p.h/2+0.12);
}
// remove screw i. returns {dest:'box',k} | {dest:'buf',k} | null
export function doMove(L,st,i,ignoreBlock){
  if (st.removed[i] || (!ignoreBlock && isBlocked(L,st,i))) return null;
  const c = L.screws[i].color;
  const k = st.boxes.findIndex(b=>b && b.color===c && b.n<BOX_SLOTS);
  let res;
  if (k>=0){ st.boxes[k].n++; res={dest:'box',k}; }
  else if (st.buffer.length < st.bufCap){ st.buffer.push(c); res={dest:'buf',k:st.buffer.length-1}; }
  else return null;
  st.removed[i]=true; settle(st); return res;
}
export function settle(st){
  let ch=true;
  while(ch){ ch=false;
    st.boxes.forEach((b,k)=>{ if(b && b.n>=BOX_SLOTS){ st.boxes[k]=st.queue.length?{color:st.queue.shift(),n:0}:null; ch=true; st.cleared=(st.cleared||0)+1; } });
    for (const arr of [st.buffer, st.stash]) for(let j=0;j<arr.length;j++){
      const b=st.boxes.find(b=>b && b.color===arr[j] && b.n<BOX_SLOTS);
      if(b){ b.n++; arr.splice(j,1); j--; ch=true; }
    }
  }
}
export const isWin = (L,st)=> st.removed.every(Boolean);
export const isLose = (L,st)=> !isWin(L,st) && st.buffer.length>=st.bufCap;
export const freeScrews = (L,st)=> L.screws.map((_,i)=>i).filter(i=>!st.removed[i] && !isBlocked(L,st,i));

// randomized greedy playouts; returns move list or null
export function solve(L, r, tries=300){
  for (let t=0;t<tries;t++){
    const st=initState(L), moves=[];
    for(;;){
      if (isWin(L,st)) return moves;
      if (isLose(L,st)) break;
      const free=freeScrews(L,st);
      if(!free.length) break;
      const cols=st.boxes.filter(Boolean).map(b=>b.color);
      const good=free.filter(i=>cols.includes(L.screws[i].color));
      let pick;
      if (good.length) pick=good[Math.floor(r()*good.length)];
      else {
        // prefer screws whose plate would fall (unlocks things), else random
        const fall=free.filter(i=>L.plates[L.screws[i].plate].screws.filter(j=>!st.removed[j]).length===1);
        const pool = fall.length && r()<.7 ? fall : free;
        pick=pool[Math.floor(r()*pool.length)];
      }
      if(!doMove(L,st,pick)) break;
      moves.push(pick);
    }
  }
  return null;
}
