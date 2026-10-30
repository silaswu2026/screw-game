/**
 * 频率刺 teaching stage on Cocos2d-JS Lite (Cocos2d-html5 lineage).
 * Mirrors ld27 canvas ② 频率: interval → spike count → HP, 练/变/考.
 * Green ninja from xy-go/sprites/green/. Does NOT modify level-design.html (ld27).
 * Lite has no DrawNode — uses LayerColor + LabelTTF + Sprite only.
 */
(function () {
  var SP = '../../../xy-go/sprites/green/';
  var RES = [
    { type: 'image', src: SP + 'walk_0.png' },
    { type: 'image', src: SP + 'walk_1.png' },
    { type: 'image', src: SP + 'walk_2.png' },
    { type: 'image', src: SP + 'walk_3.png' },
    { type: 'image', src: SP + 'idle.png' },
    { type: 'image', src: SP + 'knock_0.png' }
  ];
  var W = 960, H = 360, DUR = 12, PAD = [2, 4, 6, 9];
  var fStep = 1, fLast = null, sceneRef = null;

  function $(id) { return document.getElementById(id); }
  function fCnt(I) { return Math.floor(12 / I); }
  function fHit(I) { return 5 - I; }
  function n4(i) {
    $('n4').innerHTML = ['教', '练', '变', '考'].map(function (w, j) {
      return '<span class="' + (j === i ? 'on' : j < i ? 'done' : '') + '">' +
        ['①', '②', '③', '④'][j] + ' ' + w + '</span>';
    }).join('');
  }
  function updHP(lose) {
    var M = 6, left = Math.max(0, M - lose);
    $('hp').innerHTML = '❤'.repeat(left) + '🤍'.repeat(M - left) +
      ' <span style="font-size:12px;color:#c9c3ef">频率 → 掉' + lose + '❤</span>';
  }
  function mkColor(w, h, r, g, b, a) {
    return new cc.LayerColor(cc.color(r, g, b, a == null ? 255 : a), w, h);
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
      this.pads = [];
      this.padSpikes = [];
      this.hitLabs = [];
      this._build();
      this.scheduleUpdate();
      return true;
    },
    _build: function () {
      this.addChild(mkColor(W, H, 26, 32, 64), 0);

      var ground = mkColor(W - 180, 30, 107, 79, 47);
      ground.setPosition(0, 0);
      this.addChild(ground, 1);
      var grass = mkColor(W - 180, 6, 78, 168, 92);
      grass.setPosition(0, 24);
      this.addChild(grass, 2);

      var L = 20, cw = (W - 200) / 12;
      this.L = L; this.cw = cw; this.gy = 30;

      for (var s = 1; s <= 12; s++) {
        var cell = mkColor(cw - 4, 64, 255, 255, 255, 20);
        cell.setPosition(L + (s - 1) * cw + 2, H - 80);
        this.addChild(cell, 3);
        this.cells.push(cell);
        var lab = new cc.LabelTTF(s + '秒', 'Arial', 14);
        lab.setFontFillColor(cc.color(201, 195, 239));
        lab.setPosition(L + (s - 1) * cw + cw / 2, H - 28);
        this.addChild(lab, 4);
        var mk = new cc.LabelTTF('▲', 'Arial', 22);
        mk.setFontFillColor(cc.color(197, 208, 220));
        mk.setPosition(L + (s - 1) * cw + cw / 2, H - 55);
        mk.setVisible(false);
        this.addChild(mk, 5);
        this.marks.push(mk);
      }

      for (var i = 0; i < PAD.length; i++) {
        var p = PAD[i];
        var px = L + p * cw - cw * 0.5;
        var base = mkColor(cw * 0.9 + 8, 8, 58, 58, 66);
        base.setPosition(px - 4, this.gy - 4);
        this.addChild(base, 3);
        this.pads.push(base);
        var sp = new cc.LabelTTF('▲▲▲', 'Arial', 28);
        sp.setFontFillColor(cc.color(197, 208, 220));
        sp.setAnchorPoint(0.5, 0);
        sp.setPosition(px + cw * 0.45, this.gy);
        sp.setVisible(false);
        this.addChild(sp, 6);
        this.padSpikes.push(sp);
        var hl = new cc.LabelTTF('', 'Arial', 18);
        hl.setFontFillColor(cc.color(255, 107, 107));
        hl.setPosition(px + 20, this.gy + 70);
        this.addChild(hl, 7);
        this.hitLabs.push(hl);
      }

      this.countLab = new cc.LabelTTF('4 次', 'Arial', 32);
      this.countLab.setFontFillColor(cc.color(255, 231, 160));
      this.countLab.setPosition(W - 90, H - 50);
      this.addChild(this.countLab, 10);

      this.side = new cc.LabelTTF('-2❤', 'Arial', 36);
      this.side.setFontFillColor(cc.color(255, 107, 107));
      this.side.setPosition(W - 90, 120);
      this.addChild(this.side, 10);

      this.hint = new cc.LabelTTF('越常冒越疼', 'Arial', 14);
      this.hint.setFontFillColor(cc.color(201, 195, 239));
      this.hint.setPosition(W - 90, 80);
      this.addChild(this.hint, 10);

      this.title = new cc.LabelTTF('教：频率刺', 'Arial', 18);
      this.title.setFontFillColor(cc.color(255, 231, 160));
      this.title.setAnchorPoint(0, 1);
      this.title.setPosition(16, H - 88);
      this.addChild(this.title, 10);

      this.ninja = new cc.Sprite(SP + 'walk_0.png');
      this.ninja.setAnchorPoint(0.5, 0);
      var sz = this.ninja.getContentSize();
      this.ninja.setScale(100 / Math.max(sz.width || 100, 1));
      this.ninja.setPosition(40, this.gy);
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
      $('msg').textContent = '';
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
        if (tt >= s2) cell.setColor(cc.color(59, 69, 144));
        else cell.setColor(cc.color(255, 255, 255));
        cell.setOpacity(tt >= s2 ? 255 : 20);
        this.marks[s2 - 1].setVisible(!!drops[s2]);
      }

      var hurt = false;
      for (var pi = 0; pi < PAD.length; pi++) {
        var p = PAD[pi];
        this.padSpikes[pi].setVisible(raised);
        if (tt >= p && up(p)) {
          if (tt - p < 1) {
            hurt = true;
            this.hitLabs[pi].setString('-1❤');
            this.hitLabs[pi].setFontFillColor(cc.color(255, 107, 107));
          } else {
            this.hitLabs[pi].setString('✓');
            this.hitLabs[pi].setFontFillColor(cc.color(159, 240, 168));
          }
        } else if (tt >= p + 0.3 && !(tt >= p && up(p))) {
          this.hitLabs[pi].setString('✓');
          this.hitLabs[pi].setFontFillColor(cc.color(159, 240, 168));
        } else {
          this.hitLabs[pi].setString('');
        }
      }

      var nx = Math.min(W - 240, L + tt / DUR * 12 * cw);
      this.ninja.setPosition(nx, gy);
      this.frameT += dt;
      if (this.frameT > 0.1) {
        this.frameT = 0;
        this.frame = (this.frame + 1) % 4;
        var path = hurt ? SP + 'knock_0.png' : (tt >= DUR ? SP + 'idle.png' : this.walk[this.frame]);
        this.ninja.setTexture(cc.textureCache.addImage(path));
      }
      this.ninja.setOpacity(hurt && Math.floor(tt * 10) % 2 ? 120 : 255);

      this.countLab.setString(n + ' 次');
      this.side.setString('-' + lose + '❤');
      this.title.setString(this.preview
        ? ('频率 · 每' + I + '秒 · ' + n + '次刺')
        : ('教：每' + I + '秒冒刺 → ' + n + '次'));
      updHP(lose);

      if (!this.preview) {
        $('msg').innerHTML = '每 <b style="color:#ffe7a0">' + I + '</b> 秒 → <b>' + n +
          '</b> 次刺 → 掉 <b style="color:#ffb4b4">' + lose + '❤</b>';
        return;
      }
      if (t < DUR + 0.3) return;
      if (this.done) return;
      this.done = true;
      var pv = fLast;
      fLast = { I: I, h: lose };
      var label = ['', '🏃 练', '🔀 变', '🏁 考'][fStep] || '跑';
      var extra = fStep === 3 ? (lose <= 1 ? ' ✅ 过关' : ' 😵 太难，回去调慢') : '';
      var cmp = pv ? ' （上次 每' + pv.I + '秒 掉' + pv.h + '❤ → 这次 ' + lose + '❤）' : '';
      $('msg').innerHTML = label + '：每 <b style="color:#ffe7a0">' + I + '</b> 秒 → <b>' + n +
        '</b> 次刺 → 掉 <b style="color:#ffb4b4">' + lose + '❤</b>' + extra +
        '<span style="font-size:13px;color:#c9c3ef">' + cmp + '</span>';
      } catch (eu) {
        try { $('boot').textContent = 'update err: ' + eu; } catch (e2) {}
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
    function setBoot(m) { try { $('boot').textContent = m; } catch (e) {} }
    window.__ldBoot = setBoot;
    window.addEventListener('error', function (e) {
      setBoot('JS error: ' + (e.message || e));
    });
    if (typeof cc === 'undefined') { setBoot('cc missing — engine failed to load'); return; }
    setBoot('cc ok · renderMode=' + (cc.game && cc.game.config && cc.game.config.renderMode));
    n4(0);
    $('fI').oninput = function (e) {
      $('fIv').textContent = e.target.value;
    };
    $('fRun').onclick = function () { fStep = 1; if (sceneRef) sceneRef.resetRun(true, 1); };
    $('fTw').onclick = function () {
      $('fI').value = 1; $('fIv').textContent = '1'; fStep = 2;
      if (sceneRef) sceneRef.resetRun(true, 2);
    };
    $('fEx').onclick = function () { fStep = 3; if (sceneRef) sceneRef.resetRun(true, 3); };

    cc.game.onStart = function () {
      try {
        setBoot('onStart…');
        cc.view.enableRetina(false);
        cc.view.adjustViewPort(true);
        cc.view.setDesignResolutionSize(W, H, cc.ResolutionPolicy.SHOW_ALL);
        cc.view.resizeWithBrowserSize(true);
        /* LoaderScene.preload hung in some embeds; warm textures then run */
        var left = RES.length;
        function tick() {
          left--;
          if (left > 0) return;
          setBoot('assets ready · FreqScene');
          cc.director.runScene(new FreqScene());
          setTimeout(function () {
            setBoot(sceneRef ? 'FreqScene live · I=' + sceneRef.I : 'sceneRef null');
          }, 300);
        }
        RES.forEach(function (r) {
          try {
            var img = new Image();
            img.onload = function () {
              try { cc.textureCache.addImage(r.src); } catch (e1) {}
              tick();
            };
            img.onerror = function () { setBoot('asset fail: ' + r.src); tick(); };
            img.src = r.src;
          } catch (e2) { tick(); }
        });
        if (!RES.length) tick();
      } catch (e) {
        setBoot('onStart throw: ' + e + (e.stack || ''));
        console.error(e);
      }
    };
    try {
      cc.game.run('gameCanvas');
      if ($('boot').textContent.indexOf('onStart') < 0 && $('boot').textContent.indexOf('FreqScene') < 0 && $('boot').textContent.indexOf('assets') < 0) {
        setBoot('cc.game.run returned (waiting onStart) prepared=' + cc.game._prepared + ' loaded=' + cc._engineLoaded);
      }
    } catch (e) {
      setBoot('cc.game.run throw: ' + e + (e.stack || ''));
    }
  }

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
})();
