# 小雨旁听（LiveKit listener）

让小雨在同房 `chengzhangwu` **先听**家人说话，并用 LiveKit Inference STT 转成文字。

## 行为

1. **先听**：进房后静默旁听，不抢话。持久进程（`./run.sh`），不依赖家人登录触发。
2. **不自动欢迎**：有人带摄像头进房时不说话。
3. **点小雨才开口**：教室页点小雨头像发 `{t:'xiaoyu_active', on:true}` 后，才允许 TTS / 小雨 chat 气泡；再点可关闭。
4. **唤醒词**：仅在 speak mode 开启时，话里出现 **「小雨」**（也认「小宇」）才回复。
5. STT 始终旁听，并 `publishData` `{t:'heard'}` 给教室页做检测/日志。

## 密钥（不要提交）

```bash
cp .env.example .env
# 填入 LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET
```

STT 走 **LiveKit Inference**（`deepgram/nova-3`），一般**不需要**单独 Deepgram key；用量记在 LiveKit Cloud。

可选：

- `ENABLE_TTS=0` — 只发文字冒泡，不开语音轨
- `STT_LANGUAGE=zh`

## 在本机 / box 运行

```bash
cd shuyang-ai/classroom/xiaoyu-listener
./run.sh
```

保持该进程运行；家人在 https://silaswu2026.github.io/shuyang-chengzhangwu/shuyang-ai/classroom/ 打开教室即可旁听。点小雨头像后才开口。

## 状态说明

| 能力 | 状态 |
|------|------|
| 进同房订阅音频 | ✅ `listen.py` |
| STT（Inference） | ✅ 需 LiveKit Cloud 开通 Inference / 有额度；脚本外跑须 `http_context.open()` |
| 点头像 speak mode | ✅ `{t:'xiaoyu_active'}` |
| 欢迎语 | ❌ 已关闭 |
| 唤醒词自动回 | ⚠️ 仅 speak mode 开时 |
| TTS 开口 | ⚠️ 依赖 Inference TTS；失败时仍有文字冒泡 |
| 完整对话 LLM | ❌ 未接；唤醒后仅短回复 |

身份：`xiaoyu-listener`（与浏览器示意席 `xiaoyu` 区分，避免抢同一 identity）。
