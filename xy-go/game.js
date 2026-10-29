// 闯关平台 (8 levels, two-player A/B). Button-only L/R move — no auto-dash.
// Knockdown uses Cocos-style sprite frames (sprites/green sheet).
// Traps: spike / bomb / fire jet / lightning with color immunities.
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
  // —— 联网双人 (PeerJS) ——
  let netRole = null; // null | 'host' | 'guest'
  let netCode = '';
  let netPeer = null;
  let netConn = null;
  let netLinked = false;
  let netSnapAcc = 0;
  let netPickLv = 0;
  let netGuestPrev = { left: false, right: false, jump: false, throw: false };
  let netOutAcc = 0;
  const NET_PREFIX = 'xygo4';
  const NET_SLOTS = 2; // two slots per time bucket
  const NET_PROBE_MS = 5500; // ICE needs seconds; short timeout never opens
  const NET_FIND_MS = 120000;
  const NET_PEER_OPTS = {
    debug: 0,
    host: '0.peerjs.com',
    port: 443,
    path: '/',
    secure: true,
    key: 'peerjs',
    config: {
      // STUN only — dead public TURN was hanging candidate gather so DataConnection never opened
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
      ],
    },
  };
  let netMatchAbort = false;
  let netTransport = null; // 'peer' | 'bc'
  let netBcSession = '';
  // Same-browser / same-profile: BroadcastChannel is the reliable link (PeerJS ICE often fails same-machine)
  let netBC = null;
  try { netBC = new BroadcastChannel('xygo-coop-v5'); } catch (e) { netBC = null; }
  function netBCPost(msg) {
    try { if (netBC) netBC.postMessage(msg); } catch (e) {}
  }
  function netMakeSession() {
    return 's' + Math.floor(Date.now() % 1e9) + '-' + Math.floor(Math.random() * 1e6);
  }
  function netLinkViaBC(asHost, session, code) {
    if (netLinked) return;
    netTransport = 'bc';
    netBcSession = session || netMakeSession();
    netCode = code || netCode || netRoomId();
    netRole = asHost ? 'host' : 'guest';
    netLinked = true;
    netConn = null;
    if (asHost) {
      toast('玩家B来了！（同机直连）');
      netSetBanner('玩家B已加入·同机', 'ok');
      try { netSend({ t: 'hello', code: netCode, role: 'host' }); } catch (e) {}
      const alreadyPlaying = (mode === 'play' || mode === 'clear' || mode === 'win' || mode === 'over');
      if (alreadyPlaying) {
        try { netSend({ t: 'go', lv: levelIndex, cp: companion ? 1 : 0 }); } catch (e) {}
        try { netSend(netBuildSnap()); } catch (e) {}
        syncChrome();
      } else {
        netSetWait('配对成功！马上开始');
        setTimeout(() => { if (netRole === 'host' && netLinked) netHostStart(); }, 400);
      }
    } else {
      netSetWait('配对成功！等一下就开打');
      toast('已连上玩家A（同机直连）');
      netSetBanner('已连上·同机', 'ok');
    }
  }
  function netOnBCMessage(ev) {
    const m = ev && ev.data;
    if (!m || typeof m !== 'object') return;
    // Data plane for same-origin link
    if (m.t === 'bc-data' && netLinked && netTransport === 'bc') {
      if (m.session && netBcSession && m.session !== netBcSession) return;
      if (m.role === netRole) return; // ignore echo of own sends
      if (m.payload) netOnMsg(m.payload, netRole === 'host');
      return;
    }
    // Guest asks → host answers with session offer
    if (m.t === 'need' && netRole === 'host' && netCode && !netLinked) {
      netBCPost({ t: 'host', id: netCode, lv: netPickLv | 0 });
      netBCPost({ t: 'bc-offer', id: netCode, session: netBcSession || (netBcSession = netMakeSession()), lv: netPickLv | 0 });
      return;
    }
    // Guest sees host offer → accept via BC (skip PeerJS)
    if ((m.t === 'host' || m.t === 'bc-offer') && netRole === 'guest' && !netLinked && m.id) {
      const sess = m.session || netMakeSession();
      netBcSession = sess;
      netCode = String(m.id);
      netBCPost({ t: 'bc-hello', id: netCode, session: sess });
      // If offer already has session, host may accept immediately; also self-complete guest side after short wait if host acks
      return;
    }
    if (m.t === 'bc-hello' && netRole === 'host' && !netLinked && m.id && String(m.id) === String(netCode)) {
      netLinkViaBC(true, m.session || netMakeSession(), netCode);
      netBCPost({ t: 'bc-ok', id: netCode, session: netBcSession, lv: netPickLv | 0 });
      return;
    }
    if (m.t === 'bc-ok' && netRole === 'guest' && !netLinked) {
      netLinkViaBC(false, m.session || netBcSession || netMakeSession(), m.id || netCode);
      return;
    }
  }
  try { if (netBC) netBC.addEventListener('message', netOnBCMessage); } catch (e) {}

  let cols = 1;
  let rows = 1;
  let solid = new Uint8Array(1);
  let water = new Uint8Array(1); // puddles carved into terrain (not solid)
  let grassland = new Uint8Array(1); // 草原黑草尖刺陷阱
  let terraAcc = 0;
  let terraStep = 0;
  let terraToastCd = 0;
  let coins = [];
  let stars = [];
  let slimes = [];
  let crates = [];
  let checks = [];
  let springs = [];
  let spikes = [];
  let bombs = [];
  let fires = [];
  let bolts = [];
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
      shake: 0, flash: 0, glow: 0, bones: 0, spikeMsgCd: 0,
      burnT: 0, burnTick: 0, burnShake: 0, burnDir: 0, boltCd: 0,
      knockT: 0, knockPhase: null, knockAnimT: 0, locoT: 0,
    };
  }
  const player = makeNinja('green');
  const p2 = makeNinja('blue');
  const p3 = makeNinja('red'); // optional C companion (dumb local AI)
  let companion = false; // C on/off
  let wantCompanion = false;
  const input3 = blankInput();

  const PALETTE = {
    green: { scarf: '#1fa85a', sash: '#2fbe62', band: '#178a45', eye: '#7dff6a', plate: '#e6ebf0' },
    blue: { scarf: '#1f7de0', sash: '#3aa6ff', band: '#1868c4', eye: '#8fd4ff', plate: '#e6ebf0' },
    red: { scarf: '#e53935', sash: '#ff5252', band: '#c62828', eye: '#ff8a80', plate: '#e6ebf0' },
  };
  let pickColor = 'green';
  function applyPickColors() {
    // Humans: A green + B blue. C is always red companion when enabled.
    // 同机/联网双人: never swap — 玩家B must stay blue visually.
    player.palette = 'green';
    p2.palette = 'blue';
    p3.palette = 'red';
    if (!netRole && !wantCoop && !coop) {
      if (pickColor === 'blue') {
        player.palette = 'blue';
        p2.palette = 'green';
      } else if (pickColor === 'red' && !wantCompanion) {
        // single-player cosmetic red only when C companion off
        player.palette = 'red';
        p2.palette = 'blue';
      }
    }
  }

  const NINJA_IMG = { green: null, blue: null, red: null };
  (function loadNinjaArt() {
    ['green', 'blue', 'red'].forEach((c) => {
      const im = new Image();
      im.decoding = 'async';
      im.src = 'ninjas/ninja-' + c + '.jpg';
      im.onload = () => { NINJA_IMG[c] = im; };
      NINJA_IMG[c] = im;
    });
  })();

  // Level scenes from 原画-style plates (parallax BG), not flat gradient placeholders
  const SCENE_KEYS = ['forest-day', 'moss-dusk', 'canopy-night'];
  const SCENE_CACHE = { imgs: Object.create(null), dirt: null, grass: null, ready: false };
  (function loadScenes() {
    SCENE_KEYS.forEach((key) => {
      const im = new Image();
      im.decoding = 'async';
      im.src = 'scenes/' + key + '.jpg';
      SCENE_CACHE.imgs[key] = im;
    });
    const dirt = new Image();
    dirt.decoding = 'async';
    dirt.src = 'scenes/dirt-tile.png';
    SCENE_CACHE.dirt = dirt;
    const grass = new Image();
    grass.decoding = 'async';
    grass.src = 'scenes/grass-cap.png';
    SCENE_CACHE.grass = grass;
    dirt.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 40;
        const g = c.getContext('2d');
        g.drawImage(dirt, 0, 0, 40, 40);
        brickPat = ctx.createPattern(c, 'repeat') || brickPat;
      } catch (e) {}
    };
  })();
  function sceneKeyForLevel(i) {
    if (i <= 0) return 'forest-day';
    if (i === 1) return 'moss-dusk';
    if (i === 2) return 'canopy-night';
    return SCENE_KEYS[i % SCENE_KEYS.length];
  }

    // Cocos2d-html5 style: SpriteFrameCache + Animation (sheet + JSON atlas)
  const SPRITE_FPS = 10;
  const SPRITE_DELAY = 1 / SPRITE_FPS;
  const KNOCK_SEQ = ['knock_0', 'knock_1', 'crawl_0', 'crawl_1', 'crawl_0', 'getup'];
  const WALK_SEQ = ['walk_0', 'walk_1', 'walk_2', 'walk_3'];
  const ALL_FRAME_NAMES = [
    'idle', 'knock_0', 'knock_1', 'crawl_0', 'crawl_1', 'getup', 'hurt_skeleton',
    'walk_0', 'walk_1', 'walk_2', 'walk_3', 'jump_0',
  ];
  const FRAME_CACHE = {
    sheet: null,
    atlas: null,
    frames: Object.create(null), // name -> {img|sheetRect}
    ready: false,
  };
  (function loadSpriteFrames() {
    const base = 'sprites/green/';
    const sheet = new Image();
    sheet.decoding = 'async';
    sheet.src = base + 'green-knock-sheet.png';
    FRAME_CACHE.sheet = sheet;
    fetch(base + 'green-knock-atlas.json')
      .then((r) => r.json())
      .then((atlas) => {
        FRAME_CACHE.atlas = atlas;
        const names = Object.keys(atlas.frames || {});
        names.forEach((name) => {
          const rect = atlas.frames[name];
          FRAME_CACHE.frames[name] = { sheet: true, x: rect.x, y: rect.y, w: rect.w, h: rect.h };
        });
        // also preload discrete PNGs as fallback
        names.forEach((name) => {
          const im = new Image();
          im.decoding = 'async';
          im.src = base + name + '.png';
          FRAME_CACHE.frames[name + '_png'] = { img: im };
        });
        FRAME_CACHE.ready = true;
      })
      .catch(() => {
        ALL_FRAME_NAMES.forEach((name) => {
          const im = new Image();
          im.decoding = 'async';
          im.src = base + name + '.png';
          FRAME_CACHE.frames[name] = { img: im };
          FRAME_CACHE.frames[name + '_png'] = { img: im };
        });
        FRAME_CACHE.ready = true;
      });
  })();

  function getFrameEntry(name) {
    const e = FRAME_CACHE.frames[name];
    if (e && e.sheet && FRAME_CACHE.sheet && FRAME_CACHE.sheet.complete && FRAME_CACHE.sheet.naturalWidth) return e;
    const p = FRAME_CACHE.frames[name + '_png'];
    if (p && p.img && p.img.complete && p.img.naturalWidth) return p;
    if (e && e.img && e.img.complete && e.img.naturalWidth) return e;
    return null;
  }

  // Green sheet is authored; blue/red get a source-atop tint so they don't look green.
  const SPRITE_TINT = {
    blue: 'rgba(20, 90, 255, 0.72)',
    red: 'rgba(230, 35, 35, 0.68)',
  };
  let _tintCanvas = null;
  function drawSpriteFrame(name, face, alpha, drawH, palette) {
    const entry = getFrameEntry(name);
    if (!entry) return false;
    const h = drawH || 78;
    const tint = (palette && palette !== 'green') ? SPRITE_TINT[palette] : null;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.scale(face, 1);
    let w;
    if (entry.sheet) {
      const sh = FRAME_CACHE.sheet;
      w = h * (entry.w / entry.h);
      if (tint) {
        if (!_tintCanvas) _tintCanvas = document.createElement('canvas');
        const iw = Math.max(1, Math.ceil(w));
        const ih = Math.max(1, Math.ceil(h));
        if (_tintCanvas.width !== iw || _tintCanvas.height !== ih) {
          _tintCanvas.width = iw;
          _tintCanvas.height = ih;
        }
        const o = _tintCanvas.getContext('2d');
        o.clearRect(0, 0, iw, ih);
        o.globalCompositeOperation = 'source-over';
        o.drawImage(sh, entry.x, entry.y, entry.w, entry.h, 0, 0, iw, ih);
        o.globalCompositeOperation = 'source-atop';
        o.fillStyle = tint;
        o.fillRect(0, 0, iw, ih);
        o.globalCompositeOperation = 'source-over';
        ctx.drawImage(_tintCanvas, -w / 2, -h + 2, w, h);
      } else {
        ctx.drawImage(sh, entry.x, entry.y, entry.w, entry.h, -w / 2, -h + 2, w, h);
      }
    } else {
      const im = entry.img;
      w = h * (im.naturalWidth / im.naturalHeight);
      if (tint) {
        if (!_tintCanvas) _tintCanvas = document.createElement('canvas');
        const iw = Math.max(1, Math.ceil(w));
        const ih = Math.max(1, Math.ceil(h));
        if (_tintCanvas.width !== iw || _tintCanvas.height !== ih) {
          _tintCanvas.width = iw;
          _tintCanvas.height = ih;
        }
        const o = _tintCanvas.getContext('2d');
        o.clearRect(0, 0, iw, ih);
        o.globalCompositeOperation = 'source-over';
        o.drawImage(im, 0, 0, iw, ih);
        o.globalCompositeOperation = 'source-atop';
        o.fillStyle = tint;
        o.fillRect(0, 0, iw, ih);
        o.globalCompositeOperation = 'source-over';
        ctx.drawImage(_tintCanvas, -w / 2, -h + 2, w, h);
      } else {
        ctx.drawImage(im, -w / 2, -h + 2, w, h);
      }
    }
    ctx.restore();
    return true;
  }

  function knockFrameName(n) {
    // Map knock phases to sequenced frames (~10 fps flipbook)
    const phase = n.knockPhase;
    if (phase === 'air') return 'knock_0';
    if (phase === 'prone') return 'knock_1';
    if (phase === 'crawl') {
      const i = Math.floor((n.knockAnimT || 0) / SPRITE_DELAY);
      return (i % 2 === 0) ? 'crawl_0' : 'crawl_1';
    }
    if (phase === 'rise') return 'getup';
    // time-index through full KNOCK_SEQ if knockAnimT set
    if (n.knockAnimT != null && n.knockPhase) {
      const i = Math.min(KNOCK_SEQ.length - 1, Math.floor(n.knockAnimT / SPRITE_DELAY));
      return KNOCK_SEQ[i];
    }
    return 'idle';
  }

  function locoFrameName(n) {
    // Jump/slide frames only — walk uses drawHero (no old walk_* images).
    const anim = n.anim || 'idle';
    if (anim === 'jump' || anim === 'walljump' || anim === 'slide') return 'jump_0';
    return 'idle';
  }

  function drawHeroSprite(face, alpha, palette, bob) {
    const im = NINJA_IMG[palette] || NINJA_IMG.green;
    if (!im || !im.complete || !im.naturalWidth) return false;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.scale(face, 1);
    const h = 78;
    const w = h * (im.naturalWidth / im.naturalHeight);
    // portraits are full-body; draw feet at origin
    ctx.translate(0, -bob);
    ctx.drawImage(im, -w / 2, -h + 2, w, h);
    ctx.restore();
    return true;
  }
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

  // Per-level terrain: L1–L7 alternate swamp / mountain; L8 fuses all
  const LEVEL_TERRAIN = [
    'swamp',    // 1 林间
    'mountain', // 2 苔岩
    'swamp',    // 3 萤火
    'mountain', // 4 尖刺
    'swamp',    // 5 火焰
    'mountain', // 6 雷鸣
    'swamp',    // 7 炸弹
    'all',      // 8 终极：岛+水+金字塔+沼泽全融合
  ];
  let levelTerrain = 'swamp';
  const LEVELS = [
    {
      name: '林间晨跑', en: 'Forest Jog',
      hint: '第1关·沼泽：小心黑草草原陷阱（踩了掉尖刺·清空血）',
      cols: 70, rows: 14, spawn: [2, 11], goal: [66, 11],
      checks: [[34, 11]],
      slimes: [[22, 11]], crates: [[16, 11]],
      walls: [{ l0: 28, l1: 29, r0: 33, r1: 34, top: 8 }],
      springs: [],
      spikes: [[10, 11]],
      bombs: [[8, 11]],
      fires: [],
      bolts: [],
      boss: { c: 58, name: '史莱姆王', kind: 'slime', hp: 4 },
      coins: [[4, 9], [6, 9], [12, 9], [18, 9], [24, 9], [30, 7], [38, 9], [44, 9], [52, 9], [62, 9]],
      stars: [[30, 6]],
      build(box) {
        box(0, 14, 11, 13);
        box(17, 40, 11, 13);
        box(43, 69, 11, 13);
        box(28, 29, 8, 10);
        box(33, 34, 8, 10);
        box(33, 38, 8, 8);
      },
    },
    {
      name: '苔岩小径', en: 'Moss Path',
      hint: '第2关·山坡：金字塔地形；着火左右快晃灭火',
      cols: 82, rows: 14, spawn: [2, 11], goal: [78, 11],
      checks: [[20, 11], [48, 11]],
      slimes: [[26, 11], [54, 11]], crates: [[18, 11]],
      walls: [{ l0: 36, l1: 37, r0: 41, r1: 42, top: 7 }],
      springs: [[35, 11]],
      spikes: [[12, 13]],
      bombs: [[44, 11]],
      fires: [[30, 11]],
      bolts: [],
      boss: { c: 70, name: '野猪', kind: 'boar', hp: 5 },
      coins: [[5, 9], [10, 9], [16, 9], [24, 9], [32, 9], [39, 7], [46, 9], [56, 9], [64, 9], [74, 9]],
      stars: [[39, 5]],
      build(box) {
        box(0, 22, 11, 13);
        box(25, 58, 11, 13);
        box(61, 81, 11, 13);
        box(36, 37, 7, 10);
        box(41, 42, 7, 10);
        box(41, 50, 7, 7);
      },
    },
    {
      name: '萤火树冠', en: 'Firefly Canopy',
      hint: '第3关·沼泽：闪电初见；蓝免疫闪电',
      cols: 92, rows: 14, spawn: [2, 11], goal: [88, 11],
      checks: [[30, 11], [60, 11]],
      slimes: [[18, 11], [40, 11], [66, 11]], crates: [[24, 11]],
      walls: [{ l0: 48, l1: 49, r0: 53, r1: 54, top: 7 }],
      springs: [[47, 11]],
      spikes: [[14, 15]],
      bombs: [[56, 11]],
      fires: [[34, 11]],
      bolts: [[22, 23], [72, 73]],
      boss: { c: 80, name: '影忍者', kind: 'shadow', hp: 6 },
      coins: [[5, 9], [12, 9], [20, 9], [28, 9], [36, 9], [44, 9], [51, 7], [58, 9], [68, 9], [76, 9], [84, 9]],
      stars: [[51, 5], [64, 8]],
      build(box) {
        box(0, 26, 11, 13);
        box(29, 64, 11, 13);
        box(67, 91, 11, 13);
        box(48, 49, 7, 10);
        box(53, 54, 7, 10);
        box(53, 60, 7, 7);
        box(20, 22, 9, 10);
      },
    },
    {
      name: '尖刺走廊', en: 'Spike Hall',
      hint: '第4关·山坡：尖刺增多；绿免疫尖刺',
      cols: 96, rows: 14, spawn: [2, 11], goal: [92, 11],
      checks: [[28, 11], [56, 11]],
      slimes: [[20, 11], [44, 11], [70, 11]], crates: [[16, 11], [60, 11]],
      walls: [{ l0: 32, l1: 33, r0: 37, r1: 38, top: 7 }],
      springs: [[31, 11], [64, 11]],
      spikes: [[8, 10], [24, 26], [48, 50], [76, 78]],
      bombs: [[40, 11]],
      fires: [[52, 11]],
      bolts: [[66, 67]],
      boss: { c: 84, name: '刺甲虫', kind: 'slime', hp: 6 },
      coins: [[5, 9], [14, 9], [22, 9], [30, 9], [35, 7], [42, 9], [54, 9], [62, 9], [72, 9], [80, 9], [88, 9]],
      stars: [[35, 5]],
      build(box) {
        box(0, 18, 11, 13);
        box(21, 46, 11, 13);
        box(49, 74, 11, 13);
        box(77, 95, 11, 13);
        box(32, 33, 7, 10);
        box(37, 38, 7, 10);
        box(37, 44, 7, 7);
      },
    },
    {
      name: '火焰栈道', en: 'Flame Bridge',
      hint: '第5关·沼泽：喷火密集；着火快左右晃',
      cols: 100, rows: 14, spawn: [2, 11], goal: [96, 11],
      checks: [[26, 11], [54, 11], [78, 11]],
      slimes: [[18, 11], [38, 11], [58, 11], [82, 11]], crates: [[22, 11], [62, 11]],
      walls: [{ l0: 44, l1: 45, r0: 49, r1: 50, top: 7 }],
      springs: [[43, 11]],
      spikes: [[12, 13], [70, 71]],
      bombs: [[32, 11], [86, 11]],
      fires: [[10, 11], [28, 11], [40, 11], [56, 11], [74, 11]],
      bolts: [[64, 65]],
      boss: { c: 90, name: '炎猪', kind: 'boar', hp: 7 },
      coins: [[5, 9], [16, 9], [24, 9], [36, 9], [47, 7], [52, 9], [60, 9], [68, 9], [80, 9], [88, 9], [94, 9]],
      stars: [[47, 5], [76, 8]],
      build(box) {
        box(0, 20, 11, 13);
        box(23, 52, 11, 13);
        box(55, 80, 11, 13);
        box(83, 99, 11, 13);
        box(44, 45, 7, 10);
        box(49, 50, 7, 10);
        box(49, 58, 7, 7);
      },
    },
    {
      name: '雷鸣谷口', en: 'Thunder Gate',
      hint: '第6关·山坡：闪电增多；蓝免疫',
      cols: 104, rows: 14, spawn: [2, 11], goal: [100, 11],
      checks: [[28, 11], [56, 11], [80, 11]],
      slimes: [[16, 11], [36, 11], [52, 11], [72, 11], [88, 11]], crates: [[24, 11], [64, 11]],
      walls: [{ l0: 40, l1: 41, r0: 45, r1: 46, top: 7 }],
      springs: [[39, 11], [76, 11]],
      spikes: [[10, 11], [60, 61]],
      bombs: [[48, 11]],
      fires: [[32, 11], [84, 11]],
      bolts: [[8, 9], [20, 22], [34, 35], [54, 56], [68, 69], [90, 91]],
      boss: { c: 94, name: '雷影', kind: 'shadow', hp: 8 },
      coins: [[5, 9], [14, 9], [26, 9], [38, 9], [43, 7], [50, 9], [58, 9], [66, 9], [78, 9], [86, 9], [96, 9]],
      stars: [[43, 5], [70, 8]],
      build(box) {
        box(0, 24, 11, 13);
        box(27, 58, 11, 13);
        box(61, 86, 11, 13);
        box(89, 103, 11, 13);
        box(40, 41, 7, 10);
        box(45, 46, 7, 10);
        box(45, 52, 7, 7);
      },
    },
    {
      name: '炸弹矿坑', en: 'Bomb Pit',
      hint: '第7关·沼泽：炸弹连环；全员会被炸倒',
      cols: 110, rows: 14, spawn: [2, 11], goal: [106, 11],
      checks: [[30, 11], [58, 11], [84, 11]],
      slimes: [[18, 11], [34, 11], [50, 11], [70, 11], [90, 11]], crates: [[14, 11], [46, 11], [78, 11]],
      walls: [{ l0: 62, l1: 63, r0: 67, r1: 68, top: 7 }],
      springs: [[61, 11]],
      spikes: [[22, 23], [74, 75]],
      bombs: [[10, 11], [26, 11], [42, 11], [54, 11], [80, 11], [96, 11]],
      fires: [[38, 11], [86, 11]],
      bolts: [[16, 17], [48, 49]],
      boss: { c: 100, name: '矿霸', kind: 'boar', hp: 9 },
      coins: [[5, 9], [12, 9], [20, 9], [28, 9], [36, 9], [44, 9], [52, 9], [65, 7], [72, 9], [82, 9], [92, 9], [102, 9]],
      stars: [[65, 5], [88, 8]],
      build(box) {
        box(0, 22, 11, 13);
        box(25, 56, 11, 13);
        box(59, 88, 11, 13);
        box(91, 109, 11, 13);
        box(62, 63, 7, 10);
        box(67, 68, 7, 10);
        box(67, 76, 7, 7);
      },
    },
    {
      name: '终极融合', en: 'All Terrains',
      hint: '第8关·终极融合：岛中水+金字塔+沼泽+全陷阱',
      cols: 120, rows: 14, spawn: [2, 11], goal: [116, 11],
      checks: [[26, 11], [52, 11], [78, 11], [100, 11]],
      slimes: [[14, 11], [30, 11], [46, 11], [62, 11], [82, 11], [98, 11]], crates: [[20, 11], [56, 11], [88, 11]],
      walls: [
        { l0: 36, l1: 37, r0: 41, r1: 42, top: 7 },
        { l0: 90, l1: 91, r0: 95, r1: 96, top: 7 },
      ],
      springs: [[35, 11], [89, 11]],
      spikes: [[8, 10], [40, 42], [70, 72], [104, 106]],
      bombs: [[24, 11], [50, 11], [76, 11], [108, 11]],
      fires: [[18, 11], [44, 11], [66, 11], [86, 11], [112, 11]],
      bolts: [[12, 13], [32, 34], [58, 59], [80, 81], [102, 103]],
      boss: { c: 110, name: '终焉影', kind: 'shadow', hp: 10 },
      coins: [[5, 9], [16, 9], [22, 9], [28, 9], [38, 7], [48, 9], [54, 9], [64, 9], [74, 9], [84, 9], [93, 7], [106, 9], [114, 9]],
      stars: [[38, 5], [68, 8], [93, 5]],
      build(box) {
        box(0, 22, 11, 13);
        box(25, 48, 11, 13);
        box(51, 74, 11, 13);
        box(77, 100, 11, 13);
        box(103, 119, 11, 13);
        box(36, 37, 7, 10);
        box(41, 42, 7, 10);
        box(41, 48, 7, 7);
        box(90, 91, 7, 10);
        box(95, 96, 7, 10);
        box(95, 104, 7, 7);
      },
    },
  ];


  function setSolidCell(c, r, on) {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    solid[r * cols + c] = on ? 1 : 0;
  }
  function setWaterCell(c, r, on) {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    water[r * cols + c] = on ? 1 : 0;
    if (on) solid[r * cols + c] = 0; // water is a hole/puddle
  }
  /** Carve a small water puddle in the middle of a solid ground stretch. */
  function carveWaterPool(cMid, groundRow, halfW) {
    halfW = halfW || 1;
    const c0 = Math.max(2, cMid - halfW);
    const c1 = Math.min(cols - 3, cMid + halfW);
    // keep a solid floor under the puddle (row+1) so it is a pool, not a pit
    for (let c = c0; c <= c1; c++) {
      if (!solid[groundRow * cols + c] && !water[groundRow * cols + c]) continue;
      setWaterCell(c, groundRow, true);
      // ensure under-floor still solid for standing splash feel
      if (groundRow + 1 < rows) setSolidCell(c, groundRow + 1, true);
      if (groundRow + 2 < rows) setSolidCell(c, groundRow + 2, true);
    }
    return { c0, c1, r: groundRow };
  }
  /** Island terrain: land rim + water in the middle (safe for ninjas, hurts monsters). */
  function spawnWaterIsland(cMid, topRow) {
    const half = 3; // wider island so middle water is obvious
    const c0 = Math.max(2, cMid - half);
    const c1 = Math.min(cols - 3, cMid + half);
    const r = Math.max(5, Math.min(rows - 5, topRow));
    for (let c = c0; c <= c1; c++) {
      setSolidCell(c, r, true);
      setSolidCell(c, r + 1, true);
      if (r + 2 < rows) setSolidCell(c, r + 2, true);
    }
    // water only in the middle section (leave solid shores)
    const mid0 = c0 + 2;
    const mid1 = c1 - 2;
    for (let c = mid0; c <= mid1; c++) {
      setWaterCell(c, r, true);
      if (r + 1 < rows) setSolidCell(c, r + 1, true); // pool floor
    }
    return { c0, c1, r };
  }
  /** Pyramid / mountain slope (金字塔): stepped triangle you can climb. */
  function spawnPyramid(cMid, baseRow, height) {
    height = Math.max(3, Math.min(height || 4, 6));
    const baseRowClamped = Math.max(height + 1, Math.min(rows - 2, baseRow || 11));
    const baseHalf = height;
    const c0 = Math.max(1, cMid - baseHalf);
    const c1 = Math.min(cols - 2, cMid + baseHalf);
    for (let h = 0; h < height; h++) {
      const row = baseRowClamped - h;
      if (row < 1) break;
      const inset = h;
      const left = c0 + inset;
      const right = c1 - inset;
      for (let c = left; c <= right; c++) setSolidCell(c, row, true);
    }
    return { c0, c1, r: baseRowClamped - height + 1, h: height };
  }
  /** Swamp: many ground puddles + muddy water bands (hurts monsters). */
  function spawnSwampBand(cMid, groundRow, halfW) {
    halfW = Math.max(2, halfW || 3);
    const c0 = Math.max(2, cMid - halfW);
    const c1 = Math.min(cols - 3, cMid + halfW);
    for (let c = c0; c <= c1; c++) {
      setWaterCell(c, groundRow, true);
      if (groundRow + 1 < rows) setSolidCell(c, groundRow + 1, true);
      if (groundRow + 2 < rows) setSolidCell(c, groundRow + 2, true);
    }
    // muddy stepping stones on the shores
    setSolidCell(c0, groundRow, true);
    setSolidCell(c1, groundRow, true);
    water[groundRow * cols + c0] = 0;
    water[groundRow * cols + c1] = 0;
    return { c0, c1, r: groundRow };
  }
  function seedSwampTerrain() {
    const ground = 11;
    let c = 4;
    let n = 0;
    while (c < cols - 4 && n < 8) {
      if (!solid[ground * cols + c]) { c++; continue; }
      const start = c;
      while (c < cols && solid[ground * cols + c]) c++;
      const end = c - 1;
      const width = end - start + 1;
      if (width >= 6) {
        const mid = Math.floor((start + end) / 2);
        spawnSwampBand(mid, ground, width >= 12 ? 3 : 2);
        n++;
      }
    }
    // swamp floating islet with water mid
    const floatC = Math.min(cols - 8, Math.max(10, Math.floor(cols * 0.4)));
    spawnWaterIsland(floatC, 8);
  }
  function seedMountainTerrain() {
    const ground = 11;
    const p1 = Math.min(cols - 10, Math.max(12, Math.floor(cols * 0.28)));
    const p2 = Math.min(cols - 10, Math.max(20, Math.floor(cols * 0.52)));
    const p3 = Math.min(cols - 10, Math.max(28, Math.floor(cols * 0.75)));
    spawnPyramid(p1, ground, 3);
    spawnPyramid(p2, ground, 5);
    spawnPyramid(p3, ground, 4);
    // small ridge platforms between peaks
    for (let c = p1 + 4; c < p1 + 7 && c < cols - 2; c++) {
      setSolidCell(c, 9, true);
      setSolidCell(c, 10, true);
    }
  }
  function seedAllTerrains() {
    seedSwampTerrain();
    seedMountainTerrain();
    // extra water-islands + one more pyramid for the finale
    const i1 = Math.min(cols - 8, Math.max(8, Math.floor(cols * 0.22)));
    const i2 = Math.min(cols - 8, Math.max(14, Math.floor(cols * 0.62)));
    spawnWaterIsland(i1, 7);
    spawnWaterIsland(i2, 8);
    const pExtra = Math.min(cols - 12, Math.max(24, Math.floor(cols * 0.88)));
    spawnPyramid(pExtra, 11, 6);
  }
  function seedLevelTerrain() {
    levelTerrain = LEVEL_TERRAIN[levelIndex] || 'swamp';
    if (levelTerrain === 'mountain') seedMountainTerrain();
    else if (levelTerrain === 'all') seedAllTerrains();
    else seedSwampTerrain();
  }
  function nearAnyNinja(cx, cy, rad) {
    const rs = rad * rad;
    const check = (n) => {
      if (!n || n.down) return false;
      const dx = n.x - cx, dy = n.y - cy;
      return dx * dx + dy * dy < rs;
    };
    return check(player) || check(p2) || check(p3);
  }
  function applyTerraEvent(ev, announce) {
    if (!ev) return;
    if (ev.kind === 'pool') carveWaterPool(ev.c, ev.r | 11, ev.w || 1);
    else if (ev.kind === 'island') spawnWaterIsland(ev.c, ev.r | 8);
    else if (ev.kind === 'pyramid') spawnPyramid(ev.c, ev.r | 11, ev.h || 4);
    else if (ev.kind === 'swamp') spawnSwampBand(ev.c, ev.r | 11, ev.w || 3);
    else if (ev.kind === 'sink') {
      for (let c = ev.c0; c <= ev.c1; c++) setWaterCell(c, ev.r, true);
      if (ev.r + 1 < rows) {
        for (let c = ev.c0; c <= ev.c1; c++) setSolidCell(c, ev.r + 1, true);
      }
    }
    if (announce && terraToastCd <= 0) {
      const tip = ev.kind === 'pyramid' ? '金字塔山坡出现了！'
        : ev.kind === 'island' ? '水中岛出现·中间有水（伤怪不伤人）！'
        : ev.kind === 'swamp' ? '沼泽水域蔓延了！'
        : '地形变了·中间出现水域！';
      toast(tip);
      terraToastCd = 4;
    }
  }
  function pickTerraEvent() {
    const ground = 11;
    const focusX = player && !player.down ? player.x : (cols * T * 0.4);
    const aheadC = Math.floor(focusX / T) + 8 + (terraStep % 5) * 3;
    const theme = levelTerrain || LEVEL_TERRAIN[levelIndex] || 'swamp';
    // Theme kits: swamp → swamp/island/pool/sink; mountain → pyramid (+ rare island);
    // all → rotate every type
    const kits = {
      swamp: ['swamp', 'island', 'pool', 'sink'],
      mountain: ['pyramid', 'pyramid', 'island', 'pyramid'],
      all: ['island', 'pyramid', 'swamp', 'pool'],
    };
    const kit = kits[theme] || kits.swamp;
    const want = kit[terraStep % kit.length];
    if (want === 'island') {
      const c = Math.max(6, Math.min(cols - 7, aheadC));
      const r = 7 + (terraStep % 3);
      if (!nearAnyNinja((c + 0.5) * T, r * T, 110)) return { kind: 'island', c, r };
    }
    if (want === 'pyramid') {
      const c = Math.max(8, Math.min(cols - 9, aheadC + 2));
      if (!nearAnyNinja((c + 0.5) * T, ground * T, 140)) {
        return { kind: 'pyramid', c, r: ground, h: 3 + (terraStep % 3) };
      }
    }
    if (want === 'swamp') {
      const c = Math.max(5, Math.min(cols - 6, aheadC));
      if (!nearAnyNinja((c + 0.5) * T, ground * T, 100)) {
        return { kind: 'swamp', c, r: ground, w: 2 + (terraStep % 2) };
      }
    }
    if (want === 'pool') {
      let c = Math.max(4, Math.min(cols - 5, aheadC));
      for (let k = 0; k < 12; k++) {
        const cc = Math.max(3, Math.min(cols - 4, c + ((k % 2) ? k : -k)));
        if (solid[ground * cols + cc] || water[ground * cols + cc]) {
          if (nearAnyNinja((cc + 0.5) * T, ground * T, 90)) continue;
          return { kind: 'pool', c: cc, r: ground, w: 1 + (terraStep % 2) };
        }
      }
    }
    let c0 = Math.max(3, Math.min(cols - 8, aheadC));
    for (let k = 0; k < 10; k++) {
      const cc = Math.max(3, Math.min(cols - 6, c0 + k));
      if (solid[ground * cols + cc]) {
        const a = cc;
        const b = Math.min(cols - 3, cc + 2);
        if (nearAnyNinja(((a + b) / 2 + 0.5) * T, ground * T, 90)) continue;
        return { kind: 'sink', c0: a, c1: b, r: ground };
      }
    }
    if (theme === 'mountain') {
      const c = Math.max(8, Math.min(cols - 9, aheadC));
      if (!nearAnyNinja((c + 0.5) * T, ground * T, 120)) return { kind: 'pyramid', c, r: ground, h: 4 };
    }
    const fc = Math.max(6, Math.min(cols - 7, aheadC));
    if (!nearAnyNinja((fc + 0.5) * T, 8 * T, 100)) return { kind: 'island', c: fc, r: 8 };
    return null;
  }
  function tickDynamicTerrain(dt) {
    if (mode !== 'play') return;
    terraToastCd = Math.max(0, terraToastCd - dt);
    terraAcc += dt;
    // terrain can change anytime — fire every ~6.5s
    if (terraAcc < 6.5) return;
    terraAcc = 0;
    terraStep += 1;
    const ev = pickTerraEvent();
    if (!ev) return;
    applyTerraEvent(ev, true);
    if (netRole === 'host' && netLinked) {
      try { netSend({ t: 'terra', ev: ev, step: terraStep }); } catch (e) {}
    }
  }
  function inWaterAt(x, y) {
    const c = Math.floor(x / T);
    const r = Math.floor(y / T);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return false;
    return water[r * cols + c] === 1;
  }
  function touchWater(n) {
    // Water never harms ninjas (no HP loss) — only a soft splash feel
    if (!n || n.down) return;
    if (inWaterAt(n.x, n.y - 4) || inWaterAt(n.x, n.y + 2)) {
      n.vx *= 0.9;
      if (n.grounded) n.vy = Math.min(n.vy, 60);
    }
  }
  /** Water harms monsters (slimes); not ninjas. */
  function hurtMonstersInWater(dt) {
    for (let i = 0; i < slimes.length; i++) {
      const m = slimes[i];
      if (m.dead) continue;
      m.waterHurtCd = Math.max(0, (m.waterHurtCd || 0) - dt);
      if (!(inWaterAt(m.x, m.y - 4) || inWaterAt(m.x, m.y + 2))) continue;
      if (m.waterHurtCd > 0) continue;
      m.waterHurtCd = 0.45;
      m.hp = Math.max(0, (m.hp || 1) - 1);
      puff(m.x, m.y - 10, '#7ec8ff', 5);
      sfx.slime();
      if (m.hp <= 0) {
        m.dead = true;
        gotCoins++;
        puff(m.x, m.y - 12, '#ffe14a', 8);
      } else {
        m.vy = -160;
        m.dir *= -1;
      }
    }
  }


  function setGrasslandCell(c, r, on) {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    grassland[r * cols + c] = on ? 1 : 0;
    if (on) {
      setSolidCell(c, r, true);
      if (r + 1 < rows) setSolidCell(c, r + 1, true);
    }
  }
  /** 草原黑草陷阱：普通地块+深黑草；踩上掉进尖刺，清空全部血量（全员受伤，无免疫）. */
  function seedGrasslandTraps() {
    const ground = 11;
    const marks = [];
    let c = 8;
    while (c < cols - 6) {
      if (!solid[ground * cols + c] || water[ground * cols + c]) { c++; continue; }
      const start = c;
      while (c < cols && solid[ground * cols + c] && !water[ground * cols + c]) c++;
      const end = c - 1;
      const width = end - start + 1;
      if (width < 5) continue;
      const mid = start + 3 + ((start * 3) % Math.max(1, width - 5));
      if (mid > start + 1 && mid < end - 1) marks.push(mid);
      if (width >= 12) {
        const mid2 = Math.min(end - 2, mid + 5);
        if (mid2 !== mid) marks.push(mid2);
      }
    }
    const denser = levelTerrain === 'all' || levelIndex === 0 || levelIndex === 2 || levelIndex === 4;
    for (let i = 0; i < marks.length; i++) {
      if (!denser && (i % 2 === 1)) continue;
      const cc = marks[i];
      setGrasslandCell(cc, ground, true);
      spikes.push({
        c0: cc, c1: cc, x0: cc * T, x1: (cc + 1) * T, y: ground * T, lethal: true, hidden: true,
      });
    }
  }
  function killAllHpGrassTrap(n) {
    if (!n || n.down || mode !== 'play') return;
    n.hp = 0;
    n.invuln = 0;
    n.shake = 0.55;
    n.flash = 0.35;
    n.bones = 0.7;
    n.grounded = false;
    n.vy = 220;
    n.vx *= 0.3;
    sfx.bump();
    buzz(30);
    puff(n.x, n.y - 8, '#1a1a1a', 10);
    puff(n.x, n.y + 4, '#c5d0dc', 8);
    toast('草原黑草陷阱！掉进尖刺·血量清空');
    downOrOver(n);
  }
  function touchGrasslandTraps(n) {
    if (!n || n.down || mode !== 'play') return;
    if (!n.grounded && n.vy < 50) return;
    const col = Math.floor(n.x / T);
    const under = Math.floor((n.y + 1) / T);
    if (col < 0 || under < 0 || col >= cols || under >= rows) return;
    if (!grassland[under * cols + col]) return;
    grassland[under * cols + col] = 0;
    setSolidCell(col, under, false);
    let found = false;
    for (let i = 0; i < spikes.length; i++) {
      const s = spikes[i];
      if (s.c0 <= col && s.c1 >= col && Math.abs(s.y - under * T) < T) {
        s.lethal = true;
        s.hidden = false;
        found = true;
      }
    }
    if (!found) {
      spikes.push({
        c0: col, c1: col, x0: col * T, x1: (col + 1) * T, y: under * T, lethal: true, hidden: false,
      });
    }
    n.grounded = false;
    n.y = under * T + 2;
    n.vy = 260;
    killAllHpGrassTrap(n);
  }

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
    n.shake = 0; n.flash = 0; n.glow = 0; n.bones = 0; n.spikeMsgCd = 0;
    n.burnT = 0; n.burnTick = 0; n.burnShake = 0; n.burnDir = 0; n.boltCd = 0;
    n.knockT = 0; n.knockPhase = null; n.knockAnimT = 0; n.locoT = 0;
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
    water = new Uint8Array(cols * rows);
    grassland = new Uint8Array(cols * rows);
    terraAcc = 0;
    terraStep = 0;
    terraToastCd = 0;
    seedLevelTerrain();
    seedGrasslandTraps();
    const ground = 11;
    coins = def.coins.map(([c, r]) => Object.assign({ got: false, bob: c }, cell(c, r)));
    stars = def.stars.map(([c, r]) => Object.assign({ got: false, bob: r }, cell(c, r)));
    slimes = def.slimes.map(([c, r]) => {
      const p = feet(c, r);
      return { x: p.x, y: p.y, w: 34, h: 26, vx: 0, vy: 0, dir: 1, hop: 0.5, dead: false, grounded: true, hp: 2, max: 2, hurtCd: 0 };
    });
    crates = def.crates.map(([c, r]) => {
      const p = feet(c, r);
      return { x: p.x, y: p.y, w: 36, h: 36, dead: false };
    });
    checks = def.checks.map(([c, r]) => Object.assign({ on: false }, feet(c, r)));
    springs = (def.springs || []).map(([c, r]) => Object.assign({ squish: 0 }, feet(c, r)));
    spikes = (def.spikes || []).map((s) => {
      const c0 = s[0], c1 = s[1], row = s.length > 2 ? s[2] : ground;
      return { c0, c1, x0: c0 * T, x1: (c1 + 1) * T, y: row * T, lethal: false };
    });
    bombs = (def.bombs || []).map(([c, r]) => {
      const p = feet(c, r);
      return { x: p.x, y: p.y, armed: true, boomT: 0, cd: 0, fuse: 0 };
    });
    fires = (def.fires || []).map(([c, r]) => {
      const p = feet(c, r);
      return { x: p.x, y: p.y, phase: (c % 7) * 0.37, on: false, jet: 0 };
    });
    bolts = (def.bolts || []).map((s) => {
      const c0 = s[0], c1 = s.length > 1 ? s[1] : s[0];
      return {
        c0, c1, x0: c0 * T, x1: (c1 + 1) * T,
        y: 11 * T, phase: (c0 % 5) * 0.8, strike: 0, warn: 0,
      };
    });
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
    resetNinja(p3, spawn.x - 72, spawn.y, 1);
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
    const hp3el = document.getElementById('hp3');
    const bar3 = document.getElementById('bar3');
    if (hp3el) hp3el.style.width = Math.max(0, p3.hp) * 20 + '%';
    bar2.classList.toggle('hidden', !coop && !netRole);
    if (bar3) bar3.classList.toggle('hidden', !companion);
    const b1 = document.querySelector('#bars .bar span');
    const b2 = document.querySelector('#bar2 span');
    const b3 = bar3 ? bar3.querySelector('span') : null;
    if (b1) b1.textContent = netRole === 'guest' ? 'A绿' : (player.palette === 'red' ? '红' : player.palette === 'blue' ? '蓝' : 'A绿');
    if (b2) b2.textContent = netRole ? 'B蓝' : (coop ? 'B蓝' : '蓝');
    if (b3) b3.textContent = 'C红';
  }
  function syncChrome() {
    menu.classList.toggle('hidden', mode !== 'title');
    hud.classList.toggle('hidden', mode === 'title');
    const playing = mode === 'play';
    const online = !!netRole;
    // 联网：每人一台机，用普通单手触摸，不拆屏
    touch.classList.toggle('hidden', !playing || (coop && !online));
    coopTouch.classList.toggle('hidden', !playing || !coop || online);
    panel.classList.toggle('hidden', mode !== 'clear' && mode !== 'win' && mode !== 'over');
    if (online && (mode === 'clear' || mode === 'win' || mode === 'over') && netRole === 'guest') {
      panelBtn.textContent = '等房主…';
    }
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
    netGuestPrev = { left: false, right: false, jump: false, throw: false };
    coop = !!coopFlag;
    wantCoop = coop;
    companion = !!wantCompanion;
    mode1.classList.toggle('on', !coop);
    mode2.classList.toggle('on', coop);
    applyPickColors();
    mode = 'play';
    loadLevel(i);
    syncChrome();
    if (netRole === 'host' && netConn && netLinked) {
      netSend({ t: 'go', lv: levelIndex, cp: companion ? 1 : 0 });
      netSnapAcc = 0;
    }
  }
  function reachGoal() {
    const total = '🪙 ' + gotCoins + '   ⭐ ' + gotStars;
    if (levelIndex >= LEVELS.length - 1) {
      mode = 'win';
      panelTitle.textContent = '你做到了!';
      panelSub.textContent = 'You did it!  ' + total;
      panelBtn.textContent = netRole === 'guest' ? '等房主…' : '再玩一次 Play again';
    } else {
      mode = 'clear';
      panelTitle.textContent = '过关了!';
      panelSub.textContent = 'Level clear!  ' + total;
      panelBtn.textContent = netRole === 'guest' ? '等房主…' : '下一关 Next';
    }
    sfx.win();
    buzz(20);
    syncChrome();
    if (netRole === 'host') netSend({ t: 'mode', m: mode, lv: levelIndex, coins: gotCoins, stars: gotStars });
  }
  function gameOver() {
    if (mode !== 'play') return;
    mode = 'over';
    panelTitle.textContent = 'Game Over';
    panelSub.textContent = '再来一次';
    panelBtn.textContent = netRole === 'guest' ? '等房主…' : '再来一次';
    syncChrome();
    if (netRole === 'host') netSend({ t: 'mode', m: mode, lv: levelIndex, coins: gotCoins, stars: gotStars });
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
    if (companion) {
      resetNinja(p3, checkpoint.x - 72, checkpoint.y, 1);
      aiBuddy.mode = 'wander';
      aiBuddy.modeT = 2.5 + Math.random() * 2;
      aiBuddy.dir = Math.random() < 0.5 ? -1 : 1;
      aiBuddy.dirT = 0.8 + Math.random();
      aiBuddy.jumpCd = 0.4;
    }
    mode = 'play';
    cam.snap = true;
    syncChrome();
    if (netRole === 'host') netSend({ t: 'cmd', a: 'cont', lv: levelIndex });
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
  function hurtSpike(n) {
    // Green immune; blue/red: shake + color glow + flash + skeleton + HP
    if (!n || n.down || mode !== 'play') return;
    if (n.palette === 'green') {
      if ((n.spikeMsgCd || 0) <= 0) { toast('绿忍者免疫尖刺'); n.spikeMsgCd = 1.2; }
      return;
    }
    if (n.invuln > 0 || n.knockPhase) return;
    n.hp -= 1;
    n.invuln = 0.7;
    n.shake = 0.35;
    n.flash = 0.22;
    n.glow = 0.45;
    n.bones = 0.55;
    n.vy = -180;
    n.grounded = false;
    sfx.bump();
    buzz(18);
    toast((n.palette === 'blue' ? '蓝' : '红') + '忍者踩尖刺 -1');
    puff(n.x, n.y - 10, n.palette === 'blue' ? '#8fd4ff' : '#ff8a80', 8);
    if (n.hp <= 0) { n.hp = 0; downOrOver(n); }
  }
  function touchSpikes(n) {
    if (!n || n.down || !spikes.length) return;
    for (let i = 0; i < spikes.length; i++) {
      const s = spikes[i];
      if (s.hidden) continue;
      if (n.x >= s.x0 - 4 && n.x <= s.x1 + 4 && n.y > s.y - 6 && n.y < s.y + 18) {
        if (s.lethal) { killAllHpGrassTrap(n); return; }
        hurtSpike(n);
        return;
      }
    }
  }
  const BURN_WINDOW = 5.0; // 5s window: shake L/R to extinguish early, else -1 HP
  const BURN_SHAKES_NEED = 5; // quick direction flips to extinguish
  function tickBurn(n, dt, inp) {
    if (!n || n.down) return;
    if ((n.burnT || 0) <= 0) {
      n.burnT = 0; n.burnTick = 0; n.burnShake = 0; n.burnDir = 0;
      return;
    }
    // Quick left↔right extinguishes body fire (no HP if in time)
    let d = 0;
    if (inp) {
      if (inp.left && !inp.right) d = -1;
      else if (inp.right && !inp.left) d = 1;
    }
    if (!d) {
      if (n.vx < -55) d = -1;
      else if (n.vx > 55) d = 1;
    }
    if (d && n.burnDir && d !== n.burnDir) {
      n.burnShake = (n.burnShake || 0) + 1;
      puff(n.x, n.y - 24, '#ffe08a', 2);
    }
    if (d) n.burnDir = d;
    if ((n.burnShake || 0) >= BURN_SHAKES_NEED) {
      n.burnT = 0; n.burnTick = 0; n.burnShake = 0; n.burnDir = 0;
      n.glow = Math.max(n.glow || 0, 0.25);
      toast('左右快晃，火灭了！没掉血');
      puff(n.x, n.y - 20, '#9ad0ff', 12);
      sfx.coin && sfx.coin();
      return;
    }
    n.burnT = Math.max(0, n.burnT - dt);
    n.bones = Math.max(n.bones || 0, 0.25);
    n.glow = Math.max(n.glow || 0, 0.2);
    if (Math.random() < dt * 10) puff(n.x + (Math.random() - 0.5) * 16, n.y - 20 - Math.random() * 20, '#ff7a20', 1);
    if (n.burnT > 0) return;
    // Window over — not shaken out in time → lose 1 HP, fire goes out
    n.burnShake = 0; n.burnDir = 0; n.burnTick = 0;
    if (n.invuln <= 0) {
      n.hp -= 1;
      n.flash = 0.18;
      n.invuln = 0.45;
      puff(n.x, n.y - 28, '#ff8c32', 8);
      sfx.bump();
      toast((n.palette === 'green' ? '绿' : n.palette === 'blue' ? '蓝' : '红') + '忍者没晃灭火，-1血');
      buzz(14);
      if (n.hp <= 0) { n.hp = 0; downOrOver(n); }
    }
  }
  function hurtFire(n) {
    // Red immune; green/blue: body catches fire — shake L/R fast to extinguish before HP loss
    if (!n || n.down || mode !== 'play') return;
    if (n.palette === 'red') {
      if ((n.spikeMsgCd || 0) <= 0) { toast('红忍者免疫喷火'); n.spikeMsgCd = 1.2; }
      return;
    }
    const was = n.burnT || 0;
    if (was <= 0) {
      n.burnT = BURN_WINDOW;
      n.burnShake = 0;
      n.burnDir = 0;
      n.burnTick = 0;
      n.bones = Math.max(n.bones || 0, 0.35);
      n.glow = Math.max(n.glow || 0, 0.35);
      toast((n.palette === 'green' ? '绿' : '蓝') + '忍者着火！5秒内左右快晃可灭火');
      puff(n.x, n.y - 16, '#ff8c32', 10);
      sfx.bump();
      buzz(12);
    } else {
      // still in jet / re-hit: refresh window but keep shake progress (fair)
      n.burnT = Math.max(n.burnT, BURN_WINDOW * 0.65);
      n.bones = Math.max(n.bones || 0, 0.3);
    }
  }
  function touchFires(n) {
    if (!n || n.down || !fires.length) return;
    for (let i = 0; i < fires.length; i++) {
      const f = fires[i];
      if (!f.on) continue;
      if (Math.abs(n.x - f.x) < 20 && n.y > f.y - 70 && n.y < f.y + 10) {
        hurtFire(n);
        return;
      }
    }
  }
  function updateFires(dt) {
    for (let i = 0; i < fires.length; i++) {
      const f = fires[i];
      f.phase = (f.phase || 0) + dt;
      // cycle: 1.1s off, 1.4s on
      const cycle = f.phase % 2.5;
      f.on = cycle > 1.1;
      f.jet = f.on ? Math.min(1, (cycle - 1.1) / 0.2) : Math.max(0, 1 - (cycle < 0.15 ? 0 : (2.5 - cycle) / 0.2));
    }
  }
  function hurtBolt(n) {
    // Blue immune; green/red: skeleton + HP on hit only (no DoT)
    if (!n || n.down || mode !== 'play') return;
    if (n.palette === 'blue') {
      if ((n.spikeMsgCd || 0) <= 0) { toast('蓝忍者免疫闪电'); n.spikeMsgCd = 1.2; }
      return;
    }
    if ((n.boltCd || 0) > 0 || n.invuln > 0) return;
    n.hp -= 1;
    n.invuln = 0.55;
    n.boltCd = 0.8;
    n.bones = 0.7;
    n.flash = 0.28;
    n.shake = 0.3;
    n.glow = 0.4;
    sfx.bump();
    buzz(22);
    toast((n.palette === 'green' ? '绿' : '红') + '忍者被雷劈 -1');
    puff(n.x, n.y - 40, '#cce6ff', 12);
    if (n.hp <= 0) { n.hp = 0; downOrOver(n); }
  }
  function touchBolts(n) {
    if (!n || n.down || !bolts.length) return;
    for (let i = 0; i < bolts.length; i++) {
      const b = bolts[i];
      if (b.strike <= 0) continue;
      if (n.x >= b.x0 - 6 && n.x <= b.x1 + 6 && n.y > b.y - 90 && n.y < b.y + 12) {
        hurtBolt(n);
        return;
      }
    }
  }
  function updateBolts(dt) {
    for (let i = 0; i < bolts.length; i++) {
      const b = bolts[i];
      b.phase = (b.phase || 0) + dt;
      if (b.strike > 0) {
        b.strike = Math.max(0, b.strike - dt);
        b.warn = 0;
        continue;
      }
      // warn 0.45s then strike 0.28s, period ~3.2s
      const cycle = b.phase % 3.2;
      if (cycle > 2.4 && cycle < 2.85) {
        b.warn = (cycle - 2.4) / 0.45;
      } else if (cycle >= 2.85 && cycle < 3.13) {
        if (b.warn > 0 || b.strike <= 0) b.strike = 0.28;
        b.warn = 0;
      } else {
        b.warn = 0;
      }
    }
  }
  function startKnockdown(n) {
    n.knockPhase = 'prone';
    n.knockT = 1.55;
    n.vx = 0;
    n.vy = 0;
    n.grounded = true;
    n.anim = 'prone';
  }
  function hurtBomb(n, bomb) {
    if (!n || n.down || mode !== 'play') return;
    if (n.knockPhase) return;
    if (n.invuln > 0) return;
    n.hp -= 1;
    n.invuln = 0.9;
    n.bones = 0.32;
    n.flash = 0.18;
    n.shake = 0.35;
    n.glow = 0.4;
    // shockwave fling then knockdown
    const dir = n.x >= bomb.x ? 1 : -1;
    n.vx = dir * 260;
    n.vy = -320;
    n.grounded = false;
    n.face = -dir;
    sfx.bump();
    buzz(28);
    toast('爆炸！-1');
    puff(bomb.x, bomb.y - 10, '#ff9a3a', 14);
    puff(n.x, n.y - 20, '#fff3a0', 8);
    // enter knockdown after short airborne beat via knockArm
    n.knockPhase = 'air';
    n.knockT = 0.28;
    n.knockAnimT = 0;
    if (n.hp <= 0) {
      n.hp = 0;
      n.knockPhase = null;
      n.knockT = 0;
      n.knockAnimT = 0;
      downOrOver(n);
    }
  }
  function touchBombs(n) {
    if (!n || n.down || n.knockPhase || !bombs.length) return;
    for (let i = 0; i < bombs.length; i++) {
      const b = bombs[i];
      if (!b.armed || b.cd > 0) continue;
      if (Math.abs(n.x - b.x) < 22 && n.y > b.y - 8 && n.y < b.y + 14) {
        b.armed = false;
        b.boomT = 0.55;
        b.cd = 2.4;
        hurtBomb(n, b);
        return;
      }
    }
  }
  function updateBombs(dt) {
    for (let i = 0; i < bombs.length; i++) {
      const b = bombs[i];
      if (b.boomT > 0) b.boomT = Math.max(0, b.boomT - dt);
      if (b.cd > 0) {
        b.cd = Math.max(0, b.cd - dt);
        if (b.cd <= 0) b.armed = true;
      }
      b.fuse = (b.fuse || 0) + dt;
    }
  }
  function tickKnock(n, dt) {
    if (!n || !n.knockPhase) return false;
    n.knockAnimT = (n.knockAnimT || 0) + dt;
    n.knockT -= dt;
    n.shake = Math.max(0, (n.shake || 0) - dt);
    n.flash = Math.max(0, (n.flash || 0) - dt);
    n.glow = Math.max(0, (n.glow || 0) - dt);
    n.bones = Math.max(0, (n.bones || 0) - dt);
    n.invuln = Math.max(0, n.invuln - dt);
    if (n.knockPhase === 'air') {
      // let physics continue briefly; when timer ends or grounded, go prone
      if (n.knockT <= 0 || n.grounded) {
        startKnockdown(n);
      }
      return false; // still allow physics this frame via normal path if air+grounded handled
    }
    if (n.knockPhase === 'prone') {
      n.vx = 0;
      n.vy = 0;
      n.anim = 'prone';
      if (n.knockT <= 0.95) {
        n.knockPhase = 'crawl';
        n.anim = 'crawl';
      }
      return true;
    }
    if (n.knockPhase === 'crawl') {
      n.vx = (n.face || 1) * 55;
      n.vy = 0;
      n.anim = 'crawl';
      n.phase += dt * 10;
      if (n.knockT <= 0.35) {
        n.knockPhase = 'rise';
        n.anim = 'rise';
        n.vx = 0;
      }
      return true;
    }
    if (n.knockPhase === 'rise') {
      n.vx = 0;
      n.vy = 0;
      n.anim = 'rise';
      if (n.knockT <= 0) {
        n.knockPhase = null;
        n.knockT = 0;
        n.knockAnimT = 0;
        n.anim = 'idle';
        n.vx = 0;
      }
      return true;
    }
    return false;
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

  function companionLead() {
    // follow the human who is farthest ahead (A or B)
    if (coop && !p2.down && (player.down || p2.x > player.x + 8)) return p2;
    return player;
  }
  // Red AI: mostly wander/roam; only sometimes follow (not stuck to players)
  const aiBuddy = {
    mode: 'wander', // 'wander' | 'follow'
    modeT: 0,
    dir: 1,         // -1 left, 0 idle, 1 right
    dirT: 0,
    jumpCd: 0,
  };
  function aiBuddyPickMode() {
    // ~70% wander stretches, ~30% follow; wander lasts longer
    if (Math.random() < 0.72) {
      aiBuddy.mode = 'wander';
      aiBuddy.modeT = 2.8 + Math.random() * 4.2; // 2.8–7s roam
    } else {
      aiBuddy.mode = 'follow';
      aiBuddy.modeT = 1.2 + Math.random() * 2.0; // 1.2–3.2s brief follow
    }
  }
  function aiBuddyPickDir() {
    const r = Math.random();
    // Prefer idle: no button-like wander dash; short left/right walks only
    if (r < 0.55) aiBuddy.dir = 0;
    else if (r < 0.78) aiBuddy.dir = -1;
    else aiBuddy.dir = 1;
    aiBuddy.dirT = aiBuddy.dir === 0
      ? (1.2 + Math.random() * 2.4)
      : (0.35 + Math.random() * 0.7);
  }
  function aiCompanionInput(dt) {
    clearInput(input3);
    if (!companion || p3.down || p3.knockPhase) return input3;
    aiBuddy.modeT -= dt;
    aiBuddy.dirT -= dt;
    aiBuddy.jumpCd = Math.max(0, aiBuddy.jumpCd - dt);
    if (aiBuddy.modeT <= 0) aiBuddyPickMode();
    if (aiBuddy.dirT <= 0) aiBuddyPickDir();

    const lead = companionLead();
    // Soft leash: if way behind while wandering, briefly follow so they don't soft-lock
    if (aiBuddy.mode === 'wander' && lead && !lead.down && (lead.x - p3.x) > 420) {
      aiBuddy.mode = 'follow';
      aiBuddy.modeT = 1.4 + Math.random() * 1.2;
    }

    if (aiBuddy.mode === 'follow' && lead && !lead.down) {
      const dx = lead.x - 40 - p3.x;
      if (dx > 18) input3.right = true;
      else if (dx < -28) input3.left = true;
      const ahead = p3.x + (p3.face || 1) * 28;
      const gc = Math.floor(ahead / T);
      const gr = Math.floor((p3.y + 2) / T);
      const hole = p3.grounded && !solidAt(gc, gr) && !solidAt(gc, gr + 1);
      if ((hole || (!lead.grounded && lead.vy < -80) || (lead.y < p3.y - 36)) && p3.grounded) {
        input3.jump = true;
        input3.jumpPressed = true;
      }
    } else {
      // Wander: random walk / idle; jump gaps or on whim
      if (aiBuddy.dir > 0) input3.right = true;
      else if (aiBuddy.dir < 0) input3.left = true;
      const ahead = p3.x + (aiBuddy.dir || p3.face || 1) * 28;
      const gc = Math.floor(ahead / T);
      const gr = Math.floor((p3.y + 2) / T);
      const hole = p3.grounded && aiBuddy.dir !== 0 && !solidAt(gc, gr) && !solidAt(gc, gr + 1);
      if (hole && p3.grounded) {
        input3.jump = true;
        input3.jumpPressed = true;
      } else if (p3.grounded && aiBuddy.jumpCd <= 0 && Math.random() < dt * 0.35) {
        input3.jump = true;
        input3.jumpPressed = true;
        aiBuddy.jumpCd = 0.9 + Math.random() * 1.4;
      }
      // turn around at walls / map edge roughly
      if (p3.onWall && aiBuddy.dir) {
        aiBuddy.dir = -aiBuddy.dir;
        aiBuddy.dirT = 0.4 + Math.random() * 0.8;
      }
    }
    // weakly toss if slime nearby (either mode)
    for (let i = 0; i < slimes.length; i++) {
      const m = slimes[i];
      if (m.dead) continue;
      if (Math.abs(m.x - p3.x) < 120 && Math.abs(m.y - p3.y) < 40 && (m.x - p3.x) * (p3.face || 1) > 0) {
        if (Math.random() < dt * 0.55) { input3.throw = true; input3.throwEdge = true; }
        break;
      }
    }
    return input3;
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
    // Explosion knockdown: prone → crawl → rise (blocks input)
    if (n.knockPhase === 'prone' || n.knockPhase === 'crawl' || n.knockPhase === 'rise') {
      tickKnock(n, dt);
      n.vy += GRAV * dt;
      if (n.vy > 980) n.vy = 980;
      moveX(n, dt);
      moveY(n, dt);
      return;
    }
    if (n.knockPhase === 'air') {
      tickKnock(n, dt);
      if (n.knockPhase === 'prone' || n.knockPhase === 'crawl' || n.knockPhase === 'rise') {
        moveX(n, dt);
        moveY(n, dt);
        return;
      }
      n.vy += GRAV * dt;
      if (n.vy > 980) n.vy = 980;
      moveX(n, dt);
      moveY(n, dt);
      if (n.grounded || n.knockT <= 0) startKnockdown(n);
      n.anim = 'jump';
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
    n.shake = Math.max(0, (n.shake || 0) - dt);
    n.flash = Math.max(0, (n.flash || 0) - dt);
    n.glow = Math.max(0, (n.glow || 0) - dt);
    n.bones = Math.max(0, (n.bones || 0) - dt);
    n.spikeMsgCd = Math.max(0, (n.spikeMsgCd || 0) - dt);
    n.boltCd = Math.max(0, (n.boltCd || 0) - dt);
    tickBurn(n, dt, inp);

    // Button-only move: no auto-run / no air dash. Hold left/right to swing; release = stop.
    const MOVE = 200;
    let desired = 0;
    if (n.wallLock > 0) desired = n.vx; // brief wall-jump carry only
    else if (inp.left && !inp.right) desired = -MOVE;
    else if (inp.right && !inp.left) desired = MOVE;
    const accel = (n.grounded ? 2800 : 2200) * dt; // snappy stop when keys released
    const dv = desired - n.vx;
    n.vx += Math.max(-accel, Math.min(accel, dv));
    if (desired === 0 && n.wallLock <= 0 && Math.abs(n.vx) < 18) n.vx = 0;

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

    n.phase += Math.abs(n.vx) * dt * 0.085;
    if (n.anim === 'run') n.locoT = (n.locoT || 0) + dt;
    else if (n.anim === 'idle') n.locoT = 0;
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
    if (boss.hurtCd == null) boss.hurtCd = 0;
    if (boss.hurtCd > 0) boss.hurtCd -= dt;
    const touchOne = (n) => {
      if (!n || n.down || (n !== player && !coop)) return;
      if (Math.abs(n.x - boss.x) < 38 && n.y > boss.y - 56 && n.y - n.h < boss.y + 4) {
        const stomping = n.vy > 80 && (n.y - n.h) < boss.y - 20;
        if (stomping && boss.alive) {
          if (boss.hurtCd <= 0) {
            boss.hurtCd = 0.35;
            boss.hp = Math.max(0, boss.hp - 1);
            n.vy = -Math.min(JUMP_V * 0.75, 560);
            n.grounded = false;
            puff(boss.x, boss.y - 30, '#ffd166', 7);
            sfx.bump();
            if (boss.hp <= 0) {
              boss.hp = 0;
              boss.alive = false;
              boss.deadT = 0;
              puff(boss.x, boss.y - 24, '#ffe14a', 12);
            }
          }
        } else if (n.invuln <= 0) {
          hurt(n, boss.x);
        }
      }
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
    if (netRole === 'guest') {
      updateGuestNet(dt);
      return;
    }
    for (let i = 0; i < springs.length; i++) springs[i].squish = Math.max(0, springs[i].squish - dt);
    if (mode !== 'play') {
      updateWhoosh(0, dt);
      player.phase += dt * 8;
      if (netRole === 'host') netMaybeSnap(dt);
      return;
    }
    tickDynamicTerrain(dt);
    controlNinja(player, input, dt);
    if (coop && mode === 'play') controlNinja(p2, input2, dt);
    if (companion && mode === 'play') controlNinja(p3, aiCompanionInput(dt), dt);
    touchWater(player);
    if (coop) touchWater(p2);
    if (companion) touchWater(p3);
    hurtMonstersInWater(dt);
    updateBombs(dt);
    updateFires(dt);
    updateBolts(dt);
    touchBombs(player);
    touchGrasslandTraps(player);
    touchSpikes(player);
    touchFires(player);
    touchBolts(player);
    if (coop) {
      touchBombs(p2);
      touchGrasslandTraps(p2);
      touchSpikes(p2);
      touchFires(p2);
      touchBolts(p2);
    }
    if (companion) {
      touchBombs(p3);
      touchGrasslandTraps(p3);
      touchSpikes(p3);
      touchFires(p3);
      touchBolts(p3);
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
      s.spin += dt * 18;
      const tc = Math.floor(s.x / T);
      const tr = Math.floor(s.y / T);
      let die = s.life <= 0 || solidAt(tc, tr);
      if (!die) {
        for (let k = 0; k < slimes.length; k++) {
          const m = slimes[k];
          if (m.dead) continue;
          if (Math.abs(s.x - m.x) < 26 && Math.abs(s.y - (m.y - 16)) < 26) {
            m.hp = Math.max(0, (m.hp || 1) - 1);
            die = true;
            puff(m.x, m.y - 12, '#8ee88a', 8);
            sfx.slime();
            if (m.hp <= 0) {
              m.dead = true;
              gotCoins++;
              puff(m.x, m.y - 12, '#ffe14a', 8);
            }
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
      if (m.hurtCd > 0) m.hurtCd -= dt;
      const poke = (n) => {
        if (!n || n.down || (n !== player && !coop)) return;
        if (!(Math.abs(n.x - m.x) < 26 && n.y > m.y - 30 && n.y - n.h < m.y)) return;
        const stomping = n.vy > 80 && (n.y - n.h) < m.y - 8;
        if (stomping) {
          if (m.hurtCd > 0) return;
          m.hurtCd = 0.25;
          m.hp = Math.max(0, (m.hp || 1) - 1);
          n.vy = -Math.min(JUMP_V * 0.72, 520);
          n.grounded = false;
          puff(m.x, m.y - 12, '#8ee88a', 6);
          sfx.slime();
          if (m.hp <= 0) {
            m.dead = true;
            gotCoins++;
            puff(m.x, m.y - 12, '#ffe14a', 8);
          }
          return;
        }
        if (n.invuln <= 0) hurt(n, m.x);
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
    if (companion) {
      grab(p3, coins, 26, 36, false);
      grab(p3, stars, 30, 40, true);
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
    if (companion) markCheck(p3);

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
    if (coop || companion) {
      const a = player.down ? null : player;
      const b = (coop && !p2.down) ? p2 : null;
      const c = (companion && !p3.down) ? p3 : null;
      // soft leash stragglers
      const living = [a, b, c].filter(Boolean);
      if (living.length >= 2) {
        const leader = living.reduce((p, n) => (n.x > p.x ? n : p), living[0]);
        living.forEach((n) => {
          if (n === leader) return;
          if (leader.x - n.x > vw * 0.75) {
            n.x = leader.x - (leader.face || 1) * 40;
            n.y = leader.y;
            n.vx = 0; n.vy = 0; n.grounded = true; n.onWall = 0;
          }
        });
        const xs = living.map((n) => n.x);
        const ys = living.map((n) => n.y);
        focus = { x: xs.reduce((s, v) => s + v, 0) / xs.length, y: Math.min.apply(null, ys), face: leader.face };
      } else focus = a || b || c || player;
    }
    let tx = (coop || companion) ? focus.x - vw * 0.45 : player.x + player.face * 60 - vw * 0.4;
    tx = Math.max(0, Math.min(tx, Math.max(0, cols * T - vw)));
    const worldH = rows * T;
    let ty = ((coop || companion) ? focus.y : player.y) - vh * (viewH > viewW ? 0.58 : 0.62);
    ty = Math.max(-16, Math.min(ty, Math.max(-16, worldH - vh + 8)));
    if (cam.snap) { cam.x = tx; cam.y = ty; cam.snap = false; }
    else {
      cam.x += (tx - cam.x) * 0.16;
      cam.y += (ty - cam.y) * 0.16;
    }

    const sp = Math.max(Math.hypot(player.vx, player.vy), coop ? Math.hypot(p2.vx, p2.vy) : 0, companion ? Math.hypot(p3.vx, p3.vy) : 0);
    updateWhoosh(sp, dt);
    syncHUD();
    if (netRole === 'host') netMaybeSnap(dt);
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
      // Natural walk: opposite arm/leg swing (like a person), arms a bit smaller than legs
      const leg = s * 1.05;
      const arm = -s * 0.72;
      return {
        legL: leg, legR: -leg,
        armL: arm, armR: -arm,
        body: 0.06 + Math.abs(s) * 0.05,
        bob: Math.abs(Math.sin(phase * 2)) * 3.0,
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
  function drawBombPad(b) {
    const x = b.x, y = b.y;
    // warning pad on grass
    ctx.fillStyle = '#1a1a1a';
    for (let i = -1; i <= 1; i++) {
      for (let j = 0; j < 2; j++) {
        const px = x + i * 12 - 6;
        const py = y - 2 + j * 6;
        ctx.fillStyle = ((i + j) & 1) ? '#f2f2f2' : '#e23b3b';
        ctx.fillRect(px, py - 6, 12, 6);
      }
    }
    // bomb body sitting in / on dirt face just under grass
    const bob = Math.sin((b.fuse || 0) * 8) * 1.5;
    ctx.save();
    ctx.translate(x, y + 18 + bob);
    ctx.fillStyle = '#1b1b1b';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(-3, -3, 3, 0, Math.PI * 2);
    ctx.fill();
    // fuse
    ctx.strokeStyle = '#c4894a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.quadraticCurveTo(6, -18, 4, -24);
    ctx.stroke();
    if (b.armed) {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(4, -24, 2.5 + Math.sin((b.fuse || 0) * 20), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // shockwave ring
    if (b.boomT > 0) {
      const u = 1 - b.boomT / 0.55;
      const R = 20 + u * 70;
      ctx.strokeStyle = 'rgba(255,140,40,' + (1 - u) + ')';
      ctx.lineWidth = 6 * (1 - u);
      ctx.beginPath();
      ctx.arc(x, y - 8, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,220,120,' + (0.45 * (1 - u)) + ')';
      ctx.beginPath();
      ctx.arc(x, y - 8, 18 + u * 28, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function drawFireJet(f) {
    const x = f.x, y = f.y;
    // ground nozzle
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(x - 10, y - 4, 20, 8);
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(x - 6, y - 10, 12, 8);
    ctx.fillStyle = '#888';
    ctx.fillRect(x - 4, y - 12, 8, 3);
    if (!f.on && (f.jet || 0) <= 0) {
      // idle ember
      if (Math.sin(sim * 6 + x) > 0.4) {
        ctx.fillStyle = '#ff6a20aa';
        ctx.beginPath();
        ctx.arc(x, y - 14, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    const h = 18 + (f.jet || 1) * 52;
    const g = ctx.createLinearGradient(x, y - 8, x, y - 8 - h);
    g.addColorStop(0, '#ffef8a');
    g.addColorStop(0.35, '#ff8c20');
    g.addColorStop(1, '#ff300080');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - 8, y - 8);
    ctx.quadraticCurveTo(x - 14 - Math.sin(sim * 18) * 3, y - 8 - h * 0.55, x - 2, y - 8 - h);
    ctx.quadraticCurveTo(x + 10 + Math.sin(sim * 22) * 3, y - 8 - h * 0.5, x + 8, y - 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff6a0cc';
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 10);
    ctx.lineTo(x, y - 10 - h * 0.7);
    ctx.lineTo(x + 3, y - 10);
    ctx.fill();
  }
  function drawBolt(b) {
    const mid = (b.x0 + b.x1) / 2;
    const w = b.x1 - b.x0;
    if (b.warn > 0) {
      ctx.fillStyle = 'rgba(180,220,255,' + (0.15 + 0.25 * b.warn) + ')';
      ctx.fillRect(b.x0, b.y - 100, w, 100);
      ctx.strokeStyle = 'rgba(255,255,120,' + (0.4 + 0.5 * b.warn) + ')';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(b.x0 + 2, b.y - 98, w - 4, 96);
      ctx.setLineDash([]);
    }
    if (b.strike > 0) {
      const a = Math.min(1, b.strike / 0.15);
      ctx.strokeStyle = 'rgba(220,240,255,' + a + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      let y = b.y - 110;
      ctx.moveTo(mid + Math.sin(sim * 40) * 4, y);
      while (y < b.y) {
        y += 14;
        ctx.lineTo(mid + (Math.random() - 0.5) * 22, y);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,' + a + ')';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(200,230,255,' + (0.25 * a) + ')';
      ctx.fillRect(b.x0, b.y - 100, w, 100);
    }
    // ground mark
    ctx.fillStyle = '#6a7a8a';
    ctx.fillRect(b.x0 + 4, b.y - 2, w - 8, 4);
  }
  function drawBoneOverlay(face) {
    ctx.save();
    ctx.scale(face, 1);
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffffcc';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    // skull
    ctx.beginPath();
    ctx.arc(0, -52, 9, 0, Math.PI * 2);
    ctx.fill();
    // spine
    ctx.beginPath();
    ctx.moveTo(0, -42);
    ctx.lineTo(0, -18);
    ctx.stroke();
    // ribs
    for (let i = 0; i < 3; i++) {
      const y = -38 + i * 6;
      ctx.beginPath();
      ctx.moveTo(-10, y);
      ctx.quadraticCurveTo(0, y + 3, 10, y);
      ctx.stroke();
    }
    // arms + legs
    ctx.beginPath();
    ctx.moveTo(0, -34); ctx.lineTo(-14, -22);
    ctx.moveTo(0, -34); ctx.lineTo(14, -22);
    ctx.moveTo(0, -18); ctx.lineTo(-10, -2);
    ctx.moveTo(0, -18); ctx.lineTo(10, -2);
    ctx.stroke();
    ctx.restore();
  }
  function drawKnockNinja(n) {
    // Flipbook knockdown: sprite frames (Cocos Animation style), not rotated portrait
    ctx.save();
    ctx.translate(n.x, n.y);
    const shakeX = (n.shake > 0) ? Math.sin(sim * 70) * 5 * Math.min(1, n.shake / 0.2) : 0;
    ctx.translate(shakeX, 0);
    ctx.fillStyle = '#00000022';
    ctx.beginPath();
    ctx.ellipse(0, -2, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    const pal = PALETTE[n.palette] || PALETTE.green;
    if (n.glow > 0) {
      ctx.shadowColor = pal.scarf;
      ctx.shadowBlur = 18;
    }
    const alpha = (n.flash > 0 && Math.sin(sim * 55) > 0) ? 0.55 : 1;
    const fname = knockFrameName(n);
    // green authored; blue/red reuse green knockdown frames (same sequence)
    let ok = drawSpriteFrame(fname, n.face || 1, alpha, 82, n.palette || 'green');
    if (!ok) {
      // fallback: old portrait lean only if frames not loaded yet
      ctx.save();
      const phase = n.knockPhase;
      if (phase === 'prone' || phase === 'air') {
        ctx.translate(0, -10);
        ctx.rotate((n.face || 1) * -1.15);
      } else if (phase === 'crawl') {
        ctx.translate(0, -8);
        ctx.rotate((n.face || 1) * -0.55);
      } else if (phase === 'rise') {
        ctx.translate(0, -18);
        ctx.rotate((n.face || 1) * -0.25);
      }
      ok = drawHeroSprite(n.face || 1, alpha, n.palette || 'green', 0);
      if (!ok) drawHero(n.phase || 0, 'idle', n.face || 1, alpha, n.palette, 0);
      ctx.restore();
    }
    if (n.bones > 0) {
      const sk = drawSpriteFrame('hurt_skeleton', n.face || 1, Math.min(0.85, n.bones / 0.2), 82, n.palette || 'green');
      if (!sk) {
        ctx.globalAlpha = Math.min(1, n.bones / 0.2);
        drawBoneOverlay(n.face || 1);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }
  function drawNinja(n) {
    if (!n) return;
    if (n.down) return;
    if (n.knockPhase) {
      drawKnockNinja(n);
      return;
    }
    ctx.save();
    const shakeX = (n.shake > 0) ? Math.sin(sim * 70) * 4 * Math.min(1, n.shake / 0.2) : 0;
    ctx.translate(n.x + shakeX, n.y);
    ctx.fillStyle = '#00000022';
    ctx.beginPath();
    ctx.ellipse(0, -2, 16, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    let sx = 1;
    let sy = 1;
    if (n.squash > 0) {
      const u = Math.min(1, n.squash / 0.1);
      sy = 1 - 0.18 * u;
      sx = 1 + 0.14 * u;
    } else if (n.vy < -40) {
      sy = 1.08; sx = 0.92;
    } else if (n.anim === 'run') {
      sy = 1 + Math.sin(n.phase * 2) * 0.03;
    }
    ctx.scale(sx, sy);
    const blink = n.invuln > 0 && Math.sin(sim * 40) > 0;
    const bob = n.anim === 'run' ? Math.abs(Math.sin(n.phase)) * 2.2 : (n.anim === 'jump' ? 3 : 0);
    const pal = PALETTE[n.palette] || PALETTE.green;
    if (n.glow > 0) {
      ctx.shadowColor = pal.scarf;
      ctx.shadowBlur = 16;
    }
    let alpha = blink ? 0.45 : 1;
    if (n.flash > 0 && Math.sin(sim * 55) > 0) alpha = 0.5;
    // Loco: always procedural arm-swing for walk/run (green/blue/red same new swing).
    // Idle/jump may use Cocos frames; never use old walk_* images (white hands / stiff arms).
    ctx.translate(0, -bob);
    let ok = false;
    if (n.anim === 'run') {
      drawHero(n.phase, 'run', n.face, alpha, n.palette || 'green', Math.abs(n.vx));
      ok = true;
    } else if (n.anim === 'jump' || n.anim === 'walljump' || n.anim === 'slide') {
      const fname = locoFrameName(n);
      ok = drawSpriteFrame(fname, n.face, alpha, 82, n.palette || 'green');
      if (!ok) drawHero(n.phase, n.anim, n.face, alpha, n.palette || 'green', Math.abs(n.vx));
    } else {
      // idle / throw: prefer idle sprite, else procedural (not walk flipbook)
      ok = drawSpriteFrame('idle', n.face, alpha, 82, n.palette || 'green');
      if (!ok) {
        ok = drawHeroSprite(n.face, alpha, n.palette || 'green', 0);
        if (!ok) drawHero(n.phase, n.anim || 'idle', n.face, alpha, n.palette || 'green', Math.abs(n.vx));
      }
    }
    if (n.bones > 0) {
      ctx.globalAlpha = Math.min(1, n.bones / 0.2);
      drawBoneOverlay(n.face);
      ctx.globalAlpha = 1;
    }
    if ((n.burnT || 0) > 0) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#ff7a20';
      for (let k = 0; k < 3; k++) {
        const fx = (k - 1) * 8 + Math.sin(sim * 14 + k) * 2;
        const fh = 10 + (k % 2) * 6 + Math.sin(sim * 20 + k * 2) * 3;
        ctx.beginPath();
        ctx.moveTo(fx - 4, -18);
        ctx.lineTo(fx, -18 - fh);
        ctx.lineTo(fx + 4, -18);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
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
    // Dynamic / seeded water puddles (middle of small terrains)
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!water[r * cols + c]) continue;
        const x = c * T;
        const y = r * T;
        const wave = Math.sin(sim * 4 + c * 0.7 + r) * 2;
        ctx.fillStyle = (levelTerrain === 'swamp' || levelTerrain === 'all') ? 'rgba(36,130,110,0.82)' : 'rgba(40,140,220,0.78)';
        ctx.fillRect(x, y + 6, T + 0.6, T - 4);
        ctx.fillStyle = 'rgba(120,210,255,0.55)';
        ctx.beginPath();
        ctx.moveTo(x, y + 10 + wave);
        ctx.quadraticCurveTo(x + T * 0.35, y + 4 - wave, x + T * 0.7, y + 11 + wave * 0.5);
        ctx.quadraticCurveTo(x + T * 0.85, y + 8, x + T, y + 10 - wave);
        ctx.lineTo(x + T, y + 16);
        ctx.lineTo(x, y + 16);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(200,240,255,0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 12 + wave * 0.3);
        ctx.lineTo(x + T - 4, y + 12 - wave * 0.3);
        ctx.stroke();
      }
    }
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!solid[r * cols + c]) continue;
        if (r > 0 && solid[(r - 1) * cols + c]) continue;
        const gcap = SCENE_CACHE.grass;
        if (gcap && gcap.complete && gcap.naturalWidth) {
          ctx.drawImage(gcap, c * T, r * T - 2, T + 0.6, 16);
        } else {
          ctx.fillStyle = '#3f8f4a';
          ctx.fillRect(c * T, r * T, T + 0.6, 8);
          ctx.fillStyle = '#2f6a38';
          ctx.fillRect(c * T, r * T + 8, T + 0.6, 4);
        }
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
    // spikes on grass
    for (let i = 0; i < spikes.length; i++) {
      const s = spikes[i];
      for (let c = s.c0; c <= s.c1; c++) {
        for (let k = 0; k < 3; k++) {
          const x = c * T + 6 + k * 12;
          const y = s.y;
          ctx.fillStyle = s.lethal ? '#8b0000' : '#c5d0dc';
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 5, y - 14);
          ctx.lineTo(x + 10, y);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = s.lethal ? '#4a0000' : '#7a8794';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
    for (let i = 0; i < fires.length; i++) drawFireJet(fires[i]);
    for (let i = 0; i < bolts.length; i++) drawBolt(bolts[i]);
    for (let i = 0; i < bombs.length; i++) drawBombPad(bombs[i]);
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
    if (companion) drawNinja(p3);
  }
  function drawSky() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const key = sceneKeyForLevel(levelIndex | 0);
    const im = SCENE_CACHE.imgs[key];
    if (im && im.complete && im.naturalWidth) {
      // Parallax cover: 原画-style scene plate fills view; scroll slowly with cam
      const iw = im.naturalWidth, ih = im.naturalHeight;
      const scale = Math.max(viewW / iw, viewH / ih) * 1.08;
      const dw = iw * scale, dh = ih * scale;
      const parallax = (cam.x || 0) * 0.12;
      const ox = -((parallax % dw) + dw) % dw;
      const oy = viewH - dh + 8;
      ctx.drawImage(im, ox, oy, dw, dh);
      if (ox + dw < viewW) ctx.drawImage(im, ox + dw - 1, oy, dw, dh);
      // soft vignette so UI stays readable
      ctx.fillStyle = 'rgba(8,16,28,0.12)';
      ctx.fillRect(0, 0, viewW, viewH);
    } else {
      ctx.fillStyle = sky || '#1d4e38';
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.fillStyle = '#ffe7a0';
      ctx.beginPath();
      ctx.arc(viewW * 0.8, viewH * 0.16, Math.min(viewW, viewH) * 0.055, 0, Math.PI * 2);
      ctx.fill();
    }
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
    // Title preview: same procedural arm-swing walk as in-game (all skins, including green)
    drawHero(sim * 10, 'run', 1, 1, pickColor || 'green', 180);
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


  // ========== 联网双人 helpers ==========
  function netOnline() { return !!netRole; }
  /** Coop room ids: rotating minute slots so a stuck PeerJS id cannot block forever.
   *  ?room=xxx → single custom id. Guest probes current+previous minute slots. */
  function netCustomRoom() {
    try {
      const q = new URLSearchParams(location.search);
      const custom = (q.get('room') || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
      if (custom) return NET_PREFIX + '-c-' + custom;
    } catch (e) { /* ignore */ }
    return '';
  }
  function netRoomCandidates() {
    const custom = netCustomRoom();
    if (custom) return [custom];
    // 3-minute buckets keep ids stable while avoiding forever-stuck PeerJS ghosts
    const bucket = Math.floor(Date.now() / 180000);
    const out = [];
    for (const b of [bucket, bucket - 1]) {
      const tag = ((b % 100000) + 100000) % 100000;
      for (let s = 0; s < NET_SLOTS; s++) out.push(NET_PREFIX + '-b' + tag + '-s' + s);
    }
    return out;
  }
  function netRoomId() { return netRoomCandidates()[0]; }
  function netSetBanner(text, kind) {
    const el = document.getElementById('netBanner');
    if (!el) return;
    if (!text) {
      el.textContent = '';
      el.classList.add('hidden');
      el.classList.remove('ok', 'warn');
      return;
    }
    el.textContent = text;
    el.classList.remove('hidden', 'ok', 'warn');
    if (kind === 'ok') el.classList.add('ok');
    if (kind === 'warn') el.classList.add('warn');
  }
  function netPeerId(code) { return String(code || netRoomId()); }
  function netMakeCode() { return netRoomId(); }
  function netJoinUrl() { return location.origin + location.pathname.replace(/index\.html?$/, ''); }
  function netNewPeer(id) {
    return id ? new Peer(id, NET_PEER_OPTS) : new Peer(NET_PEER_OPTS);
  }
  function netSetWait(text) {
    const el = document.getElementById('roomWait');
    if (el) el.textContent = text;
  }
  function netSend(obj) {
    if (!netLinked) return;
    if (netTransport === 'bc') {
      netBCPost({ t: 'bc-data', role: netRole, session: netBcSession, payload: obj });
      return;
    }
    if (!netConn) return;
    try { netConn.send(obj); } catch (e) { /* drop */ }
  }
  function netDestroy() {
    try { if (netConn) netConn.close(); } catch (e) {}
    try { if (netPeer) netPeer.destroy(); } catch (e) {}
    netConn = null;
    netPeer = null;
    netLinked = false;
    netRole = null;
    netCode = '';
    netSnapAcc = 0;
    netTransport = null;
    netBcSession = '';
  }
  function netShowRoom(kind) {
    const panel = document.getElementById('roomPanel');
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    document.getElementById('roomTitle').textContent = kind === 'host' ? '玩家A · 芃芃' : '玩家B · 爸爸';
    document.getElementById('roomSub').textContent = kind === 'host'
      ? '双人联网 · 绿忍者 · 等待玩家B（另一浏览器点玩家B）'
      : '双人联网 · 蓝忍者 · 正在寻找玩家A';
    document.getElementById('roomWait').textContent = kind === 'host' ? '等待玩家B…请对方开第二窗口点玩家B' : '正在配对…请确认玩家A已点好';
    document.getElementById('joinWait').textContent = '';
  }
  function netHideRoom() {
    const panel = document.getElementById('roomPanel');
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
  }
  function netDrawQr(code) {
    const canvas = document.getElementById('roomQr');
    const url = netJoinUrl(code);
    if (typeof QRCode === 'undefined') {
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 160, 160);
      ctx.fillStyle = '#1d3557';
      ctx.font = '12px sans-serif';
      ctx.fillText(code, 50, 80);
      return;
    }
    QRCode.toCanvas(canvas, url, { width: 160, margin: 1, color: { dark: '#1d3557', light: '#ffffff' } }, function () {});
  }
  function netBindConn(conn, asHost) {
    if (netLinked && netTransport === 'bc') {
      try { conn.close(); } catch (e) {}
      return; // already linked same-machine
    }
    netConn = conn;
    const onReady = () => {
      if (netConn !== conn) return;
      if (netLinked && netTransport === 'bc') return;
      netTransport = 'peer';
      netLinked = true;
      netConn = conn;
      if (asHost) {
        toast('玩家B来了！');
        netSetBanner('玩家B已加入', 'ok');
        try { netSend({ t: 'hello', code: netCode, role: 'host' }); } catch (e) {}
        const alreadyPlaying = (mode === 'play' || mode === 'clear' || mode === 'win' || mode === 'over');
        if (alreadyPlaying) {
          // 同机双人: host already in level — pull guest in via go+snap (do not restart host)
          try { netSend({ t: 'go', lv: levelIndex, cp: companion ? 1 : 0 }); } catch (e) {}
          try { netSend(netBuildSnap()); } catch (e) {}
          syncChrome();
        } else {
          netSetWait('配对成功！马上开始');
          setTimeout(() => { if (netRole === 'host' && netLinked) netHostStart(); }, 500);
        }
      } else {
        netSetWait('配对成功！等一下就开打');
        toast('已连上玩家A');
      }
    };
    conn.on('open', onReady);
    if (conn.open) onReady();
    conn.on('data', (msg) => netOnMsg(msg, asHost));
    conn.on('close', () => {
      if (netConn === conn) netOnDisconnect();
    });
    // ICE blips must not tear down the match UI
    conn.on('error', () => {});
  }
  function netOnDisconnect() {
    const was = netRole;
    const wasPlaying = (mode === 'play' || mode === 'clear' || mode === 'win' || mode === 'over');
    netLinked = false;
    netConn = null;
    if (wasPlaying) {
      toast('联网断开，改为本地继续');
      netRole = null;
      syncChrome();
      return;
    }
    toast('连接断开了，可重新配对');
    if (was === 'guest') {
      netShowRoom('join');
      document.getElementById('joinWait').textContent = '断开了。请取消后重新点玩家B';
    } else if (was === 'host') {
      netSetWait('好友断开了，可取消后重试');
      netShowRoom('host');
    }
  }
  function netPackNinja(n) {
    return {
      x: Math.round(n.x * 10) / 10, y: Math.round(n.y * 10) / 10,
      vx: Math.round(n.vx), vy: Math.round(n.vy),
      face: n.face, anim: n.anim, phase: Math.round(n.phase * 100) / 100,
      hp: n.hp, down: !!n.down, inv: Math.round((n.invuln || 0) * 100) / 100,
      sq: Math.round((n.squash || 0) * 100) / 100,
      kp: n.knockPhase || null,
      kt: Math.round((n.knockT || 0) * 100) / 100,
      sk: Math.round((n.shake || 0) * 100) / 100,
      fl: Math.round((n.flash || 0) * 100) / 100,
      gl: Math.round((n.glow || 0) * 100) / 100,
      bn: Math.round((n.bones || 0) * 100) / 100,
      br: Math.round((n.burnT || 0) * 100) / 100,
    };
  }
  function netApplyNinja(n, s) {
    if (!s) return;
    n.x = s.x; n.y = s.y; n.vx = s.vx; n.vy = s.vy;
    n.face = s.face; n.anim = s.anim; n.phase = s.phase;
    n.hp = s.hp; n.down = !!s.down; n.invuln = s.inv || 0; n.squash = s.sq || 0;
    n.knockPhase = s.kp || null; n.knockT = s.kt || 0;
    n.shake = s.sk || 0; n.flash = s.fl || 0; n.glow = s.gl || 0; n.bones = s.bn || 0;
    n.burnT = s.br || 0;
  }
  function netBuildSnap() {
    const slimeBits = slimes.map((m) => (m.dead ? 1 : 0));
    const coinBits = coins.map((c) => (c.got ? 1 : 0));
    const starBits = stars.map((s) => (s.got ? 1 : 0));
    const crateBits = crates.map((c) => (c.dead ? 1 : 0));
    const checkBits = checks.map((k) => (k.on ? 1 : 0));
    const sh = [];
    for (let i = 0; i < shurikens.length; i++) {
      const s = shurikens[i];
      if (!s.on) continue;
      sh.push([Math.round(s.x), Math.round(s.y), Math.round(s.vx), Math.round(s.spin * 10)]);
      if (sh.length >= 6) break;
    }
    let b = null;
    if (boss) {
      b = {
        x: Math.round(boss.x), y: Math.round(boss.y), hp: boss.hp,
        alive: !!boss.alive, state: boss.state, cleared: !!boss.cleared,
        arena: !!boss.arena, wave: Math.round(boss.wave || 0),
        rx: boss.roller ? Math.round(boss.roller.x) : 0,
        ry: boss.roller ? Math.round(boss.roller.y) : 0,
        ron: !!(boss.roller),
      };
    }
    const bombBits = bombs.map((bb) => [
      bb.armed ? 1 : 0,
      Math.round((bb.boomT || 0) * 100) / 100,
      Math.round((bb.cd || 0) * 100) / 100,
    ]);
    const fireBits = fires.map((ff) => [ff.on ? 1 : 0, Math.round((ff.jet || 0) * 100) / 100]);
    const boltBits = bolts.map((bb) => [
      Math.round((bb.strike || 0) * 100) / 100,
      Math.round((bb.warn || 0) * 100) / 100,
    ]);
    return {
      t: 'snap', m: mode, lv: levelIndex, sim: Math.round(sim * 60) / 60,
      c: gotCoins, s: gotStars,
      p1: netPackNinja(player), p2: netPackNinja(p2), p3: companion ? netPackNinja(p3) : null,
      cp: companion ? 1 : 0,
      sl: slimeBits, co: coinBits, st: starBits, cr: crateBits, ck: checkBits,
      sh, b, bm: bombBits, fr: fireBits, bt: boltBits,
      cx: Math.round(checkpoint.x), cy: Math.round(checkpoint.y),
    };
  }
  function netMaybeSnap(dt) {
    if (!netLinked || netRole !== 'host' || mode === 'title') return;
    netSnapAcc += dt;
    if (netSnapAcc < 1 / 22) return;
    netSnapAcc = 0;
    netSend(netBuildSnap());
  }
  function netApplySnap(msg) {
    if (msg.lv !== levelIndex || mode === 'title') {
      // host changed level — load then apply
      if (typeof msg.lv === 'number' && msg.lv !== levelIndex) {
        coop = true;
        wantCoop = true;
        mode = 'play';
        loadLevel(msg.lv);
      }
    }
    if (msg.m && msg.m !== mode) {
      mode = msg.m;
      if (mode === 'clear' || mode === 'win') {
        const total = '🪙 ' + (msg.c || gotCoins) + '   ⭐ ' + (msg.s || gotStars);
        panelTitle.textContent = mode === 'win' ? '你做到了!' : '过关了!';
        panelSub.textContent = (mode === 'win' ? 'You did it!  ' : 'Level clear!  ') + total;
        panelBtn.textContent = '等房主…';
      } else if (mode === 'over') {
        panelTitle.textContent = 'Game Over';
        panelSub.textContent = '再来一次';
        panelBtn.textContent = '等房主…';
      }
      syncChrome();
    }
    gotCoins = msg.c | 0;
    gotStars = msg.s | 0;
    netApplyNinja(player, msg.p1);
    netApplyNinja(p2, msg.p2);
    if (msg.cp) {
      companion = true;
      if (msg.p3) netApplyNinja(p3, msg.p3);
    } else if (msg.cp === 0) companion = false;
    if (msg.sl) for (let i = 0; i < slimes.length && i < msg.sl.length; i++) slimes[i].dead = !!msg.sl[i];
    if (msg.co) for (let i = 0; i < coins.length && i < msg.co.length; i++) coins[i].got = !!msg.co[i];
    if (msg.st) for (let i = 0; i < stars.length && i < msg.st.length; i++) stars[i].got = !!msg.st[i];
    if (msg.cr) for (let i = 0; i < crates.length && i < msg.cr.length; i++) crates[i].dead = !!msg.cr[i];
    if (msg.ck) for (let i = 0; i < checks.length && i < msg.ck.length; i++) checks[i].on = !!msg.ck[i];
    if (msg.bm) {
      for (let i = 0; i < bombs.length && i < msg.bm.length; i++) {
        const a = msg.bm[i];
        bombs[i].armed = !!a[0];
        bombs[i].boomT = a[1] || 0;
        bombs[i].cd = a[2] || 0;
      }
    }
    if (msg.fr) {
      for (let i = 0; i < fires.length && i < msg.fr.length; i++) {
        fires[i].on = !!msg.fr[i][0];
        fires[i].jet = msg.fr[i][1] || 0;
      }
    }
    if (msg.bt) {
      for (let i = 0; i < bolts.length && i < msg.bt.length; i++) {
        bolts[i].strike = msg.bt[i][0] || 0;
        bolts[i].warn = msg.bt[i][1] || 0;
      }
    }
    for (let i = 0; i < shurikens.length; i++) shurikens[i].on = 0;
    if (msg.sh) {
      for (let i = 0; i < msg.sh.length && i < shurikens.length; i++) {
        const a = msg.sh[i];
        const s = shurikens[i];
        s.on = 1; s.x = a[0]; s.y = a[1]; s.vx = a[2]; s.vy = 0; s.spin = (a[3] || 0) / 10; s.life = 0.5;
      }
    }
    if (boss && msg.b) {
      const b = msg.b;
      boss.x = b.x; boss.y = b.y; boss.hp = b.hp;
      boss.alive = !!b.alive; boss.state = b.state || boss.state;
      boss.cleared = !!b.cleared; boss.arena = !!b.arena; boss.wave = b.wave || 0;
      if (b.ron) boss.roller = { x: b.rx, y: b.ry };
      else boss.roller = null;
    }
    if (msg.cx != null) { checkpoint.x = msg.cx; checkpoint.y = msg.cy; }
    syncHUD();
    syncChrome();
  }
  function updateGuestNet(dt) {
    // guest: no world authority — camera + cosmetics only
    for (let i = 0; i < springs.length; i++) springs[i].squish = Math.max(0, springs[i].squish - dt);
    updateBombs(dt);
    updateFires(dt);
    updateBolts(dt);
    player.phase += dt * 8;
    p2.phase += dt * 8;
    // local decay of cosmetic knock FX between snaps
    [player, p2].forEach((n) => {
      n.shake = Math.max(0, (n.shake || 0) - dt);
      n.flash = Math.max(0, (n.flash || 0) - dt);
      n.glow = Math.max(0, (n.glow || 0) - dt);
      n.bones = Math.max(0, (n.bones || 0) - dt);
      n.burnT = Math.max(0, (n.burnT || 0) - dt);
      n.boltCd = Math.max(0, (n.boltCd || 0) - dt);
      if (n.knockT > 0) n.knockT = Math.max(0, n.knockT - dt);
    });
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p.on) continue;
      p.life -= dt;
      p.vy += 400 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) p.on = 0;
    }
    if (mode === 'play' || mode === 'clear' || mode === 'win' || mode === 'over') {
      const vw = viewW / zoom;
      const vh = viewH / zoom;
      let focus = player;
      if (coop) {
        const a = player.down ? null : player;
        const b = p2.down ? null : p2;
        if (a && b) focus = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y), face: a.face };
        else focus = a || b || player;
      }
      let tx = focus.x - vw * 0.45;
      tx = Math.max(0, Math.min(tx, Math.max(0, cols * T - vw)));
      let ty = focus.y - vh * (viewH > viewW ? 0.58 : 0.62);
      const worldH = rows * T;
      ty = Math.max(-16, Math.min(ty, Math.max(-16, worldH - vh + 8)));
      if (cam.snap) { cam.x = tx; cam.y = ty; cam.snap = false; }
      else { cam.x += (tx - cam.x) * 0.2; cam.y += (ty - cam.y) * 0.2; }
    }
    // send local input to host (~30Hz)
    netOutAcc += dt;
    if (netOutAcc >= 1 / 36 && netLinked) {
      netOutAcc = 0;
      netSend({
        t: 'in',
        L: !!input.left, R: !!input.right, J: !!input.jump, T: !!input.throw,
      });
    }
    syncHUD();
  }
  function netApplyGuestInput(msg) {
    const L = !!msg.L, R = !!msg.R, J = !!msg.J, Th = !!msg.T;
    if (J && !netGuestPrev.jump) input2.jumpPressed = true;
    if (Th && !netGuestPrev.throw) input2.throwEdge = true;
    input2.left = L;
    input2.right = R;
    input2.jump = J;
    input2.throw = Th;
    netGuestPrev.left = L;
    netGuestPrev.right = R;
    netGuestPrev.jump = J;
    netGuestPrev.throw = Th;
  }
  function netOnMsg(msg, asHost) {
    if (!msg || !msg.t) return;
    if (asHost) {
      if (msg.t === 'in') netApplyGuestInput(msg);
      return;
    }
    // guest
    if (msg.t === 'hello') {
      document.getElementById('joinWait').textContent = '已连上房间 ' + (msg.code || netCode) + '，等房主开始';
    } else if (msg.t === 'go') {
      netHideRoom();
      unlock();
      coop = true;
      wantCoop = true;
      wantCompanion = !!msg.cp;
      companion = !!msg.cp;
      netRole = 'guest';
      netLinked = true;
      start(msg.lv | 0, true);
      companion = !!msg.cp;
      syncChrome();
      toast('开始！你是蓝色忍者');
      netSetBanner('联网对战·你是蓝', 'ok');
    } else if (msg.t === 'snap') {
      if (mode === 'title') {
        netHideRoom();
        unlock();
        coop = true;
        wantCoop = true;
        netRole = 'guest';
        netLinked = true;
        mode = 'play';
        loadLevel(typeof msg.lv === 'number' ? msg.lv : 0);
        syncChrome();
      }
      netApplySnap(msg);
    } else if (msg.t === 'mode') {
      netApplySnap({ t: 'snap', m: msg.m, lv: msg.lv, c: msg.coins, s: msg.stars, p1: netPackNinja(player), p2: netPackNinja(p2) });
    } else if (msg.t === 'terra') {
      if (msg.ev) {
        terraStep = msg.step | terraStep;
        applyTerraEvent(msg.ev, true);
      }
    } else if (msg.t === 'cmd') {
      if (msg.a === 'cont') {
        continueRun();
      } else if (msg.a === 'retry' || msg.a === 'next' || msg.a === 'again') {
        unlock();
        start(msg.lv | 0, true);
      }
    }
  }
  function netEnsurePeerJs() {
    if (typeof Peer === 'undefined') {
      toast('联网组件加载失败，请刷新');
      return false;
    }
    return true;
  }
  function netClaimOne(id) {
    return new Promise((resolve) => {
      let peer;
      try { peer = netNewPeer(id); } catch (e) { resolve(null); return; }
      let settled = false;
      const fail = () => {
        if (settled) return;
        settled = true;
        try { peer.destroy(); } catch (e) {}
        resolve(null);
      };
      peer.on('open', () => {
        if (settled || netMatchAbort) { fail(); return; }
        settled = true;
        resolve({ peer, id });
      });
      peer.on('error', () => fail());
      setTimeout(() => { if (!settled) fail(); }, 5000);
    });
  }
  /** Try each candidate until one Peer id is free; ghosts on other ids are skipped. */
  async function netClaimFirstFree(ids) {
    for (const id of ids) {
      if (netMatchAbort) return null;
      const won = await netClaimOne(id);
      if (won) return won;
    }
    return null;
  }
  function netClaimPair(id, onOk, onBusy) {
    netClaimOne(id).then((won) => {
      if (won) onOk(won.peer, won.id);
      else onBusy('busy');
    });
  }
  function netOpenHost(opts) {
    opts = opts || {};
    const silent = !!opts.silent;
    const enterPlay = !!opts.enterPlay;
    if (!netEnsurePeerJs()) {
      if (enterPlay) {
        prepareCoopCast();
        start((opts.pickLv != null ? opts.pickLv : 0) | 0, true);
        netSetBanner('联网组件失败·本地双人', 'warn');
      }
      return;
    }
    unlock();
    netMatchAbort = false;
    netDestroy();
    netRole = 'host';
    netPickLv = (opts.pickLv != null ? opts.pickLv : 0) | 0;
    const rooms = netRoomCandidates();
    if (!silent) {
      netShowRoom('host');
      netSetWait('正在当玩家A…开房中');
    } else {
      netHideRoom();
      netSetBanner('正在开房…', 'warn');
      toast('正在开房…');
    }
    // Pre-probe: if a live host already exists, join instead of opening a 2nd room.
    // Then multi-slot claim: skip stuck PeerJS ids; only fall back to join if every slot is taken.
    (async () => {
      let scout = null;
      try {
        scout = netNewPeer();
        await new Promise((resolve) => {
          let done = false;
          const finish = () => { if (done) return; done = true; resolve(); };
          scout.on('open', finish);
          scout.on('error', finish);
          setTimeout(finish, 4000);
        });
        if (!netMatchAbort && scout && scout.id) {
          const existing = await netProbeBatch(scout, rooms);
          if (existing && existing.conn) {
            netPeer = scout;
            scout = null; // keep peer; conn belongs to it
            netRole = 'guest';
            netCode = existing.id;
            netSetBanner('发现房主·正在加入', 'ok');
            toast('发现已有房间，正在加入…');
            netBindConn(existing.conn, false);
            return;
          }
        }
      } catch (e) { /* scout optional */ }
      try { if (scout) scout.destroy(); } catch (e) {}

      const won = await netClaimFirstFree(rooms);
      if (netMatchAbort) {
        if (won) { try { won.peer.destroy(); } catch (e) {} }
        return;
      }
      if (!won) {
        // All ids unavailable — likely a live host already; try join. If join fails, still play local.
        netSetBanner('房间忙·试着加入…', 'warn');
        toast('房间忙，改为加入…');
        netOpenJoin({
          silent: silent,
          enterPlay: enterPlay,
          pickLv: netPickLv,
          onFailLocal: enterPlay ? () => {
            netRole = null;
            prepareCoopCast();
            start(netPickLv | 0, true);
            netSetBanner('开房失败·先本地双人', 'warn');
          } : null,
        });
        return;
      }
      netPeer = won.peer;
      netCode = won.id;
      netRole = 'host';
      netBcSession = netMakeSession();
      netBCPost({ t: 'host', id: won.id, lv: netPickLv | 0 });
      netBCPost({ t: 'bc-offer', id: won.id, session: netBcSession, lv: netPickLv | 0 });
      const bcPulse = setInterval(() => {
        if (netMatchAbort || netRole !== 'host' || netLinked) { clearInterval(bcPulse); return; }
        netBCPost({ t: 'host', id: netCode, lv: netPickLv | 0 });
        netBCPost({ t: 'bc-offer', id: netCode, session: netBcSession, lv: netPickLv | 0 });
      }, 1200);
      netPeer.on('connection', (conn) => {
        if (netConn && netLinked) { try { conn.close(); } catch (e) {} return; }
        netBindConn(conn, true);
      });
      netPeer.on('disconnected', () => { try { netPeer.reconnect(); } catch (e) {} });
      netPeer.on('error', (err) => {
        if (err && err.type === 'peer-unavailable') return;
      });
      if (enterPlay) {
        prepareCoopCast();
        start(netPickLv | 0, true);
      }
      if (!silent) netSetWait('已准备好，请对方点玩家B');
      const short = String(won.id || '').slice(-6);
      netSetBanner('房间已开·等玩家B·' + short, 'ok');
      toast('房间已开·对方点「玩家B」加入');
    })();
  }
  function netProbeId(peer, id) {
    return new Promise((resolve) => {
      if (netMatchAbort) { resolve(null); return; }
      let done = false;
      let conn;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (!ok) { try { if (conn) conn.close(); } catch (e) {} }
        resolve(ok ? conn : null);
      };
      try { conn = peer.connect(id, { reliable: true }); }
      catch (e) { resolve(null); return; }
      conn.on('open', () => finish(true));
      conn.on('error', () => finish(false));
      const timer = setTimeout(() => finish(false), NET_PROBE_MS);
    });
  }
  async function netProbeBatch(peer, ids) {
    // Sequential — parallel connect-to-missing-ids wedges the PeerJS client
    if (netMatchAbort || !ids.length) return null;
    for (const id of ids) {
      if (netMatchAbort || netLinked) return null;
      const conn = await netProbeId(peer, id);
      if (conn) return { id, conn };
    }
    return null;
  }
  function netOpenJoin(opts) {
    opts = opts || {};
    const silent = !!opts.silent;
    const onFailLocal = opts.onFailLocal || null;
    if (!netEnsurePeerJs()) return;
    unlock();
    netMatchAbort = false;
    netDestroy();
    netRole = 'guest';
    const rooms = netRoomCandidates();
    if (!silent) {
      netShowRoom('join');
      netSetWait('正在加入…请先让对方点同机双人·开始或玩家A');
    } else {
      netHideRoom();
      toast('正在加入…');
    }
    netSetBanner('正在加入·等房主…', 'warn');
    let peer;
    try { peer = netNewPeer(); } catch (e) {
      toast('联网失败');
      if (onFailLocal) onFailLocal();
      return;
    }
    netPeer = peer;
    let bcHostId = '';
    // Global netOnBCMessage handles bc-offer/bc-ok; keep id hint for PeerJS probe order
    const onBCHint = (ev) => {
      const m = ev && ev.data;
      if (!m || !m.id) return;
      if (m.t === 'host' || m.t === 'bc-offer') bcHostId = String(m.id);
    };
    try { if (netBC) netBC.addEventListener('message', onBCHint); } catch (e) {}
    netBCPost({ t: 'need', want: 1 });
    peer.on('error', (err) => {
      if (err && err.type === 'peer-unavailable') return;
      if (!netLinked && !netMatchAbort) {
        if (!silent) netSetWait('联网信号不稳，请用系统浏览器打开后再试');
        else toast('联网信号不稳，请用系统浏览器打开后再试');
      }
    });
    const runFind = async (activePeer) => {
      const started = Date.now();
      let round = 0;
      let peerRef = activePeer;
      while (!netMatchAbort && !netLinked && Date.now() - started < NET_FIND_MS) {
        round += 1;
        if (netLinked) return;
        const ids = netRoomCandidates();
        if (bcHostId && ids.indexOf(bcHostId) < 0) ids.unshift(bcHostId);
        else if (bcHostId) { ids.splice(ids.indexOf(bcHostId), 1); ids.unshift(bcHostId); }
        if (!silent) netSetWait('正在配对…第' + round + '轮' + (bcHostId ? '·同机优先' : ''));
        else if (round === 1 || round % 4 === 0) toast(netLinked ? '已连上' : ('寻找房主…第' + round + '轮'));
        const won = await netProbeBatch(peerRef, ids);
        if (won && won.conn) {
          netPeer = peerRef;
          netCode = won.id;
          netBindConn(won.conn, false);
          if (!silent) netSetWait('配对成功！马上开始');
          else toast('已连上，马上进入');
          return;
        }
        // Fresh Peer every 2 rounds — avoids wedged client after many failed connects
        if (round % 2 === 0 && !netLinked && !netMatchAbort) {
          try { peerRef.destroy(); } catch (e) {}
          try {
            peerRef = netNewPeer();
            netPeer = peerRef;
            await new Promise((resolve) => {
              let d = false;
              const done = () => { if (d) return; d = true; resolve(); };
              peerRef.on('open', done);
              peerRef.on('error', done);
              setTimeout(done, 5000);
            });
          } catch (e) { break; }
        } else {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      if (!netLinked) {
        if (!silent) netSetWait('没找到房主。请对方先点同机双人·开始或玩家A；微信请用浏览器打开');
        toast('没找到房间：请先让对方点同机双人·开始，再点玩家B');
        netSetBanner('没找到房主', 'warn');
        if (onFailLocal) onFailLocal();
      }
    };
    peer.on('open', () => { runFind(peer); });
  }
  function netDoJoin() { netOpenJoin(); }

  function netHostStart() {
    if (netRole !== 'host' || !netLinked) {
      toast('等好友加入后再开始');
      return;
    }
    unlock();
    netHideRoom();
    // if already in that level (同机双人), just re-send go+snap
    if (mode === 'play' && levelIndex === (netPickLv | 0)) {
      try { netSend({ t: 'go', lv: levelIndex, cp: companion ? 1 : 0 }); } catch (e) {}
      try { netSend(netBuildSnap()); } catch (e) {}
      syncChrome();
      toast('已同步给玩家B');
      return;
    }
    start(netPickLv, true);
    syncChrome();
    toast('开始！你是绿色忍者');
  }
  function netBackMenu() {
    netMatchAbort = true;
    netDestroy();
    netHideRoom();
    netSetBanner('');
    mode = 'title';
    coop = false;
    wantCoop = false;
    mode1.classList.add('on');
    mode2.classList.remove('on');
    syncChrome();
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
  document.querySelectorAll('#castRow .cast').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (netRole) return;
      if (btn.id === 'castC') return; // handled by companion toggle
      pickColor = btn.getAttribute('data-color') || 'green';
      document.querySelectorAll('#castRow .cast').forEach((b) => {
        if (b.id === 'castC') return;
        b.classList.toggle('on', b === btn);
      });
      applyPickColors();
      if (pickColor === 'blue') {
        // 玩家B alone → join fixed coop room (no need to also tap 同机双人)
        wantCoop = true;
        mode2.classList.add('on');
        mode1.classList.remove('on');
        toast('蓝忍者（玩家B）· 正在加入');
        netOpenJoin({ silent: true });
        return;
      }
      toast('绿忍者（玩家A）· 点同机双人·开始开房，或点玩家A');
    });
  });

  // —— 同机双人: enter NOW + silent PeerJS host; P2 joins via 玩家B (no pair UI) ——
  function prepareCoopCast() {
    wantCompanion = true;
    companion = true;
    pickColor = 'green';
    document.querySelectorAll('#castRow .cast').forEach((b) => {
      if (b.id === 'castC') {
        b.classList.add('on');
        return;
      }
      b.classList.toggle('on', b.getAttribute('data-color') === 'green');
    });
    syncCompanionUi();
  }
  /** 同机双人: claim fixed PeerJS room first, then enter play + lasting banner.
   *  P2: 玩家B / 蓝 cast joins same id. If room busy, host path auto-joins as guest. */
  function requestLocalOrSoloStart(lv) {
    if (netRole === 'guest') return;
    if (netRole === 'host') {
      netPickLv = lv | 0;
      if (netLinked) netHostStart();
      else {
        unlock();
        prepareCoopCast();
        start(lv | 0, true);
        netSetBanner(netPeer ? '房间已开·等玩家B' : '正在开房…', netPeer ? 'ok' : 'warn');
        toast('同机双人：已开打 · 对方点「玩家B」加入');
      }
      return;
    }
    if (wantCoop) {
      // wait for Peer open before start — avoids P2 probing an empty id
      prepareCoopCast();
      unlock();
      netOpenHost({ silent: true, enterPlay: true, pickLv: lv | 0 });
      return;
    }
    unlock();
    netSetBanner('');
    start(lv | 0, false);
  }

  mode1.addEventListener('click', () => {
    if (netRole) return;
    wantCoop = false;
    mode1.classList.add('on');
    mode2.classList.remove('on');
  });
  mode2.addEventListener('click', () => {
    if (netRole) return;
    wantCoop = true;
    wantCompanion = true; // 同机双人默认带红小宇AI跟班
    mode2.classList.add('on');
    mode1.classList.remove('on');
    syncCompanionUi();
    toast('同机=一屏双人+红AI（联网请点玩家A/B）');
  });
  document.getElementById('play').addEventListener('click', () => {
    requestLocalOrSoloStart(0);
  });
  document.querySelectorAll('.picks button').forEach((b) => {
    b.addEventListener('click', () => {
      if (netRole === 'guest') return;
      if (netRole === 'host') {
        netPickLv = Number(b.dataset.lv);
        document.querySelectorAll('.roomLv button').forEach((x) => x.classList.toggle('on', Number(x.dataset.nlv) === netPickLv));
        if (netLinked) netHostStart();
        else toast('先点玩家A等待配对');
        return;
      }
      requestLocalOrSoloStart(Number(b.dataset.lv));
    });
  });
  document.getElementById('retry').addEventListener('click', () => {
    if (netRole === 'guest') { toast('等房主重来'); return; }
    start(levelIndex, coop);
    if (netRole === 'host') netSend({ t: 'cmd', a: 'retry', lv: levelIndex });
  });
  muteBtn.addEventListener('click', () => { unlock(); toggleMute(); });
  panelBtn.addEventListener('click', () => {
    if (netRole === 'guest') { toast('等房主点下一步'); return; }
    if (mode === 'over') { continueRun(); return; }
    if (mode === 'clear' && levelIndex < LEVELS.length - 1) {
      start(levelIndex + 1, coop);
      if (netRole === 'host') netSend({ t: 'cmd', a: 'next', lv: levelIndex });
    } else {
      start(0, coop);
      if (netRole === 'host') netSend({ t: 'cmd', a: 'again', lv: 0 });
    }
  });
  document.getElementById('netHost').addEventListener('click', () => { pickColor = 'green'; netOpenHost({ silent: false }); });
  document.getElementById('netJoin').addEventListener('click', () => { pickColor = 'blue'; wantCoop = true; mode2.classList.add('on'); mode1.classList.remove('on'); netOpenJoin({ silent: true }); });
  function syncCompanionUi() {
    const btn = document.getElementById('netJoinC');
    const cast = document.getElementById('castC');
    if (btn) {
      btn.classList.toggle('on', wantCompanion);
      btn.setAttribute('aria-pressed', wantCompanion ? 'true' : 'false');
    }
    if (cast) cast.classList.toggle('on', wantCompanion);
  }
  const netJoinCBtn = document.getElementById('netJoinC');
  if (netJoinCBtn) netJoinCBtn.addEventListener('click', () => {
    wantCompanion = !wantCompanion;
    syncCompanionUi();
    toast(wantCompanion ? '小宇AI跟班：开（乱逛，偶尔跟着）' : '小宇AI跟班：关');
  });
  const castC = document.getElementById('castC');
  if (castC) castC.addEventListener('click', (e) => {
    // toggle companion instead of picking red as main (unless shift)
    e.stopImmediatePropagation();
    wantCompanion = !wantCompanion;
    if (wantCompanion) pickColor = 'green';
    syncCompanionUi();
    document.querySelectorAll('#castRow .cast').forEach((b) => {
      if (b.id === 'castC') return;
      b.classList.toggle('on', b.getAttribute('data-color') === pickColor);
    });
    toast(wantCompanion ? '小宇AI跟班：开' : '小宇AI跟班：关');
  });
  syncCompanionUi();

  document.getElementById('roomClose').addEventListener('click', () => netBackMenu());
  const roomStartBtn = document.getElementById('roomStart');
  if (roomStartBtn) roomStartBtn.addEventListener('click', () => netHostStart());
  const P1K = {
    KeyA: 'left', KeyD: 'right', ArrowLeft: 'left', ArrowRight: 'right',
    KeyW: 'jump', ArrowUp: 'jump', Space: 'jump',
    KeyF: 'throw', KeyJ: 'throw', KeyK: 'throw',
  };
  addEventListener('keydown', (e) => {
    if (mode === 'title' && (e.code === 'Space' || e.code === 'Enter') && !netRole) {
      e.preventDefault();
      requestLocalOrSoloStart(0);
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
  try {
    // Fixed-day room (or ?room=xxx). Optional ?b=1 / ?a=1 opens as B/A.
    const q = new URLSearchParams(location.search);
    if (q.get('b') === '1' || q.get('as') === 'b') {
      setTimeout(() => netOpenJoin({ silent: true }), 200);
    } else if (q.get('a') === '1' || q.get('as') === 'a') {
      setTimeout(() => netOpenHost({ silent: false }), 200);
    }
  } catch (e) { /* ignore */ }

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
        coop, companion, hp: player.hp, p2x: p2.x, p2y: p2.y, p2hp: p2.hp,
        p3x: p3.x, p3y: p3.y, p3hp: p3.hp, p3anim: p3.anim,
        bossHp: boss ? boss.hp : 0, bossAlive: !!(boss && boss.alive),
        levels: LEVELS.length,
        netRole, netCode, netLinked,
      };
    },
  };
})();
