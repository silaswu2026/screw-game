// 游戏原画：绿色忍者帧 + 从 xy-go/game.js 移植的道具/陷阱画法（只读移植，不改 xy-go）
(function(){
const SP='../../xy-go/sprites/green/';
const NF=['walk_0','walk_1','walk_2','walk_3'].map(n=>{const i=new Image();i.src=SP+n+'.png';return i;});
const IDLE=new Image();IDLE.src=SP+'idle.png';const JUMP=new Image();JUMP.src=SP+'jump_0.png';const HURT=new Image();HURT.src=SP+'knock_0.png';
function rr(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
function star(g,x,y,r){g.beginPath();for(let i=0;i<10;i++){const R=i%2?r*.45:r,a=i/10*Math.PI*2-Math.PI/2;g.lineTo(x+Math.cos(a)*R,y+Math.sin(a)*R);}g.closePath();}
// 每个画法在 64x64 方框里画（底边 y=60）
const D={
 rock(g){g.fillStyle='#5a5248';g.fillRect(22,2,20,8);g.fillStyle='rgba(255,210,80,.25)';g.fillRect(16,10,32,30);
  g.save();g.translate(32,58);g.scale(1.6,1.6);g.fillStyle='#6d6358';g.beginPath();g.moveTo(-12,0);g.lineTo(-4,-16);g.lineTo(8,-14);g.lineTo(12,0);g.closePath();g.fill();g.strokeStyle='#3e3830';g.lineWidth=1.5;g.stroke();g.restore();},
 meteor(g){const gr=g.createLinearGradient(4,4,30,30);gr.addColorStop(0,'rgba(255,120,40,0)');gr.addColorStop(1,'rgba(255,170,60,.9)');g.fillStyle=gr;g.beginPath();g.moveTo(2,2);g.lineTo(40,30);g.lineTo(26,44);g.closePath();g.fill();
  g.save();g.translate(38,54);g.scale(1.4,1.4);g.fillStyle='#7a4a30';g.beginPath();g.moveTo(-12,0);g.lineTo(-4,-16);g.lineTo(8,-14);g.lineTo(12,0);g.closePath();g.fill();g.strokeStyle='#ff9a3c';g.lineWidth=1.5;g.stroke();g.restore();},
 fire(g){g.save();g.translate(18,62);g.scale(1.3,1.3);const x=0,y=0;g.fillStyle='#3a3a42';g.fillRect(x-14,y-6,28,10);g.fillStyle='#222228';g.fillRect(x-10,y-18,20,14);g.fillStyle='#6a6a74';g.beginPath();g.arc(x,y-20,7,0,7);g.fill();
  g.translate(x,y-20);g.fillStyle='#4e4e58';g.fillRect(0,-4,22,8);g.fillStyle='#8a8a96';g.fillRect(18,-5,8,10);g.fillStyle='#ffef8acc';g.beginPath();g.moveTo(26,0);g.lineTo(36,-6);g.lineTo(36,6);g.closePath();g.fill();g.restore();
  g.fillStyle='#ff3030';g.beginPath();g.arc(18,16,4,0,7);g.fill();},
 sand(g){g.fillStyle='#c9a66b';g.fillRect(2,40,60,16);g.fillStyle='rgba(160,120,60,.7)';for(let x=6;x<62;x+=10){g.beginPath();g.ellipse(x,46+Math.sin(x)*2,5,2.5,0,0,7);g.fill();}g.fillStyle='rgba(90,60,30,.4)';g.fillRect(4,52,56,4);},
 mud(g){g.fillStyle='#5b3d22';g.fillRect(2,38,60,18);g.fillStyle='rgba(40,25,10,.7)';for(let x=6;x<62;x+=10){g.beginPath();g.ellipse(x,45+Math.sin(x)*2,5,3,0,0,7);g.fill();}g.fillStyle='#7a5532';g.beginPath();g.ellipse(22,40,6,3,0,0,7);g.ellipse(46,40,5,3,0,0,7);g.fill();},
 mist(g){const gr=g.createLinearGradient(0,4,0,60);gr.addColorStop(0,'rgba(140,60,180,.15)');gr.addColorStop(.5,'rgba(120,40,160,.55)');gr.addColorStop(1,'rgba(80,30,120,.3)');g.fillStyle=gr;g.fillRect(4,4,56,56);g.fillStyle='rgba(200,140,255,.45)';for(let i=0;i<4;i++){g.beginPath();g.ellipse(12+i*13,20+(i%2)*14,7,10,0,0,7);g.fill();}},
 bubble(g){g.fillStyle='rgba(120,40,160,.35)';g.fillRect(4,44,56,14);[[20,40,9],[40,28,12],[28,14,6]].forEach(([x,y,r])=>{g.fillStyle='rgba(200,140,255,.55)';g.beginPath();g.arc(x,y,r,0,7);g.fill();g.strokeStyle='#e6c8ff';g.lineWidth=2;g.stroke();g.fillStyle='#fff8';g.beginPath();g.arc(x-r*.35,y-r*.35,r*.25,0,7);g.fill();});},
 wave(g){g.fillStyle='rgba(60,150,230,.85)';g.beginPath();g.moveTo(2,60);g.lineTo(2,30);for(let x=2;x<=62;x+=4)g.lineTo(x,26+Math.sin(x/6)*5);g.lineTo(62,60);g.closePath();g.fill();g.fillStyle='#e8f6ff';for(let x=2;x<62;x+=4)g.fillRect(x,24+Math.sin(x/6)*5,4,4);},
 lowg(g){g.fillStyle='rgba(150,120,255,.35)';g.fillRect(6,2,52,60);g.fillStyle='rgba(220,210,255,.95)';g.font='bold 15px sans-serif';g.fillText('低重力',9,36);g.strokeStyle='#dcd2ff';g.setLineDash([4,4]);g.strokeRect(7,3,50,58);g.setLineDash([]);},
 spring(g){g.save();g.translate(32,60);g.scale(1.5,1.5);g.strokeStyle='#d5dde6';g.lineWidth=3;g.beginPath();g.moveTo(0,-2);for(let i=1;i<=10;i++)g.lineTo(i%2?-8:8,-2-i/10*24);g.stroke();g.fillStyle='#e23b3b';rr(g,-14,-34,28,10,4);g.fill();g.restore();},
 coin(g){g.fillStyle='#ffd166';g.beginPath();g.ellipse(32,34,16,22,0,0,7);g.fill();g.fillStyle='#f0b43c';g.beginPath();g.ellipse(32,34,8,13,0,0,7);g.fill();},
 star(g){g.fillStyle='#ffe14a';star(g,32,34,26);g.fill();g.strokeStyle='#c99a10';g.lineWidth=2;g.stroke();},
 flag(g){g.fillStyle='#5a3b22';g.fillRect(29,14,6,48);g.fillStyle='#4cc9f0';rr(g,20,2,24,24,9);g.fill();g.fillStyle='#7cf0ff';rr(g,25,7,8,8,3);g.fill();},
 goal(g){g.fillStyle='#5a3b22';g.fillRect(29,10,6,52);g.fillStyle='#e23b3b';rr(g,18,0,28,28,9);g.fill();},
 slime(g){g.save();g.translate(32,60);g.scale(1.5,1.5);g.fillStyle='#67d36a';g.beginPath();g.ellipse(0,-14,18,14,0,0,7);g.fill();g.fillStyle='#fff';g.beginPath();g.arc(-6,-16,3.5,0,7);g.arc(6,-16,3.5,0,7);g.fill();g.fillStyle='#1b1b1b';g.beginPath();g.arc(-5,-16,1.6,0,7);g.arc(7,-16,1.6,0,7);g.fill();g.restore();}
};
const ART={};for(const k in D){const c=document.createElement('canvas');c.width=c.height=64;D[k](c.getContext('2d'));ART[k]=c;}
const URL_={};for(const k in ART)URL_[k]=ART[k].toDataURL();URL_.ninja=SP+'walk_0.png';
const EM={'🟫':'mud','🫧':'bubble','🏜️':'sand','☠️':'mist','🌊':'wave','🪨':'rock','☄️':'meteor','🔥':'fire','🌙':'lowg','🌀':'spring','⭐':'star','🪙':'coin','🚩':'flag','🏁':'goal','🟢':'slime','🥷':'ninja'};
function ninjaImg(){const now=performance.now();const im=NF[Math.floor(now/110)%4];return im.complete&&im.naturalWidth?im:null;}
const ft=CanvasRenderingContext2D.prototype.fillText;
CanvasRenderingContext2D.prototype.fillText=function(s,x,y,mw){const k=EM[s];if(!k)return ft.call(this,s,x,y,mw);
 const N=+((this.font.match(/(\d+(?:\.\d+)?)px/)||[0,20])[1]);
 if(k==='ninja'){const im=ninjaImg();if(im)this.drawImage(im,x-N*.3,y-N*1.35,N*1.6,N*1.6);return;}
 this.drawImage(ART[k],x,y-N*.95,N*1.05,N*1.05);};
window.LDART={ART,URL:URL_,EM,NF,IDLE,JUMP,HURT,D,ninjaImg,star};
// DOM：把文字里的这些表情换成原画小图（SVG <text> 换成 <image>）
const RE=new RegExp('('+Object.keys(EM).map(e=>e.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')','g');
function fix(root){const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),L=[];let n;while(n=w.nextNode())if(RE.test(n.nodeValue)){RE.lastIndex=0;L.push(n);}RE.lastIndex=0;
 L.forEach(n=>{const p=n.parentNode;if(!p||p.closest&&p.closest('script,style,button.noart'))return;
  if(p.namespaceURI==='http://www.w3.org/2000/svg'){if(p.tagName==='text'){const k=EM[n.nodeValue.trim()];if(!k)return;const fs=+(p.getAttribute('font-size')||20),im=document.createElementNS(p.namespaceURI,'image');
    im.setAttribute('href',URL_[k]);const x=+p.getAttribute('x')||0,y=+p.getAttribute('y')||0,s=k==='ninja'?fs*1.6:fs*1.05;im.setAttribute('x',k==='ninja'?x-fs*.3:x);im.setAttribute('y',y-(k==='ninja'?fs*1.35:fs*.95));im.setAttribute('width',s);im.setAttribute('height',s);p.replaceWith(im);}return;}
  const fr=document.createDocumentFragment();n.nodeValue.split(RE).forEach(part=>{const k=EM[part];if(k){const i=document.createElement('img');i.src=URL_[k];i.alt=part;i.className='art';i.style.cssText=k==='ninja'?'height:1.6em;vertical-align:-.45em':'height:1.15em;vertical-align:-.22em';fr.appendChild(i);}else if(part)fr.appendChild(document.createTextNode(part));});p.replaceChild(fr,n);});}
function start(){fix(document.body);new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(a=>{if(a.nodeType===1)fix(a);else if(a.nodeType===3&&a.parentNode)fix(a.parentNode);}))).observe(document.body,{childList:true,subtree:true,characterData:false});}
if(document.body)start();else addEventListener('DOMContentLoaded',start);
})();
