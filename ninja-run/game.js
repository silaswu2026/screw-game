// Original canvas parkour. No external sprites. The hero is a chubby plumber-ninja
// drawn with vector shapes: plain white circle on the cap, no letter.
(function () {
  const T = 40;
  const GRAV = 1650;
  const JUMP_V = 680;
  const WALL_VX = 320;
  const WALL_VY = 660;
  const SLIDE = 130;

  const canvas = document.getElementById('view');
  const ctx = canvas.getContext('2d');
  const hud = document.getElementById('hud');
  const menu = document.getElementById('menu');
  const panel = document.getElementById('panel');
  const touch = document.getElementById('touch');
  const hintEl = document.getElementById('hint');
  const toastEl = document.getElementById('toast');
  const lvlName = document.getElementById('lvlName');
  const lvlEn = document.getElementById('lvlEn');
  const coinN = document.getElementById('coinN');
  const starN = document.getElementById('starN');
  const panelTitle = document.getElementById('panelTitle');
  const panelSub = document.getElementById('panelSub');
  const panelBtn = document.getElementById('panelBtn');

  const errors = [];
  addEventListener('error', (e) => errors.push(String(e.message || e.error || e)));

  const input = { left: false, right: false, jump: false, jumpPressed: false, throw: false, throwEdge: false };
  let mode = 'title';
  let levelIndex = 0;
  let cols = 1;
  let rows = 1;
  let solid = new Uint8Array(1);
  let coins = [];
  let stars = [];
  let slimes = [];
  let crates = [];
  let checks = [];
  let goal = { x: 0, y: 0 };
  let spawn = { x: 80, y: 200 };
  let checkpoint = { x: 80, y: 200 };
  let markers = { gaps: [], walls: [], coins: [], slimes: [], goal: null, spawn: null };
  let gotCoins = 0;
  let gotStars = 0;
  let sim = 0;
  let zoom = 1;
  let viewW = 390;
  let viewH = 844;
  let dpr = 1;
  let cam = { x: 0, y: 0, snap: true };
  let sky = null;
  let hintUntil = 0;
  let toastUntil = 0;
  let trailAcc = 0;
  let trailI = 0;
  const trails = Array.from({ length: 7 }, () => ({ on: 0, x: 0, y: 0, face: 1, life: 0 }));
  const parts = Array.from({ length: 72 }, () => ({ on: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, color: '#fff', s: 2 }));
  const shurikens = Array.from({ length: 6 }, () => ({ on: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, spin: 0 }));
  const player = {
    x: 80, y: 200, vx: 0, vy: 0, w: 30, h: 58, face: 1,
    grounded: false, onWall: 0, coyote: 0, jumpBuf: 0, wallLock: 0,
    throwT: 0, wallJumpT: 0, cool: 0, squash: 0, invuln: 0, justSpawn: 0,
    anim: 'idle', phase: 0,
  };
  let whooshLevel = 0;
  let whooshBurst = 0;

  const brick = document.createElement('canvas');
  brick.width = brick.height = 40;
  {
    const g = brick.getContext('2d');
    g.fillStyle = '#e15a3a';
    g.fillRect(0, 0, 40, 40);
    g.fillStyle = '#cf4e30';
    g.fillRect(0, 20, 40, 20);
    g.strokeStyle = '#f8d7c8';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 20); g.lineTo(40, 20);
    g.moveTo(20, 0); g.lineTo(20, 20);
    g.moveTo(0, 20); g.lineTo(0, 40);
    g.stroke();
  }
  let brickPat = ctx.createPattern(brick, 'repeat');

  const audio = { ctx: null, noise: null, filter: null, gain: null, src: null };
  function ac() {
    if (!audio.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audio.ctx = new AC();
      const n = audio.ctx.sampleRate * 2;
      const buf = audio.ctx.createBuffer(1, n, audio.ctx.sampleRate);
      const data = buf.getChannelData(0);
      let b = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        b = b * 0.97 + w * 0.03;
        data[i] = b * 4;
      }
      audio.noise = buf;
    }
    return audio.ctx;
  }
  function unlock() {
    const c = ac();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    if (!audio.src) {
      const src = c.createBufferSource();
      src.buffer = audio.noise;
      src.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 320;
      filter.Q.value = 0.65;
      const gain = c.createGain();
      gain.gain.value = 0;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(c.destination);
      src.start();
      audio.src = src;
      audio.filter = filter;
      audio.gain = gain;
    }
  }
  function tone(freq, dur, type, gain, slide) {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function tickNoise(dur, gain, hp) {
    const c = ac();
    if (!c || !audio.noise) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = audio.noise;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t); src.stop(t + dur);
  }
  const sfx = {
    jump() { tone(420, 0.09, 'square', 0.04, 1.5); },
    throw() { tickNoise(0.04, 0.08, 1400); tone(880, 0.05, 'square', 0.03, 0.6); },
    coin() { tone(980, 0.07, 'sine', 0.05, 1.3); },
    star() { tone(880, 0.08, 'triangle', 0.05, 1); setTimeout(() => tone(1320, 0.1, 'triangle', 0.04, 1), 70); },
    crate() { tickNoise(0.08, 0.1, 200); tone(180, 0.08, 'sine', 0.05, 0.5); },
    slime() { tone(320, 0.1, 'sine', 0.05, 0.4); },
    check() { tone(660, 0.08, 'triangle', 0.05, 1); setTimeout(() => tone(880, 0.1, 'triangle', 0.04, 1), 80); },
    win() { tone(523, 0.1, 'triangle', 0.05, 1); setTimeout(() => tone(659, 0.1, 'triangle', 0.05, 1), 90); setTimeout(() => tone(784, 0.16, 'triangle', 0.05, 1), 180); },
    land() { tickNoise(0.04, 0.05, 300); },
    bump() { tone(160, 0.08, 'sine', 0.04, 0.6); },
    respawn() { tone(240, 0.1, 'triangle', 0.04, 0.7); },
  };
  // Looping filtered wind that swells with run speed, plus a short burst on jump / wall-jump.
  function whooshHit(power) {
    whooshBurst = Math.min(1.35, whooshBurst + power);
    const c = ac();
    if (!c || !audio.noise) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = audio.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 420 + power * 520;
    f.Q.value = 0.7;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11 * power, t + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t); src.stop(t + 0.26);
  }
  function updateWhoosh(speed, dt) {
    const base = Math.min(1, Math.max(0, (speed - 40) / 240));
    whooshBurst = Math.max(0, whooshBurst - dt * 1.5);
    whooshLevel = Math.min(1, base * 0.75 + whooshBurst);
    if (!audio.gain || !audio.filter || !audio.ctx) return;
    const t = audio.ctx.currentTime;
    audio.gain.gain.setTargetAtTime(whooshLevel * 0.15, t, 0.045);
    audio.filter.frequency.setTargetAtTime(240 + whooshLevel * 1200, t, 0.05);
  }
  function buzz(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* desktop */ }
  }

  function cell(c, r) { return { x: (c + 0.5) * T, y: (r + 0.5) * T }; }
  function feet(c, groundRow) { return { x: (c + 0.5) * T, y: groundRow * T }; }

  const LEVELS = [
    {
      name: '屋顶晨跑', en: 'Rooftop Jog',
      hint: '跳跃跨过空隙   Jump the gaps',
      cols: 80, rows: 14, spawn: [3, 11], goal: [75, 11],
      checks: [[41, 11]],
      slimes: [[28, 11]], crates: [[22, 11]], walls: [],
      coins: [[4, 9], [6, 9], [8, 9], [10, 9], [12, 9], [15, 8], [16, 7], [17, 8], [21, 9], [25, 9], [30, 9], [34, 9], [37, 8], [38, 7], [39, 8], [43, 9], [47, 9], [55, 9], [59, 8], [60, 7], [61, 8], [65, 9], [69, 9], [73, 9]],
      stars: [[50, 8]],
      build(box) {
        box(0, 14, 11, 13);
        box(18, 36, 11, 13);
        box(40, 58, 11, 13);
        box(62, 79, 11, 13);
        box(48, 52, 9, 10);
      },
    },
    {
      name: '砖墙小巷', en: 'Brick Alley',
      hint: '贴墙滑行，再蹬墙   Slide, then wall-jump',
      cols: 88, rows: 14, spawn: [3, 11], goal: [82, 11],
      checks: [[16, 11], [40, 11]],
      slimes: [[54, 11]], crates: [[62, 11]],
      walls: [{ l0: 30, l1: 31, r0: 35, r1: 36, top: 7 }],
      coins: [[5, 9], [9, 9], [13, 9], [22, 8], [27, 9], [33, 9], [33, 7], [44, 9], [50, 9], [58, 9], [66, 9], [72, 9], [78, 9]],
      stars: [[33, 5]],
      build(box) {
        box(0, 20, 11, 13);
        box(24, 87, 11, 13);
        box(30, 31, 7, 10);
        box(35, 36, 7, 10);
        box(35, 46, 7, 7);
      },
    },
    {
      name: '星灯屋顶', en: 'Star Roofs',
      hint: '收集星星，冲过终点   Grab stars, reach the goal',
      cols: 100, rows: 14, spawn: [2, 11], goal: [94, 11],
      checks: [[74, 11]],
      slimes: [[14, 11], [36, 11]], crates: [[32, 11]],
      walls: [{ l0: 44, l1: 45, r0: 49, r1: 50, top: 7 }],
      coins: [[4, 9], [8, 9], [12, 9], [16, 9], [23, 8], [28, 9], [34, 9], [40, 9], [47, 8], [47, 6], [56, 6], [63, 9], [68, 9], [76, 9], [84, 9], [90, 9]],
      stars: [[21, 8], [47, 5], [58, 6]],
      build(box) {
        box(0, 22, 11, 13);
        box(25, 78, 11, 13);
        box(82, 99, 11, 13);
        box(18, 20, 10, 10);
        box(21, 22, 9, 10);
        box(44, 45, 7, 10);
        box(49, 50, 7, 10);
        box(49, 60, 7, 7);
      },
    },
  ];

  function findGaps(groundRow) {
    const gaps = [];
    let c = 0;
    while (c < cols) {
      if (solid[groundRow * cols + c]) { c++; continue; }
      const start = c;
      while (c < cols && !solid[groundRow * cols + c]) c++;
      if (start > 0 && c < cols) gaps.push({ x0: start * T, x1: c * T, y: groundRow * T });
    }
    return gaps;
  }

  function loadLevel(i) {
    levelIndex = i;
    const def = LEVELS[i];
    cols = def.cols;
    rows = def.rows;
    solid = new Uint8Array(cols * rows);
    const box = (c0, c1, r0, r1) => {
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (c >= 0 && r >= 0 && c < cols && r < rows) solid[r * cols + c] = 1;
        }
      }
    };
    def.build(box);
    const ground = 11;
    coins = def.coins.map(([c, r]) => Object.assign({ got: false, bob: c }, cell(c, r)));
    stars = def.stars.map(([c, r]) => Object.assign({ got: false, bob: r }, cell(c, r)));
    slimes = def.slimes.map(([c, r]) => {
      const p = feet(c, r);
      return { x: p.x, y: p.y, w: 34, h: 26, vx: 0, vy: 0, dir: 1, hop: 0.5, dead: false, grounded: true };
    });
    crates = def.crates.map(([c, r]) => {
      const p = feet(c, r);
      return { x: p.x, y: p.y, w: 36, h: 36, dead: false };
    });
    checks = def.checks.map(([c, r]) => Object.assign({ on: false }, feet(c, r)));
    goal = feet(def.goal[0], def.goal[1]);
    spawn = feet(def.spawn[0], def.spawn[1]);
    checkpoint = { x: spawn.x, y: spawn.y };
    markers = {
      gaps: findGaps(ground),
      walls: (def.walls || []).map((w) => ({
        x0: (w.l1 + 1) * T,
        x1: w.r0 * T,
        top: w.top * T,
        bottom: ground * T,
      })),
      coins: coins.map((c) => ({ x: c.x, y: c.y })),
      slimes: slimes.map((s) => ({ x: s.x, y: s.y })),
      goal: { x: goal.x, y: goal.y },
      spawn: { x: spawn.x, y: spawn.y },
    };
    gotCoins = 0;
    gotStars = 0;
    player.x = spawn.x;
    player.y = spawn.y;
    player.vx = 0;
    player.vy = 0;
    player.face = 1;
    player.grounded = true;
    player.onWall = 0;
    player.coyote = 0.12;
    player.justSpawn = 0.2;
    player.invuln = 0;
    player.anim = 'idle';
    for (let i = 0; i < shurikens.length; i++) shurikens[i].on = 0;
    for (let i = 0; i < trails.length; i++) trails[i].on = 0;
    cam.snap = true;
    lvlName.textContent = '第' + (i + 1) + '关 ' + def.name;
    lvlEn.textContent = 'Level ' + (i + 1) + ' ' + def.en;
    hintEl.textContent = def.hint;
    hintEl.classList.remove('hidden');
    hintUntil = sim + 3.2;
    syncHUD();
  }

  function syncHUD() {
    coinN.textContent = '🪙 ' + gotCoins;
    starN.textContent = '⭐ ' + gotStars;
  }
  function syncChrome() {
    menu.classList.toggle('hidden', mode !== 'title');
    hud.classList.toggle('hidden', mode === 'title');
    touch.classList.toggle('hidden', mode !== 'play');
    panel.classList.toggle('hidden', mode !== 'clear' && mode !== 'win');
  }
  function toast(s) {
    toastEl.textContent = s;
    toastEl.classList.add('on');
    toastUntil = sim + 1.5;
  }
  function resetInput() {
    input.left = input.right = input.jump = input.throw = false;
    input.jumpPressed = false;
    input.throwEdge = false;
  }
  function start(i) {
    resetInput();
    mode = 'play';
    loadLevel(i);
    syncChrome();
  }
  function reachGoal() {
    const total = '🪙 ' + gotCoins + '   ⭐ ' + gotStars;
    if (levelIndex >= LEVELS.length - 1) {
      mode = 'win';
      panelTitle.textContent = '你做到了!';
      panelSub.textContent = 'You did it!  ' + total;
      panelBtn.textContent = '再玩一次 Play again';
    } else {
      mode = 'clear';
      panelTitle.textContent = '过关了!';
      panelSub.textContent = 'Level clear!  ' + total;
      panelBtn.textContent = '下一关 Next';
    }
    sfx.win();
    buzz(20);
    syncChrome();
  }
  function respawn() {
    player.x = checkpoint.x;
    player.y = checkpoint.y;
    player.vx = 0;
    player.vy = 0;
    player.grounded = true;
    player.onWall = 0;
    player.invuln = 0.7;
    player.justSpawn = 0.25;
    cam.snap = true;
    toast('回到检查点  Back to checkpoint');
    sfx.respawn();
  }

  function solidAt(c, r) {
    if (r < 0) return false;
    if (c < 0 || c >= cols) return true;
    if (r >= rows) return false;
    return solid[r * cols + c] === 1;
  }
  function hbOf(x, y) {
    return { l: x - player.w / 2, r: x + player.w / 2, t: y - player.h, b: y };
  }
  function solidOverlap(hb) {
    const c0 = Math.floor(hb.l / T);
    const c1 = Math.floor((hb.r - 0.001) / T);
    const r0 = Math.floor(hb.t / T);
    const r1 = Math.floor((hb.b - 0.001) / T);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) if (solidAt(c, r)) return true;
    }
    return false;
  }
  function crateAABB(c) {
    return { l: c.x - c.w / 2, r: c.x + c.w / 2, t: c.y - c.h, b: c.y };
  }
  function hit(a, b) {
    return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  }
  function resolveCratesX() {
    const hb = hbOf(player.x, player.y);
    for (let i = 0; i < crates.length; i++) {
      const c = crates[i];
      if (c.dead) continue;
      const box = crateAABB(c);
      if (!hit(hb, box)) continue;
      if (player.x >= c.x) player.x = box.r + player.w / 2;
      else player.x = box.l - player.w / 2;
      player.vx = 0;
    }
  }
  function resolveCratesY() {
    for (let i = 0; i < crates.length; i++) {
      const c = crates[i];
      if (c.dead) continue;
      const hb = hbOf(player.x, player.y);
      const box = crateAABB(c);
      if (!hit(hb, box)) continue;
      if (player.vy >= 0 && player.y - player.vy * 0.02 <= box.t + 8) {
        player.y = box.t;
        player.vy = 0;
        player.grounded = true;
        player.onWall = 0;
      } else if (player.vy < 0) {
        player.y = box.b + player.h;
        player.vy = 0;
      } else if (player.x >= c.x) player.x = box.r + player.w / 2;
      else player.x = box.l - player.w / 2;
    }
  }
  function moveX(dt) {
    player.x += player.vx * dt;
    const hb = hbOf(player.x, player.y);
    if (solidOverlap(hb)) {
      if (player.vx > 0) {
        const col = Math.floor((hb.r - 0.001) / T);
        player.x = col * T - player.w / 2;
        player.onWall = 1;
      } else if (player.vx < 0) {
        const col = Math.floor(hb.l / T);
        player.x = (col + 1) * T + player.w / 2;
        player.onWall = -1;
      }
      player.vx = 0;
    } else player.onWall = 0;
    resolveCratesX();
  }
  function moveY(dt) {
    player.grounded = false;
    player.y += player.vy * dt;
    const hb = hbOf(player.x, player.y);
    if (solidOverlap(hb)) {
      if (player.vy >= 0) {
        const row = Math.floor((hb.b - 0.001) / T);
        player.y = row * T;
        player.vy = 0;
        player.grounded = true;
        player.onWall = 0;
      } else {
        const row = Math.floor(hb.t / T);
        player.y = (row + 1) * T + player.h;
        player.vy = 40;
      }
    }
    resolveCratesY();
  }

  function puff(x, y, color, n) {
    for (let k = 0; k < n; k++) {
      let p = null;
      for (let i = 0; i < parts.length; i++) if (!parts[i].on) { p = parts[i]; break; }
      if (!p) p = parts[k % parts.length];
      const a = (k / n) * Math.PI * 2;
      p.on = 1;
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * (40 + (k % 5) * 18);
      p.vy = Math.sin(a) * 40 - 30;
      p.life = 0.35 + (k % 3) * 0.08;
      p.max = p.life;
      p.color = color;
      p.s = 3 + (k % 3);
    }
  }
  function doThrow() {
    if (player.cool > 0 || mode !== 'play') return;
    player.cool = 0.28;
    player.throwT = 0.2;
    let s = null;
    for (let i = 0; i < shurikens.length; i++) if (!shurikens[i].on) { s = shurikens[i]; break; }
    if (!s) s = shurikens[0];
    s.on = 1;
    s.x = player.x + player.face * 22;
    s.y = player.y - 32;
    s.vx = player.face * 540;
    s.vy = 40;
    s.life = 0.75;
    s.spin = 0;
    sfx.throw();
    buzz(8);
  }
  function press(name, down) {
    unlock();
    if (name === 'jump') {
      if (down && !input.jump) input.jumpPressed = true;
      input.jump = down;
    } else if (name === 'throw') {
      if (down && !input.throw) input.throwEdge = true;
      input.throw = down;
    } else if (name === 'left') input.left = down;
    else if (name === 'right') input.right = down;
  }

  function update(dt) {
    sim += dt;
    if (toastUntil && sim > toastUntil) {
      toastEl.classList.remove('on');
      toastUntil = 0;
    }
    if (hintUntil && sim > hintUntil) hintEl.classList.add('hidden');
    if (mode !== 'play') {
      updateWhoosh(0, dt);
      player.phase += dt * 8;
      return;
    }
    player.coyote = Math.max(0, player.coyote - dt);
    player.jumpBuf = Math.max(0, player.jumpBuf - dt);
    player.wallLock = Math.max(0, player.wallLock - dt);
    player.throwT = Math.max(0, player.throwT - dt);
    player.wallJumpT = Math.max(0, player.wallJumpT - dt);
    player.cool = Math.max(0, player.cool - dt);
    player.squash = Math.max(0, player.squash - dt);
    player.invuln = Math.max(0, player.invuln - dt);
    player.justSpawn = Math.max(0, player.justSpawn - dt);

    let desired = player.vx;
    if (player.wallLock > 0) desired = player.vx;
    else if (player.onWall && !player.grounded) {
      if (player.onWall === 1 && !input.left) desired = 90;
      else if (player.onWall === -1 && !input.right) desired = -90;
      else if (input.left) desired = -240;
      else if (input.right) desired = 270;
    } else if (input.left && !input.right) desired = -240;
    else if (input.right && !input.left) desired = 270;
    else if (player.grounded) desired = 200;
    const accel = (player.grounded ? 2400 : 1400) * dt;
    const dv = desired - player.vx;
    player.vx += Math.max(-accel, Math.min(accel, dv));

    if (input.jumpPressed) {
      player.jumpBuf = 0.14;
      input.jumpPressed = false;
    }
    const canGround = player.grounded || player.coyote > 0;
    const canWall = player.onWall !== 0 && !player.grounded;
    if (player.jumpBuf > 0 && (canWall || canGround)) {
      if (canWall) {
        player.vx = -player.onWall * WALL_VX;
        player.vy = -WALL_VY;
        player.face = -player.onWall;
        player.wallLock = 0.26;
        player.wallJumpT = 0.24;
        player.onWall = 0;
        player.grounded = false;
        player.coyote = 0;
        whooshHit(1);
        sfx.jump();
        puff(player.x, player.y, '#9ecbff', 5);
      } else {
        player.vy = -JUMP_V;
        player.grounded = false;
        player.coyote = 0;
        whooshHit(0.85);
        sfx.jump();
        puff(player.x, player.y, '#ffffff', 4);
      }
      player.jumpBuf = 0;
      buzz(10);
    }
    if (!input.jump && player.vy < -240) player.vy = -240;

    player.vy += GRAV * dt;
    if (player.vy > 980) player.vy = 980;
    if (player.onWall && !player.grounded && player.vy > SLIDE) player.vy = SLIDE;

    const wasGround = player.grounded;
    moveX(dt);
    moveY(dt);
    if (wasGround && !player.grounded) player.coyote = 0.12;
    if (!wasGround && player.grounded && player.justSpawn <= 0) {
      player.squash = 0.1;
      sfx.land();
    }

    if (player.onWall && !player.grounded) player.face = -player.onWall;
    else if (Math.abs(player.vx) > 12) player.face = player.vx > 0 ? 1 : -1;

    if (input.throwEdge) {
      input.throwEdge = false;
      doThrow();
    }

    if (player.throwT > 0) player.anim = 'throw';
    else if (player.wallJumpT > 0) player.anim = 'walljump';
    else if (player.onWall && !player.grounded) player.anim = 'slide';
    else if (!player.grounded) player.anim = 'jump';
    else if (Math.abs(player.vx) > 24) player.anim = 'run';
    else player.anim = 'idle';

    player.phase += Math.abs(player.vx) * dt * 0.05;
    const speed = Math.hypot(player.vx, player.vy);
    if (speed > 150) {
      trailAcc += dt;
      if (trailAcc > 0.045) {
        trailAcc = 0;
        const tr = trails[trailI % trails.length];
        trailI++;
        tr.on = 1;
        tr.x = player.x;
        tr.y = player.y;
        tr.face = player.face;
        tr.life = 0.28;
      }
    }
    for (let i = 0; i < trails.length; i++) if (trails[i].on) {
      trails[i].life -= dt;
      if (trails[i].life <= 0) trails[i].on = 0;
    }

    for (let i = 0; i < shurikens.length; i++) {
      const s = shurikens[i];
      if (!s.on) continue;
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.spin += dt * 16;
      const tc = Math.floor(s.x / T);
      const tr = Math.floor(s.y / T);
      let die = s.life <= 0 || solidAt(tc, tr);
      if (!die) {
        for (let k = 0; k < slimes.length; k++) {
          const m = slimes[k];
          if (m.dead) continue;
          if (Math.abs(s.x - m.x) < 26 && Math.abs(s.y - (m.y - 16)) < 26) {
            m.dead = true;
            die = true;
            gotCoins++;
            puff(m.x, m.y - 12, '#8ee88a', 8);
            sfx.slime();
          }
        }
      }
      if (!die) {
        for (let k = 0; k < crates.length; k++) {
          const c = crates[k];
          if (c.dead) continue;
          const box = crateAABB(c);
          if (s.x > box.l && s.x < box.r && s.y > box.t && s.y < box.b) {
            c.dead = true;
            die = true;
            gotCoins += 3;
            puff(c.x, c.y - 16, '#e7b15a', 8);
            sfx.crate();
          }
        }
      }
      if (die) s.on = 0;
    }

    for (let i = 0; i < slimes.length; i++) {
      const m = slimes[i];
      if (m.dead) continue;
      m.vy += GRAV * dt;
      m.y += m.vy * dt;
      const under = Math.floor((m.y + 1) / T);
      const col = Math.floor(m.x / T);
      if (solidAt(col, under)) {
        m.y = under * T;
        m.vy = 0;
        m.grounded = true;
      } else m.grounded = false;
      m.x += m.dir * 36 * dt;
      const ax = m.x + m.dir * (m.w / 2 + 2);
      const ac0 = Math.floor(ax / T);
      if (solidAt(ac0, Math.floor((m.y - 8) / T)) || !solidAt(ac0, Math.floor((m.y + 2) / T))) m.dir *= -1;
      if (m.grounded) {
        m.hop -= dt;
        if (m.hop <= 0) {
          m.vy = -240;
          m.hop = 0.85;
        }
      }
      if (player.invuln <= 0 && Math.abs(player.x - m.x) < 26 && player.y > m.y - 30 && player.y - player.h < m.y) {
        player.vx = player.x < m.x ? -200 : 200;
        player.vy = -280;
        player.grounded = false;
        player.invuln = 0.7;
        sfx.bump();
      }
    }

    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (c.got) continue;
      if (Math.abs(player.x - c.x) < 26 && Math.abs(player.y - 30 - c.y) < 36) {
        c.got = true;
        gotCoins++;
        sfx.coin();
        puff(c.x, c.y, '#ffd166', 4);
      }
    }
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      if (s.got) continue;
      if (Math.abs(player.x - s.x) < 30 && Math.abs(player.y - 36 - s.y) < 40) {
        s.got = true;
        gotStars++;
        sfx.star();
        buzz(12);
        puff(s.x, s.y, '#fff3a0', 7);
      }
    }
    for (let i = 0; i < checks.length; i++) {
      const k = checks[i];
      if (Math.abs(player.x - k.x) < 28 && Math.abs(player.y - k.y) < 48) {
        checkpoint.x = k.x;
        checkpoint.y = k.y;
        if (!k.on) {
          k.on = true;
          sfx.check();
          toast('检查点  Checkpoint');
          buzz(12);
        }
      }
    }
    if (Math.abs(player.x - goal.x) < 28 && Math.abs(player.y - goal.y) < 64) reachGoal();

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p.on) continue;
      p.life -= dt;
      p.vy += 400 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) p.on = 0;
    }

    const vw = viewW / zoom;
    const vh = viewH / zoom;
    let tx = player.x + player.face * 60 - vw * 0.4;
    tx = Math.max(0, Math.min(tx, Math.max(0, cols * T - vw)));
    const worldH = rows * T;
    let ty = player.y - vh * (viewH > viewW ? 0.58 : 0.62);
    ty = Math.max(-16, Math.min(ty, Math.max(-16, worldH - vh + 8)));
    if (cam.snap) { cam.x = tx; cam.y = ty; cam.snap = false; }
    else {
      cam.x += (tx - cam.x) * 0.16;
      cam.y += (ty - cam.y) * 0.16;
    }

    if (player.y > rows * T + 80) respawn();
    updateWhoosh(Math.hypot(player.vx, player.vy), dt);
    if (gotCoins + gotStars >= 0) syncHUD();
  }

  function rr(x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }
  function limb(x, y, len, ang, w, color, tip) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = color;
    rr(-w / 2, 0, w, len, w / 2);
    ctx.fill();
    if (tip === 'boot') {
      ctx.fillStyle = '#1a1a1a';
      rr(-w / 2 - 2, len - 8, w + 6, 12, 5);
      ctx.fill();
    } else if (tip === 'glove') {
      ctx.fillStyle = '#1c1c1c';
      ctx.beginPath();
      ctx.arc(0, len, w * 0.62, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  function poseOf(anim, phase) {
    const s = Math.sin(phase);
    if (anim === 'run' || anim === 'idle') {
      const k = anim === 'idle' ? 0.25 : 1;
      return {
        legL: s * 0.7 * k, legR: -s * 0.7 * k,
        armL: -s * 0.6 * k, armR: s * 0.6 * k,
        body: s * 0.05 * k, bob: Math.abs(s) * 3 * k,
      };
    }
    if (anim === 'jump') return { legL: -0.8, legR: 0.55, armL: -1.15, armR: -0.7, body: -0.08, bob: 0 };
    if (anim === 'slide') return { legL: 0.35, legR: 0.15, armL: -2.4, armR: 0.4, body: 0.22, bob: 0 };
    if (anim === 'walljump') return { legL: -1.15, legR: -0.35, armL: -1.5, armR: -0.4, body: -0.35, bob: 0 };
    return { legL: 0.25, legR: -0.15, armL: 0.3, armR: -1.7, body: -0.12, bob: 0 };
  }
  function drawHero(phase, anim, face, alpha) {
    const pose = poseOf(anim, phase);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.scale(face, 1);
    ctx.translate(0, -pose.bob);
    ctx.rotate(pose.body);
    ctx.strokeStyle = '#161616';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const scarf = Math.sin(sim * 14 + phase);
    ctx.moveTo(-6, -66);
    ctx.quadraticCurveTo(-22, -58 + scarf * 3, -36, -46 + scarf * 7);
    ctx.moveTo(-4, -62);
    ctx.quadraticCurveTo(-16, -44 + scarf * 2, -28, -30 + scarf * 5);
    ctx.stroke();
    ctx.save();
    ctx.translate(-10, -78);
    ctx.rotate(-0.7);
    ctx.fillStyle = '#d5dde3';
    rr(-3, 0, 6, 26, 2);
    ctx.fill();
    ctx.fillStyle = '#6d4c41';
    rr(-8, 22, 16, 5, 2);
    ctx.fill();
    ctx.fillStyle = '#5d4037';
    rr(-2, 26, 4, 9, 2);
    ctx.fill();
    ctx.restore();
    limb(-8, -40, 24, pose.legL, 12, '#1d3557', 'boot');
    limb(6, -58, 22, pose.armL, 9, '#e23b3b', 'glove');
    ctx.fillStyle = '#e23b3b';
    rr(-16, -70, 32, 18, 8);
    ctx.fill();
    ctx.fillStyle = '#1d3557';
    rr(-18, -58, 36, 28, 10);
    ctx.fill();
    ctx.fillStyle = '#ffd60a';
    ctx.beginPath();
    ctx.arc(0, -48, 3.2, 0, Math.PI * 2);
    ctx.arc(0, -40, 3.2, 0, Math.PI * 2);
    ctx.fill();
    limb(8, -40, 24, pose.legR, 12, '#1d3557', 'boot');
    limb(10, -58, 22, pose.armR, 9, '#e23b3b', 'glove');
    ctx.fillStyle = '#f1c3a0';
    ctx.beginPath();
    ctx.ellipse(0, -86, 18, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffb4c8';
    ctx.beginPath();
    ctx.ellipse(-10, -82, 4, 2.4, 0, 0, Math.PI * 2);
    ctx.ellipse(10, -82, 4, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-6, -90, 5, 5.5, 0, 0, Math.PI * 2);
    ctx.ellipse(6, -90, 5, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1b1b1b';
    ctx.beginPath();
    ctx.arc(-5, -90, 2.3, 0, Math.PI * 2);
    ctx.arc(7, -90, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-4.2, -91, 0.8, 0, Math.PI * 2);
    ctx.arc(7.8, -91, 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    rr(-14, -78, 28, 14, 7);
    ctx.fill();
    ctx.fillStyle = '#6b3a22';
    ctx.beginPath();
    ctx.ellipse(-8, -80, 9, 5.2, -0.25, 0, Math.PI * 2);
    ctx.ellipse(8, -80, 9, 5.2, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e23b3b';
    ctx.beginPath();
    ctx.ellipse(0, -100, 18, 14, 0, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(10, -90, 16, 6, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(2, -104, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffd0d0';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
  function drawSilhouette(face) {
    ctx.save();
    ctx.scale(face, 1);
    ctx.fillStyle = '#1a3d8a';
    ctx.beginPath();
    ctx.ellipse(0, -86, 16, 14, 0, 0, Math.PI * 2);
    ctx.ellipse(0, -48, 16, 22, 0, 0, Math.PI * 2);
    ctx.ellipse(-8, -16, 7, 12, 0, 0, Math.PI * 2);
    ctx.ellipse(8, -16, 7, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function drawShuriken(s) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.spin);
    ctx.fillStyle = '#e8eef2';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const R = i % 2 ? 4 : 11;
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * R;
      const y = Math.sin(a) * R;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e23b3b';
    ctx.beginPath();
    ctx.arc(0, 0, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function drawStarShape(x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const R = i % 2 ? r * 0.45 : r;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const px = x + Math.cos(a) * R;
      const py = y + Math.sin(a) * R;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  function drawWorld() {
    const c0 = Math.max(0, Math.floor(cam.x / T) - 1);
    const c1 = Math.min(cols - 1, Math.floor((cam.x + viewW / zoom) / T) + 1);
    const r0 = Math.max(0, Math.floor(cam.y / T) - 1);
    const r1 = Math.min(rows - 1, Math.floor((cam.y + viewH / zoom) / T) + 2);
    ctx.fillStyle = brickPat;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!solid[r * cols + c]) continue;
        ctx.fillRect(c * T, r * T, T + 0.6, T + 0.6);
      }
    }
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!solid[r * cols + c]) continue;
        if (r > 0 && solid[(r - 1) * cols + c]) continue;
        ctx.fillStyle = '#7dce6a';
        ctx.fillRect(c * T, r * T, T + 0.6, 6);
        ctx.fillStyle = '#c44832';
        ctx.fillRect(c * T, r * T + 6, T + 0.6, 5);
      }
    }
    for (let i = 0; i < crates.length; i++) {
      const c = crates[i];
      if (c.dead) continue;
      ctx.fillStyle = '#e7b15a';
      rr(c.x - 18, c.y - 36, 36, 36, 6);
      ctx.fill();
      ctx.strokeStyle = '#a8742e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(c.x - 18, c.y - 18);
      ctx.lineTo(c.x + 18, c.y - 18);
      ctx.moveTo(c.x, c.y - 36);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
      ctx.fillStyle = '#6b3a22';
      ctx.beginPath();
      ctx.arc(c.x - 6, c.y - 22, 2, 0, Math.PI * 2);
      ctx.arc(c.x + 6, c.y - 22, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (c.got) continue;
      const w = 7 + Math.sin(sim * 6 + c.bob) * 4;
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, Math.max(2, w), 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff4c2';
      ctx.beginPath();
      ctx.ellipse(c.x - 2, c.y - 3, 2, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      if (s.got) continue;
      const y = s.y + Math.sin(sim * 3 + s.bob) * 4;
      ctx.fillStyle = '#ffe14a';
      drawStarShape(s.x, y, 12);
      ctx.fill();
    }
    for (let i = 0; i < checks.length; i++) {
      const k = checks[i];
      ctx.fillStyle = '#6d4c41';
      ctx.fillRect(k.x - 3, k.y - 46, 6, 46);
      ctx.fillStyle = k.on ? '#7cf0ff' : '#4cc9f0';
      rr(k.x - 10, k.y - 62, 20, 22, 8);
      ctx.fill();
    }
    ctx.fillStyle = '#6d4c41';
    ctx.fillRect(goal.x - 3, goal.y - 78, 6, 78);
    ctx.fillStyle = '#e23b3b';
    rr(goal.x - 12, goal.y - 96, 24, 26, 8);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(goal.x - 4, goal.y - 102, 8, 8);
    for (let i = 0; i < slimes.length; i++) {
      const m = slimes[i];
      if (m.dead) continue;
      const squash = m.grounded ? 1.08 : 0.92;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.scale(squash, 1 / squash);
      ctx.fillStyle = '#67d36a';
      ctx.beginPath();
      ctx.ellipse(0, -14, 18, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#b6f2a8';
      ctx.beginPath();
      ctx.ellipse(-4, -18, 6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-6, -16, 4, 0, Math.PI * 2);
      ctx.arc(6, -16, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1b1b1b';
      ctx.beginPath();
      ctx.arc(-5, -16, 1.8, 0, Math.PI * 2);
      ctx.arc(7, -16, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < shurikens.length; i++) if (shurikens[i].on) drawShuriken(shurikens[i]);
    for (let i = 0; i < trails.length; i++) {
      const tr = trails[i];
      if (!tr.on) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, tr.life / 0.28) * 0.45;
      ctx.translate(tr.x, tr.y);
      drawSilhouette(tr.face);
      ctx.restore();
    }
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p.on) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.fillStyle = '#00000022';
    ctx.beginPath();
    ctx.ellipse(0, -2, 16, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    let sx = 1;
    let sy = 1;
    if (player.squash > 0) {
      const u = player.squash / 0.1;
      sy = 1 - 0.18 * u;
      sx = 1 + 0.14 * u;
    } else if (player.vy < -40) {
      sy = 1.06; sx = 0.94;
    }
    ctx.scale(sx, sy);
    const blink = player.invuln > 0 && Math.sin(sim * 40) > 0;
    drawHero(player.phase, player.anim, player.face, blink ? 0.45 : 1);
    ctx.restore();
  }
  function drawSky() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath();
    ctx.arc(viewW * 0.82, viewH * 0.16, Math.min(viewW, viewH) * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    const drift = cam.x * 0.25;
    for (let i = 0; i < 6; i++) {
      const x = ((i * 220 - drift) % (viewW + 180) + viewW + 180) % (viewW + 180) - 80;
      const y = 36 + (i % 3) * 28;
      ctx.beginPath();
      ctx.ellipse(x, y, 36, 16, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 24, y + 4, 26, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#8eb6e0';
    const base = viewH * 0.62;
    for (let i = 0; i < 8; i++) {
      const span = viewW + 240;
      const x = ((i * 190 - cam.x * 0.4) % span + span) % span - 100;
      const bh = 46 + ((i * 37) % 36);
      ctx.fillRect(x, base - bh, 100, bh);
      ctx.fillStyle = '#ffe8a3';
      ctx.fillRect(x + 14, base - bh + 12, 10, 12);
      ctx.fillRect(x + 36, base - bh + 12, 10, 12);
      ctx.fillStyle = '#8eb6e0';
    }
  }
  function drawTitle() {
    drawSky();
    const land = viewW > viewH;
    const hx = land ? viewW * 0.72 : viewW * 0.5;
    const hy = viewH - 6;
    const sc = land ? Math.min(1.45, viewH / 210) : Math.min(2, viewW / 190);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#e15a3a';
    ctx.fillRect(0, hy - 18, viewW, viewH);
    ctx.fillStyle = '#7dce6a';
    ctx.fillRect(0, hy - 18, viewW, 8);
    ctx.save();
    ctx.translate(hx, hy - 18);
    ctx.scale(sc, sc);
    drawHero(sim * 10, 'run', 1, 1);
    ctx.restore();
  }
  function draw() {
    if (mode === 'title') {
      drawTitle();
      return;
    }
    drawSky();
    const ox = -Math.round(cam.x * zoom) * dpr;
    const oy = -Math.round(cam.y * zoom) * dpr;
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, ox, oy);
    drawWorld();
  }
  function resize() {
    viewW = window.innerWidth || 390;
    viewH = window.innerHeight || 844;
    const portrait = viewH > viewW;
    zoom = viewH / ((portrait ? 12.5 : 9.2) * T);
    zoom = Math.max(0.8, Math.min(zoom, portrait ? 2.1 : 1.7));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(viewW * dpr));
    canvas.height = Math.max(1, Math.round(viewH * dpr));
    sky = ctx.createLinearGradient(0, 0, 0, viewH);
    sky.addColorStop(0, '#6ec6ff');
    sky.addColorStop(1, '#e7f7ff');
    brickPat = ctx.createPattern(brick, 'repeat');
    cam.snap = true;
  }

  function step(n) {
    for (let i = 0; i < n; i++) {
      try { update(1 / 60); }
      catch (err) {
        if (errors.length < 5) {
          errors.push(String(err && err.stack || err));
          console.error(err);
        }
      }
    }
    draw();
  }
  let last = performance.now();
  let acc = 0;
  let paused = false;
  function frame(now) {
    requestAnimationFrame(frame);
    if (paused) { draw(); return; }
    let dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    let guard = 0;
    while (acc >= 1 / 60 && guard++ < 5) {
      try { update(1 / 60); }
      catch (err) {
        if (errors.length < 5) {
          errors.push(String(err && err.stack || err));
          console.error(err);
        }
        break;
      }
      acc -= 1 / 60;
    }
    draw();
  }

  function hold(el, name) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
      press(name, true);
    });
    const up = () => press(name, false);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
  hold(document.getElementById('btnL'), 'left');
  hold(document.getElementById('btnR'), 'right');
  hold(document.getElementById('btnJ'), 'jump');
  hold(document.getElementById('btnT'), 'throw');
  document.getElementById('play').addEventListener('click', () => { unlock(); start(0); });
  document.querySelectorAll('.picks button').forEach((b) => {
    b.addEventListener('click', () => { unlock(); start(Number(b.dataset.lv)); });
  });
  document.getElementById('retry').addEventListener('click', () => start(levelIndex));
  panelBtn.addEventListener('click', () => {
    if (mode === 'clear' && levelIndex < LEVELS.length - 1) start(levelIndex + 1);
    else start(0);
  });
  addEventListener('keydown', (e) => {
    const map = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', Space: 'jump', KeyW: 'jump', KeyJ: 'throw', KeyK: 'throw', KeyF: 'throw', KeyX: 'throw' };
    if (map[e.code]) {
      e.preventDefault();
      if (mode === 'title' && (e.code === 'Space' || e.code === 'Enter')) { unlock(); start(0); return; }
      press(map[e.code], true);
    } else if (e.code === 'Enter' && mode === 'title') { unlock(); start(0); }
  });
  addEventListener('keyup', (e) => {
    const map = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', Space: 'jump', KeyW: 'jump', KeyJ: 'throw', KeyK: 'throw', KeyF: 'throw', KeyX: 'throw' };
    if (map[e.code]) press(map[e.code], false);
  });
  addEventListener('resize', resize);
  resize();
  syncChrome();
  requestAnimationFrame(frame);

  window.__ninja = {
    ready: true,
    press,
    step,
    start,
    place(x, y) {
      player.x = x;
      player.y = y;
      player.vx = 0;
      player.vy = 0;
      const under = solidAt(Math.floor(x / T), Math.floor((y + 1) / T));
      player.grounded = under;
      player.onWall = 0;
      player.coyote = under ? 0.14 : 0;
      cam.snap = true;
    },
    pause(v) { paused = !!v; if (paused) draw(); },
    get markers() { return markers; },
    get state() {
      let alive = 0;
      let flying = 0;
      for (let i = 0; i < slimes.length; i++) if (!slimes[i].dead) alive++;
      for (let i = 0; i < shurikens.length; i++) if (shurikens[i].on) flying++;
      return {
        mode, level: levelIndex, x: player.x, y: player.y, vx: player.vx, vy: player.vy,
        grounded: player.grounded, onWall: player.onWall, anim: player.anim, face: player.face,
        coins: gotCoins, stars: gotStars, slimes: alive, shurikens: flying,
        checkpointX: checkpoint.x, whooshLevel, whooshBurst, errors,
      };
    },
  };
})();
