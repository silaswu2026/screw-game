# 课程同步约定（classroom ↔ 电话小雨）

## 唯一真相源（canonical）

**文件：** `shuyang-ai/classroom/course-today.json`

- 教室页右栏「今日课题」+ 流程遮罩 + iframe 课题，都以这份 JSON 为准。
- **电话 / Grok Bot 语音频道里的小雨不会自动读教室状态**；要跟课，必须由父 bot 在本回合 `Read` 这份 JSON，再按 `theme` / `overview` / `speakOverview` / `steps[].speak` 说话。
- 改课顺序：**先改 `course-today.json`**，再改 `learn/skeleton.html`（或其它 iframe），最后才动 `classroom/index.html`。

## 稳定路径（给电话小雨 / 父 bot）

| 用途 | 路径 |
|------|------|
| 仓库内 canonical | `shuyang-ai/classroom/course-today.json` |
| 本机绝对路径（box） | `/workspace/repos/shuyang-chengzhangwu/shuyang-ai/classroom/course-today.json` |
| 线上（可能有 CDN 缓存） | `https://silaswu2026.github.io/shuyang-chengzhangwu/shuyang-ai/classroom/course-today.json` |
| box 镜像副本（便于 Read） | `/home/box/agent-data/course-today-canonical.json` |

线上 Pages 有约 10 分钟缓存；电话侧优先读 **box 绝对路径** 或仓库文件，不要假设 CDN 已更新。

## 教室页怎么加载

1. `loadCourseToday()`：`fetch('./course-today.json?v=' + Date.now(), { cache: 'no-store' })`
2. 用 JSON 的 `theme` / `overview` 填右栏「今日课题」摘要与开始遮罩
3. 点「开始」→ 小雨通过 LiveKit `{t:'xiaoyu_say', text}` 念 `speakOverview` 与各步 `speak`（网页 listener）
4. 各步 `skelStep` 同步 iframe `skeleton.html` 的步骤

## 与冒险月的关系

- 冒险月正文在 `shuyang-ai/course.js` 的 `DAYS[]`（培养目标 / 原理·方法·实践）。
- 教室「今天」**不是**自动取 `DAYS[今天序号]`；而是人工维护的 `course-today.json`。
- 当前课对齐第 2 周「立体」主题，专课为 **骨头 → 方块 → 贴皮**（`learn/skeleton.html`）。

## 为何会不同步（常见根因）

1. **两个独立频道**：Grok 电话小雨 ≠ 教室 LiveKit listener；电话不读 JSON，除非父 bot 显式加载。
2. **缓存**：旧版用固定 `?v=mc20`，浏览器 / GitHub Pages 可能仍吐旧 JSON 或旧 iframe。
3. **脚本各写各的**：有人按冒险月 Day 口述，教室仍显示 skeleton 专课。

## 更新今日课检查清单

- [ ] 编辑 `course-today.json`（`date` / `theme` / `overview` / `speakOverview` / `steps` / `iframe`）
- [ ] 确认 iframe 课题与 `steps[].skelStep` 一致
- [ ] 复制到 `/home/box/agent-data/course-today-canonical.json`
- [ ] commit + push；教室页点「强制刷新」或硬刷新（清缓存）
- [ ] 电话回合：父 bot `Read` canonical JSON 后再让小雨开口
