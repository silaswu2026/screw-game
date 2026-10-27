// 4 selectable themes — ORIGINAL fairy-tale palettes (no Disney IP)
export const THEMES = {
  pets: {
    name:'萌宠乐园', icon:'🐾', desc:'圆润萌宠、温暖阳光',
    bgEmoji:['🐾','🦴','🐟','🌸','💕','☁️'],
    css:{ '--acc':'#ff6f91', '--btn1':'#ffb08a', '--btn2':'#ff8a65', '--btnS':'#d9694a', '--card':'#ffd9c2',
      '--bg':'linear-gradient(165deg,#fff6e8 0%,#eaf8ea 45%,#dff3fb 100%)', '--ink':'#5a3d36' },
    plates:[0xfff7ea,0xd9f2e6,0xdcecff,0xfff0c2,0xffe1d6,0xe6f5d0],
    models:[{name:'小猫咪',m:'cat'},{name:'小熊',m:'bear'}],
    figures:[['🐱','橘猫'],['🐶','柴犬'],['🐰','垂耳兔'],['🐻','泰迪熊'],['🐼','熊猫'],['🦊','小狐狸'],['🐹','仓鼠'],['🐧','企鹅'],['🐨','考拉'],['🦄','独角兽']],
    scene:{ skyTop:0xfff3d4, skyMid:0xc9eadc, skyBot:0x8ec8ee, fog:0xd5eef6, pedestal:0xfff6ee, pedestalRim:0xf0b089,
      particle:0xffc4d4, particle2:0xffe7a8, stars:false, clouds:true, clear:0xc5e4f4,
      hemiSky:0xfff6e4, hemiGround:0xc7e6d4, key:0xfff4e2, keyI:1.75, fill:0xb7d2ff, fillI:0.28,
      rim:0xffd8b0, rimI:0.95, exposure:1.14, fogDensity:0.022 }
  },
  mech: {
    name:'机械工坊', icon:'🤖', desc:'可爱机器人与小车',
    bgEmoji:['⚙️','🔧','🔩','⚡','🛠️','✨'],
    css:{ '--acc':'#1f8a9e', '--btn1':'#5fd1c4', '--btn2':'#2bb3a3', '--btnS':'#1d8579', '--card':'#bfe8e2',
      '--bg':'linear-gradient(165deg,#e8f6f3 0%,#eef1f4 50%,#fff3d8 100%)', '--ink':'#2a4a52' },
    plates:[0xf2f6fa,0xfff1c9,0xdaf0ff,0xe1f7e4,0xffe2cc,0xe8e4f7],
    models:[{name:'机器人',m:'robot'},{name:'小汽车',m:'car'}],
    figures:[['🤖','小铁'],['🚗','小车车'],['🚜','拖拉机'],['🚂','蒸汽火车'],['🚁','直升机'],['🦾','机械臂'],['🚒','消防车'],['🛵','小摩托'],['🚧','工程队'],['🛸','飞碟机甲']],
    scene:{ skyTop:0xd8f4ee, skyMid:0xe4eaf2, skyBot:0xffe6b0, fog:0xd5e6ea, pedestal:0xe7f1f4, pedestalRim:0x8fbfc4,
      particle:0xffc15e, particle2:0x7ef9ff, stars:false, clouds:true, clear:0xd0e2ea,
      hemiSky:0xf2fffb, hemiGround:0xc5d4e4, key:0xf7fffc, keyI:1.65, fill:0xc9d6ee, fillI:0.36,
      rim:0xffe3b0, rimI:0.72, exposure:1.12, fogDensity:0.02 }
  },
  sweets: {
    name:'甜品屋', icon:'🧁', desc:'蛋糕冰淇淋的香甜世界',
    bgEmoji:['🍬','🍓','🍩','🍭','✨','🍪'],
    css:{ '--acc':'#e85a8c', '--btn1':'#ffb3c6', '--btn2':'#f58aa8', '--btnS':'#cf6a88', '--card':'#ffe0c7',
      '--bg':'linear-gradient(165deg,#fff8ec 0%,#fdf1ea 45%,#e8f7f0 100%)', '--ink':'#6b3a4a' },
    plates:[0xfffaf0,0xffe9f0,0xe3f7e8,0xfff0c4,0xf3e6ff,0xffe4d1],
    models:[{name:'草莓蛋糕',m:'cake'},{name:'薄荷冰棍',m:'popsicle'}],
    figures:[['🍰','草莓蛋糕'],['🧁','纸杯蛋糕'],['🍩','甜甜圈'],['🍦','甜筒'],['🍮','布丁'],['🍪','曲奇'],['🍫','巧克力'],['🍭','棒棒糖'],['🥞','松饼'],['🎂','生日蛋糕']],
    scene:{ skyTop:0xffe7c8, skyMid:0xffe0d2, skyBot:0xd5f0e4, fog:0xffefe6, pedestal:0xfff1e6, pedestalRim:0xf0b0c0,
      particle:0xffb3c4, particle2:0xffd98a, stars:false, clouds:true, clear:0xffe4d8,
      hemiSky:0xfff3e6, hemiGround:0xf0d8cc, key:0xfff2e4, keyI:1.7, fill:0xd5eadf, fillI:0.3,
      rim:0xffd0c4, rimI:0.7, exposure:1.12, fogDensity:0.02 }
  },
  space: {
    name:'太空冒险', icon:'🚀', desc:'星空火箭与小星球',
    bgEmoji:['⭐','🪐','🌙','✨','☄️','🌟'],
    css:{ '--acc':'#9b87ff', '--btn1':'#b8a9ff', '--btn2':'#7c5cff', '--btnS':'#5a3fd1', '--card':'#cfc4ff',
      '--bg':'linear-gradient(165deg,#1e2048 0%,#3a3278 50%,#1a5a7c 100%)', '--ink':'#f0eaff' },
    plates:[0xf4f0ff,0xdff6ff,0xfff3d6,0xe2ffe9,0xffe6ef,0xe6e6ff],
    models:[{name:'小火箭',m:'rocket'},{name:'飞碟',m:'ufo'}],
    figures:[['🚀','火箭'],['👽','小外星人'],['🛸','飞碟'],['🪐','土星'],['🌙','月亮'],['👩‍🚀','宇航员'],['🛰️','卫星'],['☄️','彗星'],['🌍','地球'],['🌟','超新星']],
    scene:{ skyTop:0x070818, skyMid:0x2a2468, skyBot:0x0c4e6e, fog:0x12142e, pedestal:0x3a3478, pedestalRim:0xb3a4ff,
      particle:0xfff6b0, particle2:0xc8b8ff, stars:true, clouds:false, clear:0x101228,
      hemiSky:0x6d66c0, hemiGround:0x1a2048, hemiI:0.38, key:0xd6defe, keyI:1.2, fill:0x3a3c88, fillI:0.22,
      rim:0xcbb8ff, rimI:1.2, bounce:0x3a2860, bounceI:0.18, spark:0xd2c6ff, sparkI:0.4,
      exposure:1.02, fogDensity:0.032 }
  },
};
