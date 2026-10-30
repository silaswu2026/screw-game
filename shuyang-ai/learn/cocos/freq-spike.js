/**
 * 频率刺 — Cocos2d-JS Lite teaching stage (P0 product polish).
 */
(function () {
  var SP = '../../../xy-go/sprites/green/';
  var RES = [
    SP + 'walk_0.png', SP + 'walk_1.png', SP + 'walk_2.png', SP + 'walk_3.png',
    SP + 'idle.png', SP + 'knock_0.png'
  ];
  var W = 960, H = 360, DUR = 12, PAD = [2, 4, 6, 9];
  var fStep = 1, fLast = null, sceneRef = null;
  var spikeTex = null, spikeSmTex = null;

  function $(id) { return document.getElementById(id); }
  function fCnt(I) { return Math.floor(12 / I); }
  function fHit(I) { return 5 - I; }
  function n4(i) {
    $('n4').innerHTML = ['教', '练', '变', '考'].map(function (w, j) {
      return '<span class="' + (j === i ? 'on' : j < i ? 'done' : '') + '">' +
        ['①', '②', '③', '④'][j] + ' ' + w + '</span>';
    }).join('');
  }
  function setAct(step) {
    ['fRun', 'fTw', 'fEx'].forEach(function (id, j) {
      var el = $(id);
      if (el) el.classList.toggle('on', step === j + 1);
    });
  }
  function updHP(lose) {
    var M = 6, left = Math.max(0, M - lose);
    $('hp').innerHTML = '❤'.repeat(left) + '🤍'.repeat(M - left) +
      ' <span style="font-size:13px;color:#c9c3ef">掉' + lose + '❤</span>';
  }
  function liveMsg(I, n, lose, prefix) {
    $('msg').innerHTML = (prefix || '') + '每 <b style="color:#ffe7a0">' + I + '</b> 秒 → <b>' + n +
      '</b> 次刺 → 掉 <b style="color:#ffb4b4">' + lose + '❤</b>';
  }
  function bootErr(m) {
    var b = $('boot');
    if (!b) return;
    b.textContent = m;
    b.className = 'err';
  }
  function mkColor(w, h, r, g, b, a) {
    return new cc.LayerColor(cc.color(r, g, b, a == null ? 255 : a), w, h);
  }
  function texFromCanvas(cv) {
    var tex = new cc.Texture2D();
    tex.initWithElement(cv);
    tex.handleLoadedTexture();
    return tex;
  }
  function buildSpikeTex(wide) {
    var c = document.createElement('canvas');
    var w = wide ? 72 : 28, h = wide ? 40 : 26;
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    var n = wide ? 4 : 1;
    for (var k = 0; k < n; k++) {
      var sx = wide ? 4 + k * ((w - 8) / n) : 2;
      var sw = wide ? (w - 8) / n : w - 4;
      g.fillStyle = '#c5d0dc';
      g.beginPath();
      g.moveTo(sx, h);
      g.lineTo(sx + sw / 2, 2);
      g.lineTo(sx + sw, h);
      g.closePath();
      g.fill();
      g.strokeStyle = '#7a8794';
      g.lineWidth = 1.5;
      g.stroke();
    }
    if (wide) {
      g.fillStyle = '#3a3a42';
      g.fillRect(2, h - 5, w - 4, 5);
    }
    return texFromCanvas(c);
  }

  var FreqLayer = cc.Layer.extend({
    ctor: function () {
      this._super();
      this.preview = false;
      this.t0 = Date.now() / 1000;
      this.done = false;
      this.I = 3;
      this.frame = 0;
      this.frameT = 0;
      this.cells = [];
      this.marks = [];
      this.padSpikes = [];
      this.hitLabs = [];
      this._build();
      this.scheduleUpdate();
      return true;
    },
    _build: function () {
      this.addChild(mkColor(W, H, 22, 28, 58), 0);
      /* soft sky band */
      var sky = mkColor(W, 90, 40, 55, 100, 90);
      sky.setPosition(0, H - 90);
      this.addChild(sky, 0);

      var ground = mkColor(W - 170, 34, 107, 79, 47);
      ground.setPosition(0, 0);
      this.addChild(ground, 1);
      var grass = mkColor(W - 170, 8, 78, 168, 92);
      grass.setPosition(0, 26);
      this.addChild(grass, 2);

      var L = 16, cw = (W - 190) / 12;
      this.L = L; this.cw = cw; this.gy = 34;

      for (var s = 1; s <= 12; s++) {
        var cell = mkColor(cw - 4, 58, 255, 255, 255, 18);
        cell.setPosition(L + (s - 1) * cw + 2, H - 74);
        this.addChild(cell, 3);
        this.cells.push(cell);
        var lab = new cc.LabelTTF(s + '″', 'Arial', 13);
        lab.setFontFillColor(cc.color(201, 195, 239));
        lab.setPosition(L + (s - 1) * cw + cw / 2, H - 24);
        this.addChild(lab, 4);
        var mk = new cc.Sprite(spikeSmTex);
        mk.setPosition(L + (s - 1) * cw + cw / 2, H - 48);
        mk.setVisible(false);
        this.addChild(mk, 5);
        this.marks.push(mk);
      }

      for (var i = 0; i < PAD.length; i++) {
        var p = PAD[i];
        var px = L + p * cw - cw * 0.45;
        var base = mkColor(cw * 0.85 + 8, 8, 58, 58, 66);
        base.setPosition(px - 4, this.gy - 4);
        this.addChild(base, 3);
        var sp = new cc.Sprite(spikeTex);
        sp.setAnchorPoint(0.5, 0);
        sp.setPosition(px + cw * 0.4, this.gy - 2);
        sp.setScale(Math.max(0.85, (cw * 0.9) / 72));
        sp.setVisible(false);
        this.addChild(sp, 6);
        this.padSpikes.push(sp);
        var hl = new cc.LabelTTF('', 'Arial', 20);
        hl.setFontFillColor(cc.color(255, 107, 107));
        hl.setPosition(px + cw * 0.35, this.gy + 78);
        this.addChild(hl, 7);
        this.hitLabs.push(hl);
      }

      this.countLab = new cc.LabelTTF('4 次', 'Arial', 34);
      this.countLab.setFontFillColor(cc.color(255, 231, 160));
      this.countLab.setPosition(W - 85, H - 46);
      this.addChild(this.countLab, 10);

      this.side = new cc.LabelTTF('-2❤', 'Arial', 40);
      this.side.setFontFillColor(cc.color(255, 107, 107));
      this.side.setPosition(W - 85, 128);
      this.addChild(this.side, 10);

      this.hint = new cc.LabelTTF('越常越疼', 'Arial', 14);
      this.hint.setFontFillColor(cc.color(201, 195, 239));
      this.hint.setPosition(W - 85, 88);
      this.addChild(this.hint, 10);

      this.title = new cc.LabelTTF('教：拖滑条看刺变密', 'Arial', 18);
      this.title.setFontFillColor(cc.color(255, 231, 160));
      this.title.setAnchorPoint(0, 1);
      this.title.setPosition(16, H - 82);
      this.addChild(this.title, 10);

      this.ninja = new cc.Sprite(SP + 'walk_0.png');
      this.ninja.setAnchorPoint(0.5, 0);
      var sz = this.ninja.getContentSize();
      this.ninja.setScale(118 / Math.max(sz.width || 100, 1));
      this.ninja.setPosition(48, this.gy);
      this.addChild(this.ninja, 8);
      this.walk = [SP + 'walk_0.png', SP + 'walk_1.png', SP + 'walk_2.png', SP + 'walk_3.png'];
    },
    resetRun: function (preview, step) {
      this.preview = !!preview;
      this.t0 = Date.now() / 1000;
      this.done = false;
      this.I = +$('fI').value || 3;
      fStep = step || fStep;
      n4(preview ? fStep : 0);
      setAct(preview ? fStep : 0);
      var I = this.I, n = fCnt(I), lose = fHit(I);
      liveMsg(I, n, lose, preview ? (['', '🏃 ', '🔀 ', '🏁 '][fStep] || '') + '跑！ ' : '');
    },
    update: function (dt) {
      try {
      var I = +$('fI').value || 3;
      this.I = I;
      var now = Date.now() / 1000;
      var t = now - this.t0;
      if (!this.preview) t = t % (DUR + 1.5);
      var tt = Math.min(t, DUR);
      var n = fCnt(I);
      var lose = fHit(I);
      var drops = {};
      for (var s = I; s <= 12; s += I) drops[s] = 1;
      var up = function (x) { return x >= I && (x % I) < 1; };
      var raised = up(tt);
      var L = this.L, cw = this.cw, gy = this.gy;

      for (var s2 = 1; s2 <= 12; s2++) {
        var cell = this.cells[s2 - 1];
        if (tt >= s2) { cell.setColor(cc.color(59, 69, 144)); cell.setOpacity(255); }
        else { cell.setColor(cc.color(255, 255, 255)); cell.setOpacity(18); }
        this.marks[s2 - 1].setVisible(!!drops[s2]);
      }

      var hurt = false;
      for (var pi = 0; pi < PAD.length; pi++) {
        var p = PAD[pi];
        var spk = this.padSpikes[pi];
        spk.setVisible(raised);
        if (raised) {
          var pulse = 1 + 0.08 * Math.sin(tt * 18);
          spk.setScale(Math.max(0.85, (cw * 0.9) / 72) * pulse);
        }
        if (tt >= p && up(p)) {
          if (tt - p < 1) {
            hurt = true;
            this.hitLabs[pi].setString('-1❤');
            this.hitLabs[pi].setFontFillColor(cc.color(255, 107, 107));
          } else {
            this.hitLabs[pi].setString('✓');
            this.hitLabs[pi].setFontFillColor(cc.color(159, 240, 168));
          }
        } else if (tt >= p + 0.3) {
          this.hitLabs[pi].setString(up(p) ? '' : '✓');
          this.hitLabs[pi].setFontFillColor(cc.color(159, 240, 168));
          if (!up(p) && tt >= p) this.hitLabs[pi].setString('✓');
          else if (!(tt >= p && up(p))) this.hitLabs[pi].setString('');
        } else {
          this.hitLabs[pi].setString('');
        }
      }

      var nx = Math.min(W - 220, L + tt / DUR * 12 * cw);
      this.ninja.setPosition(nx, gy);
      this.frameT += dt;
      if (this.frameT > 0.1) {
        this.frameT = 0;
        this.frame = (this.frame + 1) % 4;
        var path = hurt ? SP + 'knock_0.png' : (tt >= DUR ? SP + 'idle.png' : this.walk[this.frame]);
        this.ninja.setTexture(cc.textureCache.addImage(path));
      }
      this.ninja.setOpacity(hurt && Math.floor(tt * 10) % 2 ? 130 : 255);
      if (hurt) this.ninja.setPosition(nx, gy + 6 * Math.abs(Math.sin(tt * 20)));

      this.countLab.setString(n + ' 次');
      this.side.setString('-' + lose + '❤');
      this.title.setString(this.preview
        ? (['', '练', '变', '考'][fStep] || '跑') + '：每' + I + '秒 · ' + n + '次刺'
        : '教：每' + I + '秒冒刺 → ' + n + '次');
      updHP(lose);

      if (!this.preview) {
        liveMsg(I, n, lose, '');
        return;
      }
      /* keep formula visible while running */
      if (t < DUR + 0.3) {
        liveMsg(I, n, lose, (['', '🏃 ', '🔀 ', '🏁 '][fStep] || '') + '跑！ ');
        return;
      }
      if (this.done) return;
      this.done = true;
      var pv = fLast;
      fLast = { I: I, h: lose };
      var label = ['', '🏃 练', '🔀 变', '🏁 考'][fStep] || '跑';
      var extra = fStep === 3 ? (lose <= 1 ? ' ✅ 过关！' : ' 😵 太难，回去调慢') : '';
      var cmp = pv ? ' <span style="font-size:13px;color:#c9c3ef">（上次掉' + pv.h + '❤ → 这次' + lose + '❤）</span>' : '';
      $('msg').innerHTML = label + '：每 <b style="color:#ffe7a0">' + I + '</b> 秒 → <b>' + n +
        '</b> 次刺 → 掉 <b style="color:#ffb4b4">' + lose + '❤</b>' + extra + cmp;
      } catch (eu) {
        bootErr('画面出错：' + eu);
      }
    }
  });

  var FreqScene = cc.Scene.extend({
    onEnter: function () {
      this._super();
      this.layer = new FreqLayer();
      this.addChild(this.layer);
      sceneRef = this.layer;
    }
  });

  function boot() {
    if (typeof cc === 'undefined') { bootErr('引擎没加载上，请刷新'); return; }
    window.addEventListener('error', function (e) { bootErr(e.message || String(e)); });
    n4(0);
    setAct(0);
    $('fI').oninput = function (e) {
      $('fIv').textContent = e.target.value;
      if (sceneRef && !sceneRef.preview) {
        /* teach mode reacts instantly via update */
      }
    };
    $('fRun').onclick = function () { fStep = 1; if (sceneRef) sceneRef.resetRun(true, 1); };
    $('fTw').onclick = function () {
      $('fI').value = 1; $('fIv').textContent = '1'; fStep = 2;
      if (sceneRef) sceneRef.resetRun(true, 2);
    };
    $('fEx').onclick = function () { fStep = 3; if (sceneRef) sceneRef.resetRun(true, 3); };

    cc.game.onStart = function () {
      try {
        cc.view.enableRetina(false);
        cc.view.adjustViewPort(true);
        cc.view.setDesignResolutionSize(W, H, cc.ResolutionPolicy.SHOW_ALL);
        cc.view.resizeWithBrowserSize(true);
        spikeTex = buildSpikeTex(true);
        spikeSmTex = buildSpikeTex(false);
        var left = RES.length;
        function tick() {
          left--;
          if (left > 0) return;
          cc.director.runScene(new FreqScene());
        }
        RES.forEach(function (src) {
          var img = new Image();
          img.onload = function () { try { cc.textureCache.addImage(src); } catch (e1) {} tick(); };
          img.onerror = function () { bootErr('图片加载失败'); tick(); };
          img.src = src;
        });
      } catch (e) {
        bootErr('启动失败：' + e);
      }
    };
    try { cc.game.run('gameCanvas'); }
    catch (e) { bootErr('启动失败：' + e); }
  }

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
})();
