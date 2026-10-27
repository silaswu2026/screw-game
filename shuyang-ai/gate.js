
(function () {
  const SALT = 'shuyang_ai_gate_v1';
  const HASH = 'c22d0e5641e196dfb8922ba1c9171f8460cdd56b2b779410ae25572961b34b71';
  const KEY = 'shuyang_ai_unlocked_v1';
  async function sha(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SALT + text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  function showGate() {
    document.documentElement.style.visibility = 'hidden';
    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1a1f4a;color:#fff;font-family:-apple-system,PingFang SC,sans-serif;padding:24px;text-align:center">
        <form id="gate" style="max-width:360px;width:100%">
          <div style="font-size:40px;margin-bottom:8px">🔒</div>
          <h1 style="font-size:22px;margin:0 0 8px">澍暘的 AI 冒险月</h1>
          <p style="color:#b9b4d8;margin:0 0 16px">家庭私密页，请输入密码</p>
          <input id="pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="密码" style="width:100%;padding:14px;border-radius:12px;border:1px solid #3a4278;background:#121633;color:#fff;font-size:18px;margin-bottom:12px"/>
          <button style="width:100%;padding:14px;border:0;border-radius:999px;background:#5fb36b;color:#fff;font-size:17px">进入</button>
          <p id="err" style="color:#ff8f8f;min-height:1.2em;margin-top:12px"></p>
        </form>
      </div>`;
    document.documentElement.style.visibility = 'visible';
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
