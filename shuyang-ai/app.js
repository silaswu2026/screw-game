/* 伍澍暘 · 第 1 月 · 异地微信语音课 */
const V = '11';
const STORE = 'shuyang_ai_month_v1';
const REWARD_STORE = 'shuyang_ai_rewards_v1';
const PEOPLE = {
  '小雨': { src: 'avatars/xiaoyu.jpg', cls: 'xiaoyu', name: '小雨' },
  '爸爸': { src: 'avatars/dad-wuxin.jpg', cls: 'dad', name: '爸爸' },
  '妈妈': { src: 'avatars/mom-chunyan.jpg', cls: 'mom', name: '妈妈' },
  '澍暘': { src: 'avatars/pengpeng.jpg', cls: 'son', name: '澍暘' },
};
const WHO = {
  son: ['澍暘这边', '澍暘自己做，再用语音或摄像头给爸爸看'],
  dad: ['爸爸打字', '爸爸在这边打字，澍暘用嘴指挥'],
  call: ['语音一起', '微信语音里一起做，各看各的屏幕'],
};
const POSE_OPTS = ['站好', '抬左脚', '抬右脚', '蹲下', '跳起', '挥手'];
const SORT_ITEMS = [
  { id: 'draw', t: '纸上的一个忍者', ok: '2d' },
  { id: 'flip', t: '翻页动画', ok: '2d' },
  { id: 'photo', t: '一张照片', ok: '2d' },
  { id: 'cup', t: '手里能转的纸杯或书', ok: '3d' },
  { id: 'rocket', t: '屏幕里能转的火箭', ok: '3d' },
  { id: 'block', t: '积木或乐高', ok: '3d' },
];
const TOOL_NAME = { start: '起点', spring: '弹簧', boss: '头目', goal: '终点' };
const DEFAULT_REWARDS = [
  { id: 'r1', name: '小星星贴纸 / 小零食一份', cost: 3, emoji: '🍬' },
  { id: 'r2', name: '多看一集喜欢的动画', cost: 5, emoji: '📺' },
  { id: 'r3', name: '周末多玩 20 分钟游戏', cost: 7, emoji: '🎮' },
  { id: 'r4', name: '爸爸陪做「新关卡想法」一晚', cost: 10, emoji: '🗺️' },
  { id: 'r5', name: '澍暘导演日：用 AI 画一个角色', cost: 12, emoji: '🎬' },
  { id: 'r6', name: '月度大奖：他选的一次小奖励（约定好）', cost: 20, emoji: '🏆' },
];

let view = { name: 'home', day: 1 };
let flash = '';
let flashKind = 'ok';
let sessionStart = 0;
let clockHandle = 0;
let wired = false;
const chatByKey = {};
const intervals = {};
const stops = [];
const micBlobs = {};
let audioCtx = null;
let explain = null;
const REDUCE = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function course() {
  const c = globalThis.SHUYANG_COURSE;
  if (!c || !Array.isArray(c.DAYS) || c.DAYS.length !== 30) throw new Error('课程数据不完整');
  if (!globalThis.ShuyangSync) throw new Error('同步模块没载入');
  return c;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function byId(id) { return document.getElementById(id); }
function dayBy(n) { return course().DAYS.find((d) => d.d === n); }
function weekOf(d) { return course().WEEKS.find((w) => w.id === d.w); }

function load() {
  try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; }
}
function save(data) { localStorage.setItem(STORE, JSON.stringify(data)); }
function loadRewards() {
  try {
    const raw = JSON.parse(localStorage.getItem(REWARD_STORE) || 'null');
    if (!raw) return { catalog: DEFAULT_REWARDS.map((x) => ({ ...x })), redeemed: [], catalogTs: 0 };
    if (!Array.isArray(raw.catalog) || !raw.catalog.length) raw.catalog = DEFAULT_REWARDS.map((x) => ({ ...x }));
    if (!Array.isArray(raw.redeemed)) raw.redeemed = [];
    if (!raw.catalogTs) raw.catalogTs = 0;
    return raw;
  } catch {
    return { catalog: DEFAULT_REWARDS.map((x) => ({ ...x })), redeemed: [], catalogTs: 0 };
  }
}
function saveRewards(r) { localStorage.setItem(REWARD_STORE, JSON.stringify(r)); }
function starStats(data, rewards) {
  const earned = course().DAYS.filter((d) => data[d.d]?.done).length;
  const spent = (rewards.redeemed || []).reduce((s, x) => s + (Number(x.cost) || 0), 0);
  return { earned, spent, bal: Math.max(0, earned - spent) };
}
function readAll() {
  const rewards = loadRewards();
  return { v: 1, days: load(), rewards: { catalog: rewards.catalog, catalogTs: rewards.catalogTs || 0, redeemed: rewards.redeemed || [] } };
}
function writeAll(state) {
  if (state.days) save(state.days);
  if (state.rewards) saveRewards(state.rewards);
}
function normalize(raw) {
  const src = raw || {};
  return {
    summary: '', principleNote: '', madeNote: '', videoUrl: '', didDo: false, done: false,
    steps: {}, timerDone: {}, widgets: {}, ...src,
    steps: src.steps || {}, timerDone: src.timerDone || {}, widgets: src.widgets || {},
  };
}
function getDay(n) { return normalize(load()[n]); }
function patchDay(n, fn) {
  const cur = JSON.parse(JSON.stringify(getDay(n)));
  fn(cur);
  const day = dayBy(n);
  cur.artifact = composeArtifact(day, cur);
  cur.didDo = day.steps.every((s) => cur.steps?.[s.id]?.on);
  cur.at = new Date().toISOString();
  const data = load();
  data[n] = cur;
  save(data);
  paintResult();
  return cur;
}
function recomputeAll(days) {
  course().DAYS.forEach((d) => {
    const raw = days[d.d] || days[String(d.d)];
    if (!raw) return;
    const saved = normalize(raw);
    saved.artifact = composeArtifact(d, saved);
    days[String(d.d)] = saved;
  });
}

function formText(step, w) {
  const f = (w && w.fields) || {};
  const val = (id) => String(f[id] || '').trim();
  if (!(step.fields || []).some((field) => val(field.id))) return '';
  if (step.formMode === 'rules') return `规矩卡\n动作：${val('action')}\n危险：${val('danger')}`;
  if (step.formMode === 'level') return `关卡《${val('name')}》\n1. ${val('r1')}\n2. ${val('r2')}\n3. ${val('r3')}`;
  if (step.formMode === 'sounds') return `音效：${val('s1')}、${val('s2')}、${val('s3')}\n背景乐：${val('bgm')}`;
  if (step.formMode === 'wishes') return `愿望1：${val('w1')}\n愿望2：${val('w2')}\n愿望3：${val('w3')}\n下月主线：第${val('main')}个\n下一次第一件事：${val('step')}`;
  if (step.formMode === 'count') return `${step.fields[0].label}：${val(step.fields[0].id)}`;
  return step.fields.map((field) => `${field.label}：${val(field.id)}`).join('\n');
}
function fillTemplate(tpl, fields) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (_, id) => (fields[id] ? String(fields[id]) : '____'));
}
function mapText(cells) {
  const parts = [];
  (cells || []).forEach((c, i) => { if (c) parts.push(`${TOOL_NAME[c] || c}在第${i + 1}格`); });
  return parts.join('，');
}
function composeArtifact(day, saved) {
  const bits = [];
  (day.steps || []).forEach((step) => {
    const w = saved.widgets?.[step.id];
    if (!w) return;
    if (step.widget === 'pick' && w.artifact) bits.push(w.artifact);
    if (step.widget === 'form') { const t = formText(step, w); if (t) bits.push(t); }
    if (step.widget === 'prompt' && w.fields && Object.values(w.fields).some((x) => String(x || '').trim())) bits.push(fillTemplate(step.template, w.fields));
    if (step.widget === 'drum' && ((w.beats || []).some(Boolean) || w.name)) {
      bits.push(`鼓点《${w.name || '还没起名'}》：${(w.beats || []).map((b) => (b ? 'x' : '-')).join('')}${w.sfxHeard ? '；听过落地音' : ''}`);
    }
    if (step.widget === 'map' && (w.cells || []).some(Boolean)) bits.push(mapText(w.cells));
    if (step.widget === 'sort' && w.bins) {
      const answered = SORT_ITEMS.filter((it) => w.bins[it.id]).length;
      if (answered) bits.push(`平面/立体分对 ${SORT_ITEMS.filter((it) => w.bins[it.id] === it.ok).length}/6`);
    }
    if (step.widget === 'poses' && (w.poses || []).some(Boolean)) bits.push('三个姿势：' + w.poses.filter(Boolean).join('、'));
    if (step.widget === 'spot' && w.n) bits.push(`看见换姿势 ${w.n} 次`);
    if (step.widget === 'flip' && w.n) bits.push(`翻页 ${w.n} 次，顺序是${w.order === 'mix' ? '乱序' : '跑步'}`);
    if (step.widget === 'fps' && w.choice) bits.push(`更顺的是${w.choice === 'fast' ? '快的（每秒更多张）' : '慢的'}`);
    if (step.widget === 'layers' && (Number(w.nx) || Number(w.bg))) bits.push(`忍者滑块 ${w.nx || 0}，背景滑块 ${w.bg || 0}`);
    if (step.widget === 'spin' && (w.faces || []).length) bits.push('看到的面：' + w.faces.join('、'));
    if (step.widget === 'wave' && w.choice) bits.push(`更像连着的声音：${w.choice === 'dense' ? '密点' : '稀点'}`);
    if (step.widget === 'mic' && (w.recorded || w.heard)) bits.push(w.heard ? '爸爸听到了回放' : '页面上录过当当当');
  });
  return bits.filter(Boolean).join('\n').slice(0, 900);
}

function faceImg(who, extra) {
  const p = PEOPLE[who];
  if (!p) return '';
  return `<img class="face ${p.cls} ${extra || ''}" src="${p.src}?v=${V}" alt="${esc(p.name)}">`;
}
function faceRow(keys) {
  return `<div class="faces">${keys.map((k) => `<figure>${faceImg(k)}<figcaption>${esc(PEOPLE[k].name)}</figcaption></figure>`).join('')}</div>`;
}
function peopleToday(day) {
  const has = new Set((day.talk || []).map((t) => t[0]));
  has.add('小雨');
  (day.steps || []).forEach((s) => {
    if (s.who === 'son') has.add('澍暘');
    if (s.who === 'dad') has.add('爸爸');
    if (s.who === 'call') { has.add('小雨'); has.add('爸爸'); has.add('澍暘'); }
  });
  return ['小雨', '爸爸', '妈妈', '澍暘'].filter((k) => has.has(k));
}
function stepPeople(day, step) {
  if (step.who === 'son') return ['澍暘'];
  if (step.who === 'dad') return ['爸爸'];
  return peopleToday(day);
}
function mapSoFar(day) {
  const prev = course().DAYS.filter((d) => d.d < day.d).map((d) => d.piece);
  if (!prev.length) return '这是地图上的第一块。';
  return `地图上已经有 ${prev.length} 块。今天加上「${day.piece}」。`;
}
function latestWork(data) {
  let best = null;
  course().DAYS.forEach((d) => {
    const s = data[d.d];
    if (!s) return;
    const text = s.artifact || s.summary || s.principleNote;
    if (!text && !s.done) return;
    const at = s.at || '';
    if (!best || at >= best.at) best = { d, s, text: text || '已打卡', at };
  });
  return best;
}
function weekCount(data, wid) {
  return course().DAYS.filter((d) => d.w === wid && data[d.d]?.done).length;
}
function nextOpen(data) {
  for (const d of course().DAYS) if (!data[d.d]?.done) return d.d;
  return 30;
}
function safeUrl(u) {
  try {
    const x = new URL(u);
    if (x.protocol === 'http:' || x.protocol === 'https:') return x.href;
  } catch { /* ignore */ }
  return '';
}
function takeFlash() {
  const n = flash;
  const k = flashKind;
  flash = '';
  flashKind = 'ok';
  return n ? `<p class="banner ${k}">${esc(n)}</p>` : '';
}

function clearLive() {
  stops.splice(0).forEach((fn) => fn());
  Object.keys(intervals).forEach((k) => { clearInterval(intervals[k]); delete intervals[k]; });
  explain = null;
  try { speechSynthesis.cancel(); } catch { /* ignore */ }
  document.querySelectorAll('.talking').forEach((el) => el.classList.remove('talking'));
}
function startLoop(fn) {
  let dead = false;
  let id = 0;
  const tick = (t) => { if (dead) return; fn(t); id = requestAnimationFrame(tick); };
  id = requestAnimationFrame(tick);
  stops.push(() => { dead = true; cancelAnimationFrame(id); });
}
function speak(text, onend) {
  const done = () => {
    document.querySelectorAll('.talking').forEach((el) => el.classList.remove('talking'));
    if (onend) onend();
  };
  try {
    speechSynthesis.cancel();
    document.querySelectorAll('.face.xiaoyu').forEach((el) => el.classList.add('talking'));
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 0.95;
    u.pitch = 1.15;
    u.onend = u.onerror = done;
    speechSynthesis.speak(u);
  } catch { done(); }
}
function audio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function blip(freq, dur, type) {
  const ac = audio();
  if (!ac) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type || 'triangle';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.16, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.01, ac.currentTime + dur);
  o.connect(g); g.connect(ac.destination);
  o.start(); o.stop(ac.currentTime + dur + 0.02);
}

function fitCanvas(canvas) {
  const w = canvas.clientWidth;
  if (!w) return null;
  const h = Math.max(120, Math.round(w * 9 / 16));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}
function drawNinja(ctx, x, y, pose, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.strokeStyle = '#d7ffe4';
  ctx.fillStyle = '#5ecf75';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, -28, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff9ecf';
  ctx.fillRect(-14, -24, 10, 6);
  ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, 8); ctx.stroke();
  const leg = pose === 1 ? -16 : pose === 2 ? 16 : pose === 3 ? -10 : pose === 4 ? 8 : 12;
  const leg2 = pose === 1 ? 12 : pose === 2 ? -8 : pose === 3 ? 10 : pose === 4 ? 8 : -12;
  ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(leg, 28); ctx.moveTo(0, 8); ctx.lineTo(leg2, 28); ctx.stroke();
  const arm = pose === 5 ? -22 : 14;
  ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(-14, 6); ctx.moveTo(0, -6); ctx.lineTo(arm, pose === 3 ? -16 : 8); ctx.stroke();
  ctx.restore();
}
function drawScene(ctx, w, h, kind, t) {
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1a2458'); g.addColorStop(1, '#14281f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffe7a0';
  ctx.beginPath(); ctx.arc(w - 54, 42, 18, 0, Math.PI * 2); ctx.fill();
  const pose = [0, 1, 0, 2][Math.floor(t * (kind === 'frames' ? 2 : 4)) % 4];
  if (kind === 'flip' || kind === 'frames') {
    const n = kind === 'frames' ? 6 : 1;
    for (let i = 0; i < n; i++) {
      const p = [0, 1, 0, 2, 3, 5][i % 6];
      drawNinja(ctx, kind === 'frames' ? 40 + i * (w / 7) : w / 2, h * 0.62, kind === 'frames' ? p : pose, kind === 'frames' ? 0.7 : 1.3);
    }
  } else if (kind === 'layers') {
    ctx.font = '28px sans-serif';
    ctx.fillText('🌲', 30 + Math.sin(t) * 8, h * 0.72);
    ctx.fillText('🌲', w * 0.45, h * 0.75);
    ctx.fillText('🌲', w * 0.75 + Math.sin(t) * 6, h * 0.7);
    drawNinja(ctx, 80 + (t * 40) % (w - 100), h * 0.62, pose, 1.1);
  } else if (kind === 'spin') {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(t * 0.6);
    ctx.fillStyle = ['#2f6a45', '#24506a', '#6a4a2a', '#6a3a55'][Math.floor(t) % 4];
    ctx.fillRect(-40, -40, 80, 80);
    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.fillText(['前', '侧', '后', '上'][Math.floor(t) % 4], -8, 6);
    ctx.restore();
  } else if (kind === 'wave') {
    ctx.strokeStyle = '#9be7ff'; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = 0; x < w; x += 4) {
      const y = h / 2 + Math.sin(x / 18 + t * 3) * 24;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const dense = Math.floor(t) % 2 === 1;
    const step = dense ? 10 : 36;
    ctx.fillStyle = '#ffe7a0';
    for (let x = 8; x < w; x += step) ctx.fillRect(x, h / 2 + Math.sin(x / 18 + t * 3) * 24, 4, 4);
  } else if (kind === 'drum') {
    for (let i = 0; i < 8; i++) {
      const on = [1, 0, 1, 0, 1, 1, 0, 1][i] && Math.floor(t * 2) % 8 === i;
      ctx.fillStyle = on ? '#7ddea0' : '#2a335f';
      ctx.beginPath(); ctx.arc(30 + i * ((w - 40) / 8), h / 2, 14, 0, Math.PI * 2); ctx.fill();
    }
  } else if (kind === 'map') {
    const icons = ['🚪', '🌲', '🌀', '👾', '🚩'];
    icons.forEach((ic, i) => {
      if (t > i * 0.8) { ctx.font = '28px sans-serif'; ctx.fillText(ic, 24 + i * (w / 6), h * 0.62); }
    });
  } else if (kind === 'rules') {
    ctx.fillStyle = '#24325f';
    ctx.fillRect(24, h * 0.28, w * 0.4, 70);
    ctx.fillRect(w * 0.52, h * 0.28, w * 0.4, 70);
    ctx.fillStyle = '#ffe7a0'; ctx.font = '16px sans-serif';
    ctx.fillText('如果踩弹簧', 36, h * 0.28 + 40);
    ctx.fillText('如果碰到敌人', w * 0.52 + 12, h * 0.28 + 40);
  } else {
    drawNinja(ctx, w * 0.32, h * 0.66, 0, 1.2);
    ctx.fillStyle = '#fff8'; ctx.fillRect(w * 0.48, h * 0.28, w * 0.4, 54);
    ctx.fillStyle = '#ffe7a0'; ctx.font = '15px sans-serif';
    ctx.fillText('你来定', w * 0.52, h * 0.28 + 32);
  }
}
function startExplainer(video) {
  const canvas = byId('explain');
  if (!canvas) return;
  explain = { video, t0: performance.now() };
  const draw = (now) => {
    if (!explain) return;
    const fit = fitCanvas(canvas);
    if (!fit) return;
    const t = (now - explain.t0) / 1000;
    const caps = video.captions || [];
    const idx = caps.length ? Math.min(caps.length - 1, Math.floor(t / 6)) : 0;
    const cap = byId('cap');
    if (cap && caps[idx]) cap.textContent = caps[idx];
    drawScene(fit.ctx, fit.w, fit.h, video.kind, REDUCE ? 1 : t);
    document.querySelectorAll('.caps li').forEach((li, i) => { li.style.color = i === idx ? '#ffe7a0' : ''; });
  };
  if (REDUCE) draw(performance.now());
  else startLoop(draw);
}

function widgetHtml(step, day, saved) {
  try { return widgetInner(step, day, saved); }
  catch (e) { return `<p class="hint">这一小块暂时没画出来。</p>`; }
}
function widgetInner(step, day, saved) {
  const w = saved.widgets?.[step.id] || {};
  const id = step.id;
  if (step.widget === 'pick') {
    return `<p><b>${esc(step.q)}</b></p><div class="row">${(step.options || []).map((o, i) => `<button type="button" data-act="pick" data-step="${esc(id)}" data-i="${i}" class="${w.choice === i ? 'primary' : ''}">${esc(o.t)}</button>`).join('')}</div><p id="pick-msg-${esc(id)}" class="hint">${esc(w.artifact || '')}</p>`;
  }
  if (step.widget === 'flip') {
    return `<canvas id="cv-${esc(id)}" class="stage" width="320" height="180"></canvas>
      <p id="flip-count-${esc(id)}">已翻 ${w.n || 0}/${step.target || 8} 次 · 现在是${w.order === 'mix' ? '乱序' : '跑步顺序'}</p>
      <div class="row"><button type="button" data-act="flip-next" data-step="${esc(id)}">下一张</button>
      <button type="button" data-act="flip-run" data-step="${esc(id)}" data-speed="slow">慢速连翻</button>
      <button type="button" data-act="flip-run" data-step="${esc(id)}" data-speed="fast">快速连翻</button></div>
      <div class="row"><button type="button" data-act="flip-order" data-step="${esc(id)}" data-order="run">跑步顺序</button>
      <button type="button" data-act="flip-order" data-step="${esc(id)}" data-order="mix">乱序</button></div>`;
  }
  if (step.widget === 'spot') {
    return `<button type="button" class="big primary" data-act="spot" data-step="${esc(id)}">我看见换了</button><p id="spot-${esc(id)}">已点 ${w.n || 0}/${step.target || 4}</p>`;
  }
  if (step.widget === 'layers') {
    const nx = Number(w.nx) || 0; const bg = Number(w.bg) || 0;
    return `<div class="layer-scene"><div class="bg" id="bg-${esc(id)}" style="transform:translateX(${bg * 0.6}px)">🌲 🌲 🌲 🌲</div><div class="nj" id="nj-${esc(id)}" style="transform:translateX(${nx * 1.6}px)">🥷</div></div>
      <label class="field">忍者 <b id="nxn-${esc(id)}">${nx}</b><input type="range" min="0" max="100" value="${nx}" data-act="layer" data-step="${esc(id)}" data-which="nx"></label>
      <label class="field">背景 <b id="bgn-${esc(id)}">${bg}</b><input type="range" min="0" max="100" value="${bg}" data-act="layer" data-step="${esc(id)}" data-which="bg"></label>`;
  }
  if (step.widget === 'fps') {
    return `<canvas id="cv-${esc(id)}" class="stage" width="320" height="180"></canvas>
      <p id="fps-msg-${esc(id)}">慢的${w.slow ? '已看' : '还没看'} · 快的${w.fast ? '已看' : '还没看'}${w.choice ? ' · 选了' + (w.choice === 'fast' ? '快' : '慢') : ''}</p>
      <div class="row"><button type="button" data-act="fps" data-step="${esc(id)}" data-rate="slow">看慢的 20 秒</button>
      <button type="button" data-act="fps" data-step="${esc(id)}" data-rate="fast">看快的 20 秒</button></div>
      <div class="row"><button type="button" data-act="fps-choice" data-step="${esc(id)}" data-choice="slow">慢的更顺</button>
      <button type="button" data-act="fps-choice" data-step="${esc(id)}" data-choice="fast">快的更顺</button></div>`;
  }
  if (step.widget === 'spin') {
    const x = Number(w.x) || 0; const y = Number(w.y) || 0;
    return `<div class="cube-wrap"><div class="cube" id="cube-${esc(id)}" style="transform:rotateX(${x}deg) rotateY(${y}deg)"><i class="f f1">前</i><i class="f f2">后</i><i class="f f3">左</i><i class="f f4">右</i><i class="f f5">上</i><i class="f f6">下</i></div></div>
      <p class="face-now" id="face-${esc(id)}">现在是：${esc(faceName(x, y))}</p>
      <div class="row"><button type="button" data-act="spin" data-step="${esc(id)}" data-dir="left">左转</button>
      <button type="button" data-act="spin" data-step="${esc(id)}" data-dir="right">右转</button>
      <button type="button" data-act="spin" data-step="${esc(id)}" data-dir="up">抬头</button>
      <button type="button" class="primary" data-act="face-see" data-step="${esc(id)}">我看到这个面</button></div>
      <p id="faces-${esc(id)}">已记下：${esc((w.faces || []).join('、') || '还没有')}</p>`;
  }
  if (step.widget === 'sort') {
    const bins = w.bins || {};
    const answered = SORT_ITEMS.filter((it) => bins[it.id]).length;
    const right = SORT_ITEMS.filter((it) => bins[it.id] === it.ok).length;
    return SORT_ITEMS.map((it) => `<div class="sort-item"><span>${esc(it.t)}</span>
      <button type="button" data-act="sort" data-step="${esc(id)}" data-item="${it.id}" data-bin="2d" class="${bins[it.id] === '2d' ? 'on' : ''}">平面</button>
      <button type="button" data-act="sort" data-step="${esc(id)}" data-item="${it.id}" data-bin="3d" class="${bins[it.id] === '3d' ? 'on' : ''}">立体</button></div>`).join('')
      + `<p id="sort-msg-${esc(id)}">${answered ? `已分 ${answered}/6，目前对 ${right} 个` : '一件一件分。'}</p>`;
  }
  if (step.widget === 'wave') {
    return `<div class="row"><button type="button" data-act="wave" data-step="${esc(id)}" data-kind="sparse">听稀的点</button>
      <button type="button" data-act="wave" data-step="${esc(id)}" data-kind="dense">听密的点</button></div>
      <div class="row"><button type="button" data-act="wave-choice" data-step="${esc(id)}" data-choice="sparse" class="${w.choice === 'sparse' ? 'primary' : ''}">稀的更像</button>
      <button type="button" data-act="wave-choice" data-step="${esc(id)}" data-choice="dense" class="${w.choice === 'dense' ? 'primary' : ''}">密的更像</button></div>
      <p id="wave-msg-${esc(id)}">${w.choice ? '已选' : '两种都听一遍再选。'}</p>`;
  }
  if (step.widget === 'drum') {
    const beats = w.beats || [0, 0, 0, 0, 0, 0, 0, 0];
    return `<div class="beats">${beats.map((on, i) => `<button type="button" data-act="beat" data-step="${esc(id)}" data-i="${i}" class="${on ? 'on' : ''}">${i + 1}</button>`).join('')}</div>
      <div class="row"><button type="button" class="primary" data-act="drum-play" data-step="${esc(id)}">播放</button>
      <span id="plays-${esc(id)}">已播放 ${w.plays || 0}/3</span></div>
      <label class="field">鼓的名字<input data-act="drum-name" data-step="${esc(id)}" value="${esc(w.name || '')}" placeholder="比如：月亮鼓"></label>
      ${step.sfx ? `<button type="button" data-act="thud" data-step="${esc(id)}">播放落地音</button><span id="thud-${esc(id)}">${w.sfxHeard ? '听过了' : ''}</span>` : ''}`;
  }
  if (step.widget === 'map') {
    const cells = mapCells(step, w, day);
    const tool = w.tool || (step.only === 'spring' ? 'spring' : 'start');
    const tools = step.only === 'spring' && cells.includes('start') ? ['spring'] : ['start', 'spring', 'boss', 'goal'];
    return `<p>当前工具：<b id="tool-${esc(id)}">${esc(TOOL_NAME[tool] || '')}</b></p>
      <div class="row">${tools.map((t) => `<button type="button" data-act="tool" data-step="${esc(id)}" data-tool="${t}" class="${tool === t ? 'primary' : ''}">${TOOL_NAME[t]}</button>`).join('')}</div>
      <div class="cells">${cells.map((c, i) => `<button type="button" data-act="cell" data-step="${esc(id)}" data-i="${i}">${i + 1}<br>${esc(c ? TOOL_NAME[c] : '空')}</button>`).join('')}</div>
      <p id="map-msg-${esc(id)}">${esc(mapText(cells) || '还没放东西')}</p>`;
  }
  if (step.widget === 'mic') {
    return `<div class="row"><button type="button" class="primary" data-act="mic" data-step="${esc(id)}">录 3 秒</button>
      <button type="button" data-act="mic-play" data-step="${esc(id)}">播放</button></div>
      <p id="mic-msg-${esc(id)}">${w.recorded ? '录好了，可以播放。浏览器不让录音时，改发微信语音。' : '允许麦克风后，敲三下。不允许就改发微信语音。'}</p>`;
  }
  if (step.widget === 'prompt') {
    const fields = w.fields || {};
    return (step.fields || []).map((field) => fieldInput(step, field, fields[field.id] || '')).join('')
      + `<pre class="prompt-preview" id="preview-${esc(id)}">${esc(fillTemplate(step.template, fields))}</pre>
      <button type="button" class="primary" data-act="copy-prompt" data-step="${esc(id)}">复制提示词</button>
      <span id="copies-${esc(id)}">已复制 ${w.copies || 0} 次</span>`;
  }
  if (step.widget === 'form') {
    const fields = w.fields || {};
    const side = step.showFrom ? `<ul class="caps">${course().DAYS.filter((d) => d.d >= step.showFrom && d.d <= step.showTo).map((d) => {
      const s = getDay(d.d);
      return `<li>第${d.d}天 ${esc(d.piece)}：${esc((s.artifact || s.summary || '还没有成果').slice(0, 80))}</li>`;
    }).join('')}</ul>` : '';
    return side + (step.fields || []).map((field) => fieldInput(step, field, fields[field.id] || '')).join('');
  }
  if (step.widget === 'recap') {
    const from = step.from || 1; const to = step.to || day.d;
    return `<ul class="caps">${course().DAYS.filter((d) => d.d >= from && d.d <= to).map((d) => {
      const s = getDay(d.d);
      return `<li><b>第${d.d}天 ${esc(d.title)}</b>：${esc(s.artifact || s.summary || s.principleNote || '这天还没记下成果')}</li>`;
    }).join('')}</ul>`;
  }
  if (step.widget === 'poses') {
    const poses = w.poses || ['', '', ''];
    return `<canvas id="pose-${esc(id)}" class="stage" width="320" height="180"></canvas>`
      + [0, 1, 2].map((i) => `<label class="field">姿势 ${i + 1}<select data-act="pose" data-step="${esc(id)}" data-slot="${i}">${POSE_OPTS.map((name) => `<option ${poses[i] === name ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label>`).join('')
      + `<button type="button" data-act="pose-play" data-step="${esc(id)}">连起来看</button>`;
  }
  return '';
}
function fieldInput(step, field, value) {
  const mode = field.mode === 'numeric' ? ' inputmode="numeric"' : '';
  return `<label class="field">${esc(field.label)}<input data-act="field" data-step="${esc(step.id)}" data-field="${esc(field.id)}" value="${esc(value)}" placeholder="${esc(field.placeholder || '')}"${mode} autocomplete="off"></label>`;
}
function faceName(x, y) {
  const yy = ((y % 360) + 360) % 360;
  const xx = ((x % 360) + 360) % 360;
  if (xx > 45 && xx < 135) return '上面';
  if (yy < 45 || yy >= 315) return '前面';
  if (yy < 135) return '右面';
  if (yy < 225) return '后面';
  return '左面';
}
function mapCells(step, w, day) {
  let cells = (w.cells || []).slice();
  if (!cells.some(Boolean) && step.only === 'spring') {
    const prevDay = course().DAYS.find((d) => d.d === 24);
    const prevStep = prevDay && prevDay.steps.find((s) => s.widget === 'map');
    const prev = prevStep ? getDay(24).widgets?.[prevStep.id] : null;
    if (prev && (prev.cells || []).some(Boolean)) cells = prev.cells.slice();
  }
  while (cells.length < 8) cells.push('');
  return cells.slice(0, 8);
}
function findStep(id) {
  const day = dayBy(view.day);
  return day && day.steps.find((s) => s.id === id);
}

function checksHtml(step, saved) {
  const st = saved.steps?.[step.id] || {};
  return (step.checks || []).map((text, i) => `<label class="check"><input type="checkbox" data-act="sub" data-step="${esc(step.id)}" data-sub="${i}" ${st.subs?.[i] ? 'checked' : ''}> ${esc(text)}</label>`).join('');
}
function timerHtml(step, saved) {
  if (!step.timer) return '';
  const done = saved.timerDone?.[step.id];
  const label = done ? '时间到' : formatSec(step.timer);
  return `<div class="row"><button type="button" data-act="timer" data-step="${esc(step.id)}" data-sec="${step.timer}">开始计时 ${formatSec(step.timer)}</button><strong id="timer-${esc(step.id)}">${label}</strong></div>`;
}
function formatSec(sec) {
  const s = Math.max(0, sec | 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function linkHtml(step) {
  if (!step.link) return '';
  return `<p><a class="go-link" href="${esc(step.link)}" target="_blank" rel="noopener">${esc(step.linkLabel || '打开')}</a></p><p class="hint">微信里如果打不开，用右上角在浏览器中打开。玩完回到这一页打勾。</p>`;
}

function syncBoxHtml() {
  return `<section class="card" id="sec-sync">
    <h3>同步到另一台手机</h3>
    <p>爸爸点生成，把整段发到微信。澍暘一点开，输入家庭密码，打卡、星星和成果会合并。链接里是进度，不是密码。</p>
    <button type="button" class="primary" data-act="sync-make">生成同步链接</button>
    <textarea id="syncOut" rows="3" readonly placeholder="链接会出现在这里"></textarea>
    <button type="button" data-act="sync-copy">复制链接</button>
    <p id="syncHint" class="hint"></p>
    <label class="field">这台手机贴入链接或同步码<textarea id="syncIn" rows="3" placeholder="点开链接若没有自动同步，把整段粘在这里"></textarea></label>
    <button type="button" data-act="sync-apply">同步到这台手机</button>
    <p id="syncMsg" class="saved"></p>
  </section>`;
}
function chatHtml() {
  const key = view.name === 'day' ? 'd' + view.day : 'home';
  const msgs = chatByKey[key] || [];
  const chips = view.name === 'day'
    ? ['今天学什么原理？', '用什么方法？', '下一步做什么？', '我做完了', '我不会']
    : ['这门课学什么？', '怎么上课？', '怎么同步？', '月末交出什么？'];
  return `<section class="card" id="sec-chat">
    <h3>${faceImg('小雨', 'inline-face')}问小雨</h3>
    <div class="chat-log" id="chatLog">${msgs.map((m, i) => bubbleHtml(m, i)).join('')}</div>
    <div class="chips">${chips.map((c) => `<button type="button" data-act="chip">${esc(c)}</button>`).join('')}</div>
    <form class="chat-form" id="chatForm"><input id="chatInput" autocomplete="off" placeholder="打字问小雨"><button type="submit">发送</button></form>
    ${view.name === 'day' ? `<details class="coach"><summary>拉爸爸的 AI 进微信语音</summary>
      <p>这一页可以打字问小雨。若爸爸还要把做游戏的 AI 拉进语音：复制今天的提示词发给它，让它用很短的话陪着问。不要把密钥写进这个网页。</p>
      <button type="button" data-act="copy-coach">复制今天的上课提示词</button></details>` : ''}
  </section>`;
}
function bubbleHtml(m, i) {
  const who = m.from === 'xy' ? '小雨' : '澍暘';
  return `<div class="bubble ${m.from === 'xy' ? 'xy' : 'me'}">${faceImg(who)}<p>${esc(m.text)}</p></div>`;
}
function ensureGreet() {
  const key = view.name === 'day' ? 'd' + view.day : 'home';
  if (chatByKey[key]) return;
  const day = view.name === 'day' ? dayBy(view.day) : null;
  chatByKey[key] = [{
    from: 'xy',
    text: day
      ? `澍暘，我是小雨。今天《${day.title}》。要我告诉你原理，还是直接说下一步？`
      : '嗨，我是小雨。这门课带你一点点看清游戏和 AI 的世界。你可以问怎么上课、怎么同步、月末交出什么。',
  }];
}
function replyTo(text) {
  const t = String(text || '').trim();
  const day = view.name === 'day' ? dayBy(view.day) : null;
  if (!t) return '你打一个字，或点上面的按钮。';
  if (/原理|学什么东西|什么意思|这门课学什么/.test(t)) {
    return day ? `今天的原理是：${day.principle} 你用自己的话说一遍，爸爸帮你记在「我的原理」里。` : '这个月不是一次讲完。先看画面怎么动，再看时间和立体，再看声音，最后收成你的一关。';
  }
  if (/方法|怎么学|怎么上课/.test(t)) {
    return day ? `今天的学法是：${day.method} 动手的时候就用它。` : '三个角色：家长陪着问，孩子动手，AI 带路。家长暂时不在，这一页仍然带着做、打卡、攒星星。每节先讲原理、学法和要做的事，再看一小段动画，然后动手。';
  }
  if (/下一步|接着|然后/.test(t)) {
    if (!day) return '先点「今天从 Day 几开始」，打开那一课。';
    const saved = getDay(day.d);
    const step = day.steps.find((s) => !saved.steps?.[s.id]?.on) || day.steps[0];
    return `下一步：${step.title}。${step.do}`;
  }
  if (/做完|好了|完成/.test(t)) return '听到了。你用一句话告诉我做成了什么。然后滚到下面打卡，爸爸再把同步链接发到微信。';
  if (/不会|难|帮帮/.test(t)) {
    if (!day) return '不会就只做最小的一步。先打开今天这一页，爸爸读开场。';
    const saved = getDay(day.d);
    const step = day.steps.find((s) => !saved.steps?.[s.id]?.on) || day.steps[0];
    return `没关系。只做这一件：${step.title}。做完跟我说。`;
  }
  if (/同步|手机|微信/.test(t)) return '做完后点「生成同步链接」，爸爸发到微信。澍暘点开，输入家庭密码，就能看到同一份成果。链接里没有密码。';
  if (/星星|奖励|兑换/.test(t)) return '打卡完成一天得一颗星。星星可以在成就兑换里换成和爸爸约好的奖励。';
  if (/视频|动画/.test(t)) return day ? `先看今天的小动画「${day.video.title}」。看完告诉我你看见了什么。爸爸以后也可以贴上真正的视频链接。` : '每一课都有一段约 1 分钟的小动画，在开场之后。';
  if (/月末|发表|交出/.test(t)) return '月末要交出的是澍暘自己的一关：名字、规矩、地图和声音，并讲给家人听。';
  if (/妈妈/.test(t)) return '妈妈可以在语音里一起听、一起看成果、夸一件你真的做成的事。没有妈妈在，爸爸和澍暘也能把这节做完。';
  if (day && day.keys) {
    for (const [word, ans] of day.keys) if (t.includes(word)) return ans;
  }
  if (/你好|小雨|在吗/.test(t)) return day ? `我在。今天《${day.title}》。原理：${day.principle}` : '我在。我们用微信语音上课，我在这一页带路。';
  const clip = t.slice(0, 36);
  return day
    ? `我听到「${clip}」。今天先抓住实践：${day.practice}`
    : `我在。你可以问：这门课学什么、怎么上课、怎么同步到澍暘的手机。`;
}
function coachText(day) {
  return [
    '你是小雨姐姐，在微信语音里陪 9 岁的伍澍暘和他爸爸上课。妈妈可能也在听。',
    `今天是第 ${day.d} 天《${day.title}》。`,
    `原理：${day.principle}`,
    `学习方法：${day.method}`,
    `实践：${day.practice}`,
    '用很短的口语，一次只问一个问题，带他做完今天的动手步骤。',
    '他做完要夸具体做了什么。',
    '爸爸和孩子不在同一个城市，不要安排他们共用一张桌子上的材料。',
    '材料只限澍暘自己家里的手机、纸和铅笔。',
  ].join('\n');
}

function homeHtml() {
  const { META, WEEKS, DAYS, BADGES, MONTH2 } = course();
  const data = load();
  const rewards = loadRewards();
  const st = starStats(data, rewards);
  const done = DAYS.filter((d) => data[d.d]?.done).length;
  const cont = nextOpen(data);
  const recent = latestWork(data);
  ensureGreet();
  return `${takeFlash()}
  <header class="hero">
    <img class="hero-group" src="avatars/cast-four.jpg?v=${V}" alt="小雨、爸爸伍欣、妈妈祝春燕和澍暘">
    <p class="cast-caption"><span>小雨</span><span>爸爸</span><span>妈妈</span><span>澍暘</span></p>
    <p class="tag">第 ${META.month} 月 · 每次 ${META.minutes} 分钟 · 微信语音</p>
    <h1>${esc(META.title)}</h1>
    <p class="lead">${esc(META.lead)}</p>
    <div class="deep">
      <p><strong>本月主题</strong> ${esc(META.monthName)}</p>
      <p><strong>这个月要看清</strong> ${esc(META.deepGoal)}</p>
      <p><strong>月末要交出</strong> ${esc(META.showcase)}</p>
    </div>
    <p class="progress">已完成 <b>${done}</b> / 30 天 · 可用星星 <b>${st.bal}</b></p>
    <div class="bar"><i style="width:${(done / 30) * 100}%"></i></div>
    <button type="button" class="primary go" data-act="day" data-day="${cont}">今天从 Day ${cont} 开始</button>
    <a class="kid-entry" href="kid.html?v=bone3d6">澍暘上课首页</a>
    <button type="button" class="shop-btn" data-act="shop">⭐ 成就兑换（${st.bal} 星可用）</button>
    <button type="button" data-act="guide">这门课怎么上</button>
  </header>
  ${recent ? `<section class="card result ${recent.s.done ? 'celebrate' : ''}"><h3>最近的成果 · Day ${recent.d.d} ${esc(recent.d.title)}</h3><pre>${esc(recent.text)}</pre><button type="button" data-act="day" data-day="${recent.d.d}">打开这一天</button></section>` : `<section class="card"><h3>最近的成果</h3><p>还没有。上完一节，这里会出现澍暘做成的东西。微信同步之后，另一部手机也能看见。</p></section>`}
  <section class="card">
    <h3>世界地图</h3>
    <p>一块一块看清游戏和 AI 的世界，不一次倒光。</p>
    <ol class="world">${WEEKS.map((w) => {
      const n = weekCount(data, w.id);
      const full = n === 7;
      const badge = BADGES.find((b) => b.w === w.id);
      return `<li class="${n ? 'lit' : ''} ${full ? 'full' : ''}"><b>第 ${w.id} 周 · ${esc(w.name)}</b> ${full ? `<em class="badge">${badge.emoji} ${esc(badge.name)}</em>` : ''}<br><span>${esc(w.map)}</span> · ${n}/7</li>`;
    }).join('')}</ol>
    ${done === 30 ? '<p class="badge">🏆 冒险月完成</p>' : ''}
  </section>
  <section class="card tip">
    <h3>每节怎么上</h3>
    <ol class="caps"><li>讲清今天的原理、学法、要做的事</li><li>看约 1 分钟小动画</li><li>动手做完剩下的时间</li><li>打卡，并把同步链接发到微信</li></ol>
    <p>三个角色：<b>家长</b>陪着问，<b>孩子</b>动手并看见自己做成了什么，<b>AI</b>把课带下去。家长暂时不在，孩子仍然能学、能打卡、能攒星星。内容围着游戏和孩子的兴趣。</p>
    <p>${esc(META.how)} 这一家：爸爸妈妈是家长，澍暘是孩子，小雨是 AI。</p>
  </section>
  <section class="weeks">${WEEKS.map((w) => `<article class="week-card">
      <h2>第 ${w.id} 周 · ${esc(w.name)} <small>${weekCount(data, w.id)}/7</small>${weekCount(data, w.id) === 7 ? `<em class="badge">${BADGES.find((b) => b.w === w.id).emoji}</em>` : ''}</h2>
      <p><strong>这一周看清</strong> ${esc(w.map)}</p>
      <p><strong>深</strong> ${esc(w.deep)}</p>
      <p><strong>会做的事</strong> ${esc(w.shallow)}</p>
      <div class="day-links">${DAYS.filter((d) => d.w === w.id).map((d) => {
        const cls = data[d.d]?.done ? 'done' : (data[d.d]?.artifact || data[d.d]?.summary ? 'half' : '');
        return `<button type="button" class="day-btn ${cls}" data-act="day" data-day="${d.d}">Day ${d.d}<span>${esc(d.title)}</span></button>`;
      }).join('')}</div>
    </article>`).join('')}</section>
  <section class="card month2"><h3>第 ${MONTH2.id} 月 · 还没开学</h3><p><strong>${esc(MONTH2.name)}</strong></p><p>${esc(MONTH2.note)}</p></section>
  ${chatHtml()}
  ${syncBoxHtml()}
  <p class="foot">月课 ${META.month} · 页面 v${V} · 打卡得星星 · 成果用微信链接同步</p>`;
}

function guideHtml() {
  const { META, MONTH2 } = course();
  return `${takeFlash()}
  <button type="button" class="back" data-act="home">← 回月历</button>
  <header class="hero">
    <img class="hero-group" src="avatars/cast-four.jpg?v=${V}" alt="一家人">
    <h1>这门课怎么上</h1>
    <p class="lead">${esc(META.lead)}</p>
  </header>
  <section class="card"><h3>以月为单位</h3>
    <p><strong>本月主题</strong> ${esc(META.monthName)}</p>
    <p><strong>月末交出</strong> ${esc(META.showcase)}</p>
    <p><strong>第 ${MONTH2.id} 月</strong> ${esc(MONTH2.name)}。${esc(MONTH2.note)}</p>
  </section>
  <section class="card"><h3>三个角色</h3>
    <p>以后换一家，仍然是这三个人：<b>家长</b>陪着问和记，<b>孩子</b>动手并得到成就感，<b>AI</b>把课带下去。家长暂时不在，孩子仍然能学、能打卡、能看见自己做成了什么。内容围着游戏和孩子自己的兴趣，不围着课文。</p>
    <p>这一家就套在这三个角色上：爸爸和妈妈是家长，澍暘是孩子，小雨是 AI。</p>
  </section>
  <section class="card"><h3>谁在上课</h3>
    <div class="roles">
      <div>${faceImg('澍暘', 'inline-face')}<b>澍暘 · 孩子</b> 出主意、动手、大声说结果。做成了就有星星。</div>
      <div>${faceImg('爸爸', 'inline-face')}<b>爸爸伍欣 · 家长</b> 在另一个城市开语音、打字、把同步链接发到微信。</div>
      <div>${faceImg('妈妈', 'inline-face')}<b>妈妈祝春燕 · 家长</b> 可以一起听、一起看成果、夸一件做成的事。不在也能上课。</div>
      <div>${faceImg('小雨', 'inline-face')}<b>小雨 · AI</b> 家长不在旁边时，这一页仍带着做。语音里也可以再拉一个 AI，用每课的提示词。</div>
    </div>
  </section>
  <section class="card"><h3>人在两个城市</h3>
    <p>微信语音不要挂。各看各的屏幕，需要时开视频给对方看。澍暘自己桌上只用手机、纸和铅笔。不要安排两个人同时碰同一张纸。</p>
  </section>
  <section class="card"><h3>每一节的三层</h3>
    <div class="layers">
      <article class="layer"><b>原理</b>今天看清世界的一小块。</article>
      <article class="layer method"><b>学法</b>今天练一种以后还能用的方法。</article>
      <article class="layer practice"><b>实践</b>大部分时间用来做，不是用来读。</article>
    </div>
  </section>
  <section class="card"><h3>成就从做出来</h3>
    <p>做完并打卡得一颗星。每周七天都完成，月历亮一枚章。月末发表自己的一关。星星去兑换页换成约好的奖励。</p>
  </section>
  <section class="card"><h3>手机怎么对齐</h3>
    <p>上课可以爸爸操作这一页，澍暘在电话里说。结束时生成同步链接发到微信。澍暘点开，先输入家庭密码，然后看到同一份打卡和成果。两台都改过的勾会合并，不会把已打的勾弄丢。</p>
  </section>`;
}

function dayHtml(n) {
  const day = dayBy(n);
  const w = weekOf(day);
  const saved = getDay(n);
  const mins = day.steps.reduce((s, x) => s + x.min, 0);
  const total = Math.min(30, Math.max(20, mins + 6));
  const people = peopleToday(day);
  ensureGreet();
  return `${takeFlash()}
  <button type="button" class="back" data-act="home">← 回月历</button>
  <header class="day-hero" id="sec-open">
    <p class="tag">第 ${w.id} 周 · ${esc(w.name)} · 整节约 ${total} 分钟</p>
    <p class="piece">今天出场</p>
    ${faceRow(people)}
    <h1>Day ${day.d} · ${esc(day.title)}</h1>
    <p class="story">${esc(day.story)}</p>
    <p class="piece">${esc(mapSoFar(day))}</p>
    <p class="clock" id="clock">本节准备开始</p>
  </header>
  <nav class="flow">
    <a href="#sec-open">1 学什么</a>
    <a href="#sec-video">2 小动画</a>
    <a href="#sec-do">3 动手</a>
    <a href="#sec-done">4 打卡同步</a>
  </nav>
  <section class="card">
    <h3>开场：今天学什么</h3>
    <p class="hint">爸爸读下面三块，澍暘用自己的话重复原理。</p>
    <div class="layers">
      <article class="layer"><b>原理</b>${esc(day.principle)}</article>
      <article class="layer method"><b>学法</b>${esc(day.method)}</article>
      <article class="layer practice"><b>实践</b>${esc(day.practice)}</article>
    </div>
    <p>${esc(day.goalSpeak)}</p>
    <button type="button" class="primary" data-act="speak-goal">小雨读开场</button>
    <p class="hint">${esc(day.kit)}</p>
    <label class="field">我的原理（澍暘的话，爸爸打字）
      <textarea data-act="pnote" rows="2" placeholder="用自己的话说，不要只抄上面">${esc(saved.principleNote || '')}</textarea>
    </label>
  </section>
  <section class="card" id="sec-video">
    <h3>${faceImg('小雨', 'inline-face')}小动画 · ${esc(day.video.title)}</h3>
    <p class="hint">${esc(day.video.min)}。这是页面里的讲解。爸爸以后可以贴上真正的视频链接。</p>
    <canvas id="explain" class="stage"></canvas>
    <p class="cap-now" id="cap">${esc(day.video.captions[0] || '')}</p>
    <ol class="caps">${day.video.captions.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>
    <button type="button" data-act="replay">再看一遍</button>
    <label class="field">爸爸找到的视频链接（可空）
      <input data-act="videourl" type="url" placeholder="https://" value="${esc(saved.videoUrl || '')}">
    </label>
    <a id="videoOpen" class="go-link" target="_blank" rel="noopener" ${safeUrl(saved.videoUrl) ? '' : 'hidden'} href="${esc(safeUrl(saved.videoUrl) || '#')}">打开这个视频</a>
  </section>
  <section class="card" id="sec-talk">
    <h3>语音里可以这样说</h3>
    <ol class="talk">${day.talk.map(([who, line], i) => `<li>${faceImg(who, 'talk-face')}<div><button type="button" class="who-btn" data-act="say" data-i="${i}">▶ ${esc(who)}</button><span>${esc(line)}</span></div></li>`).join('')}</ol>
    <button type="button" class="primary" data-act="play-talk">按顺序读一遍</button>
  </section>
  <section class="card" id="sec-do">
    <h3>动手 · 大约 ${mins} 分钟</h3>
    <p id="stepProg">已做完 ${day.steps.filter((s) => saved.steps?.[s.id]?.on).length} / ${day.steps.length} 步</p>
    ${day.steps.map((step, idx) => {
      const on = !!saved.steps?.[step.id]?.on;
      const who = WHO[step.who] || WHO.call;
      return `<article class="step ${on ? 'on' : ''}" id="step-${esc(step.id)}">
        <div class="step-top"><h4>${idx + 1}. ${esc(step.title)}</h4><span class="mins">约 ${step.min} 分钟</span></div>
        <div class="who-line">${stepPeople(day, step).map((k) => faceImg(k)).join('')}<span>${esc(who[0])} · ${esc(who[1])}</span></div>
        <p>${esc(step.do)}</p>
        ${linkHtml(step)}
        ${timerHtml(step, saved)}
        ${widgetHtml(step, day, saved)}
        ${checksHtml(step, saved)}
        <p class="done-line">做完的样子：${esc(step.done)}</p>
        <label class="check"><input type="checkbox" data-act="step" data-step="${esc(step.id)}" ${on ? 'checked' : ''}> 这一步做完了</label>
      </article>`;
    }).join('')}
  </section>
  ${chatHtml()}
  <section class="card result ${saved.done ? 'celebrate' : ''}" id="sec-done">
    <h3>今天的成果</h3>
    <p class="hint">${esc(day.reflect)}</p>
    <p><b>原理（澍暘的话）</b> <span id="pnoteView">${esc(saved.principleNote || '还没写。')}</span></p>
    <p><b>学法</b> ${esc(day.method)}</p>
    <p><b>做成了</b></p>
    <pre id="artifactPreview">${esc(saved.artifact || '做完上面的步骤，成果会出现在这里。')}</pre>
    <label class="field">还想记一句
      <textarea id="summary" data-act="summary" rows="3" placeholder="比如：我做成了……">${esc(saved.summary || '')}</textarea>
    </label>
    <div class="row">
      <button type="button" class="primary" data-act="finish">今天做完了，打卡得一星</button>
      <button type="button" data-act="speak-sum">朗读总结</button>
    </div>
    <label class="check"><input type="checkbox" id="doneBox" data-act="done" ${saved.done ? 'checked' : ''}> 今天打卡完成</label>
    <p class="saved" id="savedMsg">${saved.done ? '这颗星已经记下。生成同步链接，澍暘的手机就能看到。' : ''}</p>
  </section>
  ${syncBoxHtml()}
  <div class="nav">
    <button type="button" data-act="prev" ${n <= 1 ? 'disabled' : ''}>前一天</button>
    <button type="button" data-act="shop">⭐ 兑换</button>
    <button type="button" data-act="next" ${n >= 30 ? 'disabled' : ''}>下一天</button>
  </div>`;
}

function shopHtml() {
  const data = load();
  const rewards = loadRewards();
  const st = starStats(data, rewards);
  return `${takeFlash()}
  <button type="button" class="back" data-act="home">← 回月历</button>
  <header class="shop-hero">
    <div class="star-pill">⭐ ${st.bal} <span>可用星星</span></div>
    <h1>成就兑换</h1>
    <p>每打卡完成 1 天 = 1 颗星。星星来自做完并打卡，不是来自只看一页。</p>
    <p class="muted">已获得 ${st.earned} · 已花掉 ${st.spent}</p>
  </header>
  <section class="rewards">${rewards.catalog.map((r) => {
    const can = st.bal >= r.cost;
    return `<article class="reward ${can ? '' : 'locked'}"><div class="emoji">${esc(r.emoji || '🎁')}</div><div class="body"><h3>${esc(r.name)}</h3><p>需要 <b>${r.cost}</b> 星</p></div><button type="button" class="primary" data-act="redeem" data-id="${esc(r.id)}" ${can ? '' : 'disabled'}>兑换</button></article>`;
  }).join('')}</section>
  <section class="card"><h3>爸爸可改奖励清单</h3>
    <p class="hint">每行：表情|名称|星星数</p>
    <textarea id="catalogEdit" rows="7">${esc(rewards.catalog.map((r) => `${r.emoji || '🎁'}|${r.name}|${r.cost}`).join('\n'))}</textarea>
    <button type="button" data-act="save-cat">保存奖励清单</button>
  </section>
  <section class="card"><h3>兑换记录</h3>
    ${rewards.redeemed.length ? `<ul class="hist">${rewards.redeemed.slice().reverse().map((x, idx) => {
      const real = rewards.redeemed.length - 1 - idx;
      return `<li><span>${esc(x.emoji || '🎁')} ${esc(x.name)}（-${x.cost}星）</span><label class="check"><input type="checkbox" data-act="fulfil" data-idx="${real}" ${x.fulfilled ? 'checked' : ''}> 已兑现</label></li>`;
    }).join('')}</ul>` : '<p class="muted">还没有兑换。</p>'}
  </section>
  ${syncBoxHtml()}`;
}

function paintResult() {
  if (view.name !== 'day') return;
  const day = dayBy(view.day);
  const saved = getDay(view.day);
  const art = byId('artifactPreview');
  if (art) art.textContent = saved.artifact || '做完上面的步骤，成果会出现在这里。';
  const pn = byId('pnoteView');
  if (pn) pn.textContent = saved.principleNote || '还没写。';
  const prog = byId('stepProg');
  if (prog) prog.textContent = `已做完 ${day.steps.filter((s) => saved.steps?.[s.id]?.on).length} / ${day.steps.length} 步`;
  const card = byId('sec-done');
  if (card) card.classList.toggle('celebrate', !!saved.done);
}
function paintClock() {
  const el = byId('clock');
  if (!el || !sessionStart) return;
  const sec = Math.floor((Date.now() - sessionStart) / 1000);
  const m = Math.floor(sec / 60);
  el.textContent = m >= 30 ? `本节已 ${m} 分钟，可以收成打卡了` : `本节已进行 ${m} 分 ${String(sec % 60).padStart(2, '0')} 秒`;
}
function paintVideoLink() {
  const input = document.querySelector('[data-act="videourl"]');
  const a = byId('videoOpen');
  if (!input || !a) return;
  const href = safeUrl(input.value.trim());
  if (href) { a.href = href; a.hidden = false; }
  else { a.hidden = true; }
}
function afterRender() {
  if (view.name === 'day') {
    const day = dayBy(view.day);
    startExplainer(day.video);
    day.steps.forEach((step) => {
      if (step.widget === 'flip' || step.widget === 'fps') drawMini(step.id, 0);
      if (step.widget === 'poses') drawPoses(step.id, 0);
    });
    paintVideoLink();
  }
  paintClock();
  const log = byId('chatLog');
  if (log) log.scrollTop = log.scrollHeight;
}
function render() {
  clearLive();
  const app = byId('app');
  if (!app) return;
  if (view.name === 'home') app.innerHTML = homeHtml();
  else if (view.name === 'guide') app.innerHTML = guideHtml();
  else if (view.name === 'shop') app.innerHTML = shopHtml();
  else app.innerHTML = dayHtml(view.day);
  afterRender();
  window.scrollTo(0, 0);
}
function gotoDay(n) {
  if (n < 1 || n > 30) return;
  if (view.name !== 'day') sessionStart = Date.now();
  view = { name: 'day', day: n };
  render();
}

function drawMini(stepId, frame) {
  const canvas = byId('cv-' + stepId);
  if (!canvas) return;
  const fit = fitCanvas(canvas);
  if (!fit) return;
  const step = findStep(stepId);
  const w = getDay(view.day).widgets?.[stepId] || {};
  const order = w.order === 'mix' ? [3, 2, 5, 1] : [0, 1, 0, 2];
  drawScene(fit.ctx, fit.w, fit.h, 'flip', 0);
  fit.ctx.clearRect(0, 0, fit.w, fit.h);
  const g = fit.ctx.createLinearGradient(0, 0, 0, fit.h);
  g.addColorStop(0, '#1a2458'); g.addColorStop(1, '#14281f');
  fit.ctx.fillStyle = g; fit.ctx.fillRect(0, 0, fit.w, fit.h);
  drawNinja(fit.ctx, fit.w / 2, fit.h * 0.68, order[frame % order.length], 1.4);
  if (step && step.widget === 'fps') {
    /* pose already drawn */
  }
}
function drawPoses(stepId, frame) {
  const canvas = byId('pose-' + stepId);
  if (!canvas) return;
  const fit = fitCanvas(canvas);
  if (!fit) return;
  const poses = (getDay(view.day).widgets?.[stepId]?.poses || ['站好', '抬左脚', '跳起']);
  fit.ctx.fillStyle = '#101632'; fit.ctx.fillRect(0, 0, fit.w, fit.h);
  poses.forEach((name, i) => {
    const idx = Math.max(0, POSE_OPTS.indexOf(name));
    const show = frame < 0 || i === frame % Math.max(1, poses.length);
    if (frame >= 0 && !show) return;
    const x = frame >= 0 ? fit.w / 2 : 40 + i * (fit.w / 3.2);
    drawNinja(fit.ctx, x, fit.h * 0.68, idx, frame >= 0 ? 1.3 : 0.8);
  });
}

function onFlipNext(step) {
  const saved = getDay(view.day);
  const w = saved.widgets?.[step.id] || {};
  const order = w.order === 'mix' ? [3, 2, 5, 1] : [0, 1, 0, 2];
  const frame = ((w.frame || 0) + 1) % order.length;
  patchDay(view.day, (cur) => {
    cur.widgets[step.id] = cur.widgets[step.id] || {};
    cur.widgets[step.id].frame = frame;
    cur.widgets[step.id].n = (cur.widgets[step.id].n || 0) + 1;
    cur.widgets[step.id].ts = Date.now();
  });
  const now = getDay(view.day).widgets[step.id];
  const count = byId('flip-count-' + step.id);
  if (count) count.textContent = `已翻 ${now.n}/${step.target || 8} 次 · 现在是${now.order === 'mix' ? '乱序' : '跑步顺序'}`;
  drawMini(step.id, frame);
}
function onFlipRun(step, speed) {
  const key = 'run-' + step.id;
  if (intervals[key]) clearInterval(intervals[key]);
  let left = 8;
  const ms = speed === 'fast' ? 120 : 700;
  intervals[key] = setInterval(() => {
    onFlipNext(step);
    left -= 1;
    if (left <= 0) {
      clearInterval(intervals[key]);
      delete intervals[key];
      if (speed === 'fast') patchDay(view.day, (cur) => { cur.widgets[step.id].playedFast = true; cur.widgets[step.id].ts = Date.now(); });
    }
  }, ms);
}

async function recordMic(stepId) {
  const msg = byId('mic-msg-' + stepId);
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
    if (msg) msg.textContent = '这个浏览器不让录音。请用微信语音再发一段当当当给爸爸。';
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      micBlobs[stepId] = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      patchDay(view.day, (cur) => { cur.widgets[stepId] = cur.widgets[stepId] || {}; cur.widgets[stepId].recorded = true; cur.widgets[stepId].ts = Date.now(); });
      if (msg) msg.textContent = '录好了。点播放，并把外放靠近电话。';
    };
    rec.start();
    if (msg) msg.textContent = '正在录，敲三下…';
    setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, 3000);
  } catch {
    if (msg) msg.textContent = '没有拿到麦克风。改用微信语音发「当当当」，再勾上爸爸听到了。';
  }
}

function pushChat(text, from) {
  const key = view.name === 'day' ? 'd' + view.day : 'home';
  if (!chatByKey[key]) chatByKey[key] = [];
  chatByKey[key].push({ from, text });
  const log = byId('chatLog');
  if (log) {
    log.insertAdjacentHTML('beforeend', bubbleHtml({ from, text }, chatByKey[key].length - 1));
    log.scrollTop = log.scrollHeight;
  }
}
function sendChat(text) {
  const t = String(text || '').trim();
  if (!t) return;
  pushChat(t, 'me');
  const ans = replyTo(t);
  pushChat(ans, 'xy');
  speak(ans);
}

async function copyText(text) {
  const box = byId('syncOut');
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (box) { box.focus(); box.select(); }
    return false;
  }
}
async function makeSync() {
  const code = await ShuyangSync.packState(readAll());
  const url = location.origin + location.pathname + '#sync=' + encodeURIComponent(code);
  const box = byId('syncOut');
  const hint = byId('syncHint');
  if (box) box.value = url;
  if (hint) hint.textContent = url.length > 1800
    ? '链接比较长。请整段复制发到微信。澍暘打开后如果没有自动同步，把整段粘进下面的框。'
    : '把链接发到微信。澍暘一点开并输入密码，就能看到同一份成果。';
}
async function applySync(text) {
  const incoming = await ShuyangSync.unpackState(text);
  const merged = ShuyangSync.mergeState(readAll(), incoming);
  recomputeAll(merged.days);
  writeAll(merged);
  flash = '已同步。这台手机上的打卡、星星和成果已经和链接合并。';
  render();
}

function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  if (act === 'home') { view = { name: 'home', day: view.day }; render(); return; }
  if (act === 'guide') { view = { name: 'guide', day: view.day }; render(); return; }
  if (act === 'shop') { view = { name: 'shop', day: view.day }; render(); return; }
  if (act === 'day') { gotoDay(+el.dataset.day); return; }
  if (act === 'prev') { gotoDay(view.day - 1); return; }
  if (act === 'next') { gotoDay(view.day + 1); return; }
  if (act === 'speak-goal') { const d = dayBy(view.day); speak(`${d.principle}。${d.method}。${d.practice}`); return; }
  if (act === 'speak-sum') { speak((byId('summary') && byId('summary').value) || (dayBy(view.day) || {}).reflect || ''); return; }
  if (act === 'say') { const line = dayBy(view.day).talk[+el.dataset.i]; speak(`${line[0]}说：${line[1]}`); return; }
  if (act === 'play-talk') {
    const talk = dayBy(view.day).talk;
    let i = 0;
    const next = () => { if (i >= talk.length) return; const [who, line] = talk[i++]; speak(`${who}说：${line}`, next); };
    next();
    return;
  }
  if (act === 'replay') { if (explain) explain.t0 = performance.now(); return; }
  if (act === 'sync-make') { makeSync(); return; }
  if (act === 'sync-copy') {
    const box = byId('syncOut');
    copyText(box ? box.value : '').then((ok) => { const m = byId('syncMsg'); if (m) m.textContent = ok ? '已复制。' : '请长按上面框里的字再复制。'; });
    return;
  }
  if (act === 'sync-apply') {
    applySync(byId('syncIn').value).catch(() => { const m = byId('syncMsg'); if (m) m.textContent = '这串没读出来。请爸爸重新生成一次。'; });
    return;
  }
  if (act === 'chip') { const input = byId('chatInput'); if (input) input.value = ''; sendChat(el.textContent); return; }
  if (act === 'copy-coach') {
    const text = coachText(dayBy(view.day));
    copyText(text).then((ok) => { if (!ok) { const box = byId('syncOut'); if (box) box.value = text; } });
    pushChat(okMessage(text), 'xy');
    return;
  }
  if (act === 'finish') { finishDay(); return; }
  if (act === 'timer') { startTimer(el.dataset.step, +el.dataset.sec); return; }
  if (act === 'redeem') { redeem(el.dataset.id); return; }
  if (act === 'save-cat') { saveCatalog(); return; }
  if (view.name !== 'day') return;
  const step = findStep(el.dataset.step);
  if (act === 'pick' && step) {
    const opt = step.options[+el.dataset.i];
    const msg = byId('pick-msg-' + step.id);
    if (msg) msg.textContent = opt.say;
    if (opt.ok) {
      patchDay(view.day, (cur) => {
        cur.widgets[step.id] = { choice: +el.dataset.i, artifact: opt.artifact || opt.t, ts: Date.now() };
      });
      el.classList.add('primary');
    }
    return;
  }
  if (act === 'flip-next' && step) { onFlipNext(step); return; }
  if (act === 'flip-run' && step) { onFlipRun(step, el.dataset.speed); return; }
  if (act === 'flip-order' && step) {
    patchDay(view.day, (cur) => { cur.widgets[step.id] = cur.widgets[step.id] || {}; cur.widgets[step.id].order = el.dataset.order; cur.widgets[step.id].ts = Date.now(); });
    const now = getDay(view.day).widgets[step.id];
    const count = byId('flip-count-' + step.id);
    if (count) count.textContent = `已翻 ${now.n || 0}/${step.target || 8} 次 · 现在是${now.order === 'mix' ? '乱序' : '跑步顺序'}`;
    drawMini(step.id, now.frame || 0);
    return;
  }
  if (act === 'spot' && step) {
    patchDay(view.day, (cur) => { cur.widgets[step.id] = cur.widgets[step.id] || {}; cur.widgets[step.id].n = (cur.widgets[step.id].n || 0) + 1; cur.widgets[step.id].ts = Date.now(); });
    const n = getDay(view.day).widgets[step.id].n;
    const p = byId('spot-' + step.id);
    if (p) p.textContent = `已点 ${n}/${step.target || 4}`;
    return;
  }
  if (act === 'fps' && step) { startFps(step, el.dataset.rate); return; }
  if (act === 'fps-choice' && step) {
    patchDay(view.day, (cur) => { cur.widgets[step.id] = cur.widgets[step.id] || {}; cur.widgets[step.id].choice = el.dataset.choice; cur.widgets[step.id].ts = Date.now(); });
    const msg = byId('fps-msg-' + step.id);
    const w = getDay(view.day).widgets[step.id];
    if (msg) msg.textContent = `慢的${w.slow ? '已看' : '还没看'} · 快的${w.fast ? '已看' : '还没看'} · 选了${w.choice === 'fast' ? '快' : '慢'}`;
    return;
  }
  if (act === 'spin' && step) {
    patchDay(view.day, (cur) => {
      const ww = cur.widgets[step.id] = cur.widgets[step.id] || { x: 0, y: 0, faces: [] };
      if (el.dataset.dir === 'left') ww.y = (Number(ww.y) || 0) - 90;
      if (el.dataset.dir === 'right') ww.y = (Number(ww.y) || 0) + 90;
      if (el.dataset.dir === 'up') ww.x = Math.min(90, (Number(ww.x) || 0) + 45);
      ww.ts = Date.now();
    });
    const ww = getDay(view.day).widgets[step.id];
    const cube = byId('cube-' + step.id);
    if (cube) cube.style.transform = `rotateX(${ww.x || 0}deg) rotateY(${ww.y || 0}deg)`;
    const face = byId('face-' + step.id);
    if (face) face.textContent = '现在是：' + faceName(ww.x || 0, ww.y || 0);
    return;
  }
  if (act === 'face-see' && step) {
    const ww0 = getDay(view.day).widgets?.[step.id] || { x: 0, y: 0 };
    const name = faceName(ww0.x || 0, ww0.y || 0);
    patchDay(view.day, (cur) => {
      const ww = cur.widgets[step.id] = cur.widgets[step.id] || { faces: [] };
      ww.faces = ww.faces || [];
      if (!ww.faces.includes(name)) ww.faces.push(name);
      ww.ts = Date.now();
    });
    const faces = byId('faces-' + step.id);
    if (faces) faces.textContent = '已记下：' + (getDay(view.day).widgets[step.id].faces || []).join('、');
    return;
  }
  if (act === 'sort' && step) {
    patchDay(view.day, (cur) => {
      const ww = cur.widgets[step.id] = cur.widgets[step.id] || {};
      ww.bins = ww.bins || {};
      ww.bins[el.dataset.item] = el.dataset.bin;
      ww.ts = Date.now();
    });
    const bins = getDay(view.day).widgets[step.id].bins;
    const row = el.parentElement;
    row.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.bin === bins[el.dataset.item]));
    const answered = SORT_ITEMS.filter((it) => bins[it.id]).length;
    const right = SORT_ITEMS.filter((it) => bins[it.id] === it.ok).length;
    const msg = byId('sort-msg-' + step.id);
    if (msg) msg.textContent = `已分 ${answered}/6，目前对 ${right} 个` + (answered === 6 && right < 6 ? '。错的可以改。' : '');
    return;
  }
  if (act === 'wave' && step) {
    playWave(el.dataset.kind);
    const msg = byId('wave-msg-' + step.id);
    if (msg) msg.textContent = el.dataset.kind === 'dense' ? '这是密点。' : '这是稀点。';
    return;
  }
  if (act === 'wave-choice' && step) {
    patchDay(view.day, (cur) => { cur.widgets[step.id] = cur.widgets[step.id] || {}; cur.widgets[step.id].choice = el.dataset.choice; cur.widgets[step.id].ts = Date.now(); });
    const msg = byId('wave-msg-' + step.id);
    if (msg) msg.textContent = '已选：' + (el.dataset.choice === 'dense' ? '密点更像连着的声音' : '稀点');
    return;
  }
  if (act === 'beat' && step) {
    const i = +el.dataset.i;
    patchDay(view.day, (cur) => {
      const ww = cur.widgets[step.id] = cur.widgets[step.id] || {};
      ww.beats = ww.beats && ww.beats.length === 8 ? ww.beats.slice() : [0, 0, 0, 0, 0, 0, 0, 0];
      ww.beats[i] = ww.beats[i] ? 0 : 1;
      ww.ts = Date.now();
    });
    el.classList.toggle('on');
    return;
  }
  if (act === 'drum-play' && step) {
    const beats = (getDay(view.day).widgets?.[step.id]?.beats) || [];
    beats.forEach((on, i) => { if (on) setTimeout(() => blip(i === 0 ? 160 : 230, 0.12, 'square'), i * 280); });
    patchDay(view.day, (cur) => { const ww = cur.widgets[step.id] = cur.widgets[step.id] || {}; ww.plays = (ww.plays || 0) + 1; ww.ts = Date.now(); });
    const p = byId('plays-' + step.id);
    if (p) p.textContent = `已播放 ${getDay(view.day).widgets[step.id].plays}/3`;
    return;
  }
  if (act === 'thud' && step) {
    blip(90, 0.28, 'sine');
    patchDay(view.day, (cur) => { const ww = cur.widgets[step.id] = cur.widgets[step.id] || {}; ww.sfxHeard = true; ww.ts = Date.now(); });
    const t = byId('thud-' + step.id);
    if (t) t.textContent = '听过了';
    return;
  }
  if (act === 'tool' && step) {
    patchDay(view.day, (cur) => { const ww = cur.widgets[step.id] = ensureMap(cur.widgets[step.id], step); ww.tool = el.dataset.tool; ww.ts = Date.now(); });
    const label = byId('tool-' + step.id);
    if (label) label.textContent = TOOL_NAME[el.dataset.tool];
    el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('primary', b === el));
    return;
  }
  if (act === 'cell' && step) {
    const i = +el.dataset.i;
    patchDay(view.day, (cur) => {
      const ww = cur.widgets[step.id] = ensureMap(cur.widgets[step.id], step);
      const tool = ww.tool || 'start';
      if (step.only === 'spring' && tool !== 'spring' && (ww.cells || []).includes('start')) return;
      ww.cells[i] = ww.cells[i] === tool ? '' : tool;
      if (tool !== '' ) ww.cells.forEach((c, idx) => { if (idx !== i && c === tool) ww.cells[idx] = ''; });
      ww.ts = Date.now();
    });
    const cells = getDay(view.day).widgets[step.id].cells;
    const box = el.parentElement;
    box.querySelectorAll('button').forEach((b, idx) => { b.innerHTML = `${idx + 1}<br>${cells[idx] ? TOOL_NAME[cells[idx]] : '空'}`; });
    const msg = byId('map-msg-' + step.id);
    if (msg) msg.textContent = mapText(cells) || '还没放东西';
    return;
  }
  if (act === 'mic' && step) { recordMic(step.id); return; }
  if (act === 'mic-play' && step) {
    const blob = micBlobs[step.id];
    const msg = byId('mic-msg-' + step.id);
    if (!blob) { if (msg) msg.textContent = '还没有录到。可以改发微信语音。'; return; }
    const audioEl = new Audio(URL.createObjectURL(blob));
    audioEl.play();
    return;
  }
  if (act === 'copy-prompt' && step) {
    const fields = getDay(view.day).widgets?.[step.id]?.fields || {};
    const text = fillTemplate(step.template, fields);
    copyText(text).then((ok) => {
      patchDay(view.day, (cur) => { const ww = cur.widgets[step.id] = cur.widgets[step.id] || { fields: {} }; ww.copies = (ww.copies || 0) + 1; ww.ts = Date.now(); });
      const c = byId('copies-' + step.id);
      if (c) c.textContent = `已复制 ${getDay(view.day).widgets[step.id].copies} 次` + (ok ? '' : '。如果没复制成功，请长按上面那段字。');
    });
    return;
  }
  if (act === 'pose-play' && step) {
    let f = 0;
    const key = 'pose-' + step.id;
    if (intervals[key]) clearInterval(intervals[key]);
    intervals[key] = setInterval(() => {
      drawPoses(step.id, f);
      f += 1;
      if (f > 8) { clearInterval(intervals[key]); delete intervals[key]; drawPoses(step.id, -1); }
    }, 280);
    patchDay(view.day, (cur) => { const ww = cur.widgets[step.id] = cur.widgets[step.id] || {}; ww.played = true; ww.ts = Date.now(); });
  }
}
function okMessage() { return '上课提示词已复制。爸爸把它发给语音里的 AI，让它用短句陪着问。'; }
function ensureMap(ww, step) {
  const base = ww || {};
  if (!base.cells || !base.cells.length) base.cells = mapCells(step, base, dayBy(view.day));
  if (!base.tool) base.tool = step.only === 'spring' ? 'spring' : 'start';
  return base;
}
function playWave(kind) {
  const ac = audio();
  if (!ac) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = kind === 'dense' ? 'sine' : 'square';
  o.frequency.value = kind === 'dense' ? 523 : 160;
  g.gain.setValueAtTime(0.12, ac.currentTime);
  if (kind !== 'dense') {
    for (let i = 0; i < 8; i++) o.frequency.setValueAtTime(100 + Math.random() * 480, ac.currentTime + i * 0.18);
  }
  g.gain.exponentialRampToValueAtTime(0.01, ac.currentTime + 1.45);
  o.connect(g); g.connect(ac.destination);
  o.start(); o.stop(ac.currentTime + 1.5);
}
function startFps(step, rate) {
  const key = 'fps-' + step.id;
  if (intervals[key]) clearInterval(intervals[key]);
  let frame = 0;
  let left = 20;
  const ms = rate === 'slow' ? 250 : 80;
  const msg = byId('fps-msg-' + step.id);
  intervals[key] = setInterval(() => {
    frame += 1;
    drawMini(step.id, frame);
  }, ms);
  const tick = 'fps-sec-' + step.id;
  if (intervals[tick]) clearInterval(intervals[tick]);
  intervals[tick] = setInterval(() => {
    left -= 1;
    if (msg) msg.textContent = `${rate === 'slow' ? '慢' : '快'}还剩 ${left} 秒`;
    if (left <= 0) {
      clearInterval(intervals[key]); clearInterval(intervals[tick]);
      delete intervals[key]; delete intervals[tick];
      patchDay(view.day, (cur) => {
        const ww = cur.widgets[step.id] = cur.widgets[step.id] || {};
        if (rate === 'slow') ww.slow = true; else ww.fast = true;
        ww.ts = Date.now();
      });
      const w = getDay(view.day).widgets[step.id];
      if (msg) msg.textContent = `慢的${w.slow ? '已看' : '还没看'} · 快的${w.fast ? '已看' : '还没看'}`;
    }
  }, 1000);
}
function startTimer(stepId, sec) {
  const key = 'timer-' + stepId;
  if (intervals[key]) clearInterval(intervals[key]);
  let left = sec;
  const el = byId('timer-' + stepId);
  intervals[key] = setInterval(() => {
    left -= 1;
    if (el) el.textContent = left > 0 ? formatSec(left) : '时间到';
    if (left <= 0) {
      clearInterval(intervals[key]);
      delete intervals[key];
      patchDay(view.day, (cur) => { cur.timerDone[stepId] = true; });
    }
  }, 1000);
}
function finishDay() {
  const day = dayBy(view.day);
  const saved = getDay(view.day);
  const empty = !day.steps.some((s) => saved.steps?.[s.id]?.on) && !saved.artifact && !saved.principleNote && !saved.summary;
  if (empty && !confirm('今天的步骤和成果都还空着，仍然打卡吗？')) return;
  patchDay(view.day, (cur) => { cur.done = true; });
  const box = byId('doneBox');
  if (box) box.checked = true;
  const msg = byId('savedMsg');
  const stepsOn = day.steps.filter((s) => getDay(view.day).steps?.[s.id]?.on).length;
  if (msg) msg.textContent = stepsOn < day.steps.length
    ? '已打卡，星星记下了。还有步骤没勾，下次可以补。记得生成同步链接。'
    : '已打卡。这颗星是做出来的。生成同步链接发给澍暘。';
  speak('今天的星星到手了。');
}
function onInput(e) {
  const el = e.target;
  const act = el.dataset.act;
  if (!act || view.name !== 'day') return;
  if (act === 'pnote') {
    patchDay(view.day, (cur) => { cur.principleNote = el.value; cur.principleTs = Date.now(); });
    return;
  }
  if (act === 'summary') {
    patchDay(view.day, (cur) => { cur.summary = el.value; cur.summaryTs = Date.now(); });
    return;
  }
  if (act === 'videourl') {
    patchDay(view.day, (cur) => { cur.videoUrl = el.value.trim(); cur.videoTs = Date.now(); });
    paintVideoLink();
    return;
  }
  if (act === 'field') {
    const step = findStep(el.dataset.step);
    if (!step) return;
    patchDay(view.day, (cur) => {
      const ww = cur.widgets[step.id] = cur.widgets[step.id] || {};
      ww.fields = ww.fields || {};
      ww.fields[el.dataset.field] = el.value;
      ww.ts = Date.now();
    });
    const pre = byId('preview-' + step.id);
    if (pre && step.template) pre.textContent = fillTemplate(step.template, getDay(view.day).widgets[step.id].fields || {});
    return;
  }
  if (act === 'drum-name') {
    const step = findStep(el.dataset.step);
    patchDay(view.day, (cur) => { const ww = cur.widgets[step.id] = cur.widgets[step.id] || {}; ww.name = el.value; ww.ts = Date.now(); });
    return;
  }
  if (act === 'layer') {
    const step = findStep(el.dataset.step);
    const which = el.dataset.which;
    patchDay(view.day, (cur) => {
      const ww = cur.widgets[step.id] = cur.widgets[step.id] || {};
      ww[which] = Number(el.value);
      ww.ts = Date.now();
    });
    const num = byId((which === 'nx' ? 'nxn-' : 'bgn-') + step.id);
    if (num) num.textContent = el.value;
    const node = byId((which === 'nx' ? 'nj-' : 'bg-') + step.id);
    if (node) node.style.transform = `translateX(${Number(el.value) * (which === 'nx' ? 1.6 : 0.6)}px)`;
  }
}
function onChange(e) {
  const el = e.target;
  const act = el.dataset.act;
  if (!act) return;
  if (act === 'fulfil') {
    const rewards = loadRewards();
    const i = +el.dataset.idx;
    if (rewards.redeemed[i]) rewards.redeemed[i].fulfilled = el.checked;
    saveRewards(rewards);
    return;
  }
  if (view.name !== 'day') return;
  if (act === 'step') {
    patchDay(view.day, (cur) => {
      cur.steps[el.dataset.step] = cur.steps[el.dataset.step] || { subs: [] };
      cur.steps[el.dataset.step].on = el.checked;
    });
    const art = byId('step-' + el.dataset.step);
    if (art) art.classList.toggle('on', el.checked);
    return;
  }
  if (act === 'sub') {
    const i = +el.dataset.sub;
    patchDay(view.day, (cur) => {
      const st = cur.steps[el.dataset.step] = cur.steps[el.dataset.step] || { subs: [] };
      st.subs = st.subs || [];
      st.subs[i] = el.checked;
    });
    return;
  }
  if (act === 'done') {
    patchDay(view.day, (cur) => { cur.done = el.checked; });
    const msg = byId('savedMsg');
    if (msg) msg.textContent = el.checked ? '已打卡。回月历可以看到这一天变绿。' : '已取消打卡。';
    return;
  }
  if (act === 'pose') {
    const step = findStep(el.dataset.step);
    const slot = +el.dataset.slot;
    patchDay(view.day, (cur) => {
      const ww = cur.widgets[step.id] = cur.widgets[step.id] || {};
      ww.poses = ww.poses && ww.poses.length === 3 ? ww.poses.slice() : ['站好', '抬左脚', '跳起'];
      ww.poses[slot] = el.value;
      ww.ts = Date.now();
    });
    drawPoses(step.id, -1);
  }
}
function onSubmit(e) {
  if (e.target && e.target.id === 'chatForm') {
    e.preventDefault();
    const input = byId('chatInput');
    sendChat(input.value);
    input.value = '';
  }
}
function redeem(id) {
  const rewards = loadRewards();
  const data = load();
  const st = starStats(data, rewards);
  const item = rewards.catalog.find((x) => x.id === id);
  if (!item || st.bal < item.cost) return;
  if (!confirm(`确定用 ${item.cost} 星兑换「${item.name}」吗？`)) return;
  rewards.redeemed.push({ id: item.id, name: item.name, cost: item.cost, emoji: item.emoji, at: new Date().toISOString(), fulfilled: false });
  saveRewards(rewards);
  render();
}
function saveCatalog() {
  const box = byId('catalogEdit');
  if (!box) return;
  const catalog = [];
  box.value.split('\n').map((x) => x.trim()).filter(Boolean).forEach((line, i) => {
    const parts = line.split('|').map((x) => x.trim());
    if (parts.length < 3) return;
    const cost = parseInt(parts[2], 10);
    if (!cost) return;
    catalog.push({ id: 'c' + (i + 1), emoji: parts[0], name: parts[1], cost });
  });
  if (!catalog.length) { alert('至少保留一条有效奖励'); return; }
  const rewards = loadRewards();
  rewards.catalog = catalog;
  rewards.catalogTs = Date.now();
  saveRewards(rewards);
  render();
}
function wire() {
  if (wired) return;
  wired = true;
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('submit', onSubmit);
}
function codeFromHash() {
  const m = (location.hash || '').match(/sync=([^&]+)/);
  if (!m) return '';
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}
async function boot() {
  try {
    course();
    wire();
    if (!clockHandle) clockHandle = setInterval(paintClock, 1000);
    const code = codeFromHash();
    if (code) {
      try {
        const incoming = await ShuyangSync.unpackState(code);
        const merged = ShuyangSync.mergeState(readAll(), incoming);
        recomputeAll(merged.days);
        writeAll(merged);
        history.replaceState(null, '', location.pathname + location.search);
        flash = '已从微信链接同步。这台手机上的打卡、星星和成果已经合并。';
      } catch (err) {
        flashKind = 'bad';
        flash = '链接里的同步码没读出来。这台手机原来的进度还在。可以让爸爸重新发一次。';
      }
    }
    render();
  } catch (e) {
    const app = byId('app');
    if (app) app.innerHTML = '<p style="padding:24px;color:#ffb4b4">页面加载出错：' + esc(e.message) + '</p>';
    console.error(e);
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
