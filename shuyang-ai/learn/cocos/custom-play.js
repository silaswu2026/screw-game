/**
 * 玩我的关 — landscape side-view (960×600 base)
 * Landscape/desktop: contain letterbox at 16:10 (no squash, full height).
 * Portrait: full-bleed tall design (same width world, extended sky) so no dwarf strip / void bottom.
 */
(function () {
  var KEY = 'xygo-custom-level';
  var SP = '../../../xy-go/sprites/green/';
  var RES = [SP + 'walk_0.png', SP + 'walk_1.png', SP + 'walk_2.png', SP + 'walk_3.png',
    SP + 'idle.png', SP + 'knock_0.png', SP + 'jump_0.png'];
  var W = 960, BASE_H = 600, H = 600, T = 80, MAX_HP = 6;
  var sceneRef = null, spikeTex = null, cloudTex = null, hillTex = null, fireTex = null, coinTex = null, flagTex = null;
  var level = null, lastFitKey = '', rebuilding = false;
  var inp = { left: false, right: false, jump: false, jumpPressed: false };

  function $(id) { return document.getElementById(id); }
  function bootErr(m) { var b = $('boot'); if (!b) return; b.textContent = m; b.className = 'err'; }
  function mkColor(w, h, r, g, b, a) { return new cc.LayerColor(cc.color(r, g, b, a == null ? 255 : a), w, h); }
  function texFromCanvas(cv) { var tex = new cc.Texture2D(); tex.initWithElement(cv); tex.handleLoadedTexture(); return tex; }

  function updateOrientTip() {
    var tip = $('orientTip');
    if (!tip) return;
    tip.classList.toggle('on', window.innerHeight > window.innerWidth);
  }

  function isPortrait() { return window.innerHeight > window.innerWidth; }

  /** Size stage: landscape = 16:10 contain letterbox; portrait = full-bleed tall design (no void strip). */
  function fitStage() {
    updateOrientTip();
    var wrap = $('cvwrap');
    var shell = $('shell');
    if (!wrap || !shell) return;
    var portrait = isPortrait();
    var aw = Math.max(2, shell.clientWidth || window.innerWidth);
    var ah = Math.max(2, shell.clientHeight || Math.max(160, window.innerHeight - 40));
    var dw, dh, nextH;
    if (portrait) {
      /* Full-bleed: design height matches shell AR so SHOW_ALL fills with extended sky */
      dw = aw; dh = ah;
      nextH = Math.max(BASE_H, Math.round(W * ah / aw));
    } else {
      nextH = BASE_H;
      var ar = W / BASE_H;
      if (aw / ah > ar) { dh = ah; dw = Math.round(ah * ar); }
      else { dw = aw; dh = Math.round(aw / ar); }
    }
    wrap.style.width = dw + 'px';
    wrap.style.height = dh + 'px';
    var cv = $('gameCanvas');
    if (cv) {
      cv.style.width = dw + 'px'; cv.style.height = dh + 'px';
      cv.width = W; cv.height = nextH; /* buffer matches design */
    }
    var fitKey = (portrait ? 'p' : 'l') + ':' + nextH + ':' + dw + 'x' + dh;
    var hChanged = nextH !== H;
    H = nextH;
    try {
      var dbg = $('msg');
      if (dbg) dbg.setAttribute('data-fit', fitKey + ' shell=' + aw + 'x' + ah);
    } catch (e0) {}
    if (typeof cc === 'undefined' || !cc.view) { lastFitKey = fitKey; return; }
    try {
      if (cc.view.setFrameSize) cc.view.setFrameSize(dw, dh);
      cc.view.setDesignResolutionSize(W, H, cc.ResolutionPolicy.SHOW_ALL);
      if (cc.view._resizeEvent) cc.view._resizeEvent();
    } catch (e) { /* ignore */ }
    lastFitKey = fitKey;
    if (hChanged && sceneRef && !rebuilding && window.__playSceneCtor) {
      rebuilding = true;
      setTimeout(function () {
        try { cc.director.runScene(new window.__playSceneCtor()); } catch (e2) {}
        rebuilding = false;
      }, 0);
    }
  }

  function loadLevel() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
      var tiles = Array.isArray(d.tiles) ? d.tiles : [];
      var traps = d.traps || {};
      var cols = Math.max(6, Math.min(24, d.cols | 0 || 12));
      var rows = Math.max(2, Math.min(8, d.rows | 0 || 4));
      var cells = [];
      for (var x = 0; x < cols; x++) cells[x] = null;
      tiles.forEach(function (t) {
        if (!t || t.type === 'g' || t.type === 'p') return;
        if ((t.y | 0) >= rows - 1) return;
        cells[t.x | 0] = t.type;
      });
      if (!tiles.length && d.mine && Array.isArray(d.mine.map)) {
        d.mine.map.forEach(function (k, x) { if (k) cells[x] = k; });
        if (d.mine.mp) {
          Object.keys(d.mine.mp).forEach(function (k) { traps[k] = traps[k] || d.mine.mp[k]; });
        }
      }
      if (!cells.some(Boolean)) {
        cells[3] = 'spike'; cells[6] = 'coin'; cells[9] = 'spike';
        traps.spike = traps.spike || { interval: 3, up: 1, damage: 1 };
      }
      return {
        version: d.version || '1.1', cols: cols, cells: cells, traps: traps,
        hook_seen: d.hook_seen || d.reflectHook || '',
        vs_expect: d.vs_expect || d.reflectExpect || '',
        by: d.by || ''
      };
    } catch (e) {
      var a = []; for (var i = 0; i < 12; i++) a[i] = null;
      a[3] = 'spike'; a[7] = 'coin'; a[10] = 'fire';
      return { cols: 12, cells: a, traps: { spike: { interval: 3, up: 1, damage: 1 }, fire: { damage: 1, dur: 2 } }, version: '1.1' };
    }
  }

  function buildSpikeTex() {
    var c = document.createElement('canvas'); c.width = 64; c.height = 36;
    var g = c.getContext('2d');
    for (var k = 0; k < 4; k++) {
      var sx = 2 + k * 15;
      g.fillStyle = '#e2e8f0'; g.beginPath(); g.moveTo(sx, 36); g.lineTo(sx + 7.5, 2); g.lineTo(sx + 15, 36); g.closePath(); g.fill();
      g.strokeStyle = '#64748b'; g.stroke();
    }
    g.fillStyle = '#334155'; g.fillRect(0, 32, 64, 4);
    return texFromCanvas(c);
  }
  function buildCloudTex() {
    var c = document.createElement('canvas'); c.width = 120; c.height = 48;
    var g = c.getContext('2d'); g.fillStyle = 'rgba(255,255,255,0.5)';
    function blob(x, y, r) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    blob(36, 28, 18); blob(58, 22, 22); blob(82, 28, 16);
    return texFromCanvas(c);
  }
  function buildHillTex() {
    var c = document.createElement('canvas'); c.width = 280; c.height = 90;
    var g = c.getContext('2d');
    g.fillStyle = '#2d4a6e'; g.beginPath(); g.moveTo(0, 90); g.quadraticCurveTo(70, 10, 140, 70); g.quadraticCurveTo(200, 20, 280, 90); g.closePath(); g.fill();
    return texFromCanvas(c);
  }
  function buildFireTex() {
    var c = document.createElement('canvas'); c.width = 40; c.height = 52;
    var g = c.getContext('2d');
    g.fillStyle = '#ff6b2d'; g.beginPath(); g.moveTo(20, 2); g.quadraticCurveTo(38, 26, 20, 50); g.quadraticCurveTo(2, 26, 20, 2); g.fill();
    g.fillStyle = '#ffe14a'; g.beginPath(); g.moveTo(20, 16); g.quadraticCurveTo(30, 32, 20, 46); g.quadraticCurveTo(10, 32, 20, 16); g.fill();
    return texFromCanvas(c);
  }
  function buildCoinTex() {
    var c = document.createElement('canvas'); c.width = 32; c.height = 32;
    var g = c.getContext('2d');
    g.fillStyle = '#f0c45a'; g.beginPath(); g.arc(16, 16, 14, 0, 7); g.fill();
    g.fillStyle = '#ffe7a0'; g.beginPath(); g.arc(16, 16, 8, 0, 7); g.fill();
    return texFromCanvas(c);
  }
  function buildFlagTex() {
    var c = document.createElement('canvas'); c.width = 40; c.height = 56;
    var g = c.getContext('2d');
    g.fillStyle = '#94a3b8'; g.fillRect(6, 4, 4, 52);
    g.fillStyle = '#4ea85c'; g.beginPath(); g.moveTo(10, 6); g.lineTo(36, 16); g.lineTo(10, 28); g.closePath(); g.fill();
    return texFromCanvas(c);
  }

  function updHUD(hp, coins) {
    var left = Math.max(0, hp);
    $('hp').innerHTML = '❤'.repeat(left) + '🤍'.repeat(MAX_HP - left);
    $('coins').textContent = '🪙 ' + coins;
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
    function hold(btn, key, isJump) {
      if (!btn) return;
      var down = function (e) {
        e.preventDefault();
        btn.classList.add('on');
        if (isJump) { if (!inp.jump) inp.jumpPressed = true; inp.jump = true; }
        else inp[key] = true;
      };
      var up = function (e) {
        e.preventDefault();
        btn.classList.remove('on');
        if (isJump) inp.jump = false;
        else inp[key] = false;
      };
      btn.addEventListener('touchstart', down, { passive: false });
      btn.addEventListener('touchend', up, { passive: false });
      btn.addEventListener('touchcancel', up, { passive: false });
      btn.addEventListener('mousedown', down);
      btn.addEventListener('mouseup', up);
      btn.addEventListener('mouseleave', up);
    }
    hold($('btnL'), 'left', false);
    hold($('btnR'), 'right', false);
    hold($('btnJ'), 'jump', true);
    window.addEventListener('keydown', function (e) {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') inp.left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') inp.right = true;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'KeyK') {
        if (!inp.jump) inp.jumpPressed = true;
        inp.jump = true;
        e.preventDefault();
      }
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
      this._build();
      this.reset();
      this.scheduleUpdate();
      return true;
    },
    _build: function () {
      level = loadLevel();
      var cols = level.cols;
      this.worldW = (cols + 4) * T;
      /* Portrait tall view: lift ground above touch dock; landscape keeps classic 150 */
      this.gy = (H > BASE_H + 10) ? Math.max(260, Math.min(560, Math.round(H * 0.28))) : 150;

      this.bg = mkColor(W * 2, H, 58, 92, 150);
      this.addChild(this.bg, -2);
      var sky = mkColor(W * 2, H - this.gy, 92, 140, 200);
      sky.setPosition(0, this.gy);
      this.addChild(sky, -2);

      var h1 = new cc.Sprite(hillTex); h1.setAnchorPoint(0, 0); h1.setPosition(0, this.gy - 40); h1.setOpacity(200); this.world.addChild(h1, 0);
      var h2 = new cc.Sprite(hillTex); h2.setAnchorPoint(0, 0); h2.setScaleX(-1); h2.setPosition(this.worldW - 40, this.gy - 50); h2.setOpacity(170); this.world.addChild(h2, 0);
      for (var ci = 0; ci < Math.ceil(this.worldW / 260); ci++) {
        var cl = new cc.Sprite(cloudTex);
        cl.setPosition(80 + ci * 260, H - 80 - (ci % 2) * 22);
        cl.setOpacity(150); this.world.addChild(cl, 1);
      }

      var ground = mkColor(this.worldW + 200, this.gy, 107, 79, 47);
      ground.setPosition(-40, 0);
      this.world.addChild(ground, 2);
      var grass = mkColor(this.worldW + 200, 14, 78, 168, 92);
      grass.setPosition(-40, this.gy - 8);
      this.world.addChild(grass, 3);

      this.traps = [];
      this.coinNodes = [];
      var pad = 2 * T;
      for (var x = 0; x < cols; x++) {
        var kind = level.cells[x];
        var px = pad + x * T + T * 0.5;
        if (kind === 'spike' || kind === 'fire') {
          var base = mkColor(T * 0.7, 8, 58, 58, 66);
          base.setPosition(px - T * 0.35, this.gy - 6);
          this.world.addChild(base, 4);
          var sp = new cc.Sprite(kind === 'fire' ? fireTex : spikeTex);
          sp.setAnchorPoint(0.5, 0);
          sp.setPosition(px, this.gy - 4);
          sp.setScale(kind === 'fire' ? 1.1 : 1.0);
          sp.setVisible(false);
          this.world.addChild(sp, 6);
          this.traps.push({ kind: kind, x: px, sp: sp, w: T * 0.55 });
        } else if (kind === 'coin' || kind === 'shield') {
          var cn = new cc.Sprite(coinTex);
          cn.setPosition(px, this.gy + 42);
          this.world.addChild(cn, 5);
          this.coinNodes.push({ x: px, sp: cn, got: false });
        }
      }

      var flag = new cc.Sprite(flagTex);
      flag.setAnchorPoint(0.5, 0);
      this.goalX = pad + cols * T + T * 0.5;
      flag.setPosition(this.goalX, this.gy);
      this.world.addChild(flag, 5);

      this.ninja = new cc.Sprite(SP + 'idle.png');
      this.ninja.setAnchorPoint(0.5, 0);
      var sz = this.ninja.getContentSize();
      this.nScale = 110 / Math.max(sz.width || 100, 1);
      this.ninja.setScale(this.nScale);
      this.world.addChild(this.ninja, 10);
      this.walk = [SP + 'walk_0.png', SP + 'walk_1.png', SP + 'walk_2.png', SP + 'walk_3.png'];

      var iv = (level.traps.spike && +level.traps.spike.interval) || 3;
      $('msg').textContent = (level.by ? level.by + '的关 · ' : '') + '刺每' + iv + '秒冒 · ←→跳';
    },
    reset: function () {
      this.px = 60;
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
      this.coinNodes.forEach(function (c) { c.got = false; c.sp.setVisible(true); c.sp.setOpacity(255); });
      this.ninja.setPosition(this.px, this.py);
      this.ninja.setTexture(SP + 'idle.png');
      this.ninja.setOpacity(255);
      this.camX = 0;
      this.world.setPosition(0, 0);
      hideResult();
      updHUD(this.hp, this.coins);
      inp.jumpPressed = false;
    },
    update: function (dt) {
      try {
        if (!this.playing) return;
        if (dt > 0.05) dt = 0.05;
        var now = Date.now() / 1000;
        var elapsed = now - this.t0;

        var speed = 260;
        if (inp.left && !inp.right) { this.vx = -speed; this.face = -1; }
        else if (inp.right && !inp.left) { this.vx = speed; this.face = 1; }
        else this.vx *= Math.max(0, 1 - dt * 12);

        if (this.grounded && inp.jumpPressed) {
          this.vy = 560;
          this.grounded = false;
          this.ninja.setTexture(SP + 'jump_0.png');
        }
        inp.jumpPressed = false;

        this.vy -= 1400 * dt;
        this.px += this.vx * dt;
        this.py += this.vy * dt;
        if (this.px < 30) this.px = 30;
        if (this.px > this.worldW - 40) this.px = this.worldW - 40;
        if (this.py <= this.gy) {
          this.py = this.gy;
          this.vy = 0;
          this.grounded = true;
        }

        this.ninja.setPosition(this.px, this.py);
        this.ninja.setScaleX(this.face * this.nScale);
        this.ninja.setScaleY(this.nScale);

        if (!this.grounded) {
          this.ninja.setTexture(SP + 'jump_0.png');
        } else if (Math.abs(this.vx) > 30) {
          this.frameT += dt;
          if (this.frameT > 0.1) { this.frameT = 0; this.frame = (this.frame + 1) % 4; }
          this.ninja.setTexture(this.walk[this.frame]);
        } else {
          this.ninja.setTexture(SP + 'idle.png');
        }

        if (this.invuln > 0) {
          this.invuln -= dt;
          this.ninja.setOpacity((Math.floor(this.invuln * 20) % 2) ? 90 : 255);
        } else this.ninja.setOpacity(255);

        var sp = level.traps.spike || {};
        var I = Math.max(0.6, +sp.interval || 3);
        var upDur = Math.max(0.25, +sp.up || 1);
        var phase = elapsed % I;
        var spikeUp = phase < upDur;
        var fire = level.traps.fire || {};
        var fireUp = spikeUp;
        var dmgS = Math.max(1, +sp.damage || 1);
        var dmgF = Math.max(1, +fire.damage || 1);

        for (var i = 0; i < this.traps.length; i++) {
          var tr = this.traps[i];
          var raised = tr.kind === 'fire' ? fireUp : spikeUp;
          tr.sp.setVisible(raised);
          if (raised && this.invuln <= 0) {
            var near = Math.abs(this.px - tr.x) < tr.w && this.py < this.gy + 55;
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

        for (var j = 0; j < this.coinNodes.length; j++) {
          var cn = this.coinNodes[j];
          if (cn.got) continue;
          cn.sp.setPosition(cn.x, this.gy + 48 + Math.sin(now * 5 + j) * 5);
          if (Math.abs(this.px - cn.x) < 36 && this.py < this.gy + 80) {
            cn.got = true; cn.sp.setVisible(false); this.coins += 1; updHUD(this.hp, this.coins);
          }
        }

        if (!this.won && this.px >= this.goalX - 20) {
          this.won = true; this.playing = false;
          showResult(true, this.hp, this.coins);
          $('msg').textContent = '到旗了！';
        }

        var target = this.px - W * 0.35;
        if (target < 0) target = 0;
        if (target > this.worldW - W) target = Math.max(0, this.worldW - W);
        this.camX += (target - this.camX) * Math.min(1, dt * 8);
        this.world.setPosition(-this.camX, 0);
      } catch (e) { bootErr(String(e && e.message || e)); }
    }
  });

  function boot() {
    if (typeof cc === 'undefined') { bootErr('Cocos 未加载'); return; }
    window.addEventListener('error', function (e) { bootErr(e.message || String(e)); });
    bindControls();
    updateOrientTip();
    fitStage();
    window.addEventListener('resize', fitStage);
    window.addEventListener('orientationchange', function () { setTimeout(fitStage, 120); });

    var PlayScene = cc.Scene.extend({
      onEnter: function () {
        this._super();
        sceneRef = new PlayLayer();
        this.addChild(sceneRef);
      }
    });
    window.__playSceneCtor = PlayScene;

    $('retry').onclick = function () { if (sceneRef) sceneRef.reset(); };
    $('again').onclick = function () { if (sceneRef) sceneRef.reset(); };

    cc.game.onStart = function () {
      try {
        cc.view.enableRetina(false);
        cc.view.adjustViewPort(true);
        fitStage();
        cc.view.setDesignResolutionSize(W, H, cc.ResolutionPolicy.SHOW_ALL);
        spikeTex = buildSpikeTex();
        cloudTex = buildCloudTex();
        hillTex = buildHillTex();
        fireTex = buildFireTex();
        coinTex = buildCoinTex();
        flagTex = buildFlagTex();
        var left = RES.length;
        function tick() {
          left--;
          if (left > 0) return;
          fitStage();
          cc.director.runScene(new PlayScene());
          $('msg').textContent = '可玩 · ←→移动 · 跳躲刺';
          setTimeout(fitStage, 50);
        }
        RES.forEach(function (src) {
          var img = new Image();
          img.onload = function () { try { cc.textureCache.addImage(src); } catch (e1) {} tick(); };
          img.onerror = function () { bootErr('图片失败 ' + src); tick(); };
          img.src = src;
        });
      } catch (e) { bootErr('启动失败：' + e); }
    };
    try { cc.game.run('gameCanvas'); } catch (e) { bootErr('启动失败：' + e); }
  }

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
})();
