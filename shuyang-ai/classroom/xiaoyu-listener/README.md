# 小雨旁听（LiveKit listener）

让小雨在同房 `chengzhangwu` **先听**家人说话，并用 LiveKit Inference STT 转成文字。

## 行为

1. **先听 / 默认静音**：进房后 `_speak_active=False`，不抢话、不 TTS。持久进程（`./run.sh`）。进房会广播 `{t:'xiaoyu_active',on:false}`。
2. **开口 / 静音**（点教室页小雨头像，或「关掉小雨声音」）：
   - **开口** `{t:'xiaoyu_active', on:true}` → STT + LLM 回复 + TTS（可对话）
   - **静音** `{t:'xiaoyu_active', on:false}` → STT 仍旁听，**不说话 / 不 TTS**；若正在合成会中止推流
3. **唤醒词**：开口后，话里出现「小雨」（也认「小宇」）开启一段对话窗口；窗口内可继续聊，无需每句喊名字。
4. **防回声**：TTS 播放期间及冷却期内忽略 STT finals，并过滤「我在听你说」类自回声。
5. **音色**：xAI Grok **`liora`**（用户口中的 Lyora）via `xai/tts-1`。
6. **与 Grok 电话同开教室页**：请保持网页静音（教室默认 / 「关掉小雨声音」）。浏览器无电话探测 API。

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
| 默认静音 / 开口 | ✅ `{t:'xiaoyu_active'}` 默认 `on:false` |
| 对话 LLM | ✅ Inference LLM（默认 `openai/gpt-4o-mini`） |
| TTS Liora | ✅ `xai/tts-1` + `voice=liora` |
| 回声循环防护 | ✅ |
| 静音中止 TTS | ✅ |

身份：`xiaoyu-listener`。
