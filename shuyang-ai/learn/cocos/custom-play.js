/**
 * 玩我的关 — Cocos2d-JS Lite ≈ xy-go ?custom=1 第9关·沼泽
 * Same JSON / T=40 / PAD·EXP / canopy-night / 鳄王. Engine only.
 */
(function () {
  var KEY = 'xygo-custom-level';
  var SP = '../../../xy-go/sprites/green/';
  var SC = '../../../xy-go/scenes/';
  var BG = SC + 'canopy-night.jpg';
  var RES = [
    SP + 'walk_0.png', SP + 'walk_1.png', SP + 'walk_2.png', SP + 'walk_3.png',
    SP + 'idle.png', SP + 'knock_0.png', SP + 'jump_0.png',
    BG, SC + 'dirt-tile.png', SC + 'grass-cap.png'
  ];
  var T = 40;
  var CHAR_FRAC = 0.16; /* ~16% viewport height like xy-go desktop */
  var DRAW_H = 78; /* recomputed each fit/build from H * CHAR_FRAC */
  var idleTexH = 256; /* real idle.png height once loaded — NEVER fall back to 100 */
  var EXP = 6;
  var PAD = 6;
  var MAX_HP = 6;
  /* Unified for H+V: ~13 tiles tall → character ≈ 15% screen (xy-go desktop feel). */
  var TILES_VIS = 13;
  var W = 520, H = TILES_VIS * T;

  var sceneRef = null, spikeTex = null, fireTex = null, coinTex = null, flagTex = null;
  var starTex = null, shurikenTex = null, crocTex = null;
  var forestImg = null;
  var level = null, lastFitKey = '', rebuilding = false;
  var inp = { left: false, right: false, jump: false, jumpPressed: false, throwPressed: false };

  function $(id) { return document.getElementById(id); }
  function bootErr(m) { var b = $('boot'); if (!b) return; b.textContent = m; b.className = 'err'; }
  function mkColor(w, h, r, g, b, a) { return new cc.LayerColor(cc.color(r, g, b, a == null ? 255 : a), w, h); }
  function texFromCanvas(cv) { var tex = new cc.Texture2D(); tex.initWithElement(cv); tex.handleLoadedTexture(); return tex; }

  function updateOrientTip() {
    var tip = $('orientTip');
    if (!tip) return;
    tip.classList.toggle('on', window.innerHeight > window.innerWidth);
  }
  /** Portrait: keep player leftish so fire×2+flag+croc fit first glance. */
  function camBias() {
    return (window.innerHeight > window.innerWidth) ? 0.22 : 0.4;
  }

  /** Full-bleed like xy-go: shell = viewport; EXACT_FIT kills bottom letterbox black bar. */
  function fitStage() {
    updateOrientTip();
    var wrap = $('cvwrap');
    var shell = $('shell');
    if (!wrap || !shell) return;
    /* shell is position:fixed inset 0 — use window size (not shrunk by top bar) */
    var aw = Math.max(2, window.innerWidth || shell.clientWidth);
    var ah = Math.max(2, window.innerHeight || shell.clientHeight);
    var zoom = ah / (TILES_VIS * T);
    zoom = Math.max(0.85, Math.min(zoom, 2.0));
    var nextW = Math.max(240, Math.round(aw / zoom));
    var nextH = Math.max(240, Math.round(ah / zoom));
    /* keep design AR identical to frame AR to avoid even 1px letterbox */
    nextH = Math.max(240, Math.round(nextW * ah / aw));
    wrap.style.width = '100%';
    wrap.style.height = '100%';
    var cv = $('gameCanvas');
    if (cv) {
      cv.style.width = '100%';
      cv.style.height = '100%';
      cv.width = nextW;
      cv.height = nextH;
    }
    var fitKey = nextW + 'x' + nextH + '@' + zoom.toFixed(2);
    var changed = nextW !== W || nextH !== H;
    W = nextW;
    H = nextH;
    DRAW_H = Math.max(48, Math.round(H * CHAR_FRAC));
    try {
      var dbg = $('msg');
      if (dbg) dbg.setAttribute('data-fit', fitKey + ' shell=' + aw + 'x' + ah + ' char%=' + ((DRAW_H / H) * 100).toFixed(1));
    } catch (e0) {}
    if (typeof cc === 'undefined' || !cc.view) { lastFitKey = fitKey; return; }
    try {
      if (cc.view.setFrameSize) cc.view.setFrameSize(aw, ah);
      /* EXACT_FIT: stretch to fill — no black SHOW_ALL bars on widescreen */
      cc.view.setDesignResolutionSize(W, H, cc.ResolutionPolicy.EXACT_FIT);
      if (cc.director && cc.director.setClearColor) {
        /* night clear — avoid 开局闪棕; dirt bed still paints once scene builds */
        cc.director.setClearColor(cc.color(11, 21, 32, 255));
      }
      if (cc.view._resizeEvent) cc.view._resizeEvent();
    } catch (e) {}
    lastFitKey = fitKey;
    if (changed && sceneRef && !rebuilding && window.__playSceneCtor) {
      rebuilding = true;
      setTimeout(function () {
        try { cc.director.runScene(new window.__playSceneCtor()); } catch (e2) {}
        rebuilding = false;
      }, 0);
    }
  }

  /** Swamp preset ≈ level-design preset('swamp') when JSON empty — long runway content. */
  function swampPreset(DC, DR) {
    var tiles = [];
    var x;
    for (x = 0; x < DC; x++) tiles.push({ x: x, y: DR - 1, type: 'g' });
    /* 断坑放展示区之后（约 40%/70%），开局镜头先看火/旗/鳄 */
    [Math.max(5, Math.floor(DC * 0.42)), Math.max(7, Math.floor(DC * 0.72))].forEach(function (gx) {
      tiles = tiles.filter(function (t) { return !(t.x === gx && t.y === DR - 1); });
    });
    var at = function (f) { return Math.min(DC - 1, Math.max(0, Math.round(f * DC))); };
    /* 设计列仅作补充；真正开局可见位由 loadLevel earlyShowcase 钉死 */
    tiles.push({ x: at(0.06), y: DR - 2, type: 'coin' });
    tiles.push({ x: at(0.10), y: DR - 2, type: 'fire' });
    tiles.push({ x: at(0.16), y: DR - 2, type: 'fire' });
    tiles.push({ x: at(0.22), y: DR - 2, type: 'flag' });
    tiles.push({ x: at(0.50), y: DR - 2, type: 'spike' });
    tiles.push({ x: at(0.58), y: DR - 2, type: 'coin' });
    tiles.push({ x: at(0.78), y: DR - 2, type: 'spike' });
    return {
      version: '1.1', theme: 'swamp', cols: DC, rows: DR, tiles: tiles,
      traps: { spike: { interval: 3, up: 1, damage: 1 }, fire: { damage: 1, dur: 2, burn: 2 } },
      by: ''
    };
  }

  /** Mirror xy-go buildCustomDef X mapping. */
  function loadLevel() {
    var d;
    try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { d = null; }
    if (!d || typeof d !== 'object') d = swampPreset(12, 4);
    var tiles = Array.isArray(d.tiles) ? d.tiles.slice() : [];
    var traps = d.traps || {};
    var DC = Math.max(4, Math.min(40, d.cols | 0 || 12));
    var DR = Math.max(2, Math.min(8, d.rows | 0 || 4));
    if (!tiles.length && d.mine && Array.isArray(d.mine.map)) {
      for (var xi = 0; xi < DC; xi++) tiles.push({ x: xi, y: DR - 1, type: 'g' });
      d.mine.map.forEach(function (k, xi) {
        if (k) tiles.push({ x: xi, y: DR - 2, type: k });
      });
      if (d.mine.mp) {
        Object.keys(d.mine.mp).forEach(function (k) { traps[k] = traps[k] || d.mine.mp[k]; });
      }
    }
    if (!tiles.length) {
      var pre = swampPreset(DC, DR);
      tiles = pre.tiles;
      traps = pre.traps;
      d.theme = 'swamp';
    }
    var cols = PAD + DC * EXP + PAD + 10;
    var gx = function (x) { return PAD + (x | 0) * EXP + 2; };
    var groundCols = [];
    var x;
    for (x = 0; x < DC; x++) {
      var hasG = tiles.some(function (tt) {
        return tt && tt.x === x && tt.y === DR - 1 && (tt.type === 'g' || tt.type === 'p');
      });
      groundCols.push(hasG);
    }
    var items = [];
    tiles.forEach(function (tt) {
      if (!tt || tt.type === 'g' || tt.type === 'p') return;
      if ((tt.y | 0) >= DR - 1) return;
      items.push({ type: tt.type, c: gx(tt.x | 0), designX: tt.x | 0 });
    });
    /* 断坑：缺则补在展示区之后，避免开局掉坑 */
    var holeN = groundCols.filter(function (g) { return !g; }).length;
    if (holeN === 0 && DC >= 6) {
      groundCols[Math.max(5, Math.floor(DC * 0.42))] = false;
      groundCols[Math.max(7, Math.floor(DC * 0.72))] = false;
    }
    if (!traps.fire) traps.fire = { damage: 1, dur: 2, burn: 2 };
    if (!traps.spike) traps.spike = { interval: 3, up: 1, damage: 1 };

    /*
     * c19：开局一眼火×2+旗+鳄。宽屏保持 c17 列位；竖屏/窄屏按可见列压进首屏。
     * 世界列（T=40）：spawn≈2；桌面火5/8 旗10 鳄12；竖屏≈3/4/5/6。
     */
    var visCols = Math.max(5, Math.floor(W / T));
    var earlyFire1, earlyFire2, earlyFlag, earlyBoss, earlyCut;
    if (visCols < 14) {
      var base = 2, span = Math.max(4, visCols - 2);
      earlyFire1 = base + Math.max(1, Math.round(span * 0.22));
      earlyFire2 = base + Math.max(earlyFire1 - base + 1, Math.round(span * 0.42));
      earlyFlag = base + Math.max(earlyFire2 - base + 1, Math.round(span * 0.62));
      earlyBoss = base + Math.max(earlyFlag - base + 1, Math.round(span * 0.82));
      earlyCut = earlyBoss + 3;
    } else {
      earlyFire1 = 5; earlyFire2 = 8; earlyFlag = 10; earlyBoss = 12;
      earlyCut = 18;
    }
    items = items.filter(function (it) {
      if (it.type === 'fire' || it.type === 'flag') return false;
      if (it.type === 'spike' && (it.c | 0) < earlyCut) return false;
      return true;
    });
    items.push({ type: 'fire', c: earlyFire1, designX: -1 });
    items.push({ type: 'fire', c: earlyFire2, designX: -1 });
    items.push({ type: 'flag', c: earlyFlag, designX: -1 });
    /* 展示后再给刺，保证可玩压力仍在 */
    var hasLateSpike = items.some(function (it) { return it.type === 'spike'; });
    if (!hasLateSpike) {
      items.push({ type: 'spike', c: Math.max(earlyCut + 2, gx(Math.floor(DC * 0.50))), designX: -1 });
      items.push({ type: 'spike', c: Math.max(earlyCut + 8, gx(Math.floor(DC * 0.78))), designX: -1 });
    }

    var bossC = earlyBoss;
    var goalC = Math.min(cols - 5, Math.max(bossC + 14, gx(Math.floor(DC * 0.85))));

    return {
      version: d.version || '1.1',
      theme: d.theme || 'swamp',
      DC: DC, DR: DR, cols: cols, groundCols: groundCols,
      items: items, traps: traps,
      by: d.by || '',
      hook_seen: d.hook_seen || d.reflectHook || '',
      vs_expect: d.vs_expect || d.reflectExpect || '',
      spawnC: 2,
      goalC: goalC,
      bossC: bossC
    };
  }

  function buildSpikeTex() {
    var c = document.createElement('canvas'); c.width = 48; c.height = 28;
    var g = c.getContext('2d');
    for (var k = 0; k < 3; k++) {
      var sx = 2 + k * 15;
      g.fillStyle = '#e2e8f0'; g.beginPath(); g.moveTo(sx, 28); g.lineTo(sx + 7, 2); g.lineTo(sx + 14, 28); g.closePath(); g.fill();
      g.strokeStyle = '#64748b'; g.stroke();
    }
    return texFromCanvas(c);
  }
  function buildFireTex() {
    var c = document.createElement('canvas'); c.width = 28; c.height = 36;
    var g = c.getContext('2d');
    g.fillStyle = '#ff6b2d'; g.beginPath(); g.moveTo(14, 2); g.quadraticCurveTo(26, 18, 14, 34); g.quadraticCurveTo(2, 18, 14, 2); g.fill();
    g.fillStyle = '#ffe14a'; g.beginPath(); g.moveTo(14, 12); g.quadraticCurveTo(21, 22, 14, 32); g.quadraticCurveTo(7, 22, 14, 12); g.fill();
    return texFromCanvas(c);
  }
  function buildCoinTex() {
    var c = document.createElement('canvas'); c.width = 22; c.height = 22;
    var g = c.getContext('2d');
    g.fillStyle = '#f0c45a'; g.beginPath(); g.arc(11, 11, 10, 0, 7); g.fill();
    g.fillStyle = '#ffe7a0'; g.beginPath(); g.arc(11, 11, 5, 0, 7); g.fill();
    return texFromCanvas(c);
  }
  function buildStarTex() {
    var c = document.createElement('canvas'); c.width = 24; c.height = 24;
    var g = c.getContext('2d');
    g.fillStyle = '#ffe14a'; g.beginPath();
    for (var i = 0; i < 5; i++) {
      var a = -Math.PI / 2 + i * Math.PI * 2 / 5;
      var b = a + Math.PI / 5;
      g.lineTo(12 + Math.cos(a) * 11, 12 + Math.sin(a) * 11);
      g.lineTo(12 + Math.cos(b) * 5, 12 + Math.sin(b) * 5);
    }
    g.closePath(); g.fill();
    return texFromCanvas(c);
  }
  function buildFlagTex() {
    var c = document.createElement('canvas'); c.width = 28; c.height = 48;
    var g = c.getContext('2d');
    g.fillStyle = '#94a3b8'; g.fillRect(4, 2, 3, 44);
    g.fillStyle = '#4ea85c'; g.beginPath(); g.moveTo(7, 4); g.lineTo(26, 12); g.lineTo(7, 22); g.closePath(); g.fill();
    return texFromCanvas(c);
  }
  function buildShurikenTex() {
    var c = document.createElement('canvas'); c.width = 16; c.height = 16;
    var g = c.getContext('2d');
    g.fillStyle = '#cfd8e6';
    g.beginPath(); g.moveTo(8, 0); g.lineTo(10, 6); g.lineTo(16, 8); g.lineTo(10, 10); g.lineTo(8, 16); g.lineTo(6, 10); g.lineTo(0, 8); g.lineTo(6, 6); g.closePath(); g.fill();
    g.fillStyle = '#3b4590'; g.beginPath(); g.arc(8, 8, 2, 0, 7); g.fill();
    return texFromCanvas(c);
  }
  function buildCrocTex() {
    var c = document.createElement('canvas'); c.width = 96; c.height = 64;
    var g = c.getContext('2d');
    g.fillStyle = '#3f9a5c';
    g.beginPath(); g.ellipse(48, 40, 40, 18, 0, 0, 7); g.fill();
    g.fillStyle = '#2f7a46';
    g.beginPath(); g.ellipse(78, 36, 18, 10, 0, 0, 7); g.fill();
    g.fillStyle = '#bfe6a0';
    g.beginPath(); g.ellipse(40, 42, 16, 8, 0, 0, 7); g.fill();
    g.fillStyle = '#fff';
    for (var k = 0; k < 4; k++) {
      g.beginPath(); g.moveTo(68 + k * 5, 40); g.lineTo(70 + k * 5, 46); g.lineTo(72 + k * 5, 40); g.fill();
    }
    g.fillStyle = '#2f7a46';
    for (k = 0; k < 4; k++) { g.beginPath(); g.arc(28 + k * 12, 28, 3.2, 0, 7); g.fill(); }
    g.fillStyle = '#17301c';
    g.beginPath(); g.arc(82, 32, 3, 0, 7); g.fill();
    g.fillStyle = '#ffd34a';
    g.beginPath();
    g.moveTo(40, 8); g.lineTo(40, 2); g.lineTo(44, 6); g.lineTo(48, 0); g.lineTo(52, 6); g.lineTo(56, 2); g.lineTo(56, 8); g.fill();
    return texFromCanvas(c);
  }

  function updHUD(hp, coins) {
    var left = Math.max(0, hp);
    var hpEl = $('hp');
    if (hpEl) {
      /* Green chip bar like xy-go A绿 + hearts */
      var pct = Math.round((left / MAX_HP) * 100);
      hpEl.innerHTML = '<span class="hpchip">A 绿</span><span class="hpbar"><i style="width:' + pct + '%"></i></span>';
    }
    var c = $('coins');
    if (c) c.textContent = '🪙 ' + coins;
    var bossBar = $('bossBar');
    if (bossBar && sceneRef && sceneRef.boss) {
      var b = sceneRef.boss;
      /* 血条仅在鳄精灵进入镜头时亮 —— 避免「只见血条不见鳄」 */
      var onScreen = false;
      if (b.alive && typeof sceneRef.camX === 'number') {
        var bx = b.x;
        onScreen = bx > sceneRef.camX - 40 && bx < sceneRef.camX + W + 40;
      }
      if (b.alive && onScreen) {
        bossBar.classList.add('on');
        bossBar.querySelector('.bn').textContent = b.name;
        bossBar.querySelector('i').style.width = Math.round((b.hp / b.max) * 100) + '%';
      } else bossBar.classList.remove('on');
    }
  }
  function hideResult() { var r = $('result'); if (r) r.classList.remove('show', 'win', 'fail'); }
  function showResult(win, hp, coins) {
    var r = $('result'); if (!r) return;
    r.classList.add('show');
    $('resultBig').textContent = win ? '🎉 过关！' : '😵 再试一次';
    $('resultBig').style.color = win ? '#9ff0a8' : '#ffb4b4';
    $('resultSub').innerHTML = '剩 <b>' + hp + '❤</b> · 金币 <b style="color:#ffe7a0">' + coins + '</b>' +
      (level && level.vs_expect ? '<br>你预计：' + level.vs_expect : '<br>回上一页答：和预计一样吗？');
  }

  function bindControls() {
    function hold(btn, key, isJump, isThrow) {
      if (!btn) return;
      var down = function (e) {
        e.preventDefault();
        btn.classList.add('on');
        if (isJump) { if (!inp.jump) inp.jumpPressed = true; inp.jump = true; }
        else if (isThrow) { inp.throwPressed = true; }
        else inp[key] = true;
      };
      var up = function (e) {
        e.preventDefault();
        btn.classList.remove('on');
        if (isJump) inp.jump = false;
        else if (!isThrow) inp[key] = false;
      };
      btn.addEventListener('touchstart', down, { passive: false });
      btn.addEventListener('touchend', up, { passive: false });
      btn.addEventListener('touchcancel', up, { passive: false });
      btn.addEventListener('mousedown', down);
      btn.addEventListener('mouseup', up);
      btn.addEventListener('mouseleave', up);
    }
    hold($('btnL'), 'left', false, false);
    hold($('btnR'), 'right', false, false);
    hold($('btnJ'), 'jump', true, false);
    hold($('btnT'), 'throw', false, true);
    window.addEventListener('keydown', function (e) {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') inp.left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') inp.right = true;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'KeyK') {
        if (!inp.jump) inp.jumpPressed = true;
        inp.jump = true;
        e.preventDefault();
      }
      if (e.code === 'KeyF' || e.code === 'KeyJ') { inp.throwPressed = true; e.preventDefault(); }
    });
    window.addEventListener('keyup', function (e) {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') inp.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') inp.right = false;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'KeyK') inp.jump = false;
    });
  }

  var PlayLayer = cc.Layer.extend({
    ctor: function () {
      this._super();
      this.world = new cc.Node();
      this.addChild(this.world, 0);
      this.camX = 0;
      this.playing = false;
      this.won = false;
      this.dead = false;
      this.hp = MAX_HP;
      this.coins = 0;
      this.invuln = 0;
      this.frame = 0;
      this.frameT = 0;
      this.t0 = Date.now() / 1000;
      this.throws = [];
      this.fireflies = [];
      this._build();
      this.reset();
      this.scheduleUpdate();
      /* c19: reveal canvas only after night forest + ground exist — kill navy→brown flash */
      try {
        var cvShow = $('gameCanvas');
        if (cvShow) {
          requestAnimationFrame(function () { cvShow.style.opacity = '1'; });
        }
      } catch (eShow) {}
      return true;
    },
    _addNightBg: function () {
      var fallback = mkColor(W + 4, H + 4, 11, 21, 32);
      fallback.setPosition(-2, -2);
      this.addChild(fallback, -6);
      this.bgNode = null;
      this.bgNode2 = null;
      if (forestImg && forestImg.naturalWidth) {
        try {
          /* c19: Texture from already-decoded Image — no async path flash */
          var tex = new cc.Texture2D();
          tex.initWithElement(forestImg);
          tex.handleLoadedTexture();
          var sp = new cc.Sprite(tex);
          sp.setAnchorPoint(0, 0);
          this.addChild(sp, -5);
          this.bgNode = sp;
          this._layoutBg(0);
        } catch (e) {
          try {
            var sp2 = new cc.Sprite(BG);
            sp2.setAnchorPoint(0, 0);
            this.addChild(sp2, -5);
            this.bgNode = sp2;
            this._layoutBg(0);
          } catch (e2) {}
        }
      }
      /* soft vignette */
      var vig = mkColor(W, H, 8, 16, 28, 40);
      vig.setPosition(0, 0);
      this.addChild(vig, -3);
      /* fireflies (screen space) */
      this.ffLayer = new cc.Node();
      this.addChild(this.ffLayer, -2);
      var i;
      for (i = 0; i < 14; i++) {
        var dot = mkColor(4, 4, 234, 255, 154, 200);
        dot.setPosition(Math.random() * W, Math.random() * H * 0.7);
        this.ffLayer.addChild(dot);
        this.fireflies.push({ n: dot, phase: Math.random() * 6, spd: 0.6 + Math.random() });
      }
    },
    _layoutBg: function (camX) {
      if (!this.bgNode || !forestImg) return;
      var iw = forestImg.naturalWidth || 1600;
      var ih = forestImg.naturalHeight || 900;
      var scale = Math.max(W / iw, H / ih) * 1.08;
      var dw = iw * scale, dh = ih * scale;
      this.bgNode.setScale(scale);
      var parallax = (camX || 0) * 0.12;
      var ox = -((parallax % dw) + dw) % dw;
      var oy = H - dh + 8;
      this.bgNode.setPosition(ox, oy);
      if (!this.bgNode2) {
        try {
          var spB;
          if (forestImg && forestImg.naturalWidth) {
            var texB = new cc.Texture2D();
            texB.initWithElement(forestImg);
            texB.handleLoadedTexture();
            spB = new cc.Sprite(texB);
          } else {
            spB = new cc.Sprite(BG);
          }
          spB.setAnchorPoint(0, 0);
          spB.setScale(scale);
          this.addChild(spB, -5);
          this.bgNode2 = spB;
        } catch (e2) { this.bgNode2 = null; }
      }
      if (this.bgNode2) {
        this.bgNode2.setScale(scale);
        this.bgNode2.setPosition(ox + dw - 1, oy);
        this.bgNode2.setVisible(ox + dw < W + 2);
      }
    },
    _solidAt: function (c) {
      if (c < 0 || c >= level.cols) return true;
      if (c < PAD || c >= PAD + level.DC * EXP) return true;
      var dx = Math.floor((c - PAD) / EXP);
      if (level.groundCols[dx]) return true;
      /* 断坑仅挖 EXP 块正中 3 格（120px）——可一跳过去，像老版 */
      var local = (c - PAD) - dx * EXP;
      return !(local >= 2 && local <= 4);
    },
    _buildGround: function () {
      var cols = level.cols;
      var gy = this.gy;
      var c, x0, row, nRows;
      /* 泥土铺满画布底→草皮：多行 dirt，颜色像老版土层（忌近黑） */
      nRows = Math.max(3, Math.ceil(gy / T) + 1);
      var bed = mkColor(this.worldW + 120, gy + T * 2, 90, 58, 36);
      bed.setPosition(-60, 0);
      this.world.addChild(bed, 0);
      for (c = 0; c < cols; c++) {
        x0 = c * T;
        if (!this._solidAt(c)) {
          /* 断坑：深绿沼泽水填到坑底，两侧可见土层剖面 */
          var pit = mkColor(T + 1, gy, 28, 110, 96, 230);
          pit.setPosition(x0, 0);
          this.world.addChild(pit, 1);
          var gloss = mkColor(T + 1, 10, 60, 180, 150, 120);
          gloss.setPosition(x0, gy - 14);
          this.world.addChild(gloss, 2);
          continue;
        }
        for (row = 0; row < nRows; row++) {
          try {
            var dirt = new cc.Sprite(SC + 'dirt-tile.png');
            dirt.setAnchorPoint(0, 1);
            dirt.setPosition(x0, gy - row * T);
            dirt.setScale(T / 40);
            this.world.addChild(dirt, 2);
          } catch (eD) {
            var blk = mkColor(T + 1, T + 1, 107, 79, 47);
            blk.setPosition(x0, gy - (row + 1) * T);
            this.world.addChild(blk, 2);
          }
        }
        try {
          var cap = new cc.Sprite(SC + 'grass-cap.png');
          cap.setAnchorPoint(0, 0);
          cap.setPosition(x0, gy - 2);
          cap.setScaleX((T + 0.6) / 40);
          cap.setScaleY(16 / 18);
          this.world.addChild(cap, 3);
        } catch (eC) {
          var grass = mkColor(T + 1, 12, 63, 143, 74);
          grass.setPosition(x0, gy - 2);
          this.world.addChild(grass, 3);
        }
      }
    },
    _build: function () {
      level = loadLevel();
      this.worldW = level.cols * T;
      /* Grass ~42% up — thick dirt bed fills bottom (kills 18% black band under controls). */
      this.gy = Math.round(H * 0.42);
      this.gy = Math.max(110, Math.min(this.gy, H - 100));

      this._addNightBg();
      this._buildGround();

      this.traps = [];
      this.coinNodes = [];
      var items = level.items || [];
      var i, it, px;
      for (i = 0; i < items.length; i++) {
        it = items[i];
        px = it.c * T + T * 0.5;
        if (it.type === 'spike' || it.type === 'fire') {
          var base = mkColor(T * 0.85, 6, 58, 58, 66);
          base.setPosition(px - T * 0.42, this.gy - 4);
          this.world.addChild(base, 4);
          var sp = new cc.Sprite(it.type === 'fire' ? fireTex : spikeTex);
          sp.setAnchorPoint(0.5, 0);
          sp.setPosition(px, this.gy - 2);
          sp.setScale(it.type === 'fire' ? 1.85 : 1.15);
          sp.setVisible(it.type === 'fire');
          this.world.addChild(sp, 6);
          this.traps.push({ kind: it.type, x: px, sp: sp, w: T * 0.7 });
        } else if (it.type === 'coin') {
          var cn = new cc.Sprite(coinTex);
          cn.setPosition(px, this.gy + T * 0.9);
          this.world.addChild(cn, 5);
          this.coinNodes.push({ x: px, sp: cn, got: false });
        } else if (it.type === 'shield') {
          var st = new cc.Sprite(starTex);
          st.setPosition(px, this.gy + T * 0.95);
          this.world.addChild(st, 5);
          this.coinNodes.push({ x: px, sp: st, got: false, star: true });
        } else if (it.type === 'flag') {
          var midF = new cc.Sprite(flagTex);
          midF.setAnchorPoint(0.5, 0);
          midF.setPosition(px, this.gy);
          midF.setScale(1.55);
          this.world.addChild(midF, 5);
        }
      }

      var flag = new cc.Sprite(flagTex);
      flag.setAnchorPoint(0.5, 0);
      this.goalX = level.goalC * T + T * 0.5;
      flag.setPosition(this.goalX, this.gy);
      flag.setScale(1.35);
      this.world.addChild(flag, 5);

      /* 鳄鱼王 */
      this.boss = {
        name: '鳄鱼王', max: 3, hp: 3, alive: true,
        x: level.bossC * T + T * 0.5, y: this.gy,
        dir: -1, hurtT: 0
      };
      this.bossSp = new cc.Sprite(crocTex);
      this.bossSp.setAnchorPoint(0.5, 0);
      this.bossSp.setPosition(this.boss.x, this.boss.y);
      this.bossSp.setScale(Math.max(1.85, DRAW_H * 1.5 / 64));
      this.world.addChild(this.bossSp, 8);
      this.bossSp.setVisible(true);

      this.ninja = new cc.Sprite(SP + 'idle.png');
      this.ninja.setAnchorPoint(0.5, 0);
      var sz = this.ninja.getContentSize();
      var texH = idleTexH;
      if (sz && sz.height > 8) texH = sz.height;
      /* Critical: never ||100 — that made desktop ninja ~2.4× too tall when contentSize was 0. */
      this.nScale = DRAW_H / Math.max(texH, 1);
      this.ninja.setScale(this.nScale);
      this.world.addChild(this.ninja, 10);
      this.walk = [SP + 'walk_0.png', SP + 'walk_1.png', SP + 'walk_2.png', SP + 'walk_3.png'];

      var lvEl = $('lvlChip');
      if (lvEl) lvEl.textContent = '第9关 我的关卡';
      var iv = (level.traps.spike && +level.traps.spike.interval) || 3;
      $('msg').textContent = (level.by ? level.by + ' · ' : '') + '沼泽·刺每' + iv + '秒 · 跳/投打鳄王';
    },
    reset: function () {
      this.px = level.spawnC * T + T * 0.5;
      this.py = this.gy;
      this.vx = 0;
      this.vy = 0;
      this.grounded = true;
      this.face = 1;
      this.hp = MAX_HP;
      this.coins = 0;
      this.invuln = 0;
      this.playing = true;
      this.won = false;
      this.dead = false;
      this.t0 = Date.now() / 1000;
      this.hitKeys = {};
      this.throws.forEach(function (t) { if (t.sp) t.sp.removeFromParent(); });
      this.throws = [];
      this.coinNodes.forEach(function (c) { c.got = false; c.sp.setVisible(true); c.sp.setOpacity(255); });
      if (this.boss) {
        this.boss.hp = this.boss.max;
        this.boss.alive = true;
        this.boss.hurtT = 0;
        this.bossSp.setVisible(true);
        this.bossSp.setOpacity(255);
        this.bossSp.setPosition(this.boss.x, this.boss.y);
      }
      this.ninja.setPosition(this.px, this.py);
      this.ninja.setTexture(SP + 'idle.png');
      this.ninja.setOpacity(255);
      this.camX = Math.max(0, this.px - W * camBias());
      this.world.setPosition(-this.camX, 0);
      this._layoutBg(this.camX);
      hideResult();
      updHUD(this.hp, this.coins);
      inp.jumpPressed = false;
      inp.throwPressed = false;
    },
    _groundYAt: function (px) {
      var c = Math.floor(px / T);
      if (!this._solidAt(c)) return -9999;
      return this.gy;
    },
    update: function (dt) {
      try {
        if (!this.playing) return;
        if (dt > 0.05) dt = 0.05;
        var now = Date.now() / 1000;
        var elapsed = now - this.t0;
        var i;

        /* fireflies drift */
        for (i = 0; i < this.fireflies.length; i++) {
          var ff = this.fireflies[i];
          var ox = (i * 97 + elapsed * 14 * ff.spd) % (W + 30) - 10;
          var oy = H * 0.38 + Math.sin(elapsed * 2 + ff.phase) * 24 + (i % 5) * 16;
          ff.n.setPosition(ox, oy);
          ff.n.setOpacity(90 + Math.floor((Math.sin(elapsed * 5 + i) * 0.5 + 0.5) * 140));
        }

        var speed = 200; /* ≈ xy-go MOVE */
        if (inp.left && !inp.right) { this.vx = -speed; this.face = -1; }
        else if (inp.right && !inp.left) { this.vx = speed; this.face = 1; }
        else this.vx *= Math.max(0, 1 - dt * 12);

        if (this.grounded && inp.jumpPressed) {
          this.vy = 680; /* ≈ xy-go JUMP_V — 3-tile pit jumpable */
          this.grounded = false;
          this.ninja.setTexture(SP + 'jump_0.png');
        }
        inp.jumpPressed = false;

        if (inp.throwPressed) {
          inp.throwPressed = false;
          if (this.throws.length < 3) {
            var sh = new cc.Sprite(shurikenTex);
            sh.setPosition(this.px + this.face * 18, this.py + DRAW_H * 0.55);
            this.world.addChild(sh, 12);
            this.throws.push({ sp: sh, x: this.px + this.face * 18, y: this.py + DRAW_H * 0.55, vx: this.face * 280, life: 1.2 });
          }
        }

        this.vy -= 1650 * dt; /* ≈ xy-go GRAV */
        if (this.vy < -980) this.vy = -980;
        this.px += this.vx * dt;
        this.py += this.vy * dt;
        if (this.px < T * 0.5) this.px = T * 0.5;
        if (this.px > this.worldW - T * 0.5) this.px = this.worldW - T * 0.5;

        var gY = this._groundYAt(this.px);
        if (this.py <= gY && this.vy <= 0 && gY > -1000) {
          this.py = gY;
          this.vy = 0;
          this.grounded = true;
        } else if (gY < -1000 && this.py < this.gy - 80) {
          /* fell in pit */
          if (this.invuln <= 0) {
            this.hp -= 1;
            this.invuln = 1.0;
            this.px = Math.max(T, this.px - T * 3);
            this.py = this.gy + 10;
            this.vy = 0;
            updHUD(this.hp, this.coins);
            if (this.hp <= 0) {
              this.hp = 0; this.dead = true; this.playing = false;
              showResult(false, 0, this.coins);
            }
          }
        } else {
          this.grounded = false;
        }

        this.ninja.setPosition(this.px, this.py);
        this.ninja.setScaleX(this.face * this.nScale);
        this.ninja.setScaleY(this.nScale);

        if (!this.grounded) this.ninja.setTexture(SP + 'jump_0.png');
        else if (Math.abs(this.vx) > 20) {
          this.frameT += dt;
          if (this.frameT > 0.1) { this.frameT = 0; this.frame = (this.frame + 1) % 4; }
          this.ninja.setTexture(this.walk[this.frame]);
        } else this.ninja.setTexture(SP + 'idle.png');

        if (this.invuln > 0) {
          this.invuln -= dt;
          this.ninja.setOpacity((Math.floor(this.invuln * 20) % 2) ? 90 : 255);
        } else this.ninja.setOpacity(255);

        /* traps */
        var spk = level.traps.spike || {};
        var I = Math.max(0.6, +spk.interval || 3);
        var upDur = Math.max(0.25, +spk.up || 1);
        var phase = elapsed % I;
        var spikeUp = phase < upDur;
        var fire = level.traps.fire || {};
        var dmgS = Math.max(1, +spk.damage || 1);
        var dmgF = Math.max(1, +fire.damage || 1);

        for (i = 0; i < this.traps.length; i++) {
          var tr = this.traps[i];
          var raised = tr.kind === 'fire' ? true : spikeUp;
          tr.sp.setVisible(raised);
          if (raised && this.invuln <= 0) {
            var near = Math.abs(this.px - tr.x) < tr.w && this.py < this.gy + DRAW_H * 0.7;
            var key = tr.kind + ':' + i + ':' + Math.floor(elapsed / I);
            if (near && !this.hitKeys[key]) {
              this.hitKeys[key] = 1;
              this.hp -= (tr.kind === 'fire' ? dmgF : dmgS);
              this.invuln = 1.0;
              this.ninja.setTexture(SP + 'knock_0.png');
              updHUD(this.hp, this.coins);
              if (this.hp <= 0) {
                this.hp = 0; this.dead = true; this.playing = false;
                showResult(false, 0, this.coins);
                $('msg').textContent = '掉光了 · 点重来';
              }
            }
          }
        }

        for (i = 0; i < this.coinNodes.length; i++) {
          var cn = this.coinNodes[i];
          if (cn.got) continue;
          cn.sp.setPosition(cn.x, this.gy + T * 0.85 + Math.sin(now * 5 + i) * 4);
          if (Math.abs(this.px - cn.x) < T * 0.7 && this.py < this.gy + DRAW_H) {
            cn.got = true; cn.sp.setVisible(false);
            this.coins += cn.star ? 0 : 1;
            if (cn.star) this.invuln = Math.max(this.invuln, 3);
            updHUD(this.hp, this.coins);
          }
        }

        /* boss patrol + contact */
        if (this.boss && this.boss.alive) {
          this.boss.hurtT = Math.max(0, this.boss.hurtT - dt);
          var bx = this.boss.x + Math.sin(elapsed * 0.7) * 18;
          this.bossSp.setPosition(bx, this.boss.y);
          this.bossSp.setScaleX((this.px < bx ? -1 : 1) * Math.max(1.85, DRAW_H * 1.5 / 64));
          if (this.boss.hurtT > 0) this.bossSp.setOpacity(120 + (Math.floor(this.boss.hurtT * 20) % 2) * 100);
          else this.bossSp.setOpacity(255);
          if (this.invuln <= 0 && Math.abs(this.px - bx) < T * 1.2 && this.py < this.gy + DRAW_H) {
            this.hp -= 1;
            this.invuln = 1.0;
            this.vx = (this.px < bx ? -1 : 1) * 120;
            this.ninja.setTexture(SP + 'knock_0.png');
            updHUD(this.hp, this.coins);
            if (this.hp <= 0) {
              this.hp = 0; this.dead = true; this.playing = false;
              showResult(false, 0, this.coins);
            }
          }
        }

        /* shurikens */
        for (i = this.throws.length - 1; i >= 0; i--) {
          var th = this.throws[i];
          th.life -= dt;
          th.x += th.vx * dt;
          th.sp.setPosition(th.x, th.y);
          th.sp.setRotation(th.sp.getRotation() + dt * 720);
          var hitBoss = this.boss && this.boss.alive && Math.abs(th.x - this.bossSp.getPositionX()) < T * 1.4 && Math.abs(th.y - (this.boss.y + 30)) < 40;
          if (hitBoss && this.boss.hurtT <= 0) {
            this.boss.hp -= 1;
            this.boss.hurtT = 0.4;
            updHUD(this.hp, this.coins);
            if (this.boss.hp <= 0) {
              this.boss.alive = false;
              this.bossSp.setVisible(false);
              $('msg').textContent = '鳄王倒下！冲向旗杆';
              var bb = $('bossBar'); if (bb) bb.classList.remove('on');
            }
            th.life = 0;
          }
          if (th.life <= 0) {
            th.sp.removeFromParent();
            this.throws.splice(i, 1);
          }
        }

        if (!this.won && this.px >= this.goalX - T * 0.4 && (!this.boss || !this.boss.alive)) {
          this.won = true; this.playing = false;
          showResult(true, this.hp, this.coins);
          $('msg').textContent = '到旗了！';
        } else if (!this.won && this.px >= this.goalX - T * 0.4 && this.boss && this.boss.alive) {
          $('msg').textContent = '先投中鳄王再冲旗！';
        }

        var target = this.px - W * camBias();
        if (target < 0) target = 0;
        if (target > this.worldW - W) target = Math.max(0, this.worldW - W);
        this.camX += (target - this.camX) * Math.min(1, dt * 8);
        this.world.setPosition(-this.camX, 0);
        this._layoutBg(this.camX);
      } catch (e) { bootErr(String(e && e.message || e)); }
    }
  });


  /* —— PeerJS 联机 (同 xy-go：Peer + BroadcastChannel) —— */
  var NET_PREFIX = 'sycocos1';
  var NET_PEER_OPTS = {
    debug: 0, host: '0.peerjs.com', port: 443, path: '/', secure: true, key: 'peerjs',
    config: { iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
    ] }
  };
  var netRole = null, netPeer = null, netConn = null, netLinked = false, netCode = '';
  var netTransport = null, netBcSession = '', netBC = null, netP2 = null;
  try { netBC = new BroadcastChannel('sycocos-coop-v1'); } catch (eN) { netBC = null; }

  function netRoomId() {
    var slot = Math.floor(Date.now() / 60000) % 1000;
    return NET_PREFIX + '-c-' + slot;
  }
  function netBanner(t, ok) {
    var b = $('netBanner');
    if (!b) return;
    b.textContent = t || '';
    b.classList.toggle('on', !!t);
    b.style.color = ok ? '#9ff0a8' : '#ffe7a0';
  }
  function netPanel(on, wait) {
    var p = $('netPanel');
    if (!p) return;
    if (on) {
      p.classList.add('on');
      p.style.display = 'flex';
    } else {
      p.classList.remove('on');
      p.style.display = 'none';
    }
    if (wait && $('netWait')) $('netWait').textContent = wait;
    var st = $('netStart');
    if (st) st.style.display = (netRole === 'host' && netLinked) ? 'inline-flex' : 'none';
  }
  function netSend(obj) {
    try {
      if (netTransport === 'bc' && netBC) netBC.postMessage(Object.assign({ session: netBcSession }, obj));
      else if (netConn && netConn.open) netConn.send(obj);
    } catch (e) {}
  }
  function netOnMsg(msg) {
    if (!msg || !msg.t) return;
    if (msg.t === 'hello' && netRole === 'guest') {
      netBanner('已连上队友', true);
      netPanel(true, '已准备！等房主点「开始游戏」');
    }
    if (msg.t === 'go') {
      netPanel(false);
      netBanner('联机中 · ' + (netRole === 'host' ? '房主' : '玩家B'), true);
      if (sceneRef) sceneRef.reset();
    }
    if (msg.t === 'inp' && netRole === 'host' && sceneRef && sceneRef.p2) {
      var p2 = sceneRef.p2;
      p2._nl = !!msg.left; p2._nr = !!msg.right; p2._nj = !!msg.jump; p2._nt = !!msg.throw;
    }
    if (msg.t === 'snap' && netRole === 'guest' && sceneRef) {
      if (msg.x != null) { sceneRef.px = msg.x; sceneRef.py = msg.y; }
      if (msg.p2x != null && sceneRef.p2) {
        sceneRef.p2.x = msg.p2x; sceneRef.p2.y = msg.p2y;
        if (sceneRef.p2.sp) sceneRef.p2.sp.setPosition(msg.p2x, msg.p2y);
      }
      if (msg.bhp != null && sceneRef.boss) {
        sceneRef.boss.hp = msg.bhp;
        sceneRef.boss.alive = !!msg.balive;
        if (sceneRef.bossSp) sceneRef.bossSp.setVisible(sceneRef.boss.alive);
        updHUD(sceneRef.hp, sceneRef.coins);
      }
    }
    if (msg.t === 'bc-offer' && !netLinked && netRole !== 'host') {
      netTransport = 'bc'; netBcSession = msg.session; netCode = msg.id || netCode;
      netRole = 'guest'; netLinked = true;
      netBanner('已连上·同机', true);
      netPanel(true, '已准备！等房主点「开始游戏」');
      netSend({ t: 'bc-ok', session: netBcSession });
    }
    if (msg.t === 'bc-ok' && netRole === 'host' && !netLinked) {
      netTransport = 'bc'; netBcSession = msg.session || netBcSession;
      netLinked = true;
      netBanner('玩家B已加入·同机', true);
      netPanel(true, '队友已到！点「开始游戏」');
      netSend({ t: 'hello', role: 'host' });
    }
  }
  function netWireConn(conn) {
    netConn = conn;
    conn.on('open', function () {
      netLinked = true; netTransport = 'peer';
      netBanner(netRole === 'host' ? '玩家B已加入' : '已连上房主', true);
      netPanel(true, netRole === 'host' ? '队友已到！点「开始游戏」' : '已准备！等房主开始');
      if (netRole === 'host') netSend({ t: 'hello', role: 'host' });
    });
    conn.on('data', netOnMsg);
    conn.on('close', function () { netLinked = false; netBanner('连接断开', false); });
  }
  function netStartMatch() {
    if (typeof Peer === 'undefined') {
      netPanel(true, 'PeerJS 未加载，用同页 BroadcastChannel 试同机…');
      netRole = 'host'; netCode = netRoomId();
      netBcSession = 's' + Date.now();
      if (netBC) netBC.postMessage({ t: 'bc-offer', session: netBcSession, id: netCode });
      return;
    }
    netPanel(true, '正在匹配队友（PeerJS）…');
    netBanner('匹配中…', false);
    netCode = netRoomId();
    netRole = null; netLinked = false;
    try { if (netPeer) netPeer.destroy(); } catch (e) {}
    /* Try host first on this minute's room id */
    netPeer = new Peer(netCode, NET_PEER_OPTS);
    var hosted = false;
    netPeer.on('open', function (id) {
      hosted = true; netRole = 'host'; netCode = id;
      netPanel(true, '开房成功 · 等另一位也点「联机游玩」');
      netBanner('房主 · ' + id.slice(-6), false);
      netBcSession = 's' + Date.now();
      if (netBC) netBC.postMessage({ t: 'bc-offer', session: netBcSession, id: netCode });
    });
    netPeer.on('connection', function (conn) { netWireConn(conn); });
    netPeer.on('error', function (err) {
      if (hosted) return;
      /* id taken → join as guest */
      try { netPeer.destroy(); } catch (e2) {}
      netRole = 'guest';
      netPeer = new Peer(NET_PEER_OPTS);
      netPeer.on('open', function () {
        netPanel(true, '发现房间，正在连接…');
        var c = netPeer.connect(netCode, { reliable: true });
        netWireConn(c);
      });
      netPeer.on('error', function () {
        netPanel(true, '匹配失败，可重试或同机开两页');
      });
    });
  }
  function netBindUI() {
    var btn = $('btnNet');
    if (btn) {
      btn.onclick = function (ev) {
        if (ev) ev.preventDefault();
        netPanel(true, '正在打开联机…');
        netStartMatch();
      };
    }
    var cancel = $('netCancel');
    if (cancel) cancel.onclick = function () {
      netPanel(false); netBanner('', false);
      try { if (netPeer) netPeer.destroy(); } catch (e) {}
      netRole = null; netLinked = false;
    };
    var start = $('netStart');
    if (start) start.onclick = function () {
      if (netRole !== 'host' || !netLinked) return;
      netSend({ t: 'go' });
      netPanel(false);
      netBanner('联机中 · 房主', true);
      if (sceneRef) {
        /* spawn p2 ghost */
        if (!sceneRef.p2) {
          var sp = new cc.Sprite(SP + 'idle.png');
          sp.setAnchorPoint(0.5, 0);
          sp.setScale(sceneRef.nScale);
          sp.setOpacity(200);
          sceneRef.world.addChild(sp, 9);
          sceneRef.p2 = { sp: sp, x: sceneRef.px - 40, y: sceneRef.py, _nl: false, _nr: false, _nj: false, _nt: false };
        }
        sceneRef.reset();
      }
    };
    if (netBC) {
      netBC.onmessage = function (ev) { netOnMsg(ev && ev.data); };
    }
  }
  /* host snaps + applies p2 input each frame (hooked from PlayLayer.update) */
  var _origUpdate = null;
  function netAttachUpdate(layer) {
    if (!layer || layer._netHooked) return;
    layer._netHooked = true;
    var prev = layer.update.bind(layer);
    layer.update = function (dt) {
      prev(dt);
      if (!netLinked || !this.playing) return;
      if (netRole === 'host') {
        if (this.p2) {
          var spd = 140;
          if (this.p2._nl && !this.p2._nr) this.p2.x -= spd * dt;
          if (this.p2._nr && !this.p2._nl) this.p2.x += spd * dt;
          if (this.p2._nj) { this.p2.y = this.gy + 40; this.p2._nj = false; }
          else this.p2.y = this.gy;
          if (this.p2.sp) this.p2.sp.setPosition(this.p2.x, this.p2.y);
          if (this.p2._nt) {
            this.p2._nt = false;
            /* guest throw → damage boss from host */
            if (this.boss && this.boss.alive && this.boss.hurtT <= 0 && Math.abs(this.p2.x - this.boss.x) < T * 4) {
              this.boss.hp -= 1; this.boss.hurtT = 0.4;
              if (this.boss.hp <= 0) { this.boss.alive = false; this.bossSp.setVisible(false); }
              updHUD(this.hp, this.coins);
            }
          }
        }
        netSend({
          t: 'snap', x: this.px, y: this.py,
          p2x: this.p2 ? this.p2.x : 0, p2y: this.p2 ? this.p2.y : 0,
          bhp: this.boss ? this.boss.hp : 0, balive: !!(this.boss && this.boss.alive)
        });
      } else if (netRole === 'guest') {
        netSend({ t: 'inp', left: inp.left, right: inp.right, jump: inp.jumpPressed || inp.jump, throw: false });
        /* guest throw edge */
        if (inp.throwPressed) netSend({ t: 'inp', left: inp.left, right: inp.right, jump: false, throw: true });
      }
    };
  }

  function boot() {
    if (typeof cc === 'undefined') { bootErr('Cocos 未加载'); return; }
    window.addEventListener('error', function (e) { bootErr(e.message || String(e)); });
    bindControls();
    netBindUI(); /* c16: was defined but never called — 联机按钮无 handler */
    updateOrientTip();
    fitStage();
    window.addEventListener('resize', fitStage);
    window.addEventListener('orientationchange', function () { setTimeout(fitStage, 120); });

    var PlayScene = cc.Scene.extend({
      onEnter: function () {
        this._super();
        sceneRef = new PlayLayer();
        this.addChild(sceneRef);
        netAttachUpdate(sceneRef);
      }
    });
    window.__playSceneCtor = PlayScene;

    $('retry').onclick = function () { if (sceneRef) sceneRef.reset(); };
    $('again').onclick = function () { if (sceneRef) sceneRef.reset(); };

    function startEngine() {
      cc.game.onStart = function () {
        try {
          cc.view.enableRetina(false);
          cc.view.adjustViewPort(true);
          fitStage();
          cc.view.setDesignResolutionSize(W, H, cc.ResolutionPolicy.EXACT_FIT);
          if (cc.director && cc.director.setClearColor) {
            cc.director.setClearColor(cc.color(11, 21, 32, 255));
          }
          spikeTex = buildSpikeTex();
          fireTex = buildFireTex();
          coinTex = buildCoinTex();
          starTex = buildStarTex();
          flagTex = buildFlagTex();
          shurikenTex = buildShurikenTex();
          crocTex = buildCrocTex();
          var others = RES.filter(function (s) { return s.indexOf('canopy-night') < 0; });
          var left = others.length;
          function tick() {
            left--;
            if (left > 0) return;
            fitStage();
            cc.director.runScene(new PlayScene());
            $('msg').textContent = '第9关沼泽 · ←→跳 · F/J投';
            setTimeout(fitStage, 50);
          }
          if (!others.length) { left = 1; tick(); return; }
          others.forEach(function (src) {
            var img = new Image();
            img.onload = function () {
              try { cc.textureCache.addImage(src); } catch (e1) {}
              if (src.indexOf('idle.png') >= 0 && img.naturalHeight) idleTexH = img.naturalHeight;
              tick();
            };
            img.onerror = function () { bootErr('图片失败 ' + src); tick(); };
            img.src = src;
          });
        } catch (e) { bootErr('启动失败：' + e); }
      };
      try { cc.game.run('gameCanvas'); } catch (e) { bootErr('启动失败：' + e); }
    }

    /* c19: decode night forest BEFORE Cocos first GL clear — CSS already shows it under opacity:0 canvas */
    var pre = new Image();
    pre.onload = function () {
      forestImg = pre;
      try { if (typeof cc !== 'undefined' && cc.textureCache) cc.textureCache.addImage(BG); } catch (e0) {}
      startEngine();
    };
    pre.onerror = function () { bootErr('夜林背景失败'); startEngine(); };
    pre.src = BG;
  }

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
})();
