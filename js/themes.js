// 4 selectable themes — ORIGINAL fairy-tale palettes (no Disney IP)
export const THEMES = {
  pets: {
    name:'萌宠乐园', icon:'🐾', desc:'圆润萌宠、温暖阳光',
    bgEmoji:['🐾','🦴','🐟','🌸','💕','☁️'],
    css:{ '--acc':'#ff6f91', '--btn1':'#ffb08a', '--btn2':'#ff8a65', '--btnS':'#d9694a', '--card':'#ffd9c2',
      '--bg':'linear-gradient(165deg,#fff6e8 0%,#eaf8ea 45%,#dff3fb 100%)', '--ink':'#5a3d36' },
    plates:[0xfff7ea,0xd9f2e6,0xdcecff,0xfff0c2,0xffe1d6,0xe6f5d0],
    models:[{name:'小猫咪',m:'cat'},{name:'小熊',m:'bear'}],
    figures:[['🐱','橘猫'],['🐶','柴犬'],['🐰','垂耳兔'],['🐻','泰迪熊'],['🐼','熊猫'],['🦊','小狐狸'],['🐹','仓鼠'],['🐧','企鹅'],['🐨','考拉'],['🦄','独角兽']]
  },
  mech: {
    name:'机械工坊', icon:'🤖', desc:'可爱机器人与小车',
    bgEmoji:['⚙️','🔧','🔩','⚡','🛠️','✨'],
    css:{ '--acc':'#1f8a9e', '--btn1':'#5fd1c4', '--btn2':'#2bb3a3', '--btnS':'#1d8579', '--card':'#bfe8e2',
      '--bg':'linear-gradient(165deg,#e8f6f3 0%,#eef1f4 50%,#fff3d8 100%)', '--ink':'#2a4a52' },
    plates:[0xf2f6fa,0xfff1c9,0xdaf0ff,0xe1f7e4,0xffe2cc,0xe8e4f7],
    models:[{name:'机器人',m:'robot'},{name:'小汽车',m:'car'}],
    figures:[['🤖','小铁'],['🚗','小车车'],['🚜','拖拉机'],['🚂','蒸汽火车'],['🚁','直升机'],['🦾','机械臂'],['🚒','消防车'],['🛵','小摩托'],['🚧','工程队'],['🛸','飞碟机甲']]
  },
  sweets: {
    name:'甜品屋', icon:'🧁', desc:'蛋糕冰淇淋的香甜世界',
    bgEmoji:['🍬','🍓','🍩','🍭','✨','🍪'],
    css:{ '--acc':'#e85a8c', '--btn1':'#ffb3c6', '--btn2':'#f58aa8', '--btnS':'#cf6a88', '--card':'#ffe0c7',
      '--bg':'linear-gradient(165deg,#fff8ec 0%,#fdf1ea 45%,#e8f7f0 100%)', '--ink':'#6b3a4a' },
    plates:[0xfffaf0,0xffe9f0,0xe3f7e8,0xfff0c4,0xf3e6ff,0xffe4d1],
    models:[{name:'草莓蛋糕',m:'cake'},{name:'薄荷冰棍',m:'popsicle'}],
    figures:[['🍰','草莓蛋糕'],['🧁','纸杯蛋糕'],['🍩','甜甜圈'],['🍦','甜筒'],['🍮','布丁'],['🍪','曲奇'],['🍫','巧克力'],['🍭','棒棒糖'],['🥞','松饼'],['🎂','生日蛋糕']]
  },
  space: {
    name:'太空冒险', icon:'🚀', desc:'星空火箭与小星球',
    bgEmoji:['⭐','🪐','🌙','✨','☄️','🌟'],
    css:{ '--acc':'#9b87ff', '--btn1':'#b8a9ff', '--btn2':'#7c5cff', '--btnS':'#5a3fd1', '--card':'#cfc4ff',
      '--bg':'linear-gradient(165deg,#1e2048 0%,#3a3278 50%,#1a5a7c 100%)', '--ink':'#f0eaff' },
    plates:[0xf4f0ff,0xdff6ff,0xfff3d6,0xe2ffe9,0xffe6ef,0xe6e6ff],
    models:[{name:'小火箭',m:'rocket'},{name:'飞碟',m:'ufo'}],
    figures:[['🚀','火箭'],['👽','小外星人'],['🛸','飞碟'],['🪐','土星'],['🌙','月亮'],['👩‍🚀','宇航员'],['🛰️','卫星'],['☄️','彗星'],['🌍','地球'],['🌟','超新星']]
  },
};
