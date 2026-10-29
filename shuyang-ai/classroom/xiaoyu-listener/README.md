# 小雨旁听（LiveKit listener）

让小雨在同房 `chengzhangwu` **先听**家人说话，并用 LiveKit Inference STT 转成文字。

## 行为

1. **先听**：进房后静默旁听，不抢话。持久进程（`./run.sh`）。
2. **开口 / 静音**（点教室页小雨头像）：
   - **开口** `{t:'xiaoyu_active', on:true}` → STT + LLM 回复 + TTS（可对话）
   - **静音** `{t:'xiaoyu_active', on:false}` → STT 仍旁听，**不说话 / 不 TTS**
3. **唤醒词**：开口后，话里出现「小雨」（也认「小宇」）开启一段对话窗口；窗口内可继续聊，无需每句喊名字。
4. **防回声**：TTS 播放期间及冷却期内忽略 STT finals，并过滤「我在听你说」类自回声。
5. **音色**：xAI Grok **`liora`**（用户口中的 Lyora）via `xai/tts-1`。

## 密钥

```bash
cp .env.example .env
# 填入 LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET
```

STT / TTS / LLM 都走 **LiveKit Inference**（用量记在 LiveKit Cloud）。

## 运行

```bash
cd shuyang-ai/classroom/xiaoyu-listener
./run.sh
```

| 能力 | 状态 |
|------|------|
| 进同房订阅音频 | ✅ |
| STT | ✅ |
| 开口/静音 | ✅ `{t:'xiaoyu_active'}` |
| 对话 LLM | ✅ Inference LLM（默认 `openai/gpt-4o-mini`） |
| TTS Liora | ✅ `xai/tts-1` + `voice=liora` |
| 回声循环防护 | ✅ |

身份：`xiaoyu-listener`。
