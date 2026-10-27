// Short synthesized sounds. No audio files, no CDN.
let ctx = null, master = null;
export const fx = { sound: true, vibe: true };

export function unlock() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tone(f, dur, { type = 'sine', vol = 0.3, to = null, delay = 0 } = {}) {
  if (!fx.sound || !ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

let noiseBuf = null;
function noise(dur, { vol = 0.25, freq = 800, type = 'lowpass', delay = 0 } = {}) {
  if (!fx.sound || !ctx) return;
  const t = ctx.currentTime + delay;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t); s.stop(t + dur + 0.02);
}

export const sfx = {
  turn() { tone(520, 0.07, { type: 'triangle', vol: 0.16, to: 860 }); },
  pop() { tone(480, 0.1, { to: 1200, vol: 0.22 }); },
  chime() { [523, 659, 784].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.14, delay: i * 0.05 })); },
  hurt() { tone(220, 0.14, { type: 'square', vol: 0.07, to: 90 }); noise(0.08, { vol: 0.08, freq: 400 }); },
  blocked() { tone(160, 0.1, { type: 'square', vol: 0.06, to: 110 }); },
  boom() {
    noise(0.35, { vol: 0.4, freq: 240, type: 'lowpass' });
    tone(90, 0.4, { type: 'sawtooth', vol: 0.12, to: 40 });
  },
  minus() { tone(660, 0.08, { type: 'square', vol: 0.06, to: 220 }); },
  badge() { tone(880, 0.1, { type: 'triangle', vol: 0.16, to: 1320 }); },
  chest() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, { type: 'triangle', vol: 0.16, delay: i * 0.08 })); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.16, delay: i * 0.09 })); },
  lose() { [392, 330, 262].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.14, delay: i * 0.1 })); },
  ui() { tone(740, 0.04, { vol: 0.08 }); },
};

export function buzz(ms) {
  if (fx.vibe && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ignore */ } }
}
