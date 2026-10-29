#!/usr/bin/env python3
"""
小雨同房旁听：先听，不抢话。
- 加入 LiveKit room（默认 chengzhangwu）身份 xiaoyu-listener
- 订阅家人音频 → LiveKit Inference STT（无需单独 Deepgram key）
- 有人带摄像头进房：稍等后说「欢迎爸爸/芃芃/妈妈进来」
- 日常只静默听；仅当话里喊到「小雨」（或误称「小宇」）才回复/冒泡
- 通过 publishData 推给教室页：{t:'heard'} / {t:'chat', who:'小雨', ...}

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
WELCOME_DELAY_S = float(os.environ.get("WELCOME_DELAY_S", "1.6"))
ENABLE_TTS = os.environ.get("ENABLE_TTS", "1").strip() not in ("0", "false", "no")

# Wake words: canonical 小雨; family sometimes says 小宇
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
        self._welcomed: set[str] = set()
        self._audio_ready = asyncio.Event()
        self._listen_started_at = 0.0
        self._tts = None
        self._audio_source: rtc.AudioSource | None = None
        self._audio_track: rtc.LocalAudioTrack | None = None
        self._speak_lock = asyncio.Lock()

    async def start(self) -> None:
        token = mint_token()
        log.info("connecting to %s room=%s as %s (LISTEN FIRST)", LIVEKIT_URL, ROOM_NAME, IDENTITY)

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
            elif track.kind == rtc.TrackKind.KIND_VIDEO:
                asyncio.create_task(self._maybe_welcome(participant))

        @self.room.on("participant_connected")
        def _on_participant_connected(participant: rtc.RemoteParticipant):
            log.info("participant connected: %s name=%s", participant.identity, participant.name)
            # video may arrive later via track_subscribed

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
            self._welcomed.discard(participant.identity)

        await self.room.connect(LIVEKIT_URL, token)
        self._listen_started_at = time.time()
        log.info("joined — 先听，不抢话。唤醒词：小雨（也认小宇）")

        await self._publish_system("小雨已进同房旁听，先听你们说～")
        # existing participants
        for p in self.room.remote_participants.values():
            for pub in p.track_publications.values():
                if pub.track and pub.track.kind == rtc.TrackKind.KIND_AUDIO:
                    self._audio_ready.set()
                    self._ensure_stt(p, pub.track)
                if pub.track and pub.track.kind == rtc.TrackKind.KIND_VIDEO:
                    asyncio.create_task(self._maybe_welcome(p))

        # stay alive
        while True:
            await asyncio.sleep(3600)

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
        # Always notify classroom that 小雨 heard (for bubble/log), but do not speak back
        # unless wake word present.
        await self._publish(
            {
                "t": "heard",
                "who": who,
                "id": identity,
                "text": text,
                "wake": bool(WAKE_RE.search(text)),
            }
        )
        if not WAKE_RE.search(text):
            # 静默旁听 — family talking among themselves
            return

        # Called 小雨 — short acknowledgment
        reply = self._reply_for_wake(who, text)
        log.info("wake word → reply: %s", reply)
        await self._say(reply, mood="happy")

    def _reply_for_wake(self, who: str, text: str) -> str:
        # Keep first replies short & kid-friendly; full LLM later
        if "欢迎" in text:
            return "嗯，我在～"
        return f"{who}，我在听，你说～"

    async def _maybe_welcome(self, participant: rtc.RemoteParticipant) -> None:
        ident = participant.identity
        if ident == IDENTITY or ident in ("xiaoyu", "rain"):
            return
        if ident in self._welcomed:
            return
        # only welcome family roles we know
        who = label_for(participant)
        if who not in ("爸爸", "芃芃", "妈妈"):
            log.info("skip welcome for unknown %s", ident)
            return
        self._welcomed.add(ident)
        # LISTEN FIRST: wait until audio path ready a bit, then pause before speaking
        try:
            await asyncio.wait_for(self._audio_ready.wait(), timeout=8)
        except asyncio.TimeoutError:
            pass
        # ensure we have been in room at least WELCOME_DELAY
        elapsed = time.time() - self._listen_started_at
        await asyncio.sleep(max(WELCOME_DELAY_S, 0.8 - elapsed if elapsed < 0.8 else WELCOME_DELAY_S))
        line = f"欢迎{who}进来"
        log.info("welcome: %s", line)
        await self._say(line, mood="happy")

    async def _say(self, text: str, mood: str = "happy") -> None:
        async with self._speak_lock:
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
            # AudioFrame events
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
