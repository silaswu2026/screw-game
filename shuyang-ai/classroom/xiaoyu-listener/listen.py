#!/usr/bin/env python3
"""
小雨同房旁听：先听，不抢话。
- 加入 LiveKit room（默认 chengzhangwu）身份 xiaoyu-listener
- 订阅家人音频 → LiveKit Inference STT
- 始终旁听并 publish {t:'heard'}；开口（TTS + 小雨 chat）须教室页点小雨激活（开口）
- 静音：STT 继续，但不回复 / 不 TTS
- TTS：xAI Grok voice **liora**（用户口中的 Lyora；与 Grok Bot 通话音色一致）via LiveKit Inference
- 唤醒后用 Inference LLM 生成真实回复；说话期间静音 STT，防回声循环

Secrets: .env or LIVEKIT_* env — never commit.
"""
from __future__ import annotations

import asyncio
import aiohttp
import json
import logging
import os
import re
import time
from pathlib import Path

from dotenv import load_dotenv
from livekit import api, rtc
from livekit.agents import inference, llm as lk_llm
from livekit.agents.stt import SpeechEventType
from livekit.agents.utils import http_context

HERE = Path(__file__).resolve().parent
load_dotenv(HERE / ".env")
load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("xiaoyu-listen")

LIVEKIT_URL = os.environ["LIVEKIT_URL"].strip()
LIVEKIT_API_KEY = os.environ["LIVEKIT_API_KEY"].strip()
LIVEKIT_API_SECRET = os.environ["LIVEKIT_API_SECRET"].strip()
ROOM_NAME = os.environ.get("LIVEKIT_ROOM", "chengzhangwu").strip()
IDENTITY = os.environ.get("XIAOYU_IDENTITY", "xiaoyu-listener").strip()
STT_MODEL = os.environ.get("STT_MODEL", "deepgram/nova-3").strip()
STT_LANGUAGE = os.environ.get("STT_LANGUAGE", "zh").strip()
# Lyora = xAI Grok TTS voice id "liora" (Calm, grounded, luminous)
TTS_MODEL = os.environ.get("TTS_MODEL", "xai/tts-1").strip()
TTS_VOICE = os.environ.get("TTS_VOICE", "liora").strip()
TTS_LANGUAGE = os.environ.get("TTS_LANGUAGE", "zh").strip()
LLM_MODEL = os.environ.get("LLM_MODEL", "openai/gpt-4o-mini").strip()
ENABLE_TTS = os.environ.get("ENABLE_TTS", "1").strip() not in ("0", "false", "no")
ENABLE_LLM = os.environ.get("ENABLE_LLM", "1").strip() not in ("0", "false", "no")
# After TTS ends, keep ignoring STT for this many seconds (echo / room reverb)
ECHO_COOLDOWN_S = float(os.environ.get("ECHO_COOLDOWN_S", "1.2"))
# Keep conversation open after wake without re-saying 小雨
CONV_HOLD_S = float(os.environ.get("CONV_HOLD_S", "90"))

WAKE_RE = re.compile(r"(小雨|小宇|xiaoyu|xiao.?yu)", re.I)
# Own canned / recent replies often re-heard by mic — never treat as user speech
OWN_ECHO_RE = re.compile(
    r"(我在听你说|我在听.?你说|爸爸.?我在听|我在听.?你说～|嗯.?我在)",
    re.I,
)

ROLE_LABEL = {
    "dad": "爸爸",
    "lucas": "芃芃",
    "kid": "芃芃",
    "mom": "妈妈",
    "chunyan": "妈妈",
}

SYSTEM_PROMPT = (
    "你是「小雨」，伍澍暘成长屋里的陪伴姐姐，语气亲切、简短、适合亲子口语。"
    "用中文回复，一两句即可（一般不超过40字），不要复读唤醒词，不要自称AI。"
    "根据家人刚才说的话自然回应，像通电话一样聊天。"
)


def label_for(participant: rtc.RemoteParticipant) -> str:
    ident = (participant.identity or "").lower()
    if ident in ROLE_LABEL:
        return ROLE_LABEL[ident]
    name = participant.name or ""
    if "爸" in name:
        return "爸爸"
    if "妈" in name:
        return "妈妈"
    if "芃" in name or "澍" in name:
        return "芃芃"
    return name or participant.identity or "家人"


def mint_token() -> str:
    grant = api.VideoGrants(
        room_join=True,
        room=ROOM_NAME,
        can_publish=True,
        can_subscribe=True,
        can_publish_data=True,
    )
    return (
        api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        .with_identity(IDENTITY)
        .with_name("小雨")
        .with_grants(grant)
        .to_jwt()
    )


class XiaoyuListener:
    def __init__(self) -> None:
        self.room = rtc.Room()
        self._stt_tasks: dict[str, asyncio.Task] = {}
        self._audio_ready = asyncio.Event()
        self._listen_started_at = 0.0
        self._tts = None
        self._llm = None
        self._http: aiohttp.ClientSession | None = None
        self._audio_source: rtc.AudioSource | None = None
        self._audio_track: rtc.LocalAudioTrack | None = None
        self._speak_lock = asyncio.Lock()
        self._speak_active = False
        self._speaking = False
        self._mute_stt_until = 0.0
        self._conv_until = 0.0
        self._recent_replies: list[str] = []
        self._history: list[tuple[str, str]] = []  # (role, text) for short context

    def _stt_muted(self) -> bool:
        return self._speaking or time.time() < self._mute_stt_until

    def _conv_open(self) -> bool:
        return time.time() < self._conv_until

    def _mark_speaking(self, on: bool, cooldown: float | None = None) -> None:
        self._speaking = on
        if not on:
            cd = ECHO_COOLDOWN_S if cooldown is None else cooldown
            self._mute_stt_until = time.time() + max(0.0, cd)

    def _looks_like_echo(self, text: str) -> bool:
        t = (text or "").strip()
        if not t:
            return True
        if OWN_ECHO_RE.search(t):
            return True
        norm = re.sub(r"[\s，。！？、～,.!?]+", "", t)
        for prev in self._recent_replies[-6:]:
            p = re.sub(r"[\s，。！？、～,.!?]+", "", prev)
            if not p:
                continue
            if norm == p or (len(norm) >= 4 and (norm in p or p in norm)):
                return True
        return False

    async def start(self) -> None:
        self._http = aiohttp.ClientSession()
        try:
            await self._start_room()
        finally:
            for task in list(self._stt_tasks.values()):
                task.cancel()
            if self._http and not self._http.closed:
                await self._http.close()
            self._http = None

    async def _start_room(self) -> None:
        token = mint_token()
        log.info(
            "connecting to %s room=%s as %s TTS=%s voice=%s LLM=%s",
            LIVEKIT_URL,
            ROOM_NAME,
            IDENTITY,
            TTS_MODEL,
            TTS_VOICE,
            LLM_MODEL if ENABLE_LLM else "off",
        )

        @self.room.on("track_subscribed")
        def _on_track_subscribed(
            track: rtc.Track,
            publication: rtc.RemoteTrackPublication,
            participant: rtc.RemoteParticipant,
        ):
            if track.kind == rtc.TrackKind.KIND_AUDIO:
                if participant.identity == IDENTITY:
                    return
                log.info("audio subscribed: %s (%s) — 静默旁听", participant.identity, label_for(participant))
                self._audio_ready.set()
                self._ensure_stt(participant, track)

        @self.room.on("participant_connected")
        def _on_participant_connected(participant: rtc.RemoteParticipant):
            log.info("participant connected: %s name=%s", participant.identity, participant.name)

        @self.room.on("track_unsubscribed")
        def _on_track_unsubscribed(
            track: rtc.Track,
            publication: rtc.RemoteTrackPublication,
            participant: rtc.RemoteParticipant,
        ):
            if track.kind == rtc.TrackKind.KIND_AUDIO:
                self._stop_stt(participant.identity)

        @self.room.on("participant_disconnected")
        def _on_participant_disconnected(participant: rtc.RemoteParticipant):
            self._stop_stt(participant.identity)

        @self.room.on("data_received")
        def _on_data_received(data: rtc.DataPacket):
            asyncio.create_task(self._on_data(data))

        await self.room.connect(LIVEKIT_URL, token)
        self._listen_started_at = time.time()
        log.info("joined — 开口/静音由教室页 xiaoyu_active 控制；voice=%s", TTS_VOICE)

        await self._publish_system("小雨已进同房旁听（点小雨「开口」才说话；再点「静音」）")
        for p in self.room.remote_participants.values():
            for pub in p.track_publications.values():
                if pub.track and pub.track.kind == rtc.TrackKind.KIND_AUDIO:
                    self._audio_ready.set()
                    self._ensure_stt(p, pub.track)

        while True:
            await asyncio.sleep(3600)

    async def _on_data(self, data: rtc.DataPacket) -> None:
        try:
            raw = data.data
            if isinstance(raw, memoryview):
                raw = raw.tobytes()
            msg = json.loads(raw.decode("utf-8"))
        except Exception:
            return
        if not isinstance(msg, dict):
            return
        if msg.get("t") == "xiaoyu_active":
            on = bool(msg.get("on"))
            prev = self._speak_active
            self._speak_active = on
            who = ""
            if data.participant:
                who = data.participant.identity or ""
            log.info("speak mode %s → %s (from %s)  # 开口=%s 静音=%s", prev, on, who or "?", on, not on)
            if not on:
                self._conv_until = 0.0
            await self._publish({"t": "xiaoyu_active", "on": on})
            return

        if msg.get("t") == "xiaoyu_say":
            text = (msg.get("text") or "").strip()
            if not text:
                return
            if not self._speak_active:
                self._speak_active = True
                await self._publish({"t": "xiaoyu_active", "on": True})
            mood = msg.get("mood") or "happy"
            log.info("xiaoyu_say (%s): %s", mood, text[:80])
            await self._say(text, mood=mood)
            return

    def _ensure_stt(self, participant: rtc.RemoteParticipant, track: rtc.Track) -> None:
        ident = participant.identity
        if ident in self._stt_tasks and not self._stt_tasks[ident].done():
            return
        self._stt_tasks[ident] = asyncio.create_task(
            self._stt_loop(participant, track), name=f"stt-{ident}"
        )

    def _stop_stt(self, identity: str) -> None:
        task = self._stt_tasks.pop(identity, None)
        if task and not task.done():
            task.cancel()

    async def _stt_loop(self, participant: rtc.RemoteParticipant, track: rtc.Track) -> None:
        who = label_for(participant)
        log.info("STT start for %s (%s) model=%s lang=%s", participant.identity, who, STT_MODEL, STT_LANGUAGE)
        stt = inference.STT(model=STT_MODEL, language=STT_LANGUAGE, http_session=self._http)
        stream = stt.stream()
        audio = rtc.AudioStream(track, sample_rate=16000, num_channels=1)

        async def pump_audio():
            async for ev in audio:
                # Still push frames so STT stays warm; finals are gated in consumer
                stream.push_frame(ev.frame)

        pump = asyncio.create_task(pump_audio())
        try:
            async for event in stream:
                if event.type != SpeechEventType.FINAL_TRANSCRIPT:
                    continue
                text = ""
                if event.alternatives:
                    text = (event.alternatives[0].text or "").strip()
                if not text:
                    continue
                if self._stt_muted():
                    log.info("ignore STT while speaking/cooldown: %s", text[:60])
                    continue
                log.info("heard %s: %s", who, text)
                await self._on_final_transcript(who, participant.identity, text)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.exception("STT loop error for %s: %s", participant.identity, e)
        finally:
            pump.cancel()
            try:
                await stream.aclose()
            except Exception:
                pass
            try:
                await audio.aclose()
            except Exception:
                pass

    async def _on_final_transcript(self, who: str, identity: str, text: str) -> None:
        wake = bool(WAKE_RE.search(text))
        await self._publish(
            {
                "t": "heard",
                "who": who,
                "id": identity,
                "text": text,
                "wake": wake,
                "speak": self._speak_active,
            }
        )
        # 静音：只听不说
        if not self._speak_active:
            return
        if self._looks_like_echo(text):
            log.info("skip echo-like transcript: %s", text[:60])
            return
        # 开口后：唤醒词 或 对话窗口内 → 真实回复
        if wake:
            self._conv_until = time.time() + CONV_HOLD_S
        elif not self._conv_open():
            return

        user_line = WAKE_RE.sub("", text).strip(" ，,。.!！？?～~")
        if not user_line:
            user_line = text.strip()

        reply = await self._reply_for(who, user_line, raw=text)
        if not reply:
            return
        log.info("speak-on → reply: %s", reply)
        self._conv_until = time.time() + CONV_HOLD_S
        await self._say(reply, mood="happy")

    async def _reply_for(self, who: str, text: str, raw: str) -> str:
        if ENABLE_LLM:
            try:
                out = await self._llm_reply(who, text)
                if out:
                    return out
            except Exception as e:
                log.warning("LLM failed, fallback ack: %s", e)
        # No LLM / failure: varied short ack based on transcript (never fixed loop phrase)
        snippet = re.sub(r"\s+", "", text)[:12] or "你说的"
        return f"{who}，你说「{snippet}」啦，我听到了～"

    async def _llm_reply(self, who: str, text: str) -> str:
        if self._llm is None:
            self._llm = inference.LLM(model=LLM_MODEL)
        self._history.append(("user", f"{who}：{text}"))
        self._history = self._history[-8:]
        chat = lk_llm.ChatContext()
        chat.add_message(role="system", content=SYSTEM_PROMPT)
        for role, content in self._history:
            chat.add_message(role=role, content=content)
        stream = self._llm.chat(chat_ctx=chat)
        chunks: list[str] = []
        async for chunk in stream:
            if chunk is None:
                continue
            delta = getattr(chunk, "delta", None)
            if delta is not None:
                c = getattr(delta, "content", None)
                if c:
                    chunks.append(c)
                    continue
            c = getattr(chunk, "content", None) or getattr(chunk, "text", None)
            if isinstance(c, str) and c:
                chunks.append(c)
        reply = "".join(chunks).strip()
        # strip quotes / markdown
        reply = reply.strip("「」\"' \n")
        if len(reply) > 80:
            reply = reply[:78] + "…"
        if reply:
            self._history.append(("assistant", reply))
            self._history = self._history[-8:]
        return reply

    async def _say(self, text: str, mood: str = "happy") -> None:
        if not self._speak_active:
            log.info("skip _say (静音): %s", text)
            return
        async with self._speak_lock:
            if not self._speak_active:
                return
            self._recent_replies.append(text)
            self._recent_replies = self._recent_replies[-8:]
            await self._publish(
                {
                    "t": "chat",
                    "who": "小雨",
                    "id": "xiaoyu",
                    "text": text,
                    "mood": mood,
                }
            )
            if ENABLE_TTS:
                self._mark_speaking(True)
                try:
                    await self._speak_tts(text)
                except Exception as e:
                    log.warning("TTS failed (data bubble still sent): %s", e)
                finally:
                    # Estimate trailing echo: ~0.05s per char + cooldown
                    extra = min(2.5, max(0.4, len(text) * 0.04))
                    self._mark_speaking(False, cooldown=ECHO_COOLDOWN_S + extra)

    async def _ensure_mic(self) -> rtc.AudioSource:
        if self._audio_source and self._audio_track:
            return self._audio_source
        self._audio_source = rtc.AudioSource(24000, 1)
        self._audio_track = rtc.LocalAudioTrack.create_audio_track("xiaoyu-voice", self._audio_source)
        await self.room.local_participant.publish_track(self._audio_track)
        log.info("published local TTS audio track (voice=%s)", TTS_VOICE)
        return self._audio_source

    async def _speak_tts(self, text: str) -> None:
        if self._tts is None:
            self._tts = inference.TTS(
                model=TTS_MODEL,
                voice=TTS_VOICE,
                language=TTS_LANGUAGE,
                http_session=self._http,
            )
            log.info("TTS ready model=%s voice=%s lang=%s", TTS_MODEL, TTS_VOICE, TTS_LANGUAGE)
        source = await self._ensure_mic()
        stream = self._tts.synthesize(text)
        async for ev in stream:
            frame = getattr(ev, "frame", None) or ev
            if hasattr(frame, "data"):
                await source.capture_frame(frame)

    async def _publish(self, payload: dict) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        try:
            await self.room.local_participant.publish_data(data, reliable=True)
        except Exception as e:
            log.warning("publish_data failed: %s", e)

    async def _publish_system(self, text: str) -> None:
        await self._publish({"t": "chat", "who": "系统", "text": text, "id": "xiaoyu"})


async def main() -> None:
    missing = [k for k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET") if not os.environ.get(k)]
    if missing:
        raise SystemExit(f"missing env: {', '.join(missing)} (see .env.example)")
    async with http_context.open():
        listener = XiaoyuListener()
        await listener.start()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("bye")
