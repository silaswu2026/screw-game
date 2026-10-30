/**
 * 玩我的关 — Cocos2d-JS Lite
 * Loads localStorage xygo-custom-level (JSON v1.1) and auto-runs the kid's traps.
 * Same play idea as xy-go/?custom=1; engine migration in progress.
 */
(function () {
  var KEY = 'xygo-custom-level';
  var SP = '../../../xy-go/sprites/green/';
  var RES = [SP + 'walk_0.png', SP + 'walk_1.png', SP + 'walk_2.png', SP + 'walk_3.png', SP + 'idle.png', SP + 'knock_0.png', SP + 'jump_0.png'];
  var W = 960, H = 360, DUR = 10;
  var sceneRef = null, spikeTex = null, cloudTex = null, hillTex = null, fireTex = null, coinTex = null;
  var level = null;

  function $(id) { return document.getElementById(id); }
  function bootErr(m) { var b = $('boot'); if (!b) return; b.textContent = m; b.className = 'err'; }
  function mkColor(w, h, r, g, b, a) { return new cc.LayerColor(cc.color(r, g, b, a == null ? 255 : a), w, h); }
  function texFromCanvas(cv) { var tex = new cc.Texture2D(); tex.initWithElement(cv); tex.handleLoadedTexture(); return tex; }

  function loadLevel() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
      var tiles = Array.isArray(d.tiles) ? d.tiles : [];
      var traps = d.traps || {};
      var cols = Math.max(4, Math.min(20, d.cols | 0 || 12));
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
          Object.keys(d.mine.mp).forEach(function (k) {
            traps[k] = traps[k] || d.mine.mp[k];
          });
        }
      }
      var has = cells.some(Boolean);
      if (!has) {
        cells[2] = 'spike'; cells[5] = 'coin'; cells[8] = 'spike';
        traps.spike = traps.spike || { interval: 3, up: 1, damage: 1 };
      }
      return {
        version: d.version || '1.1',
        cols: cols,
        cells: cells,
        traps: traps,
        hook_seen: d.hook_seen || d.reflectHook || '',
        vs_expect: d.vs_expect || d.reflectExpect || '',
        by: d.by || ''
      };
    } catch (e) {
      return { cols: 12, cells: (function () { var a = []; for (var i = 0; i < 12; i++) a[i] = null; a[3] = 'spike'; a[7] = 'coin'; return a; })(), traps: { spike: { interval: 3, up: 1, damage: 1 } }, version: '1.1' };
    }
  }

  function buildSpikeTex() {
    var c = document.createElement('canvas'); c.width = 72; c.height = 40;
    var g = c.getContext('2d');
    for (var k = 0; k < 4; k++) {
      var sx = 4 + k * 16, sw = 16;
      g.fillStyle = '#d8e0ea'; g.beginPath(); g.moveTo(sx, 40); g.lineTo(sx + sw / 2, 2); g.lineTo(sx + sw, 40); g.closePath(); g.fill();
      g.strokeStyle = '#6a7584'; g.stroke();
    }
    g.fillStyle = '#3a3a42'; g.fillRect(2, 35, 68, 5);
    return texFromCanvas(c);
  }
  function buildCloudTex() {
    var c = document.createElement('canvas'); c.width = 120; c.height = 48;
    var g = c.getContext('2d'); g.fillStyle = 'rgba(255,255,255,0.55)';
    function blob(x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    blob(36, 28, 18); blob(58, 22, 22); blob(82, 28, 16);
    return texFromCanvas(c);
  }
  function buildHillTex() {
    var c = document.createElement('canvas'); c.width = 280; c.height = 90;
    var g = c.getContext('2d');
    g.fillStyle = '#2d4a6e'; g.beginPath(); g.moveTo(0, 90); g.quadraticCurveTo(70, 10, 140, 70); g.quadraticCurveTo(200, 20, 280, 90); g.closePath(); g.fill();
    g.fillStyle = '#3a5f88'; g.beginPath(); g.moveTo(40, 90); g.quadraticCurveTo(120, 30, 200, 90); g.closePath(); g.fill();
    return texFromCanvas(c);
  }
  function buildFireTex() {
    var c = document.createElement('canvas'); c.width = 48; c.height = 56;
    var g = c.getContext('2d');
    g.fillStyle = '#ff6b2d'; g.beginPath(); g.moveTo(24, 4); g.quadraticCurveTo(44, 28, 24, 54); g.quadraticCurveTo(4, 28, 24, 4); g.fill();
    g.fillStyle = '#ffe14a'; g.beginPath(); g.moveTo(24, 18); g.quadraticCurveTo(34, 34, 24, 48); g.quadraticCurveTo(14, 34, 24, 18); g.fill();
    return texFromCanvas(c);
  }
  function buildCoinTex() {
    var c = document.createElement('canvas'); c.width = 36; c.height = 36;
    var g = c.getContext('2d');
    g.fillStyle = '#f0c45a'; g.beginPath(); g.arc(18, 18, 15, 0, 7); g.fill();
    g.fillStyle = '#ffe7a0'; g.beginPath(); g.arc(18, 18, 9, 0, 7); g.fill();
    g.fillStyle = '#b88920'; g.font = 'bold 14px sans-serif'; g.fillText('¥', 11, 23);
    return texFromCanvas(c);
  }

  function updHP(lose) {
    var M = 6, left = Math.max(0, M - lose);
    $('hp').innerHTML = '❤'.repeat(left) + '🤍'.repeat(M - left) +
      ' <span style="font-size:13px;color:#c9c3ef">掉' + lose + '❤</span>';
  }
  function hideResult() {
    var r = $('result'); if (r) r.classList.remove('show');
  }
  function showResult(lose, coins) {
    var r = $('result'); if (!r) return;
    r.classList.add('show');
    var ok = lose <= 3;
    $('resultBig').textContent = ok ? '🎉 跑完了！' : '😵 刺有点疼';
    $('resultBig').style.color = ok ? '#9ff0a8' : '#ffb4b4';
    $('resultSub').innerHTML = '掉 <b style="color:#ffb4b4">' + lose + '❤</b> · 金币 <b style="color:#ffe7a0">' + coins + '</b>' +
      (level && level.vs_expect ? '<br>你预计过：' + level.vs_expect : '<br>回上一页答：和预计一样吗？');
  }

  var PlayLayer = cc.Layer.extend({
    ctor: function () {
      this._super();
      this.running = false;
      this.t0 = 0;
      this.done = false;
      this.lose = 0;
      this.coins = 0;
      this.hitAt = {};
      this.frame = 0;
      this.frameT = 0;
      this._build();
      this.scheduleUpdate();
      return true;
    },
    _build: function () {
      level = loadLevel();
      var iv = (level.traps.spike && level.traps.spike.interval) || 3;
      $('kidsub').textContent = '刺每 ' + iv + ' 秒冒一次 · 点开始跑';
      $('msg').textContent = (level.by ? level.by + '的关 · ' : '') + 'JSON ' + (level.version || '1.1') + ' · 间隔 ' + iv + ' 秒';

      this.addChild(mkColor(W, H, 58, 92, 150), 0);
      var skyTop = mkColor(W, 130, 92, 140, 200);
      skyTop.setPosition(0, H - 130);
      this.addChild(skyTop, 0);
      var h1 = new cc.Sprite(hillTex); h1.setAnchorPoint(0, 0); h1.setPosition(0, 100); h1.setOpacity(200); this.addChild(h1, 1);
      var h2 = new cc.Sprite(hillTex); h2.setAnchorPoint(0, 0); h2.setScaleX(-1); h2.setPosition(W - 20, 92); h2.setOpacity(170); this.addChild(h2, 1);
      for (var ci = 0; ci < 3; ci++) {
        var cl = new cc.Sprite(cloudTex);
        cl.setPosition(90 + ci * 280, H - 80 - (ci % 2) * 20);
        cl.setOpacity(160); this.addChild(cl, 2);
      }
      this.addChild(mkColor(W, 110, 107, 79, 47), 3);
      this.addChild((function () { var g = mkColor(W, 14, 78, 168, 92); g.setPosition(0, 102); return g; })(), 4);

      var cols = level.cols, L = 28, cw = (W - 56) / cols, gy = 110;
      this.L = L; this.cw = cw; this.gy = gy; this.cols = cols;
      this.trapNodes = [];
      this.coinNodes = [];

      for (var x = 0; x < cols; x++) {
        var kind = level.cells[x];
        var px = L + x * cw + cw * 0.5;
        if (kind === 'spike' || kind === 'fire') {
          var base = mkColor(cw * 0.7, 8, 58, 58, 66);
          base.setPosition(px - cw * 0.35, gy - 4);
          this.addChild(base, 5);
          var sp = new cc.Sprite(kind === 'fire' ? fireTex : spikeTex);
          sp.setAnchorPoint(0.5, 0);
          sp.setPosition(px, gy - 2);
          sp.setScale(kind === 'fire' ? 0.9 : Math.max(0.7, (cw * 0.75) / 72));
          sp.setVisible(false);
          this.addChild(sp, 7);
          this.trapNodes.push({ x: x, kind: kind, sp: sp, px: px });
        } else if (kind === 'coin' || kind === 'shield') {
          var cn = new cc.Sprite(coinTex);
          cn.setPosition(px, gy + 48);
          this.addChild(cn, 6);
          this.coinNodes.push({ x: x, sp: cn, got: false, px: px });
        }
      }

      this.countLab = new cc.LabelTTF('准备', 'Arial', 26);
      this.countLab.setFontFillColor(cc.color(255, 231, 160));
      this.countLab.setPosition(W - 80, H - 32);
      this.addChild(this.countLab, 10);

      this.ninja = new cc.Sprite(SP + 'idle.png');
      this.ninja.setAnchorPoint(0.5, 0);
      var sz = this.ninja.getContentSize();
      this.ninja.setScale(110 / Math.max(sz.width || 100, 1));
      this.ninja.setPosition(40, gy);
      this.addChild(this.ninja, 10);
      this.walk = [SP + 'walk_0.png', SP + 'walk_1.png', SP + 'walk_2.png', SP + 'walk_3.png'];
      updHP(0);
    },
    startRun: function () {
      this.running = true;
      this.done = false;
      this.t0 = Date.now() / 1000;
      this.lose = 0;
      this.coins = 0;
      this.hitAt = {};
      this.coinNodes.forEach(function (c) { c.got = false; c.sp.setVisible(true); c.sp.setOpacity(255); });
      hideResult();
      updHP(0);
      $('msg').textContent = '跑！刺按你设的秒数冒';
      this.countLab.setString('跑！');
    },
    update: function (dt) {
      try {
        if (!this.running) {
          this.ninja.setTexture(SP + 'idle.png');
          return;
        }
        var now = Date.now() / 1000;
        var t = now - this.t0;
        var tt = Math.min(t, DUR);
        var progress = tt / DUR;
        var nx = 40 + progress * (W - 100);
        this.ninja.setPosition(nx, this.gy);

        this.frameT += dt;
        if (this.frameT > 0.12) {
          this.frameT = 0;
          this.frame = (this.frame + 1) % 4;
          this.ninja.setTexture(this.walk[this.frame]);
        }

        var sp = level.traps.spike || {};
        var I = Math.max(0.5, +sp.interval || 3);
        var up = (tt >= I) && ((tt % I) < Math.max(0.35, +sp.up || 1));
        var fireOn = up;
        var dmgSpike = Math.max(1, +sp.damage || 1);
        var fire = level.traps.fire || {};
        var dmgFire = Math.max(1, +fire.damage || 1);

        for (var i = 0; i < this.trapNodes.length; i++) {
          var tn = this.trapNodes[i];
          var raised = tn.kind === 'fire' ? fireOn : up;
          tn.sp.setVisible(raised);
          if (raised) {
            var near = Math.abs(nx - tn.px) < this.cw * 0.55;
            if (near && !this.hitAt[tn.x + ':' + Math.floor(tt / I)]) {
              this.hitAt[tn.x + ':' + Math.floor(tt / I)] = 1;
              this.lose += (tn.kind === 'fire' ? dmgFire : dmgSpike);
              updHP(this.lose);
              this.ninja.setTexture(SP + 'knock_0.png');
            }
          }
        }

        for (var j = 0; j < this.coinNodes.length; j++) {
          var cn = this.coinNodes[j];
          if (cn.got) continue;
          cn.sp.setPosition(cn.px, this.gy + 48 + Math.sin(now * 4 + j) * 6);
          if (Math.abs(nx - cn.px) < this.cw * 0.45) {
            cn.got = true;
            cn.sp.setVisible(false);
            this.coins += 1;
          }
        }

        this.countLab.setString('掉' + this.lose + '❤');
        if (!this.done && t >= DUR) {
          this.done = true;
          this.running = false;
          this.ninja.setTexture(SP + 'idle.png');
          $('msg').textContent = '跑完 · 掉' + this.lose + '❤ · 金币' + this.coins;
          showResult(this.lose, this.coins);
        }
      } catch (e) { bootErr(String(e && e.message || e)); }
    }
  });

  function boot() {
    if (typeof cc === 'undefined') { bootErr('Cocos 未加载'); return; }
    spikeTex = buildSpikeTex();
    cloudTex = buildCloudTex();
    hillTex = buildHillTex();
    fireTex = buildFireTex();
    coinTex = buildCoinTex();

    cc.game.onStart = function () {
      cc.view.enableRetina(true);
      cc.view.adjustViewPort(true);
      cc.view.setDesignResolutionSize(W, H, cc.ResolutionPolicy.SHOW_ALL);
      cc.view.resizeWithBrowserSize(true);
      cc.LoaderScene.preload(RES, function () {
        var Scene = cc.Scene.extend({
          onEnter: function () {
            this._super();
            sceneRef = new PlayLayer();
            this.addChild(sceneRef);
          }
        });
        cc.director.runScene(new Scene());
        $('msg').textContent = '关卡已载入 · 点「开始跑」';
      }, this);
    };
    cc.game.run();

    $('start').onclick = function () {
      if (sceneRef) sceneRef.startRun();
    };
    $('resultBtn').onclick = function () {
      hideResult();
      if (sceneRef) sceneRef.startRun();
    };
  }

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
})();
