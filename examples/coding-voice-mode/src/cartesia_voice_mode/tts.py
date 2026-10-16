"""Sonic 3.6 over SSE. One request per sentence group, PCM written as it arrives."""

from __future__ import annotations

import base64
import re
import sys
import time
from dataclasses import dataclass

from cartesia import omit

from .config import Settings

MAX_CHUNK_CHARS = 500

class TtsError(Exception):
    pass

@dataclass
class TtsStats:
    ttfa_ms: float | None = None
    chars: int = 0

def split_text(text: str, limit: int = MAX_CHUNK_CHARS) -> list[str]:
    """Split on sentence ends into pieces of at most `limit` characters."""
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    out: list[str] = []
    cur = ""
    for s in sentences:
        while len(s) > limit:
            cut = s.rfind(" ", 0, limit)
            if cut <= 0:
                cut = limit
            if cur:
                out.append(cur)
                cur = ""
            out.append(s[:cut].strip())
            s = s[cut:].strip()
        if cur and len(cur) + 1 + len(s) > limit:
            out.append(cur)
            cur = s
        else:
            cur = f"{cur} {s}".strip()
    if cur:
        out.append(cur)
    return [c for c in out if c]

async def speak(client, s: Settings, text: str, speaker, *, voice: str | None = None, speed: float | None = None) -> TtsStats:
    stats = TtsStats(chars=len(text))
    t0 = time.monotonic()
    speed = speed if speed is not None else s.speed
    if speed is not None:
        speed = min(1.5, max(0.6, speed))
    try:
        for piece in split_text(text):
            stream = await client.tts.generate_sse(
                model_id=s.tts_model,
                transcript=piece,
                voice=voice or s.voice_id,
                output_format={"container": "raw", "encoding": "pcm_s16le", "sample_rate": s.sample_rate_out},
                generation_config={"speed": speed} if speed else omit,
                language=s.language or omit,
            )
            try:
                async for ev in stream:
                    if ev.type == "chunk":
                        if stats.ttfa_ms is None:
                            stats.ttfa_ms = (time.monotonic() - t0) * 1000
                            print(f"tts ttfa_ms={stats.ttfa_ms:.0f}", file=sys.stderr)
                        await speaker.write(base64.b64decode(ev.data))
                    elif ev.type == "error":
                        raise TtsError(f"{ev.title}: {ev.message}")
                    elif ev.type == "done":
                        break
            finally:
                close = getattr(stream, "close", None)
                if close is not None:
                    res = close()
                    if hasattr(res, "__await__"):
                        await res
    except BaseException:
        speaker.stop()
        raise
    return stats
