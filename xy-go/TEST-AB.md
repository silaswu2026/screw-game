# 小宇 xy-go · 测试说明（A/B + C AI）

Live: https://silaswu2026.github.io/shuyang-chengzhangwu/xy-go/

## 双人联网（人类 A + B）

1. **浏览器 1** 打开链接 → 点 **玩家A**（绿 · 芃芃）
2. **浏览器 2**（或无痕窗）同一链接 → 点 **玩家B**（蓝 · 爸爸）
3. 配对成功后自动开打。快捷：`?a=1` / `?b=1`
4. 微信请用右上角「浏览器打开」

## 玩家 C（可选笨 AI 跟班）

- 点 **玩家C** 或红头像开关「小宇 AI 跟班」
- **不占联网席**：本地/房主模拟，只会跟在 A/B 后面走跳
- 红忍者免疫喷火；不聪明，偶尔扔手里剑

## 玩法要点

- **不自动往前跑**：默认站立，方向键/触屏自己走，空格跳
- **8 关** 由易到难：每关有怪 + 楼梯/蹬墙 + 陷阱 + Boss
- 陷阱免疫：尖刺→绿；喷火→红；闪电→蓝；爆炸→无人免疫

## 稍后（未做）

- 教学 UI / 清晰视频：讲解角色、怪物、陷阱的 **精灵帧动画**（sprite/frame）

## 2026-10-29 verify
- Walk: hold ←/→ — green ninja flips walk_0..walk_3 (~10fps), not a sliding JPG.
- Jump: mid-air shows jump_0 frame.
- Knock: bomb pad still knock→crawl→getup frames.
- Scenes: L1 forest-day / L2 moss-dusk / L3 canopy-night parallax plates (not flat green gradient).
