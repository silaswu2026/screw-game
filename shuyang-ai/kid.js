/* 澍暘的简单版。一天三拍：知识点 → 小视频 → 互动（含甜点）。
   新的一晚：往 LESSONS 末尾加一课。kid.html 默认打开最后一课，?lesson=id 可指定。
   进度写进和完整版相同的 localStorage，键是 kid:<课id>，不占用 30 天课程的天数。
   带 #sync= 打开时，用同一套合并规则接上。 */
(function () {
  const STORE = 'shuyang_ai_month_v1';
  const REWARD_STORE = 'shuyang_ai_rewards_v1';
  const PEOPLE = {
    '小雨': { src: 'avatars/xiaoyu.jpg', cls: 'xiaoyu', name: '小雨' },
    '爸爸': { src: 'avatars/dad-wuxin.jpg', cls: 'dad', name: '爸爸' },
    '妈妈': { src: 'avatars/mom-chunyan.jpg', cls: 'mom', name: '妈妈' },
    '澍暘': { src: 'avatars/pengpeng.jpg', cls: 'son', name: '伍澍暘' },
    '伍澍暘': { src: 'avatars/pengpeng.jpg', cls: 'son', name: '伍澍暘' },
  };
  const HOME_CAST = ['小雨', '爸爸', '妈妈', '伍澍暘'];

  const LESSONS = [
    {
      id: '2026-10-28',
      kicker: '昨晚',
      title: '人怎么动',
      with: ['小雨', '爸爸', '妈妈', '澍暘'],
      principle: '2D 是很多张画一张一张换；3D 是骨头架子在摆，皮跟着动。',
      skeleton: { url: 'learn/skeleton.html?v=mc11', label: '拖一拖：3D骨头人' },
      // 2D/3D explainer (relative to kid.html).
      video: { url: 'videos/how-characters-move-2d-3d.mp4' },
      guess: {
        prompt: '玩小宇时，爸爸喊暂停，你猜：换画还是摆骨头？',
        options: [
          { id: '2d', t: '换画（2D）', ok: true },
          { id: '3d', t: '摆骨头（3D）', ok: false },
        ],
        then: '3D 游戏里走路弯腿 = 骨头在摆',
      },
      dessert: {
        line: '接着玩小宇：一人开房出码/二维码，另一人扫码或输入房间码，一起闯关',
        play: '../xiao-yu/',
        label: '去玩联网双人',
      },
      star: '知道 2D 换画、3D 摆骨头',
    },
    {
      id: '2026-10-29',
      kicker: '今晚',
      title: '逐帧动画',
      with: ['小雨', '爸爸', '妈妈', '澍暘'],
      principle: '一张张画好的图按顺序换，就「动」起来了——像翻书一样。人物、怪物、陷阱都一样。',
      lab: { url: 'learn/frame-anim.html?v=mc11', label: '打开动手页 · 换帧试试' },
      skeleton: { url: 'learn/skeleton.html?v=mc11', label: '拖一拖：3D骨头人' },
      video: { url: 'videos/frame-anim-teach.mp4?v=1' },
      guess: {
        prompt: '小宇绿忍者倒地爬起，是怎么「动」的？',
        options: [
          { id: 'frames', t: '换好几张画好的图', ok: true },
          { id: 'bones', t: '摆立体骨头', ok: false },
        ],
        then: '对！小宇是 2D 逐帧：一张张图在换。打开动手页再练一遍，再去闯关看尖刺和怪物。',
      },
      dessert: {
        line: '去小宇闯关：看绿忍者倒地、怪物跳、尖刺动——心里数：第几张？',
        play: '../xy-go/',
        label: '去玩小宇闯关',
      },
      star: '知道逐帧动画：换图就动',
    },
  ];

  let screen = 'home';
  let miss = false;
  let replay = false;
  let hello = '';
  let copied = false;
  let shareFail = '';

  function lesson() {
    const id = new URLSearchParams(location.search).get('lesson');
    return LESSONS.find((item) => item.id === id) || LESSONS[LESSONS.length - 1];
  }
  function key() { return 'kid:' + lesson().id; }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function loadDays() {
    try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; }
  }
  function loadRewards() {
    try {
      const raw = JSON.parse(localStorage.getItem(REWARD_STORE) || 'null');
      if (!raw || typeof raw !== 'object') return { catalog: [], catalogTs: 0, redeemed: [] };
      if (!Array.isArray(raw.catalog)) raw.catalog = [];
      if (!Array.isArray(raw.redeemed)) raw.redeemed = [];
      if (!raw.catalogTs) raw.catalogTs = 0;
      return raw;
    } catch {
      return { catalog: [], catalogTs: 0, redeemed: [] };
    }
  }
  function readAll() {
    const rewards = loadRewards();
    return { v: 1, days: loadDays(), rewards: { catalog: rewards.catalog, catalogTs: rewards.catalogTs || 0, redeemed: rewards.redeemed || [] } };
  }
  function writeAll(state) {
    localStorage.setItem(STORE, JSON.stringify(state.days || {}));
    if (state.rewards) localStorage.setItem(REWARD_STORE, JSON.stringify(state.rewards));
  }
  function saved() { return readAll().days[key()] || {}; }
  function patch(fn) {
    const all = readAll();
    const cur = Object.assign({ steps: {}, widgets: {}, summary: '', done: false }, all.days[key()] || {});
    cur.steps = cur.steps || {};
    cur.widgets = cur.widgets || {};
    fn(cur);
    cur.at = new Date().toISOString();
    all.days[key()] = cur;
    writeAll(all);
    return cur;
  }
  function mark(id) {
    patch((cur) => { cur.steps[id] = { on: true, subs: [] }; });
  }
  function showDessert() {
    if (replay) return false;
    const guess = saved().widgets && saved().widgets.guess;
    return !!(guess && guess.ok);
  }

  function safeVideo(url) {
    const raw = String(url || '').trim();
    if (!raw) return null;
    if (!/^[a-z]+:/i.test(raw)) {
      if (raw.includes('..') && raw.split('..').length > 2) return null;
      if (/\.(mp4|webm)(\?|#|$)/i.test(raw)) return { kind: 'file', href: raw };
      return null;
    }
    let u;
    try { u = new URL(raw); } catch { return null; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      return id ? { kind: 'embed', href: 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) } : null;
    }
    if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'm.youtube.com') {
      let id = u.searchParams.get('v');
      const parts = u.pathname.split('/').filter(Boolean);
      if (!id && parts[0] === 'embed') id = parts[1];
      if (!id && parts[0] === 'shorts') id = parts[1];
      return id ? { kind: 'embed', href: 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) } : null;
    }
    if (/\.(mp4|webm)$/i.test(u.pathname)) return { kind: 'file', href: u.href };
    return null;
  }

  function faces(keys) {
    return `<div class="faces">${keys.map((name) => {
      const p = PEOPLE[name];
      if (!p) return '';
      return `<figure><img class="face ${p.cls}" src="${p.src}" alt="${esc(p.name)}"><figcaption>${esc(p.name)}</figcaption></figure>`;
    }).join('')}</div>`;
  }
  function dots(n) {
    return `<div class="dots" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i === n ? 'on' : ''}"></i>`).join('')}</div>`;
  }
  function linkBtn(cfg, fallbackLabel) {
    if (!cfg || !cfg.url) return '';
    const href = esc(String(cfg.url));
    const label = esc(cfg.label || fallbackLabel);
    return `<p class="skel"><a class="big" href="${href}">${label}</a></p>`;
  }
  function skeletonBtn(day) {
    return linkBtn(day && day.lab, '打开动手页') + linkBtn(day && day.skeleton, '看3D骨头图');
  }
  function videoSlot(url) {
    const src = safeVideo(url);
    if (!src) return '<div class="slot soon" id="slot"><div class="emoji">🎬</div><p>视频马上到</p></div>';
    if (src.kind === 'file') return `<div class="slot" id="slot"><video id="clip" controls playsinline src="${esc(src.href)}"></video></div>`;
    return `<div class="slot" id="slot"><iframe id="clip" title="小视频" src="${esc(src.href)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
  }

  function todayLabel() {
    try {
      return new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
      }).format(new Date());
    } catch (e) {
      return lesson().id;
    }
  }
  function homeHtml() {
    const day = lesson();
    const star = saved().done ? `<p class="line">⭐ ${esc(day.star)}</p>` : '';
    const note = hello ? `<p class="hello">${esc(hello)}</p>` : '';
    return `<section class="screen" data-screen="home">
      <div class="stage">
        ${faces(HOME_CAST)}
        <p class="kicker">${esc(todayLabel())}</p>
        <h1>${esc(day.title)}</h1>
        <p class="line">${esc(day.kicker)}课程</p>
        ${star}
        ${note}
      </div>
      <div class="dock">
        <button type="button" class="primary" data-act="start">${saved().done ? '再看一遍' : '进入今晚'}</button>
      </div>
    </section>`;
  }
  function ideaHtml() {
    const day = lesson();
    return `<section class="screen" data-screen="idea">
      <div class="stage">
        <p class="kicker">知识点</p>
        <p class="huge">${esc(day.principle)}</p>
        ${skeletonBtn(day)}
      </div>
      ${dots(1)}
      <div class="dock">
        <button type="button" class="primary" data-act="next">下一步</button>
      </div>
    </section>`;
  }
  function videoHtml() {
    const day = lesson();
    return `<section class="screen" data-screen="video">
      <div class="stage">
        <p class="kicker">小视频</p>
        ${videoSlot(day.video && day.video.url)}
      </div>
      ${dots(2)}
      <div class="dock">
        <button type="button" data-act="watch">看小视频</button>
        <button type="button" class="primary" data-act="next">下一步</button>
      </div>
    </section>`;
  }
  function playHtml() {
    const day = lesson();
    if (showDessert()) {
      return `<section class="screen" data-screen="play">
        <div class="stage">
          <p class="kicker">来玩</p>
          <p class="line">${esc(day.guess.then)}</p>
          <p class="line">${esc(day.dessert.line)}</p>
        </div>
        ${dots(3)}
        <div class="dock">
          <a class="btn" id="goPlay" href="${esc(day.dessert.play)}" target="_blank" rel="noopener noreferrer">${esc(day.dessert.label)}</a>
          <button type="button" class="primary" data-act="star">得星星</button>
        </div>
      </section>`;
    }
    const oops = miss ? '<p class="miss">再猜一次</p>' : '';
    return `<section class="screen" data-screen="play">
      <div class="stage">
        <p class="kicker">来玩</p>
        <p class="prompt">${esc(day.guess.prompt)}</p>
        ${oops}
      </div>
      ${dots(3)}
      <div class="dock">
        ${day.guess.options.map((opt) => `<button type="button" class="choice" data-act="guess" data-id="${esc(opt.id)}">${esc(opt.t)}</button>`).join('')}
      </div>
    </section>`;
  }
  function winHtml() {
    const day = lesson();
    const box = shareFail
      ? `<textarea class="sharebox" readonly rows="3">${esc(shareFail)}</textarea>`
      : '';
    return `<section class="screen" data-screen="win">
      <div class="stage">
        <p class="star pop">⭐</p>
        <p class="line">${esc(day.star)}</p>
        ${faces(day.with)}
      </div>
      <div class="dock">
        ${box}
        <button type="button" class="primary" data-act="share">${copied ? '发给爸爸啦' : '发给爸爸'}</button>
        <button type="button" data-act="again">好啦</button>
      </div>
    </section>`;
  }

  function render() {
    const app = document.getElementById('app');
    if (!app) return;
    const html = screen === 'idea' ? ideaHtml()
      : screen === 'video' ? videoHtml()
      : screen === 'play' ? playHtml()
      : screen === 'win' ? winHtml()
      : homeHtml();
    app.innerHTML = html;
  }
  function restore() {
    const cur = saved();
    if (cur.widgets && cur.widgets.guess && cur.widgets.guess.ok && !cur.done) screen = 'play';
    else if (cur.steps && cur.steps.video && cur.steps.video.on && !cur.done) screen = 'play';
    else if (cur.steps && cur.steps.idea && cur.steps.idea.on && !cur.done) screen = 'video';
    else screen = 'home';
  }

  async function share() {
    const code = await ShuyangSync.packState(readAll());
    const url = location.origin + location.pathname + location.search + '#sync=' + encodeURIComponent(code);
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      shareFail = '';
    } catch {
      copied = false;
      shareFail = url;
    }
    render();
  }

  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'start') {
      miss = false;
      replay = !!saved().done;
      screen = 'idea';
      render();
      return;
    }
    if (act === 'again') {
      miss = false;
      screen = 'home';
      render();
      return;
    }
    if (act === 'next' && screen === 'idea') {
      mark('idea');
      screen = 'video';
      render();
      return;
    }
    if (act === 'next' && screen === 'video') {
      mark('video');
      screen = 'play';
      render();
      return;
    }
    if (act === 'watch') {
      const clip = document.getElementById('clip');
      if (clip && clip.play) clip.play().catch(() => {});
      const slot = document.getElementById('slot');
      if (slot) slot.classList.add('ping');
      return;
    }
    if (act === 'guess') {
      const opt = lesson().guess.options.find((item) => item.id === el.dataset.id);
      if (!opt) return;
      if (!opt.ok) {
        miss = true;
        render();
        return;
      }
      miss = false;
      replay = false;
      patch((cur) => {
        cur.widgets.guess = { choice: opt.id, ok: true, ts: Date.now() };
        cur.steps.play = { on: true, subs: [] };
      });
      screen = 'play';
      render();
      return;
    }
    if (act === 'star') {
      const day = lesson();
      patch((cur) => {
        cur.steps.idea = { on: true, subs: [] };
        cur.steps.video = cur.steps.video && cur.steps.video.on ? cur.steps.video : { on: true, subs: [] };
        cur.steps.play = { on: true, subs: [] };
        cur.done = true;
        cur.didDo = true;
        cur.summary = day.star;
        cur.summaryTs = Date.now();
      });
      screen = 'win';
      if (navigator.vibrate) navigator.vibrate(12);
      render();
      return;
    }
    if (act === 'share') {
      share().catch(() => {});
    }
  }

  function codeFromHash() {
    const m = (location.hash || '').match(/sync=([^&]+)/);
    if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch { return m[1]; }
  }

  async function boot() {
    if (!globalThis.ShuyangSync) throw new Error('同步模块没载入');
    const code = codeFromHash();
    if (code) {
      try {
        const incoming = await ShuyangSync.unpackState(code);
        writeAll(ShuyangSync.mergeState(readAll(), incoming));
        history.replaceState(null, '', location.pathname + location.search);
        hello = '接上啦';
      } catch {
        hello = '这次没接上';
      }
    }
    restore();
    render();
    document.addEventListener('click', onClick);
  }

  boot().catch((err) => {
    const app = document.getElementById('app');
    if (app) app.innerHTML = '<p class="boom">页面没打开：' + esc(err.message) + '</p>';
  });
})();
