# 成长屋共学教室

LiveKit Cloud 房间页。打开：https://silaswu2026.github.io/shuyang-chengzhangwu/shuyang-ai/classroom/

- 爸爸点「爸爸进房」，芃芃手机微信打开同一链接点「芃芃进房」
- 第三格小雨 = 旁听在线（**默认【静音】**：只听不说，不播 TTS）
- 点小雨头像切换 **开口 / 静音**；音量旁 **「关掉小雨声音」** 一键：发布 `{t:'xiaoyu_active',on:false}` + 网页停播 `xiaoyu-voice`
- API Secret 不进仓库；进房 JWT 由小雨本机签发后写入本页（约 30 天有效）

## 与 Grok Bot 电话同时用

浏览器**无法**可靠探测你是否在和 Grok 电话中。两边小雨会抢声，请：

1. 进教室后保持小雨 **静音**（默认已是），或点 **「关掉小雨声音」**
2. 需要网页小雨开口时再点头像；电话期间不要点开口
3. 可选：控制台执行 `localStorage.setItem('xiaoyuForceMute','1')` 强制保持静音（电话结束后 `removeItem`）

- 今日课题真相源：`course-today.json`（见 `COURSE_SYNC.md`）；电话小雨需由 bot Read 该文件，不会自动同步。
