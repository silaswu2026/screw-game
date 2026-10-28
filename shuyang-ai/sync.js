/* 家庭进度同步：压缩进链接碎片，不经过服务器。不含密码。 */
(function (root) {
  function extractCode(input) {
    let s = String(input || '').trim();
    if (!s) return '';
    const hash = s.match(/#sync=([^&\s]+)/);
    if (hash) return safeDecode(hash[1]);
    const mid = s.match(/sync=([^&\s]+)/);
    if (mid) return safeDecode(mid[1]);
    return s;
  }

  function safeDecode(s) {
    try { return decodeURIComponent(s); } catch { return s; }
  }

  function b64urlEncode(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let bin = '';
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(u8).toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function b64urlDecode(s) {
    let t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    if (typeof atob === 'function') {
      const bin = atob(t);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(t, 'base64'));
  }

  async function deflateRaw(u8) {
    if (typeof CompressionStream !== 'undefined') {
      const stream = new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    if (typeof require === 'function') {
      const zlib = require('zlib');
      return new Uint8Array(zlib.deflateRawSync(Buffer.from(u8)));
    }
    return null;
  }

  async function inflateRaw(u8) {
    if (typeof DecompressionStream !== 'undefined') {
      const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    if (typeof require === 'function') {
      const zlib = require('zlib');
      return new Uint8Array(zlib.inflateRawSync(Buffer.from(u8)));
    }
    throw new Error('这台设备解不开压缩同步码');
  }

  function hasPayload(d) {
    if (!d || typeof d !== 'object') return false;
    if (d.done || d.didDo || d.summary || d.principleNote || d.madeNote || d.videoUrl || d.artifact) return true;
    if (d.steps && Object.values(d.steps).some((s) => s && (s.on || (s.subs || []).some(Boolean)))) return true;
    if (d.timerDone && Object.values(d.timerDone).some(Boolean)) return true;
    if (d.widgets && Object.keys(d.widgets).length) return true;
    return false;
  }

  function slimState(state) {
    const days = {};
    const src = (state && state.days) || {};
    Object.keys(src).forEach((k) => {
      if (hasPayload(src[k])) days[k] = src[k];
    });
    const rewards = (state && state.rewards) || {};
    return {
      v: 1,
      days,
      rewards: {
        catalog: rewards.catalog || [],
        catalogTs: rewards.catalogTs || 0,
        redeemed: rewards.redeemed || [],
      },
    };
  }

  async function packState(state) {
    const json = JSON.stringify(slimState(state));
    const bytes = new TextEncoder().encode(json);
    const z = await deflateRaw(bytes);
    if (z) return 'z' + b64urlEncode(z);
    return 'p' + b64urlEncode(bytes);
  }

  async function unpackState(code) {
    const raw = extractCode(code);
    if (!raw || raw.length < 2) throw new Error('同步码是空的');
    const flag = raw[0];
    const body = raw.slice(1);
    const bytes = b64urlDecode(body);
    let json;
    if (flag === 'z') json = new TextDecoder().decode(await inflateRaw(bytes));
    else if (flag === 'p') json = new TextDecoder().decode(bytes);
    else throw new Error('同步码格式不对');
    const obj = JSON.parse(json);
    if (!obj || obj.v !== 1 || typeof obj.days !== 'object') throw new Error('同步码版本不对');
    if (!obj.rewards) obj.rewards = { catalog: [], catalogTs: 0, redeemed: [] };
    return obj;
  }

  function maxNum(a, b) {
    return Math.max(Number(a) || 0, Number(b) || 0);
  }

  function pickText(textA, tsA, textB, tsB) {
    const a = textA || '';
    const b = textB || '';
    const ta = Number(tsA) || 0;
    const tb = Number(tsB) || 0;
    if (tb > ta) return b || a;
    if (ta > tb) return a || b;
    return b.length > a.length ? b : a || b;
  }

  function mergeSteps(a, b) {
    const out = {};
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    keys.forEach((id) => {
      const A = (a && a[id]) || {};
      const B = (b && b[id]) || {};
      const n = Math.max((A.subs || []).length, (B.subs || []).length);
      const subs = [];
      for (let i = 0; i < n; i++) subs[i] = !!((A.subs || [])[i] || (B.subs || [])[i]);
      out[id] = { on: !!(A.on || B.on), subs };
    });
    return out;
  }

  function mergeWidgets(a, b) {
    const out = {};
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    keys.forEach((id) => {
      const A = a && a[id];
      const B = b && b[id];
      if (!A) out[id] = B;
      else if (!B) out[id] = A;
      else out[id] = (Number(A.ts) || 0) >= (Number(B.ts) || 0) ? A : B;
    });
    return out;
  }

  function orMap(a, b) {
    const out = { ...(a || {}), ...(b || {}) };
    Object.keys(out).forEach((k) => {
      out[k] = !!((a && a[k]) || (b && b[k]));
    });
    return out;
  }

  function laterIso(a, b) {
    const as = a || '';
    const bs = b || '';
    return as >= bs ? as || bs : bs;
  }

  function mergeDay(local, incoming) {
    const A = local || {};
    const B = incoming || {};
    return {
      summary: pickText(A.summary, A.summaryTs, B.summary, B.summaryTs),
      summaryTs: maxNum(A.summaryTs, B.summaryTs),
      principleNote: pickText(A.principleNote, A.principleTs, B.principleNote, B.principleTs),
      principleTs: maxNum(A.principleTs, B.principleTs),
      madeNote: pickText(A.madeNote, A.madeNoteTs, B.madeNote, B.madeNoteTs),
      madeNoteTs: maxNum(A.madeNoteTs, B.madeNoteTs),
      videoUrl: pickText(A.videoUrl, A.videoTs, B.videoUrl, B.videoTs),
      videoTs: maxNum(A.videoTs, B.videoTs),
      steps: mergeSteps(A.steps, B.steps),
      timerDone: orMap(A.timerDone, B.timerDone),
      widgets: mergeWidgets(A.widgets, B.widgets),
      done: !!(A.done || B.done),
      didDo: !!(A.didDo || B.didDo),
      at: laterIso(A.at, B.at),
    };
  }

  function mergeRedeemed(a, b) {
    const map = new Map();
    [...(a || []), ...(b || [])].forEach((item) => {
      if (!item) return;
      const key = `${item.at || ''}|${item.name || ''}|${item.cost || 0}`;
      const prev = map.get(key);
      if (!prev) map.set(key, { ...item });
      else prev.fulfilled = !!(prev.fulfilled || item.fulfilled);
    });
    return [...map.values()];
  }

  function mergeRewards(a, b) {
    const A = a || { catalog: [], redeemed: [], catalogTs: 0 };
    const B = b || { catalog: [], redeemed: [], catalogTs: 0 };
    const aTs = Number(A.catalogTs) || 0;
    const bTs = Number(B.catalogTs) || 0;
    const newer = bTs >= aTs ? B : A;
    const older = newer === B ? A : B;
    const catalog = newer.catalog && newer.catalog.length ? newer.catalog : older.catalog || [];
    return {
      catalog,
      catalogTs: Math.max(aTs, bTs),
      redeemed: mergeRedeemed(A.redeemed, B.redeemed),
    };
  }

  function mergeDays(a, b) {
    const out = {};
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    keys.forEach((k) => {
      out[k] = mergeDay(a && a[k], b && b[k]);
    });
    return out;
  }

  function mergeState(local, incoming) {
    return {
      v: 1,
      days: mergeDays(local && local.days, incoming && incoming.days),
      rewards: mergeRewards(local && local.rewards, incoming && incoming.rewards),
    };
  }

  const api = { extractCode, packState, unpackState, mergeState, mergeDay };
  root.ShuyangSync = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

if (typeof require === 'function' && typeof module !== 'undefined' && require.main === module) {
  (async () => {
    const { packState, unpackState, mergeState } = module.exports;
    const dad = {
      v: 1,
      days: {
        1: {
          done: true,
          summary: '忍者是画',
          summaryTs: 20,
          principleNote: '会换的画',
          principleTs: 20,
          steps: { play: { on: true, subs: [true, false, true] } },
          widgets: { card: { artifact: '成果卡', ts: 5 } },
          at: '2026-10-02T00:00:00.000Z',
        },
      },
      rewards: {
        catalog: [{ id: 'r1', name: '贴纸', cost: 3, emoji: '🍬' }],
        catalogTs: 10,
        redeemed: [{ name: '贴纸', cost: 3, at: 't1', fulfilled: false }],
      },
    };
    const son = {
      v: 1,
      days: {
        1: {
          done: false,
          summary: '',
          summaryTs: 1,
          principleNote: '我自己说的更长的一句原理',
          principleTs: 30,
          steps: { play: { on: false, subs: [false, true, false] } },
          widgets: { card: { artifact: '儿子的卡', ts: 40 } },
          timerDone: { play: true },
          at: '2026-10-01T00:00:00.000Z',
        },
        2: { done: true, summary: '翻页', summaryTs: 3, at: '2026-10-03T00:00:00.000Z' },
      },
      rewards: {
        catalog: [{ id: 'r9', name: '旧清单', cost: 1, emoji: '⭐' }],
        catalogTs: 1,
        redeemed: [{ name: '贴纸', cost: 3, at: 't1', fulfilled: true }, { name: '动画', cost: 5, at: 't2', fulfilled: false }],
      },
    };
    const merged = mergeState(son, dad);
    const d1 = merged.days[1];
    if (!d1.done) throw new Error('done should union');
    if (!d1.steps.play.on || !d1.steps.play.subs[1]) throw new Error('steps should OR');
    if (d1.summary !== '忍者是画') throw new Error('newer summary');
    if (d1.principleNote.indexOf('更长') < 0) throw new Error('newer principle kept');
    if (d1.widgets.card.artifact !== '儿子的卡') throw new Error('newer widget');
    if (!d1.timerDone.play) throw new Error('timer OR');
    if (!merged.days[2].done) throw new Error('son-only day');
    if (merged.rewards.catalog[0].id !== 'r1') throw new Error('newer catalog');
    if (merged.rewards.redeemed.length !== 2) throw new Error('redeemed union');
    const sticker = merged.rewards.redeemed.find((x) => x.at === 't1');
    if (!sticker.fulfilled) throw new Error('fulfilled OR');
    const code = await packState(merged);
    const back = await unpackState(code);
    if (back.days[1].summary !== '忍者是画') throw new Error('roundtrip summary');
    const url = 'https://example.com/shuyang-ai/#sync=' + encodeURIComponent(code);
    const again = await unpackState(url);
    if (again.days[2].summary !== '翻页') throw new Error('extract from url');
    console.log('sync ok', code.length);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
