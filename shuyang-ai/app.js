/* 伍澍暘 · AI 陪伴一个月 · 互动日课 */
const STORE = 'shuyang_ai_month_v1';

const META = {
  title: '澍暘的 AI 冒险月',
  companion: '小雨姐姐',
  minutes: 20,
  deepGoal:
    '学会把脑子里的想法，用 AI 和游戏一点点变成真的。不是背概念，是和爸爸、AI 一起玩、一起说、一起做。',
  roles: ['小雨（AI）', '爸爸', '澍暘'],
};

const WEEKS = [
  {
    id: 1,
    name: '精灵醒来',
    deep: '搞懂：游戏里会动的角色，其实是一张张小图在换。',
    shallow: '玩、画、翻页，看见「动」是怎么来的。',
    story:
      '森林里的绿灯笼亮了。小雨姐姐说：澍暘，忍者不是真人钻进手机里的——他是一张会换姿势的小画。我们用二十天，从「看懂画面」走到「自己做一关」。',
  },
  {
    id: 2,
    name: '时间与积木',
    deep: '搞懂：视频是很多图连起来；3D 像搭立体积木。',
    shallow: '拍短视频、玩积木、转模型，摸到「连续」和「立体」。',
    story:
      '小雨打开一本会翻页的月亮书：一页一页翻快了，就变成动画片。旁边的橡皮泥忍者转一圈——哦，原来游戏里的立体东西，是像积木一样搭出来的。',
  },
  {
    id: 3,
    name: '鼓声与会呼吸的背景',
    deep: '搞懂：声音可以录，也可以算出来；有的背景是程序当场画的。',
    shallow: '听鼓点、画波浪线、指挥自己的节奏。',
    story:
      '夜里鼓声「当当当」从树丛传来。小雨说：有的声音是麦克风抓住的波浪，有的是电脑按节奏敲出来的。雾和萤火虫也不是一张死图——是代码在呼吸。',
  },
  {
    id: 4,
    name: '我的一关',
    deep: '把精灵、关卡、声音、规则合成一件自己的作品，并讲给家人听。',
    shallow: '选题、画、配声、请 AI 帮忙、发表。',
    story:
      '第 28 天，森林空地搭好了小舞台。澍暘要公布「我的一关」。爸爸递话筒，小雨举着故事书当提词板。这不是考试，是冒险月的庆功宴。',
  },
];

/** 每天：story 小情节；purpose 今日目的；talk 三人说话脚本；do 动手；prompt 总结引导 */
const DAYS = [
  // Week 1
  {
    d: 1,
    w: 1,
    title: '手机里的忍者是谁',
    story: '小雨指着屏幕：他会跑会跳，可是摸不到。今天只做一件事——认清「他是画出来的」。',
    purpose: '建立第一块基石：游戏角色 = 画面，不是真人。',
    talk: [
      ['小雨', '澍暘，你觉得忍者是住在手机里，还是一张会动的画？'],
      ['爸爸', '我们打开忍者小绿，你指给我看：哪个是角色，哪个是背景。'],
      ['澍暘', '（自己说一句）我觉得他是……'],
    ],
    do: '一起玩 5 分钟「忍者小绿」。暂停三次，每次指出：角色 / 敌人 / 背景。',
    prompt: '用一句话：忍者是什么？（例如：一张会动的小画）',
  },
  {
    d: 2,
    w: 1,
    title: '翻页小人会跑',
    story: '小雨撕了四张便签：抬左脚、站好、抬右脚、站好。快翻——小人跑起来了！',
    purpose: '亲身体会「多张图切换 = 动画」。',
    talk: [
      ['小雨', '电影和游戏的动作，常常是很多张姿势图在换。'],
      ['爸爸', '我们画四个姿势，你来翻页当导演。'],
      ['澍暘', '我要决定他跑得快还是慢。'],
    ],
    do: '纸笔画 4 格跑步小人并翻页；手机拍一段翻页视频。',
    prompt: '今天学到的关键词是什么？（例如：翻页 / 姿势 / 动画）',
  },
  {
    d: 3,
    w: 1,
    title: '找出在换的那几张',
    story: '小雨按下慢动作：看，围巾和腿的姿势在轮换。精灵图，就是这些会换班的小画。',
    purpose: '把「精灵图 / sprite」这个词对应到真实游戏画面。',
    talk: [
      ['小雨', '精灵图 = 角色用的一张张姿势图。'],
      ['爸爸', '跑的时候腿变了几次？我们数一数。'],
      ['澍暘', '我看到变成了……次。'],
    ],
    do: '玩一局，专门盯着忍者的腿和围巾，说出差一点点的变化。',
    prompt: '用自己的话解释：什么是精灵图？',
  },
  {
    d: 4,
    w: 1,
    title: '两层纸：背景不动角色动',
    story: '小雨把两张透明纸叠起来：下层森林，上层忍者。只拉上层——世界就「动」了。',
    purpose: '理解图层：背景与角色分开。',
    talk: [
      ['小雨', '如果背景和角色画在同一张纸上，改起来就麻烦啦。'],
      ['爸爸', '我们做两层：你画忍者，我画树。'],
      ['澍暘', '我只移动忍者那一层。'],
    ],
    do: '两张纸分层：下层树，上层忍者，只滑动上层演示「跑过森林」。',
    prompt: '为什么角色和背景要分开画？',
  },
  {
    d: 5,
    w: 1,
    title: '请 AI 画我的忍者',
    story: '小雨把故事书递给澍暘：你出主意，AI 来画。你是导演，我是画师助手。',
    purpose: '体验「说话指挥 AI 出图」——AI 是工具，主意是自己的。',
    talk: [
      ['小雨', '告诉我：围巾什么颜色？手里拿什么？白天还是月亮下？'],
      ['爸爸', '我帮你打字，你来决定每个细节。'],
      ['澍暘', '我要……（说至少 3 个细节）'],
    ],
    do: '用 AI 生成一张原创绿忍者图并保存；不能要求画别人的商标角色。',
    prompt: '今天你当导演时，做的最重要的一个决定是什么？',
  },
  {
    d: 6,
    w: 1,
    title: '给角色定一条规矩',
    story: '小雨笑：每个英雄都有规矩。踩弹簧会怎样？碰到史莱姆又怎样？',
    purpose: '把「规则」说清楚——这是做游戏的种子。',
    talk: [
      ['小雨', '规矩要简单，一句话就行。'],
      ['爸爸', '我们写在卡片上，贴在墙上。'],
      ['澍暘', '我的规矩是……'],
    ],
    do: '给 Day5 角色写 1 条动作规矩 + 1 条危险规矩，做成小卡片。',
    prompt: '你定的两条规矩是什么？',
  },
  {
    d: 7,
    w: 1,
    title: '周展览：讲给家人听',
    story: '森林小灯亮成一排。小雨说：今天你是讲解员，不是考生。',
    purpose: '用自己的话复述第一周，巩固「精灵与图层」。',
    talk: [
      ['小雨', '选一件作品讲 1 分钟就好。'],
      ['爸爸', '我帮你录像，讲砸了也没关系，可以重来。'],
      ['澍暘', '今天我要讲的是……'],
    ],
    do: '展示翻页动画或 AI 图，录一段不超过 1 分钟的讲解。',
    prompt: '第一周你最喜欢的一天是哪天？为什么？',
  },
  // Week 2
  {
    d: 8,
    w: 2,
    title: '挥手变成很多张图',
    story: '小雨举起手机：挥一下手。滑相册——咦，中间藏着好多张静止的你。',
    purpose: '建立「视频 ≈ 很多张图很快切换」。',
    talk: [
      ['小雨', '视频不是一整块魔法，是一串图。'],
      ['爸爸', '我们拍 2 秒，然后一张张滑给你看。'],
      ['澍暘', '我数到了大概……张。'],
    ],
    do: '拍 2 秒挥手视频，逐帧滑看，估算大概有多少张。',
    prompt: '视频是由什么组成的？',
  },
  {
    d: 9,
    w: 2,
    title: '顺和不顺：每秒几张',
    story: '鼓点变慢，忍者动作也一顿一顿。小雨说：每秒换多少张，手感就不一样。',
    purpose: '感性认识帧率（不必背数字定义）。',
    talk: [
      ['小雨', '游戏「顺」常常是因为每秒换得够多。'],
      ['爸爸', '我们对比正常速度和故意卡顿（爸爸用手指挡一下屏幕也行）。'],
      ['澍暘', '我更喜欢哪一种？为什么？'],
    ],
    do: '玩一局感受顺滑；再用慢动作回放对比「帧」的感觉。',
    prompt: '用自己的话说：为什么有的画面看起来更顺？',
  },
  {
    d: 10,
    w: 2,
    title: '橡皮泥忍者转一圈',
    story: '小雨把一团绿泥放桌上：正面是脸，转到侧面——耳朵出来了。这就是立体。',
    purpose: '3D = 可以转着看的立体结构，像积木。',
    talk: [
      ['小雨', '平面画只有一个面；立体东西有很多面。'],
      ['爸爸', '我们用橡皮泥或乐高搭一个头或桥。'],
      ['澍暘', '我要从左边和右边各看一眼。'],
    ],
    do: '搭一个简单立体物，拍正面 + 侧面两张照片。',
    prompt: '3D 和一张平面画，最大的不同是什么？',
  },
  {
    d: 11,
    w: 2,
    title: '转一转屏幕里的模型',
    story: '若打得开螺丝/火箭 demo 就转模型；否则看一段角色旋转短片。小雨：里面也是「积木感」。',
    purpose: '把桌上的积木感对应到电脑里的 3D。',
    talk: [
      ['小雨', '程序员搭的是数字积木，但道理和橡皮泥很像。'],
      ['爸爸', '你来转，告诉我看到了几个面。'],
      ['澍暘', '我看到了……'],
    ],
    do: '旋转一个 3D 模型或视频，说出至少两个不同角度看到的东西。',
    prompt: '电脑里的 3D，让你想到生活中的什么？',
  },
  {
    d: 12,
    w: 2,
    title: 'AI 帮我想一座木桥',
    story: '河上要有桥。小雨：你决定几根柱子，AI 画出概念图，我们再改。',
    purpose: '用对话迭代设计（想法 → AI 图 → 再改）。',
    talk: [
      ['小雨', '先说清楚：桥要结实还是好看？有没有灯笼？'],
      ['爸爸', '我们生成一版，再提一个修改。'],
      ['澍暘', '第一版我要改的是……'],
    ],
    do: 'AI 生成「森林木桥」概念图，并提出一处修改再生成或手改。',
    prompt: '你改了什么？为什么这样改更好玩或更合理？',
  },
  {
    d: 13,
    w: 2,
    title: '对照卡：2D 和 3D',
    story: '小雨做了一张对照卡：左边侧视忍者（2D），右边橡皮泥头（3D）。',
    purpose: '能自己区分 2D 精灵与 3D 模型。',
    talk: [
      ['小雨', '做跑酷小游戏，常常先用 2D 精灵就很好玩。'],
      ['爸爸', '你更想先做哪种？说理由就行。'],
      ['澍暘', '我选……因为……'],
    ],
    do: '做一张实体或电子对照卡，左右各贴/放一样东西并写一句区别。',
    prompt: '如果只选一个先学做游戏，你选 2D 还是 3D？为什么？',
  },
  {
    d: 14,
    w: 2,
    title: '小动画周复习',
    story: '月亮书合上又打开：第二周的关键词闪了一下——视频、帧、积木、立体。',
    purpose: '连起来讲「时间里的图」和「空间里的积木」。',
    talk: [
      ['小雨', '各用一句话就好，别背课文。'],
      ['爸爸', '我问两个问题，你像聊天一样答。'],
      ['澍暘', '视频是……；3D 像……'],
    ],
    do: '把挥手视频和积木照片放一起，给家人讲 1 分钟。',
    prompt: '第二周你新学会的最酷的一件事是什么？',
  },
  // Week 3
  {
    d: 15,
    w: 3,
    title: '「当当当」被抓住了',
    story: '小雨敲了三下桌子，又按下录音。声音消失了，可手机里还留着它。',
    purpose: '声音能变成设备里的记录（数字化的直觉）。',
    talk: [
      ['小雨', '关掉嘴巴以后，录音还在，说明声音被记住了。'],
      ['爸爸', '你对着手机说「当当当」，我们听回放。'],
      ['澍暘', '我听到了自己的……'],
    ],
    do: '录 3 秒「当当当」并回放；对比现场敲击和录音。',
    prompt: '声音关掉以后，为什么手机还能放出来？',
  },
  {
    d: 16,
    w: 3,
    title: '波浪线上的小点点',
    story: '小雨在纸上画波浪，又戳很多点：点子越密，越像真实声音。这叫采样的感觉。',
    purpose: '用画画理解「采样」：连续声音 → 很多小样本点。',
    talk: [
      ['小雨', '不用记英文单词，记住「密密的点」就行。'],
      ['爸爸', '我们画两条波：一条点少，一条点多。'],
      ['澍暘', '哪一条更光滑？'],
    ],
    do: '画两条声波线（疏点 / 密点），说出哪条更「像真声音」。',
    prompt: '用自己的话说说「采样」像什么？',
  },
  {
    d: 17,
    w: 3,
    title: '没有麦克风也能出鼓声',
    story: '游戏里的鼓点响起来。小雨：有的鼓声不是录乐队，是程序按节奏「算」出来的。',
    purpose: '区分录音 vs 合成；听懂忍者游戏的神秘鼓点。',
    talk: [
      ['小雨', '合成 = 按规则造声音。'],
      ['爸爸', '打开忍者小绿的音乐，跟着拍腿。'],
      ['澍暘', '我数到的节奏是……'],
    ],
    do: '开 BGM 跟拍 20 秒；找到静音按钮并试用一次。',
    prompt: '录音的声音和「算出来」的声音，有什么不一样？',
  },
  {
    d: 18,
    w: 3,
    title: '音效和背景乐是两伙人',
    story: '飞镖「嗖」、弹簧「嘣」、远处一直「当当当」。小雨：近处的叫音效，一直陪着的叫背景乐。',
    purpose: '会分类游戏里的声音。',
    talk: [
      ['小雨', '我们列个小表：三种音效 + 一种背景乐。'],
      ['爸爸', '你负责听，我负责写。'],
      ['澍暘', '扔掉飞镖的声音是……'],
    ],
    do: '玩一局，列出至少 3 种音效和 1 种背景乐。',
    prompt: '如果少了音效，游戏会少掉什么感觉？',
  },
  {
    d: 19,
    w: 3,
    title: '会呼吸的森林背景',
    story: '雾在游，星星在眨。小雨：有的背景不是一张大海报，是程序一边玩一边画。',
    purpose: '理解「实时生成的背景」。',
    talk: [
      ['小雨', '死图像照片；活背景像舞台灯光一直在变。'],
      ['爸爸', '盯着背景 10 秒，找出一个在动的东西。'],
      ['澍暘', '我看到……在动。'],
    ],
    do: '在忍者游戏或小雨页面里找出 1～2 个「一直在动」的背景元素。',
    prompt: '为什么有的背景要用程序画，而不是只用一张大图？',
  },
  {
    d: 20,
    w: 3,
    title: '我当节奏指挥官',
    story: '小雨把指挥棒递给澍暘：你定 8 拍，我们按你的规矩敲。',
    purpose: '孩子主导创作一小段节奏（合成思维的种子）。',
    talk: [
      ['小雨', '例如：当·当·当当·当——你来改。'],
      ['爸爸', '我们拍手或用手机节拍录下来。'],
      ['澍暘', '我的 8 拍是……'],
    ],
    do: '创作并录下一段 8 拍「关卡鼓点」，起个名字。',
    prompt: '你的鼓点叫什么名字？留给哪一关用？',
  },
  {
    d: 21,
    w: 3,
    title: '声音小电台',
    story: '小雨打开「森林广播」：今晚的主持人是澍暘。',
    purpose: '用口语总结采样、合成、音效、活背景。',
    talk: [
      ['小雨', '当 1 分钟小主持人就好。'],
      ['爸爸', '我帮你播你的录音和游戏鼓点。'],
      ['澍暘', '听众大家好，今天我学到……'],
    ],
    do: '录一段不超过 1 分钟的「小电台」总结。',
    prompt: '第三周里，哪个声音实验最好玩？',
  },
  // Week 4
  {
    d: 22,
    w: 4,
    title: '选题：我的一关',
    story: '空地上出现一块木牌：关卡名称待填写。小雨：先定梦，再画桥。',
    purpose: '明确作品题目与 3 条规则（有目的地创作）。',
    talk: [
      ['小雨', 'Boss 是谁？要不要弹簧？怎么算赢？'],
      ['爸爸', '我记下你的三句话，不当裁判。'],
      ['澍暘', '我的关卡叫……；规则是 1… 2… 3…'],
    ],
    do: '写下关卡名 + 3 条规则（可拍照片存进本页总结）。',
    prompt: '三句话规则是什么？',
  },
  {
    d: 23,
    w: 4,
    title: '画出会动的自己',
    story: '小雨摊开三张卡：站、跑、跳。少一张，动画就会瘸腿。',
    purpose: '为作品准备 2～3 个精灵姿势。',
    talk: [
      ['小雨', '可以手绘，也可以 AI 辅助，主意必须是你的。'],
      ['爸爸', '你选姿势，我帮你整理文件。'],
      ['澍暘', '这三个姿势是……'],
    ],
    do: '完成主角站/跑/跳（或其中两个）图。',
    prompt: '哪个姿势最难画？你怎么解决的？',
  },
  {
    d: 24,
    w: 4,
    title: '地图草图',
    story: '小雨洒下荧光粉：起点、墙、弹簧、Boss、终点，一一亮起。',
    purpose: '把规则落成一张能「假装玩」的地图。',
    talk: [
      ['小雨', '弹簧要靠墙，才像你改过的第 3 关。'],
      ['爸爸', '你画，我只提问：这里会不会太难？'],
      ['澍暘', '弹簧放在……；Boss 站在……'],
    ],
    do: '在纸上画关卡草图并标注关键物件。',
    prompt: '地图上你最得意的一个设计是什么？',
  },
  {
    d: 25,
    w: 4,
    title: '给关卡配声音',
    story: '试玩还没开始，耳朵先到。小雨：选一段鼓点，再选一个「落地」音。',
    purpose: '为作品配置 BGM 想法 + 至少 1 个音效。',
    talk: [
      ['小雨', '可以用第 20 天的鼓点，也可以新做。'],
      ['爸爸', '我们录音或选定拍手节奏。'],
      ['澍暘', '背景用……；音效用……'],
    ],
    do: '确定并录下/选定：1 段鼓点 + 1 个音效。',
    prompt: '为什么这个声音适合你的关卡？',
  },
  {
    d: 26,
    w: 4,
    title: 'AI 当助手，我当导演',
    story: '小雨把故事书翻到空白页：你说规则，我写成关卡说明书，或画出宣传小海报。',
    purpose: '练习「人出主意，AI 出力」的协作。',
    talk: [
      ['小雨', '你口述，爸爸打字，我（AI）整理。'],
      ['爸爸', '生成后你只准改一处最在意的地方。'],
      ['澍暘', '说明书/海报上必须出现的一句话是……'],
    ],
    do: '生成关卡短说明或海报图，并完成一处人工修改。',
    prompt: 'AI 帮了什么？哪一步必须是你自己决定的？',
  },
  {
    d: 27,
    w: 4,
    title: '假装玩，改一版',
    story: '手指当忍者，在纸上跑。哎呀，弹簧太远了——挪近一点。',
    purpose: '用试玩思维做一次迭代（游戏设计核心）。',
    talk: [
      ['小雨', '改一个点就够，证明你会打磨。'],
      ['爸爸', '我扮演玩家，你观察我卡在哪里。'],
      ['澍暘', '我改的是……'],
    ],
    do: '对着草图「手指试玩」一局，修改一处难度或乐趣问题。',
    prompt: '改之前和改之后，手感有什么不同？',
  },
  {
    d: 28,
    w: 4,
    title: '发表会',
    story: '灯笼亮起。爸爸举着手机，小雨鼓掌。澍暘站上小舞台。',
    purpose: '完整展示作品：图 + 规则 + 声音 + 讲解。',
    talk: [
      ['小雨', '1 分钟，讲清楚「好玩在哪里」。'],
      ['爸爸', '我负责录像和存档。'],
      ['澍暘', '大家好，我的关卡是……'],
    ],
    do: '开家庭发表会，录 1 分钟展示视频。',
    prompt: '发表时你最想让大家记住的一句话是什么？',
  },
  {
    d: 29,
    w: 4,
    title: '复盘填空',
    story: '小雨拿出月亮卡片，上面有五个空：不是考试，是宝藏清单。',
    purpose: '用自己的语言固化一个月概念。',
    talk: [
      ['小雨', '想不起来就看本周作品，不准抄定义。'],
      ['爸爸', '我读题目，你答。'],
      ['澍暘', '精灵是……；视频是……；3D 像……；声音可以……或……；背景有时是……画的。'],
    ],
    do: '口头或书面完成五个填空，拍照保存。',
    prompt: '哪个空你答得最有把握？哪个还想下周再练？',
  },
  {
    d: 30,
    w: 4,
    title: '下个月的三个愿望',
    story: '冒险月的最后一晚。小雨合上书：愿望要具体，才能再次出发。',
    purpose: '把陪伴式学习变成可持续的下一轮目标。',
    talk: [
      ['小雨', '愿望可以很小：给游戏加一个弹簧皮肤也行。'],
      ['爸爸', '我们选一个当「下月主线」。'],
      ['澍暘', '我的三个愿望是……；主线是……'],
    ],
    do: '写下 3 个愿望并圈出 1 个下月主线；告诉灵姬或爸爸存档。',
    prompt: '下个月主线是什么？第一步打算哪天做？',
  },
];

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || '{}');
  } catch {
    return {};
  }
}
function save(data) {
  localStorage.setItem(STORE, JSON.stringify(data));
}

function $(sel) {
  return document.querySelector(sel);
}

function weekOf(d) {
  return WEEKS.find((w) => w.id === d.w);
}

function renderHome() {
  const data = load();
  const done = DAYS.filter((x) => data[x.d]?.done).length;
  const app = $('#app');
  app.innerHTML = `
    <header class="hero">
      <img class="avatar" src="xiaoyu.jpg" alt="小雨姐姐"/>
      <div>
        <p class="tag">陪伴式 · 每天约 ${META.minutes} 分钟 · 小雨 + 爸爸 + 澍暘</p>
        <h1>${META.title}</h1>
        <p class="deep"><strong>总目标（深）</strong> ${META.deepGoal}</p>
        <p class="progress">已完成 <b>${done}</b> / 30 天</p>
        <div class="bar"><i style="width:${(done / 30) * 100}%"></i></div>
      </div>
    </header>
    <section class="weeks">
      ${WEEKS.map(
        (w) => `
        <article class="week-card">
          <h2>第 ${w.id} 周 · ${w.name}</h2>
          <p><strong>深目标</strong> ${w.deep}</p>
          <p><strong>浅活动</strong> ${w.shallow}</p>
          <p class="story">📖 ${w.story}</p>
          <div class="day-links">
            ${DAYS.filter((d) => d.w === w.id)
              .map((d) => {
                const st = data[d.d]?.done ? 'done' : '';
                return `<button class="day-btn ${st}" data-day="${d.d}">Day ${d.d}<span>${d.title}</span></button>`;
              })
              .join('')}
          </div>
        </article>`
      ).join('')}
    </section>
    <p class="foot">说话互动 · 有形象 · 有故事 · 有目的 · 每天有总结 · 由深到浅拆成日课</p>
  `;
  app.querySelectorAll('[data-day]').forEach((btn) => {
    btn.onclick = () => renderDay(+btn.dataset.day);
  });
}

function speak(text) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 0.92;
    u.pitch = 1.25;
    speechSynthesis.speak(u);
  } catch {}
}

function renderDay(n) {
  const day = DAYS.find((x) => x.d === n);
  const w = weekOf(day);
  const data = load();
  const saved = data[n] || {};
  const app = $('#app');
  app.innerHTML = `
    <button class="back" id="back">← 回月历</button>
    <header class="day-hero">
      <img class="avatar sm" src="xiaoyu.jpg" alt="小雨"/>
      <div>
        <p class="tag">第 ${w.id} 周 · ${w.name} · 约 ${META.minutes} 分钟</p>
        <h1>Day ${day.d} · ${day.title}</h1>
        <p><strong>深（周目标）</strong> ${w.deep}</p>
        <p><strong>浅（今天）</strong> ${day.purpose}</p>
      </div>
    </header>

    <section class="card">
      <h3>📖 今日小故事</h3>
      <p id="story">${day.story}</p>
      <button class="primary" id="readStory">小雨讲给我听</button>
    </section>

    <section class="card">
      <h3>🎯 今日目的</h3>
      <p>${day.purpose}</p>
    </section>

    <section class="card">
      <h3>💬 三人一起说（AI · 爸爸 · 澍暘）</h3>
      <ol class="talk">
        ${day.talk
          .map(
            ([who, line], i) =>
              `<li><button class="who" data-say="${i}">▶ ${who}</button><span>${line}</span></li>`
          )
          .join('')}
      </ol>
      <button class="primary" id="playTalk">按顺序读一遍对话</button>
    </section>

    <section class="card">
      <h3>✋ 动手（今天就做这个）</h3>
      <p>${day.do}</p>
      <label class="check"><input type="checkbox" id="didDo" ${
        saved.didDo ? 'checked' : ''
      }/> 我们做完了</label>
    </section>

    <section class="card">
      <h3>🌙 今日总结（澍暘说，爸爸可帮忙打字）</h3>
      <p class="hint">${day.prompt}</p>
      <textarea id="summary" rows="4" placeholder="写在这里，会保存在这台手机/电脑上…">${
        saved.summary || ''
      }</textarea>
      <div class="row">
        <button class="primary" id="saveBtn">保存今天</button>
        <button id="speakSum">朗读我的总结</button>
        <label class="check"><input type="checkbox" id="done" ${
          saved.done ? 'checked' : ''
        }/> 今天打卡完成</label>
      </div>
      <p class="saved" id="savedMsg"></p>
    </section>

    <div class="nav">
      <button id="prev" ${n <= 1 ? 'disabled' : ''}>前一天</button>
      <button id="next" ${n >= 30 ? 'disabled' : ''}>下一天</button>
    </div>
  `;

  $('#back').onclick = renderHome;
  $('#prev').onclick = () => renderDay(n - 1);
  $('#next').onclick = () => renderDay(n + 1);
  $('#readStory').onclick = () => speak(day.story);
  $('#speakSum').onclick = () => speak($('#summary').value || day.prompt);
  app.querySelectorAll('[data-say]').forEach((b) => {
    b.onclick = () => speak(day.talk[+b.dataset.say][1]);
  });
  $('#playTalk').onclick = () => {
    let i = 0;
    const next = () => {
      if (i >= day.talk.length) return;
      const [who, line] = day.talk[i++];
      const u = new SpeechSynthesisUtterance(`${who}说：${line}`);
      u.lang = 'zh-CN';
      u.rate = 0.92;
      u.onend = next;
      speechSynthesis.speak(u);
    };
    speechSynthesis.cancel();
    next();
  };
  $('#saveBtn').onclick = () => {
    const data = load();
    data[n] = {
      summary: $('#summary').value.trim(),
      didDo: $('#didDo').checked,
      done: $('#done').checked,
      at: new Date().toISOString(),
    };
    save(data);
    $('#savedMsg').textContent = '已保存到本机。灵姬那边的规划文件也有月目标备份。';
  };
}

document.addEventListener('DOMContentLoaded', renderHome);
