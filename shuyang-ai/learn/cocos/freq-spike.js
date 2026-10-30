/**
 * 频率刺 — Cocos2d-JS Lite (P0 delight: sound + 考 overlay + denser world).
 */
(function () {
  var SP = '../../../xy-go/sprites/green/';
  var RES = [
    SP + 'walk_0.png', SP + 'walk_1.png', SP + 'walk_2.png', SP + 'walk_3.png',
    SP + 'idle.png', SP + 'knock_0.png', SP + 'jump_0.png'
  ];
  var W = 960, H = 300, DUR = 12, PAD = [2, 4, 6, 9];
  var fStep = 1, fLast = null, sceneRef = null;
  var spikeTex = null, spikeSmTex = null, cloudTex = null, hillTex = null, platTex = null;
  var audioCtx = null, lastRaised = false, thudAt = {};

  function $(id) { return document.getElementById(id); }
  function fCnt(I) { return Math.floor(12 / I); }
  function fHit(I) { return 5 - I; }

  function ensureAudio() {
    if (audioCtx) return audioCtx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
    return audioCtx;
  }
  function unlockAudio() {
    var ctx = ensureAudio();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
  }
  function tone(freq, dur, type, vol, slideTo) {
    var ctx = ensureAudio();
    if (!ctx) return;
    var t0 = ctx.currentTime;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.22, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noiseThud() {
    var ctx = ensureAudio();
    if (!ctx) return;
    var t0 = ctx.currentTime;
    var n = Math.floor(ctx.sampleRate * 0.12);
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.2);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var g = ctx.createGain();
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 180;
    g.gain.setValueAtTime(0.45, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    src.connect(f); f.connect(g); g.connect(ctx.destination);
    src.start(t0);
    tone(90, 0.12, 'triangle', 0.18, 45);
  }
  function sfxThud() { try { noiseThud(); } catch (e) {} }
  function sfxDing() {
    try {
      tone(880, 0.18, 'sine', 0.2, 1320);
      setTimeout(function () { tone(1320, 0.28, 'sine', 0.16, 1760); }, 90);
    } catch (e) {}
  }
  function sfxFail() {
    try { tone(220, 0.22, 'sawtooth', 0.12, 90); } catch (e) {}
  }

  function n4(i) { /* removed: cryptic progress row confused kids */ }
  function setAct(step) {
    ['fRun', 'fTw', 'fEx'].forEach(function (id, j) {
      var el = $(id);
      if (el) el.classList.toggle('on', step === j + 1);
    });
  }
  var _lastLose = 0;
  function updHP(lose) {
    var M = 6, left = Math.max(0, M - lose);
    if (lose > _lastLose) flashHit();
    _lastLose = lose;
    $('hp').innerHTML = '❤'.repeat(left) + '🤍'.repeat(M - left) +
      ' <span style="font-size:13px;color:#c9c3ef">掉' + lose + '❤</span>';
  }
  function liveMsg(I, n, lose, prefix) {
    $('msg').innerHTML = (prefix || '') + '每 <b style="color:#ffe7a0">' + I + '</b> 秒 → <b>' + n +
      '</b> 次刺 → 掉 <b style="color:#ffb4b4">' + lose + '❤</b>';
  }
  function flashHit() {
    var wrap = document.querySelector('.cvwrap');
    if (!wrap) return;
    wrap.style.boxShadow = '0 0 0 3px #ff4d4d, 0 0 24px #ff4d4d88';
    setTimeout(function () { wrap.style.boxShadow = ''; }, 180);
  }
  function hideResult() {
    var r = $('result');
    if (!r) return;
    r.classList.remove('show', 'win', 'fail');
  }
  function showResult(win, I, n, lose) {
    var r = $('result');
    if (!r) return;
    r.classList.add('show');
    r.classList.toggle('win', !!win);
    r.classList.toggle('fail', !win);
    $('resultBig').textContent = win ? '🎉 过关！' : '😵 再试一次';
    $('resultSub').innerHTML = win
      ? '每 <b style="color:#ffe7a0">' + I + '</b> 秒 → 只掉 <b>' + lose + '❤</b> · 真棒！'
      : '刺太密了（掉 <b style="color:#ffb4b4">' + lose + '❤</b>）· 把滑条拖慢再考';
    $('resultBtn').textContent = win ? '再玩一次' : '再试一次';
    if (win) sfxDing(); else sfxFail();
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
  function buildCloudTex() {
    var c = document.createElement('canvas');
    c.width = 120; c.height = 48;
    var g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.55)';
    function blob(x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    blob(36, 28, 18); blob(58, 22, 22); blob(82, 28, 16); blob(50, 32, 14);
    return texFromCanvas(c);
  }
  function buildHillTex() {
    var c = document.createElement('canvas');
    c.width = 280; c.height = 90;
    var g = c.getContext('2d');
    g.fillStyle = '#2d4a6e';
    g.beginPath();
    g.moveTo(0, 90);
    g.quadraticCurveTo(70, 10, 140, 70);
    g.quadraticCurveTo(200, 20, 280, 90);
    g.closePath();
    g.fill();
    g.fillStyle = '#3a5f88';
    g.beginPath();
    g.moveTo(40, 90);
    g.quadraticCurveTo(120, 30, 200, 90);
    g.closePath();
    g.fill();
    return texFromCanvas(c);
  }
  function buildPlatTex() {
    var c = document.createElement('canvas');
    c.width = 96; c.height = 28;
    var g = c.getContext('2d');
    g.fillStyle = '#6b5238';
    g.fillRect(0, 8, 96, 20);
    g.fillStyle = '#5a9e5a';
    g.fillRect(0, 4, 96, 10);
    g.fillStyle = '#7ec87e';
    g.fillRect(0, 4, 96, 4);
    g.fillStyle = '#4a3a28';
    g.fillRect(0, 24, 96, 4);
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
      this.plats = [];
      this._build();
      this.scheduleUpdate();
      return true;
    },
    _build: function () {
      /* opaque sky — no dark “black panel” void at top */
      this.addChild(mkColor(W, H, 58, 92, 150), 0);
      var skyTop = mkColor(W, 120, 92, 140, 200);
      skyTop.setPosition(0, H - 120);
      this.addChild(skyTop, 0);

      /* hills */
      var h1 = new cc.Sprite(hillTex);
      h1.setAnchorPoint(0, 0);
      h1.setPosition(0, 90);
      h1.setOpacity(200);
      this.addChild(h1, 1);
      var h2 = new cc.Sprite(hillTex);
      h2.setAnchorPoint(0, 0);
      h2.setScaleX(-1);
      h2.setPosition(W - 40, 82);
      h2.setOpacity(170);
      this.addChild(h2, 1);

      /* clouds */
      for (var ci = 0; ci < 3; ci++) {
        var cl = new cc.Sprite(cloudTex);
        cl.setPosition(80 + ci * 260, H - 90 - (ci % 2) * 22);
        cl.setOpacity(160);
        cl.setScale(0.85 + ci * 0.1);
        this.addChild(cl, 2);
      }

      /* ground strip */
      /* fill canvas: thick ground + grass so stage is not an empty navy box */
      var ground = mkColor(W, 100, 107, 79, 47);
      ground.setPosition(0, 0);
      this.addChild(ground, 3);
      var grass = mkColor(W, 14, 78, 168, 92);
      grass.setPosition(0, 92);
      this.addChild(grass, 4);
      var dirtLine = mkColor(W, 4, 80, 55, 35, 140);
      dirtLine.setPosition(0, 40);
      this.addChild(dirtLine, 4);

      /* full-width ground math — no top timeline strip, no side black card */
      var L = 24, cw = (W - 48) / 12;
      this.L = L; this.cw = cw; this.gy = 100;
      this.cells = [];
      this.marks = [];

      /* decorative platforms between pads */
      var platXs = [1.2, 3.1, 5.0, 7.2, 10.0];
      for (var pi = 0; pi < platXs.length; pi++) {
        var pl = new cc.Sprite(platTex);
        pl.setAnchorPoint(0.5, 0);
        var px = L + platXs[pi] * cw;
        pl.setPosition(px, this.gy + 18 + (pi % 2) * 16);
        pl.setScale(0.7 + (pi % 3) * 0.08);
        pl.setOpacity(220);
        this.addChild(pl, 5);
        this.plats.push(pl);
      }

      for (var i = 0; i < PAD.length; i++) {
        var p = PAD[i];
        var px2 = L + p * cw - cw * 0.45;
        var base = mkColor(cw * 0.85 + 8, 8, 58, 58, 66);
        base.setPosition(px2 - 4, this.gy - 4);
        this.addChild(base, 5);
        var sp = new cc.Sprite(spikeTex);
        sp.setAnchorPoint(0.5, 0);
        sp.setPosition(px2 + cw * 0.4, this.gy - 2);
        sp.setScale(Math.max(0.85, (cw * 0.9) / 72));
        sp.setVisible(false);
        this.addChild(sp, 7);
        this.padSpikes.push(sp);
        var hl = new cc.LabelTTF('', 'Arial', 22);
        hl.setFontFillColor(cc.color(255, 107, 107));
        hl.setPosition(px2 + cw * 0.35, this.gy + 78);
        this.addChild(hl, 9);
        this.hitLabs.push(hl);
      }

      /* one clear kid readout — no black panel */
      this.countLab = new cc.LabelTTF('刺 4 次', 'Arial', 28);
      this.countLab.setFontFillColor(cc.color(255, 231, 160));
      this.countLab.setPosition(W - 90, H - 36);
      this.addChild(this.countLab, 10);

      this.side = new cc.LabelTTF('掉 2❤', 'Arial', 28);
      this.side.setFontFillColor(cc.color(255, 140, 140));
      this.side.setPosition(W - 90, H - 72);
      this.addChild(this.side, 10);

      this.hint = null;
      this.title = null;

      this.ninja = new cc.Sprite(SP + 'walk_0.png');
      this.ninja.setAnchorPoint(0.5, 0);
      var sz = this.ninja.getContentSize();
      this.ninja.setScale(118 / Math.max(sz.width || 100, 1));
      this.ninja.setPosition(48, this.gy);
      this.addChild(this.ninja, 10);
      this.walk = [SP + 'walk_0.png', SP + 'walk_1.png', SP + 'walk_2.png', SP + 'walk_3.png'];
    },
    resetRun: function (preview, step) {
      this.preview = !!preview;
      this.t0 = Date.now() / 1000;
      this.done = false;
      this.I = +$('fI').value || 3;
      fStep = step || fStep;
      lastRaised = false;
      thudAt = {};
      hideResult();
      _lastLose = 0;
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
      var elapsed = now - this.t0;
      var cycle = 0;
      var t = elapsed;
      if (!this.preview) {
        cycle = Math.floor(elapsed / (DUR + 1.5));
        t = elapsed % (DUR + 1.5);
      }
      var tt = Math.min(t, DUR);
      var n = fCnt(I);
      var lose = fHit(I);
      var drops = {};
      for (var s = I; s <= 12; s += I) drops[s] = 1;
      var up = function (x) { return x >= I && (x % I) < 1; };
      var raised = up(tt);
      var L = this.L, cw = this.cw, gy = this.gy;

      /* spike thud on rising edge (preview + teach pulse) */
      if (raised && !lastRaised) {
        var key = cycle + ':' + Math.floor(tt / I);
        if (!thudAt[key]) {
          thudAt[key] = 1;
          sfxThud();
        }
      }
      lastRaised = raised;

      var hurt = false;
      for (var pi = 0; pi < PAD.length; pi++) {
        var p = PAD[pi];
        var spk = this.padSpikes[pi];
        spk.setVisible(raised);
        if (raised) {
          var pulse = 1 + 0.08 * Math.sin(tt * 18);
          spk.setScale(Math.max(0.85, (cw * 0.9) / 72) * pulse);
        }
        if (this.hitLabs[pi]) this.hitLabs[pi].setString('');
        if (tt >= p && up(p) && (tt - p < 1)) hurt = true;
      }

      var nx = Math.min(W - 80, L + tt / DUR * 12 * cw);
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

      this.countLab.setString('刺 ' + n + ' 次');
      this.side.setString('掉 ' + lose + '❤');
      updHP(lose);

      if (!this.preview) {
        liveMsg(I, n, lose, '');
        return;
      }
      if (t < DUR + 0.3) {
        liveMsg(I, n, lose, (['', '🏃 ', '🔀 ', '🏁 '][fStep] || '') + '跑！ ');
        return;
      }
      if (this.done) return;
      this.done = true;
      var pv = fLast;
      fLast = { I: I, h: lose };
      var label = ['', '🏃 练', '🔀 变', '🏁 考'][fStep] || '跑';
      var win = lose <= 1;
      var extra = '';
      var cmp = pv ? ' <span style="font-size:13px;color:#c9c3ef">（上次掉' + pv.h + '❤ → 这次' + lose + '❤）</span>' : '';
      if (fStep === 3) {
        extra = win ? ' ✅ 过关！' : ' 😵 太难';
        showResult(win, I, n, lose);
      } else if (fStep === 1 || fStep === 2) {
        /* soft ding when a practice/twist run finishes without 考 overlay */
        if (lose <= 2) sfxDing();
      }
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
    hideResult();
    $('fI').oninput = function (e) {
      $('fIv').textContent = e.target.value;
      unlockAudio();
    };
    function startRun(step, forceI) {
      unlockAudio();
      hideResult();
      if (forceI != null) { $('fI').value = forceI; $('fIv').textContent = String(forceI); }
      fStep = step;
      if (sceneRef) sceneRef.resetRun(true, step);
    }
    $('fRun').onclick = function () { startRun(1); };
    $('fTw').onclick = function () { startRun(2, 1); };
    $('fEx').onclick = function () { startRun(3); };
    $('resultBtn').onclick = function () {
      unlockAudio();
      hideResult();
      /* one-tap: retry 考 with current slider */
      startRun(3);
    };

    cc.game.onStart = function () {
      try {
        cc.view.enableRetina(false);
        cc.view.adjustViewPort(true);
        cc.view.setDesignResolutionSize(W, H, cc.ResolutionPolicy.SHOW_ALL);
        cc.view.resizeWithBrowserSize(true);
        spikeTex = buildSpikeTex(true);
        spikeSmTex = buildSpikeTex(false);
        cloudTex = buildCloudTex();
        hillTex = buildHillTex();
        platTex = buildPlatTex();
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
