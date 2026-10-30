/**
 * 玩我的关 — Cocos2d-JS Lite, aligned to xy-go custom=1 (same JSON / T / zoom / forest BG).
 * Only the engine differs. Coordinate system mirrors xy-go/game.js buildCustomDef + resize().
 */
(function () {
  var KEY = 'xygo-custom-level';
  var SP = '../../../xy-go/sprites/green/';
  var SC = '../../../xy-go/scenes/';
  var RES = [
    SP + 'walk_0.png', SP + 'walk_1.png', SP + 'walk_2.png', SP + 'walk_3.png',
    SP + 'idle.png', SP + 'knock_0.png', SP + 'jump_0.png',
    SC + 'forest-day.jpg', SC + 'dirt-tile.png', SC + 'grass-cap.png'
  ];
  /* xy-go constants */
  var T = 40;
  var DRAW_H = 78;
  var EXP = 6;   /* design col → game cols */
  var PAD = 6;   /* safe pad cols each side */
  var WORLD_ROWS = 14;
  var GROUND_ROW = 11;
  var MAX_HP = 6;
  var W = 640, H = 368; /* overwritten by fitStage to match xy-go visible world */

  var sceneRef = null, spikeTex = null, fireTex = null, coinTex = null, flagTex = null;
  var dirtTex = null, grassTex = null, forestImg = null;
  var level = null, lastFitKey = '', rebuilding = false;
  var inp = { left: false, right: false, jump: false, jumpPressed: false };

  function $(id) { return document.getElementById(id); }
  function bootErr(m) { var b = $('boot'); if (!b) return; b.textContent = m; b.className = 'err'; }
  function mkColor(w, h, r, g, b, a) { return new cc.LayerColor(cc.color(r, g, b, a == null ? 255 : a), w, h); }
  function texFromCanvas(cv) { var tex = new cc.Texture2D(); tex.initWithElement(cv); tex.handleLoadedTexture(); return tex; }
  function isPortrait() { return window.innerHeight > window.innerWidth; }

  function updateOrientTip() {
    var tip = $('orientTip');
    if (!tip) return;
    tip.classList.toggle('on', isPortrait());
  }

  /**
   * Match xy-go resize(): zoom = viewH / ((portrait?12.5:9.2)*T), clamp;
   * design size = visible world in tile pixels so character/tile scale matches.
   * Full-bleed shell (letterbox only if CSS chrome); no 960×600 SHOW_ALL blow-up.
   */
  function fitStage() {
    updateOrientTip();
    var wrap = $('cvwrap');
    var shell = $('shell');
    if (!wrap || !shell) return;
    var aw = Math.max(2, shell.clientWidth || window.innerWidth);
    var ah = Math.max(2, shell.clientHeight || Math.max(160, window.innerHeight - 40));
    var portrait = ah > aw;
    var zoom = ah / ((portrait ? 12.5 : 9.2) * T);
    zoom = Math.max(0.8, Math.min(zoom, portrait ? 2.1 : 1.7));
    var nextW = Math.max(200, Math.round(aw / zoom));
    var nextH = Math.max(200, Math.round(ah / zoom));
    wrap.style.width = aw + 'px';
    wrap.style.height = ah + 'px';
    var cv = $('gameCanvas');
    if (cv) {
      cv.style.width = aw + 'px';
      cv.style.height = ah + 'px';
      cv.width = nextW;
      cv.height = nextH;
    }
    var fitKey = (portrait ? 'p' : 'l') + ':' + nextW + 'x' + nextH + '@' + zoom.toFixed(2);
    var changed = nextW !== W || nextH !== H;
    W = nextW;
    H = nextH;
    try {
      var dbg = $('msg');
      if (dbg) dbg.setAttribute('data-fit', fitKey + ' shell=' + aw + 'x' + ah);
    } catch (e0) {}
    if (typeof cc === 'undefined' || !cc.view) { lastFitKey = fitKey; return; }
    try {
      if (cc.view.setFrameSize) cc.view.setFrameSize(aw, ah);
      cc.view.setDesignResolutionSize(W, H, cc.ResolutionPolicy.SHOW_ALL);
      if (cc.view._resizeEvent) cc.view._resizeEvent();
    } catch (e) { /* ignore */ }
    lastFitKey = fitKey;
    if (changed && sceneRef && !rebuilding && window.__playSceneCtor) {
      rebuilding = true;
      setTimeout(function () {
        try { cc.director.runScene(new window.__playSceneCtor()); } catch (e2) {}
        rebuilding = false;
      }, 0);
    }
  }

  /** Same mapping as xy-go buildCustomDef — design cells → game tile columns. */
  function loadLevel() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
      var tiles = Array.isArray(d.tiles) ? d.tiles : [];
      var traps = d.traps || {};
      var DC = Math.max(4, Math.min(40, d.cols | 0 || 12));
      var DR = Math.max(2, Math.min(8, d.rows | 0 || 4));
      var cols = PAD + DC * EXP + PAD + 10;
      var gx = function (x) { return PAD + (x | 0) * EXP + 2; };
      var items = [];
      var groundCols = [];
      var i, x, t, g;
      for (x = 0; x < DC; x++) {
        g = tiles.length
          ? tiles.some(function (tt) { return tt && tt.x === x && tt.y === DR - 1 && (tt.type === 'g' || tt.type === 'p'); })
          : true;
        groundCols.push(g);
      }
      if (!tiles.length && d.mine && Array.isArray(d.mine.map)) {
        d.mine.map.forEach(function (k, xi) {
          if (!k) return;
          items.push({ type: k, c: gx(xi), designX: xi });
        });
        if (d.mine.mp) {
          Object.keys(d.mine.mp).forEach(function (k) { traps[k] = traps[k] || d.mine.mp[k]; });
        }
      } else {
        tiles.forEach(function (tt) {
          if (!tt || tt.type === 'g' || tt.type === 'p') return;
          if ((tt.y | 0) >= DR - 1) return;
          items.push({ type: tt.type, c: gx(tt.x | 0), designX: tt.x | 0, y: tt.y | 0 });
        });
      }
      if (!items.length) {
        items.push({ type: 'spike', c: gx(3), designX: 3 });
        items.push({ type: 'coin', c: gx(6), designX: 6 });
        items.push({ type: 'spike', c: gx(9), designX: 9 });
        traps.spike = traps.spike || { interval: 3, up: 1, damage: 1 };
      }
      return {
        version: d.version || '1.1',
        DC: DC, DR: DR, cols: cols, groundCols: groundCols,
        items: items, traps: traps,
        theme: d.theme || 'swamp',
        hook_seen: d.hook_seen || d.reflectHook || '',
        vs_expect: d.vs_expect || d.reflectExpect || '',
        by: d.by || '',
        spawnC: 2,
        goalC: cols - 5
      };
    } catch (e) {
      var fallback = {
        version: '1.1', DC: 12, DR: 4, cols: PAD + 12 * EXP + PAD + 10,
        groundCols: [], items: [], traps: { spike: { interval: 3, up: 1, damage: 1 }, fire: { damage: 1, dur: 2 } },
        theme: 'swamp', by: '', spawnC: 2, goalC: 0
      };
      for (i = 0; i < 12; i++) fallback.groundCols.push(true);
      fallback.items = [
        { type: 'spike', c: PAD + 3 * EXP + 2 },
        { type: 'coin', c: PAD + 7 * EXP + 2 },
        { type: 'fire', c: PAD + 10 * EXP + 2 }
      ];
      fallback.goalC = fallback.cols - 5;
      return fallback;
    }
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
  function buildFlagTex() {
    var c = document.createElement('canvas'); c.width = 28; c.height = 48;
    var g = c.getContext('2d');
    g.fillStyle = '#94a3b8'; g.fillRect(4, 2, 3, 44);
    g.fillStyle = '#4ea85c'; g.beginPath(); g.moveTo(7, 4); g.lineTo(26, 12); g.lineTo(7, 22); g.closePath(); g.fill();
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
    _addForestBg: function () {
      /* Screen-space cover plate like xy-go drawSky (parallax updated each frame). */
      var fallback = mkColor(W + 4, H + 4, 29, 78, 56);
      fallback.setPosition(-2, -2);
      this.addChild(fallback, -5);
      this.bgNode = null;
      if (forestImg && forestImg.naturalWidth) {
        try {
          var path = SC + 'forest-day.jpg';
          var sp = new cc.Sprite(path);
          sp.setAnchorPoint(0, 0);
          this.addChild(sp, -4);
          this.bgNode = sp;
          this._layoutBg(0);
        } catch (e) { /* solid fallback stays */ }
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
          var sp2 = new cc.Sprite(SC + 'forest-day.jpg');
          sp2.setAnchorPoint(0, 0);
          sp2.setScale(scale);
          this.addChild(sp2, -4);
          this.bgNode2 = sp2;
        } catch (e2) { this.bgNode2 = null; }
      }
      if (this.bgNode2) {
        this.bgNode2.setScale(scale);
        this.bgNode2.setPosition(ox + dw - 1, oy);
        this.bgNode2.setVisible(ox + dw < W + 2);
      }
    },
    _buildGround: function () {
      var cols = level.cols;
      var gy = this.gy;
      var c, x0, solid;
      /* Deep dirt fill below ground surface */
      var deep = mkColor(this.worldW + 80, gy + 4, 61, 42, 28);
      deep.setPosition(-40, -4);
      this.world.addChild(deep, 1);
      for (c = 0; c < cols; c++) {
        solid = true;
        if (level.groundCols && level.groundCols.length === level.DC) {
          /* pad zones always solid; design band uses groundCols */
          if (c >= PAD && c < PAD + level.DC * EXP) {
            var dx = Math.floor((c - PAD) / EXP);
            solid = !!level.groundCols[dx];
          }
        }
        if (!solid) continue;
        x0 = c * T;
        if (dirtTex) {
          var dirt = new cc.Sprite(SC + 'dirt-tile.png');
          dirt.setAnchorPoint(0, 1);
          dirt.setPosition(x0, gy);
          dirt.setScale(T / 40);
          this.world.addChild(dirt, 2);
          var dirt2 = new cc.Sprite(SC + 'dirt-tile.png');
          dirt2.setAnchorPoint(0, 1);
          dirt2.setPosition(x0, gy - T);
          dirt2.setScale(T / 40);
          this.world.addChild(dirt2, 2);
        }
        if (grassTex) {
          var cap = new cc.Sprite(SC + 'grass-cap.png');
          cap.setAnchorPoint(0, 0);
          cap.setPosition(x0, gy - 2);
          cap.setScaleX((T + 0.6) / 40);
          cap.setScaleY(16 / 18);
          this.world.addChild(cap, 3);
        } else {
          var strip = mkColor(T + 1, 10, 63, 143, 74);
          strip.setPosition(x0, gy - 2);
          this.world.addChild(strip, 3);
        }
      }
    },
    _build: function () {
      level = loadLevel();
      this.worldW = level.cols * T;
      /* Player sits near 38% up the view (xy-go camera puts focus ~0.62 from top). */
      this.gy = Math.round(H * 0.36);
      this.gy = Math.max(80, Math.min(this.gy, H - 100));

      this._addForestBg();
      this._buildGround();

      this.traps = [];
      this.coinNodes = [];
      var items = level.items || [];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var px = it.c * T + T * 0.5;
        if (it.type === 'spike' || it.type === 'fire') {
          var base = mkColor(T * 0.85, 6, 58, 58, 66);
          base.setPosition(px - T * 0.42, this.gy - 4);
          this.world.addChild(base, 4);
          var sp = new cc.Sprite(it.type === 'fire' ? fireTex : spikeTex);
          sp.setAnchorPoint(0.5, 0);
          sp.setPosition(px, this.gy - 2);
          sp.setScale(it.type === 'fire' ? 1.15 : 1.05);
          sp.setVisible(false);
          this.world.addChild(sp, 6);
          this.traps.push({ kind: it.type, x: px, sp: sp, w: T * 0.7 });
        } else if (it.type === 'coin' || it.type === 'shield') {
          var cn = new cc.Sprite(coinTex);
          cn.setPosition(px, this.gy + T * 0.9);
          this.world.addChild(cn, 5);
          this.coinNodes.push({ x: px, sp: cn, got: false });
        } else if (it.type === 'flag') {
          /* optional mid-flag from JSON; main goal still at goalC */
        }
      }

      var flag = new cc.Sprite(flagTex);
      flag.setAnchorPoint(0.5, 0);
      this.goalX = level.goalC * T + T * 0.5;
      flag.setPosition(this.goalX, this.gy);
      flag.setScale(DRAW_H / 48 * 0.55);
      this.world.addChild(flag, 5);

      this.ninja = new cc.Sprite(SP + 'idle.png');
      this.ninja.setAnchorPoint(0.5, 0);
      var sz = this.ninja.getContentSize();
      var ref = Math.max(sz.height || 256, 1);
      this.nScale = DRAW_H / ref;
      this.ninja.setScale(this.nScale);
      this.world.addChild(this.ninja, 10);
      this.walk = [SP + 'walk_0.png', SP + 'walk_1.png', SP + 'walk_2.png', SP + 'walk_3.png'];

      var iv = (level.traps.spike && +level.traps.spike.interval) || 3;
      $('msg').textContent = (level.by ? level.by + '的关 · ' : '') + '刺每' + iv + '秒冒 · ←→跳';
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
      this.coinNodes.forEach(function (c) { c.got = false; c.sp.setVisible(true); c.sp.setOpacity(255); });
      this.ninja.setPosition(this.px, this.py);
      this.ninja.setTexture(SP + 'idle.png');
      this.ninja.setOpacity(255);
      this.camX = Math.max(0, this.px - W * 0.4);
      this.world.setPosition(-this.camX, 0);
      this._layoutBg(this.camX);
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

        /* Speeds tuned for T=40 world (xy-go-ish feel, not the old T=80 mega-stride). */
        var speed = 140;
        if (inp.left && !inp.right) { this.vx = -speed; this.face = -1; }
        else if (inp.right && !inp.left) { this.vx = speed; this.face = 1; }
        else this.vx *= Math.max(0, 1 - dt * 12);

        if (this.grounded && inp.jumpPressed) {
          this.vy = 320;
          this.grounded = false;
          this.ninja.setTexture(SP + 'jump_0.png');
        }
        inp.jumpPressed = false;

        this.vy -= 900 * dt;
        this.px += this.vx * dt;
        this.py += this.vy * dt;
        if (this.px < T * 0.5) this.px = T * 0.5;
        if (this.px > this.worldW - T * 0.5) this.px = this.worldW - T * 0.5;
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
        } else if (Math.abs(this.vx) > 20) {
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

        for (var j = 0; j < this.coinNodes.length; j++) {
          var cn = this.coinNodes[j];
          if (cn.got) continue;
          cn.sp.setPosition(cn.x, this.gy + T * 0.85 + Math.sin(now * 5 + j) * 4);
          if (Math.abs(this.px - cn.x) < T * 0.7 && this.py < this.gy + DRAW_H) {
            cn.got = true; cn.sp.setVisible(false); this.coins += 1; updHUD(this.hp, this.coins);
          }
        }

        if (!this.won && this.px >= this.goalX - T * 0.4) {
          this.won = true; this.playing = false;
          showResult(true, this.hp, this.coins);
          $('msg').textContent = '到旗了！';
        }

        var target = this.px - W * 0.4;
        if (target < 0) target = 0;
        if (target > this.worldW - W) target = Math.max(0, this.worldW - W);
        this.camX += (target - this.camX) * Math.min(1, dt * 8);
        this.world.setPosition(-this.camX, 0);
        this._layoutBg(this.camX);
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
        fireTex = buildFireTex();
        coinTex = buildCoinTex();
        flagTex = buildFlagTex();
        var left = RES.length;
        function tick() {
          left--;
          if (left > 0) return;
          dirtTex = true;
          grassTex = true;
          fitStage();
          cc.director.runScene(new PlayScene());
          $('msg').textContent = '可玩 · ←→移动 · 跳躲刺';
          setTimeout(fitStage, 50);
        }
        RES.forEach(function (src) {
          var img = new Image();
          img.onload = function () {
            try { cc.textureCache.addImage(src); } catch (e1) {}
            if (src.indexOf('forest-day') >= 0) forestImg = img;
            tick();
          };
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
