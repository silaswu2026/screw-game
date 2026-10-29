#!/usr/bin/env python3
"""
小雨同房旁听：先听，不抢话。
- 加入 LiveKit room（默认 chengzhangwu）身份 xiaoyu-listener
- 订阅家人音频 → LiveKit Inference STT（无需单独 Deepgram key）
- 始终旁听并 publish {t:'heard'}；开口（TTS + 小雨 chat 气泡）须教室页点小雨激活
- 教室页 publishData {t:'xiaoyu_active', on:true|false} 开关 speak mode
- 教室页 publishData {t:'xiaoyu_say', text} 课程/脚本让小雨开口（可自动开 speak）
- 通过 publishData 推给教室页：{t:'heard'} / {t:'chat', who:'小雨', ...} / {t:'xiaoyu_active'}

Secrets: .env or LIVEKIT_* env — never commit.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from pathlib import Path

from dotenv import load_dotenv
from livekit import api, rtc
from livekit.agents import inference
from livekit.agents.stt import SpeechEventType

HERE = Path(__file__).resolve().parent
load_dotenv(HERE / ".env")
load_dotenv()  # also allow process env

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("xiaoyu-listen")

LIVEKIT_URL = os.environ["LIVEKIT_URL"].strip()
LIVEKIT_API_KEY = os.environ["LIVEKIT_API_KEY"].strip()
LIVEKIT_API_SECRET = os.environ["LIVEKIT_API_SECRET"].strip()
ROOM_NAME = os.environ.get("LIVEKIT_ROOM", "chengzhangwu").strip()
IDENTITY = os.environ.get("XIAOYU_IDENTITY", "xiaoyu-listener").strip()
STT_MODEL = os.environ.get("STT_MODEL", "deepgram/nova-3").strip()
STT_LANGUAGE = os.environ.get("STT_LANGUAGE", "zh").strip()
TTS_MODEL = os.environ.get("TTS_MODEL", "cartesia/sonic-3").strip()
ENABLE_TTS = os.environ.get("ENABLE_TTS", "1").strip() not in ("0", "false", "no")

# Wake words: canonical 小雨; family sometimes says 小宇 — only reply when speak mode on
WAKE_RE = re.compile(r"(小雨|小宇|xiaoyu|xiao.?yu)", re.I)

ROLE_LABEL = {
    "dad": "爸爸",
    "lucas": "芃芃",
    "kid": "芃芃",
    "mom": "妈妈",
    "chunyan": "妈妈",
}


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
    token = (
        api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        .with_identity(IDENTITY)
        .with_name("小雨")
        .with_grants(grant)
        .to_jwt()
    )
    return token


class XiaoyuListener:
    def __init__(self) -> None:
        self.room = rtc.Room()
        self._stt_tasks: dict[str, asyncio.Task] = {}
        self._audio_ready = asyncio.Event()
        self._listen_started_at = 0.0
        self._tts = None
        self._audio_source: rtc.AudioSource | None = None
        self._audio_track: rtc.LocalAudioTrack | None = None
        self._speak_lock = asyncio.Lock()
        # Gate ALL spoken output until classroom page activates 小雨
        self._speak_active = False

    async def start(self) -> None:
        token = mint_token()
        log.info("connecting to %s room=%s as %s (LISTEN FIRST, speak gated)", LIVEKIT_URL, ROOM_NAME, IDENTITY)

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
            # video: no auto-welcome

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
        log.info("joined — 先听；开口需教室页点小雨 (xiaoyu_active)")

        await self._publish_system("小雨已进同房旁听（默默听；点小雨才开口）")
        # existing participants
        for p in self.room.remote_participants.values():
            for pub in p.track_publications.values():
                if pub.track and pub.track.kind == rtc.TrackKind.KIND_AUDIO:
                    self._audio_ready.set()
                    self._ensure_stt(p, pub.track)

        # stay alive
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
            log.info("speak mode %s → %s (from %s)", prev, on, who or "?")
            # Echo so all classroom tabs stay in sync
            await self._publish({"t": "xiaoyu_active", "on": on})
            return

        # Course / scripted line: classroom asks 小雨 to speak a fixed line
        if msg.get("t") == "xiaoyu_say":
            text = (msg.get("text") or "").strip()
            if not text:
                return
            # Course flow may send say before speak toggle; activate for this line
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
        stt = inference.STT(model=STT_MODEL, language=STT_LANGUAGE)
        stream = stt.stream()
        audio = rtc.AudioStream(track, sample_rate=16000, num_channels=1)

        async def pump_audio():
            async for ev in audio:
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
        # Always notify classroom that 小雨 heard (for log/detection); never auto-speak
        # unless speak mode is on AND wake word present.
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
        if not self._speak_active:
            return
        if not wake:
            return

        reply = self._reply_for_wake(who, text)
        log.info("speak-on + wake → reply: %s", reply)
        await self._say(reply, mood="happy")

    def _reply_for_wake(self, who: str, text: str) -> str:
        # Keep first replies short & kid-friendly; full LLM later
        if "欢迎" in text:
            return "嗯，我在～"
        return f"{who}，我在听，你说～"

    async def _say(self, text: str, mood: str = "happy") -> None:
        if not self._speak_active:
            log.info("skip _say (speak off): %s", text)
            return
        async with self._speak_lock:
            if not self._speak_active:
                return
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
                try:
                    await self._speak_tts(text)
                except Exception as e:
                    log.warning("TTS failed (data bubble still sent): %s", e)

    async def _ensure_mic(self) -> rtc.AudioSource:
        if self._audio_source and self._audio_track:
            return self._audio_source
        self._audio_source = rtc.AudioSource(24000, 1)
        self._audio_track = rtc.LocalAudioTrack.create_audio_track("xiaoyu-voice", self._audio_source)
        await self.room.local_participant.publish_track(self._audio_track)
        log.info("published local TTS audio track")
        return self._audio_source

    async def _speak_tts(self, text: str) -> None:
        if self._tts is None:
            self._tts = inference.TTS(model=TTS_MODEL, language="zh")
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
    listener = XiaoyuListener()
    await listener.start()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("bye")
