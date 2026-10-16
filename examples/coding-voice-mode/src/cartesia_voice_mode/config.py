from __future__ import annotations

import os
import stat
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping

TTS_MODEL = "sonic-3.6"
STT_MODEL = "ink-2"
DEFAULT_VOICE_ID = "47c38ca4-5f35-497b-b1a3-415245fb35e1"

RETIRED_MODELS = ("sonic-2", "sonic-turbo", "sonic-3-2025-10-27", "sonic-latest", "sonic-english")  # allow-model-id

class ConfigError(Exception):
    pass

@dataclass(frozen=True)
class Settings:
    api_key: str | None = field(default=None, repr=False)
    voice_id: str = DEFAULT_VOICE_ID
    tts_model: str = TTS_MODEL
    stt_model: str = STT_MODEL
    language: str | None = None
    speed: float | None = None
    turn_end_timeout_ms: float | None = None
    turn_start_threshold: float | None = None
    turn_eager_end_threshold: float | None = None
    turn_end_threshold: float | None = None
    keyterms: tuple[str, ...] = ()
    sample_rate_in: int = 16000
    sample_rate_out: int = 24000
    input_device: str | None = None
    output_device: str | None = None
    no_speech_timeout_s: float = 20.0
    max_listen_s: float = 120.0
    max_message_chars: int = 2000
    base_url: str | None = None
    ws_base_url: str | None = None

    def __repr__(self) -> str:
        have = "set" if self.api_key else "missing"
        return f"Settings(api_key=<{have}>, voice_id={self.voice_id!r}, tts_model={self.tts_model!r}, stt_model={self.stt_model!r})"

def config_dir(env: Mapping[str, str] | None = None) -> Path:
    env = os.environ if env is None else env
    base = env.get("XDG_CONFIG_HOME")
    root = Path(base) if base else Path(env.get("HOME") or Path.home()) / ".config"
    return root / "cartesia-voice-mode"

def key_file(env: Mapping[str, str] | None = None) -> Path:
    return config_dir(env) / "env"

def _read_key_file(path: Path) -> str | None:
    try:
        text = path.read_text()
        mode = stat.S_IMODE(path.stat().st_mode)
    except OSError:
        return None
    if mode & 0o077:
        print(f"warning: {path} is readable by other users, run: chmod 600 {path}", file=sys.stderr)
    for line in text.splitlines():
        name, sep, value = line.partition("=")
        if sep and name.strip() == "CARTESIA_API_KEY":
            return value.strip().strip("'\"") or None
    return None

def _first(env: Mapping[str, str], *names: str) -> str | None:
    for n in names:
        v = env.get(n)
        if v:
            return v.strip()
    return None

def _num(env: Mapping[str, str], name: str, cast=float):
    raw = env.get(name)
    if not raw:
        return None
    try:
        return cast(raw)
    except ValueError:
        raise ConfigError(f"{name} must be a number, got {raw!r}") from None

def load_settings(env: Mapping[str, str] | None = None) -> Settings:
    env = os.environ if env is None else env

    tts_model = _first(env, "CARTESIA_TTS_MODEL", "VOICEMODE_CARTESIA_MODEL") or TTS_MODEL
    if tts_model in RETIRED_MODELS:
        raise ConfigError(f"TTS model {tts_model!r} is retired. Use {TTS_MODEL!r}.")
    stt_model = env.get("CARTESIA_STT_MODEL") or STT_MODEL
    if stt_model != STT_MODEL:
        raise ConfigError(f"The turns endpoint only accepts {STT_MODEL!r}, got {stt_model!r}.")

    speed = _num(env, "CARTESIA_SPEED")
    if speed is not None:
        speed = min(1.5, max(0.6, speed))

    keyterms = tuple(t.strip() for t in (env.get("CARTESIA_KEYTERMS") or "").split(",") if t.strip())
    if len(keyterms) > 100 or sum(len(t) for t in keyterms) > 1200:
        raise ConfigError("CARTESIA_KEYTERMS allows up to 100 terms and 1200 characters.")

    timeout_ms = _num(env, "CARTESIA_TURN_END_TIMEOUT_MS")
    if timeout_ms is not None and not 640 <= timeout_ms <= 11200:
        raise ConfigError("CARTESIA_TURN_END_TIMEOUT_MS must be between 640 and 11200.")

    api_key = env.get("CARTESIA_API_KEY") or _read_key_file(key_file(env))
    return Settings(
        api_key=api_key or None,
        voice_id=_first(env, "CARTESIA_VOICE_ID", "VOICEMODE_CARTESIA_VOICE_ID") or DEFAULT_VOICE_ID,
        tts_model=tts_model,
        stt_model=stt_model,
        language=_first(env, "CARTESIA_LANGUAGE"),
        speed=speed,
        turn_end_timeout_ms=timeout_ms,
        turn_start_threshold=_num(env, "CARTESIA_TURN_START_THRESHOLD"),
        turn_eager_end_threshold=_num(env, "CARTESIA_TURN_EAGER_END_THRESHOLD"),
        turn_end_threshold=_num(env, "CARTESIA_TURN_END_THRESHOLD"),
        keyterms=keyterms,
        sample_rate_in=_num(env, "CARTESIA_SAMPLE_RATE_IN", int) or 16000,
        sample_rate_out=_num(env, "CARTESIA_SAMPLE_RATE_OUT", int) or 24000,
        input_device=_first(env, "CARTESIA_INPUT_DEVICE"),
        output_device=_first(env, "CARTESIA_OUTPUT_DEVICE"),
        no_speech_timeout_s=_num(env, "CARTESIA_NO_SPEECH_TIMEOUT_S") or 20.0,
        max_listen_s=_num(env, "CARTESIA_MAX_LISTEN_S") or 120.0,
        max_message_chars=_num(env, "CARTESIA_MAX_MESSAGE_CHARS", int) or 2000,
        base_url=_first(env, "CARTESIA_BASE_URL"),
        ws_base_url=_first(env, "CARTESIA_WS_BASE_URL"),
    )
