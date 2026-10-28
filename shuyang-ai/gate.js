
(function () {
  const SALT = 'shuyang_ai_gate_v1';
  const HASH = 'c22d0e5641e196dfb8922ba1c9171f8460cdd56b2b779410ae25572961b34b71';
  const KEY = 'shuyang_ai_unlocked_v1';
  async function sha(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SALT + text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  function showGate() {
    document.body.innerHTML = `
      <div class="gate-wrap">
        <div class="gate-glow"></div>
        <form id="gate" class="gate-card">
          <div class="gate-moon">🌙</div>
          <h1>澍暘的 AI 冒险月</h1>
          <p class="gate-sub">家庭私密小世界 · 输入密码进屋</p>
          <input id="pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="家庭密码" autofocus/>
          <button type="submit">进入冒险</button>
          <p id="err" class="gate-err"></p>
        </form>
      </div>
      <style>
        body{margin:0;min-height:100vh;background:radial-gradient(1200px 600px at 50% -10%,#3a2f7a,#12162f 55%,#0b0e1c);font-family:-apple-system,"PingFang SC",sans-serif;color:#fff}
        .gate-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;position:relative;overflow:hidden}
        .gate-glow{position:absolute;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle,#ffe9a055,#ffe9a000 70%);top:12%;filter:blur(4px)}
        .gate-card{position:relative;max-width:380px;width:100%;background:rgba(28,32,70,.88);border:1px solid #5a63a888;border-radius:24px;padding:28px 22px 22px;text-align:center;box-shadow:0 20px 60px #0008, inset 0 1px 0 #ffffff22;backdrop-filter:blur(10px)}
        .gate-moon{font-size:48px;margin-bottom:6px}
        h1{font-size:24px;margin:0 0 8px;letter-spacing:.02em}
        .gate-sub{color:#c9c3ef;margin:0 0 18px;font-size:14px}
        input{width:100%;box-sizing:border-box;padding:14px 16px;border-radius:14px;border:1px solid #4a5288;background:#0f1330;color:#fff;font-size:18px;margin-bottom:12px;outline:none}
        input:focus{border-color:#ffe9a0;box-shadow:0 0 0 3px #ffe9a033}
        button{width:100%;padding:14px;border:0;border-radius:999px;background:linear-gradient(180deg,#78d484,#4ea85c);color:#fff;font-size:17px;font-weight:700;box-shadow:0 4px 0 #2f6d3a;cursor:pointer}
        button:active{transform:translateY(2px);box-shadow:0 2px 0 #2f6d3a}
        .gate-err{color:#ff9a9a;min-height:1.2em;margin:12px 0 0;font-size:14px}
      </style>`;
    document.getElementById('gate').onsubmit = async (e) => {
      e.preventDefault();
      const v = document.getElementById('pin').value.trim();
      const h = await sha(v);
      if (h === HASH) {
        sessionStorage.setItem(KEY, '1');
        location.reload();
      } else {
        document.getElementById('err').textContent = '密码不对，再试一次';
      }
    };
  }
  window.__shuyangGate = async function () {
    if (sessionStorage.getItem(KEY) === '1') return true;
    showGate();
    return false;
  };
})();
