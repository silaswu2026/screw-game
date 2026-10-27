// Forest parkour. Green ninja (and a blue-scarf partner) drawn with canvas vectors.
// Plain metal headband plate, no leaf mark. Blue afterimages stay blue.
(function () {
  const T = 40;
  const GRAV = 1650;
  const JUMP_V = 680;
  const WALL_VX = 320;
  const WALL_VY = 660;
  const SLIDE = 130;
  const MAX_HP = 5;

  const canvas = document.getElementById('view');
  const ctx = canvas.getContext('2d');
  const hud = document.getElementById('hud');
  const menu = document.getElementById('menu');
  const panel = document.getElementById('panel');
  const touch = document.getElementById('touch');
  const coopTouch = document.getElementById('coopTouch');
  const hintEl = document.getElementById('hint');
  const toastEl = document.getElementById('toast');
  const lvlName = document.getElementById('lvlName');
  const lvlEn = document.getElementById('lvlEn');
  const coinN = document.getElementById('coinN');
  const starN = document.getElementById('starN');
  const panelTitle = document.getElementById('panelTitle');
  const panelSub = document.getElementById('panelSub');
  const panelBtn = document.getElementById('panelBtn');
  const hp1 = document.getElementById('hp1');
  const hp2 = document.getElementById('hp2');
  const bar2 = document.getElementById('bar2');
  const muteBtn = document.getElementById('mute');
  const mode1 = document.getElementById('mode1');
  const mode2 = document.getElementById('mode2');

  const errors = [];
  addEventListener('error', (e) => errors.push(String(e.message || e.error || e)));

  function blankInput() {
    return { left: false, right: false, jump: false, jumpPressed: false, throw: false, throwEdge: false };
  }
  const input = blankInput();
  const input2 = blankInput();
  let mode = 'title';
  let coop = false;
  let wantCoop = false;
  let levelIndex = 0;
  let cols = 1;
  let rows = 1;
  let solid = new Uint8Array(1);
  let coins = [];
  let stars = [];
  let slimes = [];
  let crates = [];
  let checks = [];
  let springs = [];
  let boss = null;
  let goal = { x: 0, y: 0 };
  let spawn = { x: 80, y: 200 };
  let checkpoint = { x: 80, y: 200 };
  let markers = { gaps: [], walls: [], coins: [], slimes: [], goal: null, spawn: null, spring: null, boss: null };
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
  const trails = Array.from({ length: 8 }, () => ({ on: 0, x: 0, y: 0, face: 1, life: 0 }));
  const parts = Array.from({ length: 72 }, () => ({ on: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, color: '#fff', s: 2 }));
  const shurikens = Array.from({ length: 8 }, () => ({ on: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, spin: 0 }));

  function makeNinja(palette) {
    return {
      x: 80, y: 200, vx: 0, vy: 0, w: 30, h: 58, face: 1,
      grounded: false, onWall: 0, coyote: 0, jumpBuf: 0, wallLock: 0,
      throwT: 0, wallJumpT: 0, cool: 0, squash: 0, invuln: 0, justSpawn: 0,
      anim: 'idle', phase: 0, palette: palette,
      hp: MAX_HP, down: false, downT: 0, springCd: 0, springLock: 0,
    };
  }
  const player = makeNinja('green');
  const p2 = makeNinja('blue');

  const PALETTE = {
    green: { scarf: '#1fa85a', sash: '#2fbe62', band: '#178a45', eye: '#7dff6a', plate: '#e6ebf0' },
    blue: { scarf: '#1f7de0', sash: '#3aa6ff', band: '#1868c4', eye: '#8fd4ff', plate: '#e6ebf0' },
  };

  const brick = document.createElement('canvas');
  brick.width = brick.height = 40;
  {
    const g = brick.getContext('2d');
    g.fillStyle = '#6b4a2e';
    g.fillRect(0, 0, 40, 40);
    g.fillStyle = '#5a3b22';
    g.fillRect(0, 0, 40, 8);
    g.strokeStyle = '#3e2a18';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 16); g.lineTo(40, 16);
    g.moveTo(0, 28); g.lineTo(40, 28);
    g.stroke();
    g.strokeStyle = '#8a6544';
    g.beginPath();
    g.moveTo(8, 8); g.lineTo(12, 16);
    g.moveTo(24, 16); g.lineTo(28, 28);
    g.moveTo(10, 28); g.lineTo(16, 40);
    g.stroke();
  }
  let brickPat = ctx.createPattern(brick, 'repeat');

  const audio = { ctx: null, noise: null, filter: null, gain: null, src: null };
  let musicOn = true;
  let musicTimer = 0;
  let musicBeatN = 0;
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
    startMusic();
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
    boing() { tone(160, 0.14, 'square', 0.05, 2.4); },
  };
  const PENTA = [220, 261.63, 293.66, 329.63, 392];
  function startMusic() {
    if (!musicOn || musicTimer || !audio.ctx) return;
    musicTimer = 1;
    setTimeout(musicBeat, 30);
  }
  function musicBeat() {
    if (!musicOn) { musicTimer = 0; return; }
    try {
      const accent = musicBeatN % 2 === 0;
      tickNoise(accent ? 0.06 : 0.04, accent ? 0.07 : 0.035, accent ? 140 : 220);
      if (musicBeatN % 8 === 0) tone(110, 0.22, 'sine', 0.025, 1);
      if (musicBeatN % 4 === 2) tone(PENTA[(musicBeatN >> 1) % PENTA.length], 0.12, 'triangle', 0.02, 1);
    } catch (err) { /* audio */ }
    musicBeatN++;
    const bpm = (mode === 'play' && boss && boss.alive) ? 156 : 132;
    musicTimer = setTimeout(musicBeat, (60 / bpm / 2) * 1000);
  }
  function toggleMute() {
    musicOn = !musicOn;
    muteBtn.textContent = musicOn ? '音' : '静';
    if (!musicOn) {
      if (musicTimer) clearTimeout(musicTimer);
      musicTimer = 0;
    } else startMusic();
  }
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
      name: '林间晨跑', en: 'Forest Jog',
      hint: '跳过空隙，手里剑打史莱姆  Jump the gaps',
      cols: 80, rows: 14, spawn: [3, 11], goal: [75, 11],
      checks: [[41, 11]],
      slimes: [[28, 11]], crates: [[22, 11]], walls: [], springs: [],
      boss: { c: 68, name: '史莱姆王', kind: 'slime', hp: 5 },
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
      name: '苔岩小径', en: 'Moss Wall',
      hint: '踩红弹簧，或贴墙再蹬  Spring or wall-jump',
      cols: 88, rows: 14, spawn: [3, 11], goal: [82, 11],
      checks: [[16, 11], [40, 11]],
      slimes: [[54, 11]], crates: [[62, 11]],
      walls: [{ l0: 30, l1: 31, r0: 35, r1: 36, top: 7 }],
      springs: [[29, 11]],
      boss: { c: 72, name: '野猪', kind: 'boar', hp: 6 },
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
      name: '萤火树冠', en: 'Firefly Canopy',
      hint: '收集星星，打败影子  Grab stars, beat the shadow',
      cols: 100, rows: 14, spawn: [2, 11], goal: [94, 11],
      checks: [[74, 11]],
      slimes: [[14, 11], [36, 11]], crates: [[32, 11]],
      walls: [{ l0: 44, l1: 45, r0: 49, r1: 50, top: 7 }],
      springs: [[43, 11]],
      boss: { c: 88, name: '影忍者', kind: 'shadow', hp: 7 },
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

  function resetNinja(n, x, y, face) {
    n.x = x; n.y = y; n.vx = 0; n.vy = 0; n.face = face || 1;
    n.grounded = true; n.onWall = 0; n.coyote = 0.12; n.jumpBuf = 0; n.wallLock = 0;
    n.throwT = 0; n.wallJumpT = 0; n.cool = 0; n.squash = 0; n.invuln = 0.4; n.justSpawn = 0.25;
    n.anim = 'idle'; n.hp = MAX_HP; n.down = false; n.downT = 0;
    n.springCd = 0; n.springLock = 0;
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
    springs = (def.springs || []).map(([c, r]) => Object.assign({ squish: 0 }, feet(c, r)));
    goal = feet(def.goal[0], def.goal[1]);
    spawn = feet(def.spawn[0], def.spawn[1]);
    checkpoint = { x: spawn.x, y: spawn.y };
    const bdef = def.boss;
    const home = feet(bdef.c, ground);
    boss = {
      x: home.x, y: home.y, homeX: home.x, homeY: home.y,
      hp: bdef.hp, max: bdef.hp, alive: true, cleared: false, deadT: 0,
      name: bdef.name, kind: bdef.kind, state: 'walk', t: 0,
      vx: 0, vy: 0, grounded: true, wave: 0, roller: null, arena: false, dir: -1,
    };
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
      spring: springs[0] ? { x: springs[0].x, y: springs[0].y } : null,
      boss: { x: boss.x, y: boss.y, hp: boss.hp },
    };
    gotCoins = 0;
    gotStars = 0;
    resetNinja(player, spawn.x, spawn.y, 1);
    resetNinja(p2, spawn.x - 36, spawn.y, 1);
    for (let k = 0; k < shurikens.length; k++) shurikens[k].on = 0;
    for (let k = 0; k < trails.length; k++) trails[k].on = 0;
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
    hp1.style.width = Math.max(0, player.hp) * 20 + '%';
    hp2.style.width = Math.max(0, p2.hp) * 20 + '%';
    bar2.classList.toggle('hidden', !coop);
  }
  function syncChrome() {
    menu.classList.toggle('hidden', mode !== 'title');
    hud.classList.toggle('hidden', mode === 'title');
    const playing = mode === 'play';
    touch.classList.toggle('hidden', !playing || coop);
    coopTouch.classList.toggle('hidden', !playing || !coop);
    panel.classList.toggle('hidden', mode !== 'clear' && mode !== 'win' && mode !== 'over');
  }
  function toast(s) {
    toastEl.textContent = s;
    toastEl.classList.add('on');
    toastUntil = sim + 1.5;
  }
  function clearInput(inp) {
    inp.left = inp.right = inp.jump = inp.throw = false;
    inp.jumpPressed = false;
    inp.throwEdge = false;
  }
  function start(i, coopFlag) {
    clearInput(input);
    clearInput(input2);
    coop = !!coopFlag;
    wantCoop = coop;
    mode1.classList.toggle('on', !coop);
    mode2.classList.toggle('on', coop);
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
  function gameOver() {
    if (mode !== 'play') return;
    mode = 'over';
    panelTitle.textContent = 'Game Over';
    panelSub.textContent = '再来一次';
    panelBtn.textContent = '再来一次';
    syncChrome();
  }
  function resetBoss() {
    if (!boss) return;
    boss.hp = boss.max;
    boss.alive = true;
    boss.cleared = false;
    boss.deadT = 0;
    boss.state = 'walk';
    boss.t = 0;
    boss.vx = 0;
    boss.vy = 0;
    boss.wave = 0;
    boss.roller = null;
    boss.x = boss.homeX;
    boss.y = boss.homeY;
    boss.grounded = true;
  }
  function continueRun() {
    resetBoss();
    resetNinja(player, checkpoint.x, checkpoint.y, 1);
    if (coop) resetNinja(p2, checkpoint.x - 40, checkpoint.y, 1);
    mode = 'play';
    cam.snap = true;
    syncChrome();
    syncHUD();
  }
  function downOrOver(n) {
    if (coop) {
      const other = n === player ? p2 : player;
      if (other.hp <= 0 || other.down) { gameOver(); return; }
      n.down = true;
      n.downT = 3;
      n.vx = 0;
      n.vy = 0;
      return;
    }
    gameOver();
  }
  function reviveAt(n, x, y) {
    n.x = x;
    n.y = y;
    n.vx = 0;
    n.vy = 0;
    n.grounded = true;
    n.onWall = 0;
    n.invuln = 0.9;
    n.justSpawn = 0.25;
    n.springLock = 0;
    cam.snap = true;
  }

  function solidAt(c, r) {
    if (r < 0) return false;
    if (c < 0 || c >= cols) return true;
    if (r >= rows) return false;
    return solid[r * cols + c] === 1;
  }
  function hbOf(n) {
    return { l: n.x - n.w / 2, r: n.x + n.w / 2, t: n.y - n.h, b: n.y };
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
  function resolveCratesX(n) {
    const hb = hbOf(n);
    for (let i = 0; i < crates.length; i++) {
      const c = crates[i];
      if (c.dead) continue;
      const box = crateAABB(c);
      if (!hit(hb, box)) continue;
      if (n.x >= c.x) n.x = box.r + n.w / 2;
      else n.x = box.l - n.w / 2;
      n.vx = 0;
    }
  }
  function resolveCratesY(n) {
    for (let i = 0; i < crates.length; i++) {
      const c = crates[i];
      if (c.dead) continue;
      const hb = hbOf(n);
      const box = crateAABB(c);
      if (!hit(hb, box)) continue;
      if (n.vy >= 0 && n.y - n.vy * 0.02 <= box.t + 8) {
        n.y = box.t;
        n.vy = 0;
        n.grounded = true;
        n.onWall = 0;
      } else if (n.vy < 0) {
        n.y = box.b + n.h;
        n.vy = 0;
      } else if (n.x >= c.x) n.x = box.r + n.w / 2;
      else n.x = box.l - n.w / 2;
    }
  }
  function moveX(n, dt) {
    n.x += n.vx * dt;
    const hb = hbOf(n);
    if (solidOverlap(hb)) {
      if (n.vx > 0) {
        const col = Math.floor((hb.r - 0.001) / T);
        n.x = col * T - n.w / 2;
        n.onWall = 1;
      } else if (n.vx < 0) {
        const col = Math.floor(hb.l / T);
        n.x = (col + 1) * T + n.w / 2;
        n.onWall = -1;
      }
      n.vx = 0;
    } else n.onWall = 0;
    resolveCratesX(n);
  }
  function moveY(n, dt) {
    n.grounded = false;
    n.y += n.vy * dt;
    const hb = hbOf(n);
    if (solidOverlap(hb)) {
      if (n.vy >= 0) {
        const row = Math.floor((hb.b - 0.001) / T);
        n.y = row * T;
        n.vy = 0;
        n.grounded = true;
        n.onWall = 0;
      } else {
        const row = Math.floor(hb.t / T);
        n.y = (row + 1) * T + n.h;
        n.vy = 40;
      }
    }
    resolveCratesY(n);
  }
  function capSpringVx(n) {
    if (n.springLock <= 0) return;
    if (n.vx > 60) n.vx = 60;
    if (n.vx < -60) n.vx = -60;
  }
  function trySpring(n, inp) {
    if (n.springCd > 0) return false;
    for (let i = 0; i < springs.length; i++) {
      const s = springs[i];
      if (Math.abs(n.x - s.x) < 24 && n.grounded && Math.abs(n.y - s.y) < 18) {
        const mul = 1.8 * (inp.jump ? 1.15 : 1);
        n.vy = -JUMP_V * mul;
        n.grounded = false;
        n.coyote = 0;
        n.springCd = 0.4;
        n.springLock = 0.3;
        n.squash = 0.12;
        n.jumpBuf = 0;
        s.squish = 0.16;
        whooshHit(1);
        sfx.boing();
        puff(n.x, n.y, '#ff5a6a', 6);
        return true;
      }
    }
    return false;
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
  function doThrow(n) {
    if (n.cool > 0 || n.down || mode !== 'play') return;
    n.cool = 0.28;
    n.throwT = 0.2;
    let s = null;
    for (let i = 0; i < shurikens.length; i++) if (!shurikens[i].on) { s = shurikens[i]; break; }
    if (!s) s = shurikens[0];
    s.on = 1;
    s.x = n.x + n.face * 22;
    s.y = n.y - 32;
    s.vx = n.face * 540;
    s.vy = 0;
    s.life = 0.85;
    s.spin = 0;
    sfx.throw();
    buzz(8);
  }
  function press(name, down) { setPress(input, name, down); }
  function press2(name, down) { setPress(input2, name, down); }
  function setPress(inp, name, down) {
    unlock();
    if (name === 'jump') {
      if (down && !inp.jump) inp.jumpPressed = true;
      inp.jump = down;
    } else if (name === 'throw') {
      if (down && !inp.throw) inp.throwEdge = true;
      inp.throw = down;
    } else if (name === 'left') inp.left = down;
    else if (name === 'right') inp.right = down;
  }
  function hurt(n, fromX) {
    if (!n || n.down || n.invuln > 0 || mode !== 'play') return;
    n.hp -= 1;
    n.invuln = 0.85;
    n.vx = n.x < fromX ? -220 : 220;
    n.vy = -280;
    n.grounded = false;
    sfx.bump();
    buzz(15);
    if (n.hp <= 0) {
      n.hp = 0;
      downOrOver(n);
    }
  }
  function dropTrail(n) {
    const speed = Math.hypot(n.vx, n.vy);
    if (speed <= 150) return;
    trailAcc += 0.016;
    if (trailAcc > 0.045) {
      trailAcc = 0;
      const tr = trails[trailI % trails.length];
      trailI++;
      tr.on = 1;
      tr.x = n.x;
      tr.y = n.y;
      tr.face = n.face;
      tr.life = 0.28;
    }
  }

  function controlNinja(n, inp, dt) {
    if (n.down) {
      n.downT -= dt;
      n.vx = 0;
      n.vy = 0;
      if (n.downT <= 0) {
        const other = n === player ? p2 : player;
        const ox = other.down ? checkpoint.x : other.x - (other.face || 1) * 36;
        const oy = other.down ? checkpoint.y : other.y;
        reviveAt(n, ox, oy);
        n.hp = MAX_HP;
        n.down = false;
        n.invuln = 1.1;
        sfx.respawn();
        toast('回来了  Back');
      }
      return;
    }
    n.coyote = Math.max(0, n.coyote - dt);
    n.jumpBuf = Math.max(0, n.jumpBuf - dt);
    n.wallLock = Math.max(0, n.wallLock - dt);
    n.throwT = Math.max(0, n.throwT - dt);
    n.wallJumpT = Math.max(0, n.wallJumpT - dt);
    n.cool = Math.max(0, n.cool - dt);
    n.squash = Math.max(0, n.squash - dt);
    n.invuln = Math.max(0, n.invuln - dt);
    n.justSpawn = Math.max(0, n.justSpawn - dt);
    n.springCd = Math.max(0, n.springCd - dt);
    n.springLock = Math.max(0, n.springLock - dt);

    let desired = n.vx;
    if (n.wallLock > 0) desired = n.vx;
    else if (n.onWall && !n.grounded) {
      if (n.onWall === 1 && !inp.left) desired = 90;
      else if (n.onWall === -1 && !inp.right) desired = -90;
      else if (inp.left) desired = -240;
      else if (inp.right) desired = 270;
    } else if (inp.left && !inp.right) desired = -240;
    else if (inp.right && !inp.left) desired = 270;
    else if (n.grounded) desired = 200;
    const accel = (n.grounded ? 2400 : 1400) * dt;
    const dv = desired - n.vx;
    n.vx += Math.max(-accel, Math.min(accel, dv));

    if (inp.jumpPressed) {
      n.jumpBuf = 0.14;
      inp.jumpPressed = false;
    }
    const launched = trySpring(n, inp);
    capSpringVx(n);
    const canGround = n.grounded || n.coyote > 0;
    const canWall = n.onWall !== 0 && !n.grounded;
    if (!launched && n.jumpBuf > 0 && (canWall || canGround)) {
      if (canWall) {
        n.vx = -n.onWall * WALL_VX;
        n.vy = -WALL_VY;
        n.face = -n.onWall;
        n.wallLock = 0.26;
        n.wallJumpT = 0.24;
        n.onWall = 0;
        n.grounded = false;
        n.coyote = 0;
        whooshHit(1);
        sfx.jump();
        puff(n.x, n.y, '#9ecbff', 5);
      } else {
        n.vy = -JUMP_V;
        n.grounded = false;
        n.coyote = 0;
        whooshHit(0.85);
        sfx.jump();
        puff(n.x, n.y, '#ffffff', 4);
      }
      n.jumpBuf = 0;
      buzz(10);
    }
    if (!inp.jump && n.vy < -240 && n.springLock <= 0) n.vy = -240;

    n.vy += GRAV * dt;
    if (n.vy > 980) n.vy = 980;
    if (n.onWall && !n.grounded && n.vy > SLIDE) n.vy = SLIDE;

    const wasGround = n.grounded;
    moveX(n, dt);
    moveY(n, dt);
    if (trySpring(n, inp)) capSpringVx(n);
    if (wasGround && !n.grounded) n.coyote = 0.12;
    if (!wasGround && n.grounded && n.justSpawn <= 0) {
      n.squash = 0.1;
      sfx.land();
    }

    if (n.onWall && !n.grounded) n.face = -n.onWall;
    else if (Math.abs(n.vx) > 12) n.face = n.vx > 0 ? 1 : -1;

    if (inp.throwEdge) {
      inp.throwEdge = false;
      doThrow(n);
    }

    if (n.throwT > 0) n.anim = 'throw';
    else if (n.wallJumpT > 0) n.anim = 'walljump';
    else if (n.onWall && !n.grounded) n.anim = 'slide';
    else if (!n.grounded) n.anim = 'jump';
    else if (Math.abs(n.vx) > 24) n.anim = 'run';
    else n.anim = 'idle';

    n.phase += Math.abs(n.vx) * dt * 0.05;
    dropTrail(n);

    if (n.y > rows * T + 80) {
      n.hp = Math.max(0, n.hp - 1);
      if (n.hp <= 0) {
        n.hp = 0;
        downOrOver(n);
        n.x = checkpoint.x;
        n.y = checkpoint.y;
        n.vy = 0;
      } else {
        reviveAt(n, checkpoint.x, checkpoint.y);
        toast('回到检查点  Back to checkpoint');
        sfx.respawn();
      }
    }
  }

  function nearestHero(x) {
    if (coop && !p2.down && (player.down || Math.abs(p2.x - x) < Math.abs(player.x - x))) return p2;
    return player;
  }
  function updateBoss(dt) {
    if (!boss) return;
    if (!boss.alive) {
      boss.deadT += dt;
      if (!boss.cleared && boss.deadT > 0.65) {
        boss.cleared = true;
        reachGoal();
      }
      return;
    }
    boss.t += dt;
    const target = nearestHero(boss.x);
    if (boss.state === 'walk') {
      boss.dir = target.x < boss.x ? -1 : 1;
      boss.vx = boss.dir * 70;
      if (boss.t > 1.55) { boss.state = 'crouch'; boss.t = 0; boss.vx = 0; }
    } else if (boss.state === 'crouch') {
      boss.vx *= 0.8;
      if (boss.t > 0.45) {
        boss.state = 'leap';
        boss.t = 0;
        const aim = Math.max(-180, Math.min(180, (target.x - boss.x) * 0.9));
        boss.vx = aim;
        boss.vy = -520;
        boss.grounded = false;
      }
    } else if (boss.state === 'shock') {
      boss.vx = 0;
      boss.wave += 220 * dt;
      if (boss.t > 0.55) {
        boss.state = 'roll';
        boss.t = 0;
        boss.wave = 0;
        const dir = target.x < boss.x ? -1 : 1;
        boss.roller = { x: boss.x, y: boss.y, vx: dir * 160, life: 1.25 };
      }
    } else if (boss.state === 'roll') {
      boss.vx = 0;
      if (boss.roller) {
        boss.roller.x += boss.roller.vx * dt;
        boss.roller.life -= dt;
        if (boss.roller.life <= 0 || solidAt(Math.floor(boss.roller.x / T), Math.floor((boss.roller.y - 8) / T))) boss.roller = null;
      }
      if (boss.t > 1.15) { boss.state = 'walk'; boss.t = 0; boss.roller = null; }
    }
    boss.vy += GRAV * dt;
    boss.x += boss.vx * dt;
    boss.y += boss.vy * dt;
    const under = Math.floor((boss.y + 1) / T);
    const col = Math.floor(boss.x / T);
    if (boss.vy >= 0 && solidAt(col, under)) {
      const landed = !boss.grounded;
      boss.y = under * T;
      boss.vy = 0;
      boss.grounded = true;
      if (landed && boss.state === 'leap') {
        boss.state = 'shock';
        boss.t = 0;
        boss.wave = 10;
        boss.vx = 0;
        sfx.bump();
      }
    } else if (boss.vy > 40) boss.grounded = false;
    if (boss.y > rows * T) {
      boss.x = boss.homeX;
      boss.y = boss.homeY;
      boss.vy = 0;
      boss.vx = 0;
      boss.grounded = true;
      boss.state = 'walk';
    }
    const touchOne = (n) => {
      if (!n || n.down || (n !== player && !coop)) return;
      if (Math.abs(n.x - boss.x) < 38 && n.y > boss.y - 56 && n.y - n.h < boss.y + 4) hurt(n, boss.x);
      if (boss.state === 'shock' && n.grounded && Math.abs(Math.abs(n.x - boss.x) - boss.wave) < 18 && Math.abs(n.y - boss.y) < 24) hurt(n, boss.x);
      if (boss.roller && n.grounded && Math.abs(n.x - boss.roller.x) < 22 && Math.abs(n.y - boss.roller.y) < 24) hurt(n, boss.roller.x);
    };
    touchOne(player);
    if (coop) touchOne(p2);
    if (!boss.arena) {
      const close = (n) => n && !n.down && n.x > boss.x - 320 && Math.abs(n.y - boss.y) < 90;
      if (close(player) || (coop && close(p2))) {
        boss.arena = true;
        checkpoint.x = boss.homeX - 180;
        checkpoint.y = boss.homeY;
        toast('首领战  Boss');
        sfx.check();
      }
    }
  }

  let whooshLevel = 0;
  let whooshBurst = 0;

  function update(dt) {
    sim += dt;
    if (toastUntil && sim > toastUntil) {
      toastEl.classList.remove('on');
      toastUntil = 0;
    }
    if (hintUntil && sim > hintUntil) hintEl.classList.add('hidden');
    for (let i = 0; i < springs.length; i++) springs[i].squish = Math.max(0, springs[i].squish - dt);
    if (mode !== 'play') {
      updateWhoosh(0, dt);
      player.phase += dt * 8;
      return;
    }
    controlNinja(player, input, dt);
    if (coop && mode === 'play') controlNinja(p2, input2, dt);

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
      s.spin += dt * 18;
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
      if (!die && boss && boss.alive && Math.abs(s.x - boss.x) < 42 && Math.abs(s.y - (boss.y - 30)) < 36) {
        boss.hp -= 1;
        die = true;
        puff(s.x, s.y, '#ffd166', 5);
        sfx.bump();
        if (boss.hp <= 0) {
          boss.hp = 0;
          boss.alive = false;
          boss.deadT = 0;
          puff(boss.x, boss.y - 24, '#ffe14a', 12);
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
      const poke = (n) => {
        if (!n || n.down || (n !== player && !coop)) return;
        if (n.invuln <= 0 && Math.abs(n.x - m.x) < 26 && n.y > m.y - 30 && n.y - n.h < m.y) hurt(n, m.x);
      };
      poke(player);
      if (coop) poke(p2);
    }

    const grab = (n, list, radX, radY, star) => {
      if (!n || n.down) return;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (c.got) continue;
        if (Math.abs(n.x - c.x) < radX && Math.abs(n.y - (star ? 36 : 30) - c.y) < radY) {
          c.got = true;
          if (star) { gotStars++; sfx.star(); buzz(12); puff(c.x, c.y, '#fff3a0', 7); }
          else { gotCoins++; sfx.coin(); puff(c.x, c.y, '#ffd166', 4); }
        }
      }
    };
    grab(player, coins, 26, 36, false);
    grab(player, stars, 30, 40, true);
    if (coop) {
      grab(p2, coins, 26, 36, false);
      grab(p2, stars, 30, 40, true);
    }
    const markCheck = (n) => {
      if (!n || n.down) return;
      for (let i = 0; i < checks.length; i++) {
        const k = checks[i];
        if (Math.abs(n.x - k.x) < 28 && Math.abs(n.y - k.y) < 48) {
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
    };
    markCheck(player);
    if (coop) markCheck(p2);

    if (mode === 'play') updateBoss(dt);

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
    let focus = player;
    if (coop) {
      const a = player.down ? null : player;
      const b = p2.down ? null : p2;
      if (a && b && Math.abs(a.x - b.x) > vw * 0.7) {
        const leader = a.x >= b.x ? a : b;
        const trailer = leader === a ? b : a;
        trailer.x = leader.x - (leader.face || 1) * 36;
        trailer.y = leader.y;
        trailer.vx = 0;
        trailer.vy = 0;
        trailer.grounded = true;
        trailer.onWall = 0;
      }
      if (a && b) {
        focus = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y), face: a.face };
      } else focus = a || b || player;
    }
    let tx = coop ? focus.x - vw * 0.45 : player.x + player.face * 60 - vw * 0.4;
    tx = Math.max(0, Math.min(tx, Math.max(0, cols * T - vw)));
    const worldH = rows * T;
    let ty = (coop ? focus.y : player.y) - vh * (viewH > viewW ? 0.58 : 0.62);
    ty = Math.max(-16, Math.min(ty, Math.max(-16, worldH - vh + 8)));
    if (cam.snap) { cam.x = tx; cam.y = ty; cam.snap = false; }
    else {
      cam.x += (tx - cam.x) * 0.16;
      cam.y += (ty - cam.y) * 0.16;
    }

    const sp = Math.max(Math.hypot(player.vx, player.vy), coop ? Math.hypot(p2.vx, p2.vy) : 0);
    updateWhoosh(sp, dt);
    syncHUD();
  }

  function rr(x, y, w, h, r) {
    const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
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
      ctx.fillStyle = '#111';
      rr(-w / 2 - 2, len - 8, w + 8, 11, 4);
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
    if (anim === 'run') {
      return {
        legL: s * 0.95, legR: -s * 0.95,
        armL: -s * 0.9, armR: s * 0.9,
        body: 0.16, bob: Math.abs(Math.sin(phase * 2)) * 2.4,
      };
    }
    if (anim === 'idle') {
      return { legL: s * 0.08, legR: -s * 0.06, armL: -0.15, armR: 0.2, body: 0.04, bob: Math.abs(s) * 0.8 };
    }
    if (anim === 'jump') return { legL: -0.7, legR: 0.45, armL: -1.2, armR: -0.85, body: -0.12, bob: 0 };
    if (anim === 'slide') return { legL: 0.4, legR: 0.15, armL: -2.2, armR: 0.35, body: 0.28, bob: 0 };
    if (anim === 'walljump') return { legL: -1.2, legR: -0.4, armL: -1.6, armR: -0.45, body: -0.4, bob: 0 };
    return { legL: 0.2, legR: -0.1, armL: 0.15, armR: -1.55, body: -0.08, bob: 0 };
  }
  function drawHero(phase, anim, face, alpha, palette, speed) {
    const pal = PALETTE[palette] || PALETTE.green;
    const pose = poseOf(anim, phase);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.scale(face, 1);
    ctx.translate(0, -pose.bob);
    ctx.rotate(pose.body);
    const flap = Math.sin(sim * 14 + phase);
    const tail = 24 + Math.min(30, (speed || 40) * 0.06);
    ctx.strokeStyle = pal.scarf;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2, -58);
    ctx.quadraticCurveTo(-18, -48 + flap * 2, -tail, -40 + flap * 8);
    ctx.moveTo(0, -54);
    ctx.quadraticCurveTo(-14, -34 + flap, -(tail - 8), -22 + flap * 6);
    ctx.stroke();
    ctx.strokeStyle = pal.sash;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(6, -36);
    ctx.quadraticCurveTo(16, -28 + flap, tail * 0.45, -18 + flap * 4);
    ctx.stroke();
    limb(-4, -56, 22, pose.armL, 7, '#141414', 'glove');
    limb(-5, -32, 26, pose.legL, 8, '#141414', 'boot');
    ctx.fillStyle = '#161616';
    rr(-12, -64, 24, 34, 8);
    ctx.fill();
    ctx.fillStyle = pal.sash;
    rr(-13, -40, 26, 7, 3);
    ctx.fill();
    limb(5, -32, 26, pose.legR, 8, '#141414', 'boot');
    limb(6, -56, 22, pose.armR, 7, '#141414', 'glove');
    if (anim === 'throw') {
      ctx.save();
      ctx.translate(14, -40);
      ctx.rotate(sim * 18);
      ctx.fillStyle = '#e8eef2';
      ctx.fillRect(-7, -1.4, 14, 2.8);
      ctx.fillRect(-1.4, -7, 2.8, 14);
      ctx.restore();
    }
    ctx.fillStyle = '#121212';
    ctx.beginPath();
    ctx.moveTo(-11, -80);
    ctx.lineTo(-16, -98);
    ctx.lineTo(-4, -84);
    ctx.lineTo(-1, -104);
    ctx.lineTo(3, -84);
    ctx.lineTo(8, -102);
    ctx.lineTo(12, -82);
    ctx.lineTo(16, -96);
    ctx.lineTo(12, -76);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#141414';
    ctx.beginPath();
    ctx.ellipse(0, -74, 12, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.band;
    rr(-13, -84, 26, 8, 3);
    ctx.fill();
    ctx.fillStyle = pal.plate;
    rr(-5, -86, 11, 9, 2);
    ctx.fill();
    ctx.fillStyle = '#ffffffcc';
    ctx.fillRect(-3, -84, 2, 5);
    ctx.fillStyle = '#0c0c0c';
    rr(-11, -76, 22, 11, 4);
    ctx.fill();
    ctx.fillStyle = pal.eye;
    ctx.beginPath();
    ctx.ellipse(-4.6, -71, 3.3, 3.5, 0, 0, Math.PI * 2);
    ctx.ellipse(4.6, -71, 3.3, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#102010';
    ctx.beginPath();
    ctx.ellipse(-4.2, -71, 1.5, 1.8, 0, 0, Math.PI * 2);
    ctx.ellipse(5, -71, 1.5, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function drawSilhouette(face) {
    ctx.save();
    ctx.scale(face, 1);
    ctx.fillStyle = '#1a3d8a';
    ctx.beginPath();
    ctx.ellipse(0, -74, 12, 13, 0, 0, Math.PI * 2);
    ctx.ellipse(0, -46, 12, 18, 0, 0, Math.PI * 2);
    ctx.ellipse(-6, -16, 6, 14, 0, 0, Math.PI * 2);
    ctx.ellipse(6, -16, 6, 14, 0, 0, Math.PI * 2);
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
    ctx.fillStyle = '#3ecf6e';
    ctx.beginPath();
    ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
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
  function drawSpring(s) {
    const squash = s.squish > 0 ? 0.55 : 1;
    const top = s.y - 26 * squash;
    ctx.strokeStyle = '#d5dde6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y - 2);
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const y = s.y - 2 - t * (s.y - 2 - top);
      const x = s.x + (i % 2 ? -8 : 8);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#e23b3b';
    rr(s.x - 14, top - 8, 28, 10, 4);
    ctx.fill();
  }
  function drawBoss(b) {
    if (!b) return;
    if (b.state === 'shock' && b.wave > 0) {
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = '#ffe14a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y - 2, Math.max(4, b.wave), 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (b.roller) {
      ctx.fillStyle = '#6b4428';
      ctx.beginPath();
      ctx.arc(b.roller.x, b.roller.y - 10, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(b.x, b.y);
    const crouch = b.state === 'crouch' ? 0.72 : 1;
    ctx.scale(b.alive ? 1 : 1.15, (b.alive ? 1 : 0.35) * crouch);
    if (b.kind === 'boar') {
      ctx.fillStyle = '#7a4b2e';
      ctx.beginPath();
      ctx.ellipse(0, -24, 34, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f3e2cf';
      ctx.beginPath();
      ctx.moveTo(-10, -18); ctx.lineTo(-22, -6); ctx.lineTo(-8, -12);
      ctx.moveTo(10, -18); ctx.lineTo(22, -6); ctx.lineTo(8, -12);
      ctx.fill();
      ctx.fillStyle = '#2a1a12';
      ctx.beginPath();
      ctx.arc(-8, -28, 3, 0, Math.PI * 2);
      ctx.arc(8, -28, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (b.kind === 'shadow') {
      ctx.fillStyle = '#241838';
      rr(-16, -62, 32, 40, 10);
      ctx.fill();
      ctx.strokeStyle = '#7a4cff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-6, -40);
      ctx.quadraticCurveTo(-20, -28, -32, -18);
      ctx.stroke();
      ctx.fillStyle = '#c9b6ff';
      ctx.beginPath();
      ctx.ellipse(-5, -48, 3, 3, 0, 0, Math.PI * 2);
      ctx.ellipse(5, -48, 3, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#2f9a45';
      ctx.beginPath();
      ctx.ellipse(0, -26, 34, 24, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#b6f2a8';
      ctx.beginPath();
      ctx.ellipse(-8, -34, 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(-14, -56, 8, 14);
      ctx.fillRect(-4, -64, 8, 22);
      ctx.fillRect(8, -56, 8, 14);
      ctx.fillStyle = '#17301c';
      ctx.beginPath();
      ctx.arc(-8, -30, 3, 0, Math.PI * 2);
      ctx.arc(8, -30, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (b.state === 'crouch') {
      ctx.fillStyle = '#fff';
      ctx.font = '700 20px sans-serif';
      ctx.fillText('!', b.x - 4, b.y - 78);
    }
    if (b.alive) {
      ctx.fillStyle = '#0008';
      ctx.fillRect(b.x - 26, b.y - 74, 52, 6);
      ctx.fillStyle = '#ff5a5a';
      ctx.fillRect(b.x - 26, b.y - 74, 52 * Math.max(0, b.hp / b.max), 6);
    }
  }
  function drawNinja(n) {
    if (!n || n.down) return;
    ctx.save();
    ctx.translate(n.x, n.y);
    ctx.fillStyle = '#00000022';
    ctx.beginPath();
    ctx.ellipse(0, -2, 14, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    let sx = 1;
    let sy = 1;
    if (n.squash > 0) {
      const u = Math.min(1, n.squash / 0.1);
      sy = 1 - 0.18 * u;
      sx = 1 + 0.14 * u;
    } else if (n.vy < -40) {
      sy = 1.08; sx = 0.92;
    }
    ctx.scale(sx, sy);
    const blink = n.invuln > 0 && Math.sin(sim * 40) > 0;
    drawHero(n.phase, n.anim, n.face, blink ? 0.45 : 1, n.palette, Math.abs(n.vx));
    ctx.restore();
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
        ctx.fillStyle = '#3f8f4a';
        ctx.fillRect(c * T, r * T, T + 0.6, 8);
        ctx.fillStyle = '#2f6a38';
        ctx.fillRect(c * T, r * T + 8, T + 0.6, 4);
        if ((c + r) % 6 === 0) {
          ctx.strokeStyle = '#237a3c';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(c * T + 12, r * T);
          ctx.quadraticCurveTo(c * T + 22, r * T + 16, c * T + 8, r * T + 30);
          ctx.stroke();
        }
      }
    }
    for (let i = 0; i < springs.length; i++) drawSpring(springs[i]);
    for (let i = 0; i < crates.length; i++) {
      const c = crates[i];
      if (c.dead) continue;
      ctx.fillStyle = '#c4894a';
      rr(c.x - 18, c.y - 36, 36, 36, 6);
      ctx.fill();
      ctx.strokeStyle = '#6b4a2e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(c.x - 18, c.y - 18);
      ctx.lineTo(c.x + 18, c.y - 18);
      ctx.moveTo(c.x, c.y - 36);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
    }
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (c.got) continue;
      const w = 7 + Math.sin(sim * 6 + c.bob) * 4;
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, Math.max(2, w), 10, 0, 0, Math.PI * 2);
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
      ctx.fillStyle = '#5a3b22';
      ctx.fillRect(k.x - 3, k.y - 46, 6, 46);
      ctx.fillStyle = k.on ? '#7cf0ff' : '#4cc9f0';
      rr(k.x - 10, k.y - 62, 20, 22, 8);
      ctx.fill();
    }
    ctx.fillStyle = '#5a3b22';
    ctx.fillRect(goal.x - 3, goal.y - 78, 6, 78);
    ctx.fillStyle = boss && boss.alive ? '#8d6a45' : '#e23b3b';
    rr(goal.x - 12, goal.y - 96, 24, 26, 8);
    ctx.fill();
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
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-6, -16, 3.5, 0, Math.PI * 2);
      ctx.arc(6, -16, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1b1b1b';
      ctx.beginPath();
      ctx.arc(-5, -16, 1.6, 0, Math.PI * 2);
      ctx.arc(7, -16, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (boss) drawBoss(boss);
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
    drawNinja(player);
    if (coop) drawNinja(p2);
  }
  function drawSky() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.fillStyle = '#ffe7a0';
    ctx.beginPath();
    ctx.arc(viewW * 0.8, viewH * 0.16, Math.min(viewW, viewH) * 0.055, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e7f6e4';
    const drift = cam.x * 0.2;
    for (let i = 0; i < 5; i++) {
      const x = ((i * 240 - drift) % (viewW + 200) + viewW + 200) % (viewW + 200) - 80;
      const y = 40 + (i % 3) * 24;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.ellipse(x, y, 40, 14, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 26, y + 4, 24, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const base = viewH * 0.7;
    for (let i = 0; i < 8; i++) {
      const span = viewW + 220;
      const x = ((i * 170 - cam.x * 0.35) % span + span) % span - 90;
      const bh = 78 + (i % 4) * 28;
      ctx.fillStyle = i % 2 ? '#1a4630' : '#24573a';
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.lineTo(x + 36, base - bh);
      ctx.lineTo(x + 72, base);
      ctx.fill();
      ctx.fillStyle = '#143826';
      ctx.fillRect(x + 32, base - 16, 8, 16);
    }
    ctx.fillStyle = '#d9ffe8';
    ctx.globalAlpha = 0.25;
    ctx.fillRect(0, viewH * 0.62, viewW, viewH * 0.16);
    ctx.globalAlpha = 1;
    for (let i = 0; i < 12; i++) {
      const x = ((i * 97 + sim * 14) % (viewW + 30)) - 10;
      const y = viewH * 0.38 + Math.sin(sim * 2 + i) * 24 + (i % 5) * 16;
      ctx.globalAlpha = 0.35 + Math.sin(sim * 5 + i) * 0.35;
      ctx.fillStyle = '#eaff9a';
      ctx.beginPath();
      ctx.arc(x, y, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function drawBossBar() {
    if (mode !== 'play' || !boss || !boss.alive) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = Math.min(210, viewW * 0.52);
    const x = (viewW - w) / 2;
    const y = 62;
    ctx.fillStyle = '#102016cc';
    rr(x - 10, y - 16, w + 20, 36, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 14px "WenQuanYi Micro Hei","Droid Sans Fallback",sans-serif';
    ctx.fillText(boss.name, x, y);
    ctx.fillStyle = '#3a1818';
    ctx.fillRect(x, y + 6, w, 8);
    ctx.fillStyle = '#ff5a5a';
    ctx.fillRect(x, y + 6, w * Math.max(0, boss.hp / boss.max), 8);
  }
  function drawTitle() {
    drawSky();
    const land = viewW > viewH;
    const hy = viewH - 6;
    const sc = land ? Math.min(1.35, viewH / 230) : Math.min(1.85, viewW / 210);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#3d2a1c';
    ctx.fillRect(0, hy - 18, viewW, viewH);
    ctx.fillStyle = '#3f8f4a';
    ctx.fillRect(0, hy - 18, viewW, 8);
    ctx.save();
    ctx.translate(land ? viewW * 0.72 : viewW * 0.5, hy - 18);
    ctx.scale(sc, sc);
    drawHero(sim * 10, 'run', 1, 1, 'green', 180);
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
    drawBossBar();
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
    sky.addColorStop(0, '#1d4e38');
    sky.addColorStop(0.55, '#67b37a');
    sky.addColorStop(1, '#dff6d4');
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

  function hold(el, name, fn) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
      fn(name, true);
    });
    const up = () => fn(name, false);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
  hold(document.getElementById('btnL'), 'left', press);
  hold(document.getElementById('btnR'), 'right', press);
  hold(document.getElementById('btnJ'), 'jump', press);
  hold(document.getElementById('btnT'), 'throw', press);
  hold(document.getElementById('p1L'), 'left', press);
  hold(document.getElementById('p1R'), 'right', press);
  hold(document.getElementById('p1J'), 'jump', press);
  hold(document.getElementById('p1T'), 'throw', press);
  hold(document.getElementById('p2L'), 'left', press2);
  hold(document.getElementById('p2R'), 'right', press2);
  hold(document.getElementById('p2J'), 'jump', press2);
  hold(document.getElementById('p2T'), 'throw', press2);
  mode1.addEventListener('click', () => {
    wantCoop = false;
    mode1.classList.add('on');
    mode2.classList.remove('on');
  });
  mode2.addEventListener('click', () => {
    wantCoop = true;
    mode2.classList.add('on');
    mode1.classList.remove('on');
  });
  document.getElementById('play').addEventListener('click', () => { unlock(); start(0, wantCoop); });
  document.querySelectorAll('.picks button').forEach((b) => {
    b.addEventListener('click', () => { unlock(); start(Number(b.dataset.lv), wantCoop); });
  });
  document.getElementById('retry').addEventListener('click', () => start(levelIndex, coop));
  muteBtn.addEventListener('click', () => { unlock(); toggleMute(); });
  panelBtn.addEventListener('click', () => {
    if (mode === 'over') { continueRun(); return; }
    if (mode === 'clear' && levelIndex < LEVELS.length - 1) start(levelIndex + 1, coop);
    else start(0, coop);
  });
  const P1K = {
    KeyA: 'left', KeyD: 'right', ArrowLeft: 'left', ArrowRight: 'right',
    KeyW: 'jump', ArrowUp: 'jump', Space: 'jump',
    KeyF: 'throw', KeyJ: 'throw', KeyK: 'throw',
  };
  addEventListener('keydown', (e) => {
    if (mode === 'title' && (e.code === 'Space' || e.code === 'Enter')) {
      e.preventDefault();
      unlock();
      start(0, false);
      return;
    }
    if (P1K[e.code]) {
      e.preventDefault();
      if (e.repeat) return;
      press(P1K[e.code], true);
    }
  });
  addEventListener('keyup', (e) => {
    if (P1K[e.code]) press(P1K[e.code], false);
  });
  addEventListener('resize', resize);
  resize();
  syncChrome();
  requestAnimationFrame(frame);

  window.__ninja = {
    ready: true,
    press,
    press2,
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
      player.springCd = 0;
      player.springLock = 0;
      player.down = false;
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
        coop, hp: player.hp, p2x: p2.x, p2y: p2.y, p2hp: p2.hp,
        bossHp: boss ? boss.hp : 0, bossAlive: !!(boss && boss.alive),
      };
    },
  };
})();
