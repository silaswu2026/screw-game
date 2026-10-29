# 小雨旁听（LiveKit listener）

让小雨在同房 `chengzhangwu` **先听**家人说话，并用 LiveKit Inference STT 转成文字。

## 行为

1. **先听**：进房后静默旁听，不抢话。
2. **欢迎**：爸爸 / 芃芃 / 妈妈带摄像头进房后，稍等再说「欢迎爸爸进来」等（不是笼统的「欢迎你」）。
3. **唤醒才回**：日常只听；话里出现 **「小雨」**（也认误称「小宇」）才回复。
4. 教室页通过 `publishData` 收到 `{t:'heard'}` / `{t:'chat', who:'小雨'}`，头顶冒泡。

## 密钥（不要提交）

```bash
cp .env.example .env
# 填入 LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET
```

STT 走 **LiveKit Inference**（`deepgram/nova-3`），一般**不需要**单独 Deepgram key；用量记在 LiveKit Cloud。

可选：

- `ENABLE_TTS=0` — 只发文字冒泡，不开语音轨
- `STT_LANGUAGE=zh`
- `WELCOME_DELAY_S=1.6`

## 在本机 / box 运行

```bash
cd shuyang-ai/classroom/xiaoyu-listener
./run.sh
```

保持该进程运行；家人在 https://silaswu2026.github.io/shuyang-chengzhangwu/shuyang-ai/classroom/ 点头像进房后，小雨即可听。

## 状态说明

| 能力 | 状态 |
|------|------|
| 进同房订阅音频 | ✅ `listen.py` |
| STT（Inference） | ✅ 需 LiveKit Cloud 开通 Inference / 有额度 |
| 欢迎语 + 唤醒词 | ✅ |
| TTS 开口 | ⚠️ 依赖 Inference TTS；失败时仍有文字冒泡 |
| 完整对话 LLM | ❌ 未接；唤醒后仅短回复 |

身份：`xiaoyu-listener`（与浏览器示意席 `xiaoyu` 区分，避免抢同一 identity）。
