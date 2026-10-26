// Synthesized SFX (WebAudio) + haptics — no audio files
let ctx=null, master=null;
export const fx = { sound:true, vibe:true };
export function unlock(){
  if (!ctx){ const AC = window.AudioContext || window.webkitAudioContext; if(!AC) return; ctx=new AC(); master=ctx.createGain(); master.gain.value=0.55; master.connect(ctx.destination); }
  if (ctx.state==='suspended') ctx.resume();
}
function tone(f, dur, {type='sine', vol=0.3, to=null, delay=0, attack=0.005}={}){
  if (!fx.sound || !ctx) return; const t=ctx.currentTime+delay;
  const o=ctx.createOscillator(), g=ctx.createGain(); o.type=type; o.frequency.setValueAtTime(f,t);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20,to), t+dur);
  g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol,t+attack); g.gain.exponentialRampToValueAtTime(0.0008,t+dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+dur+0.02);
}
let noiseBuf=null;
function noise(dur, {vol=0.3, freq=3000, ftype='highpass', delay=0}={}){
  if (!fx.sound || !ctx) return; const t=ctx.currentTime+delay;
  if (!noiseBuf){ noiseBuf=ctx.createBuffer(1, ctx.sampleRate*0.5, ctx.sampleRate); const d=noiseBuf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; }
  const s=ctx.createBufferSource(); s.buffer=noiseBuf; const f=ctx.createBiquadFilter(); f.type=ftype; f.frequency.value=freq;
  const g=ctx.createGain(); g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.0008,t+dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t+dur+0.02);
}
export const sfx = {
  turn(){ for (let i=0;i<3;i++){ noise(0.025,{vol:0.32,freq:4000,delay:i*0.055}); tone(2200-i*200,0.03,{type:'square',vol:0.05,delay:i*0.055}); } },
  pop(){ tone(500,0.12,{to:1300,vol:0.28}); noise(0.04,{vol:0.14,freq:2000,delay:0.02}); },
  chime(combo=1){ const b=660*Math.pow(2,Math.min(combo-1,6)*2/12); [1,1.26,1.5,2].forEach((m,i)=>tone(b*m,0.32,{type:'triangle',vol:0.16,delay:i*0.06})); },
  thud(){ tone(140,0.28,{to:45,vol:0.45}); noise(0.16,{vol:0.22,freq:500,ftype:'lowpass'}); },
  blocked(){ tone(180,0.12,{type:'square',vol:0.08,to:140}); },
  jingle(){ [523,659,784,1047,1319].forEach((f,i)=>tone(f,0.32,{type:'triangle',vol:0.18,delay:i*0.1})); },
  boing(){ tone(250,0.32,{to:900,vol:0.22}); tone(900,0.18,{to:400,vol:0.1,delay:0.28}); },
  lose(){ [440,370,311,262].forEach((f,i)=>tone(f,0.28,{type:'triangle',vol:0.16,delay:i*0.14})); },
  tapUI(){ tone(880,0.05,{vol:0.1}); },
  adDing(){ [784,988,1175].forEach((f,i)=>tone(f,0.2,{type:'triangle',vol:0.2,delay:i*0.08})); },
};
export function buzz(p){ if (fx.vibe && navigator.vibrate) try{ navigator.vibrate(p); }catch(e){} }
