import contextlib
import logging
import os
import re
import subprocess
import tempfile
import time
import typing
from typing import List, Optional, Tuple

from cartesia import (
    APIConnectionError,
    Cartesia,
    InternalServerError,
    RateLimitError,
)
from cartesia.types import Emotion, SupportedLanguage
import pydub.audio_segment
from pydub import AudioSegment

from audiobook_generator.config.general_config import GeneralConfig
from audiobook_generator.core import cast, readalong
from audiobook_generator.utils.utils import set_audio_tags

logger = logging.getLogger(__name__)
logging.getLogger("httpx").setLevel(logging.WARNING)

TTS_CARTESIA = "cartesia"
DEFAULT_MODEL = "sonic-3.6"
SAMPLE_RATE = 44100
BYTES_PER_SECOND = SAMPLE_RATE * 2
LAUGHTER_TAG = "[laughter]"
DEFAULT_MAX_CHARS = 1500
DEFAULT_BREAK_MS = 600
MAX_CHUNK_RETRIES = 2

_RETIRED_MODELS = re.compile(
    r"^(sonic-2|sonic-turbo|sonic-latest|sonic-english|sonic-multilingual|sonic-3-2025-10-27)"  # allow-model-id
)

class CartesiaStreamError(RuntimeError):

    def __init__(self, status_code: int, message: str):
        super().__init__(f"Cartesia error {status_code}: {message}")
        self.status_code = status_code

def get_cartesia_supported_models() -> List[str]:
    return [DEFAULT_MODEL, "sonic-3.6-2026-08-27"]

def get_cartesia_supported_output_formats() -> List[str]:
    return ["mp3", "wav", "flac"]

def get_cartesia_supported_emotions() -> List[str]:
    return list(typing.get_args(Emotion))

def get_cartesia_supported_languages() -> List[str]:
    codes: List[str] = []
    for arg in typing.get_args(SupportedLanguage):
        codes.extend(typing.get_args(arg) or [])
    return codes

def normalise_language(language: Optional[str]) -> str:
    return (language or "en").split("-")[0].split("_")[0].lower()

class CartesiaTTSProvider:
    def __init__(self, config: GeneralConfig):
        config.model_name = config.model_name or DEFAULT_MODEL
        config.output_format = config.output_format or "mp3"
        config.language = normalise_language(config.language)
        config.cartesia_max_chars = config.cartesia_max_chars or DEFAULT_MAX_CHARS
        config.speed = 1.0 if config.speed is None else float(config.speed)
        config.cartesia_volume = 1.0 if config.cartesia_volume is None else float(config.cartesia_volume)
        config.write_timings = True if config.write_timings is None else bool(config.write_timings)
        config.cast_mode = config.cast_mode or "dialogue"
        config.cartesia_expressive = True if config.cartesia_expressive is None else bool(config.cartesia_expressive)
        config.break_duration = (
            DEFAULT_BREAK_MS if config.break_duration in (None, "") else int(config.break_duration)
        )
        self.config = config
        self.validate_config()
        self.cast = cast.load_cast(config)
        self.narrator_voice_id = self.cast.narrator_voice_id()
        config.voice_name = config.voice_name or self.cast.narrator
        self._client: Optional[Cartesia] = None

    def __str__(self) -> str:
        return f"CartesiaTTSProvider(model={self.config.model_name}, voice={self.config.voice_name})"

    def validate_config(self):
        c = self.config
        if c.output_format not in get_cartesia_supported_output_formats():
            raise ValueError(
                f"Unsupported output format '{c.output_format}'. Use one of: "
                + ", ".join(get_cartesia_supported_output_formats())
            )
        if _RETIRED_MODELS.match(c.model_name):
            raise ValueError(
                f"Model '{c.model_name}' is retired or about to be (sonic-3-2025-10-27 stops "  # allow-model-id
                f"working on 2026-10-20). Use {DEFAULT_MODEL}."
            )
        if not (c.model_name in get_cartesia_supported_models() or c.model_name.startswith(DEFAULT_MODEL)):
            logger.warning(f"Model '{c.model_name}' is not in the tested list, trying it anyway.")
        if c.language not in get_cartesia_supported_languages():
            raise ValueError(f"Unsupported language '{c.language}'.")
        if not 200 <= c.cartesia_max_chars <= 4000:
            raise ValueError("cartesia_max_chars must be between 200 and 4000.")
        if not 0.6 <= c.speed <= 1.5:
            raise ValueError("speed must be between 0.6 and 1.5.")
        if not 0.5 <= c.cartesia_volume <= 2.0:
            raise ValueError("volume must be between 0.5 and 2.0.")
        if not 0 <= c.break_duration <= 5000:
            raise ValueError("break_duration must be between 0 and 5000 ms.")
        if c.cast_mode not in ("narrator", "dialogue"):
            raise ValueError("cast_mode must be 'narrator' or 'dialogue'.")
        emotion = c.cartesia_emotion
        if emotion and emotion not in get_cartesia_supported_emotions():
            raise ValueError(f"Unknown emotion '{emotion}'.")

    @property
    def client(self) -> Cartesia:
        if self._client is None:
            api_key = os.environ.get("CARTESIA_API_KEY")
            if not api_key:
                raise RuntimeError(
                    "CARTESIA_API_KEY is not set. Export it or load your .env file "
                    "(set -a; . .env; set +a) before converting."
                )
            self._client = Cartesia(api_key=api_key)
        return self._client

    def prepare_run(self, chapters):
        c = self.config
        if c.cast_mode == "dialogue":
            expressive = c.cartesia_expressive and c.language == "en"
            for name in cast.scan_speakers(chapters, expressive=expressive):
                self.cast.assign(name)
        path = cast.cast_path(c.output_folder)
        if path:
            os.makedirs(c.output_folder, exist_ok=True)
            self.cast.save(path)
            logger.info(f"Voices: {', '.join(f'{k} = {v}' for k, v in self.cast.speakers.items()) or 'narrator only'} (saved to {path})")

    def get_break_string(self):
        return cast.PARAGRAPH_BREAK

    def get_output_file_extension(self):
        return self.config.output_format

    def estimate_cost(self, total_chars):
        logger.info(
            f"About {total_chars} Cartesia credits (roughly 1 per character). "
            "Price depends on your plan, see docs.cartesia.ai/pricing."
        )
        return 0.0

    def _generation_config(self, emotion: Optional[str]) -> dict:
        c = self.config
        gen = {}
        if emotion and c.language == "en":
            gen["emotion"] = emotion
        if c.speed != 1.0:
            gen["speed"] = c.speed
        if c.cartesia_volume != 1.0:
            gen["volume"] = c.cartesia_volume
        return gen

    def _stream_chunk(self, chunk: cast.Segment) -> Tuple[bytes, List[Tuple[str, float, float]]]:
        kwargs = dict(
            model_id=self.config.model_name,
            transcript=chunk.text,
            voice=chunk.voice_id,
            language=self.config.language,
            output_format={"container": "raw", "encoding": "pcm_s16le", "sample_rate": SAMPLE_RATE},
            add_timestamps=True,
            use_normalized_timestamps=False,
        )
        gen = self._generation_config(chunk.emotion)
        if gen:
            kwargs["generation_config"] = gen

        pcm = bytearray()
        words: List[Tuple[str, float, float]] = []
        with contextlib.closing(self.client.tts.generate_sse(**kwargs)) as stream:
            for ev in stream:
                if ev.type == "chunk":
                    if ev.audio:
                        pcm += ev.audio
                elif ev.type == "timestamps":
                    wt = ev.word_timestamps
                    words.extend(zip(wt.words, wt.start, wt.end, strict=False))
                elif ev.type == "error":
                    raise CartesiaStreamError(ev.status_code, f"{ev.title}: {ev.message}")
                elif ev.type == "done":
                    break
        return bytes(pcm), words

    def _stream_chunk_with_retry(self, chunk: cast.Segment):
        for attempt in range(MAX_CHUNK_RETRIES + 1):
            try:
                return self._stream_chunk(chunk)
            except (APIConnectionError, RateLimitError, InternalServerError, CartesiaStreamError) as e:
                retryable = not isinstance(e, CartesiaStreamError) or e.status_code == 429 or e.status_code >= 500
                if attempt == MAX_CHUNK_RETRIES or not retryable:
                    raise
                delay = 2 ** attempt
                logger.warning(f"{type(e).__name__} on a chunk, retrying in {delay}s")
                time.sleep(delay)

    def build_chunks(self, text: str) -> List[cast.Segment]:
        c = self.config
        segments = cast.build_segments(
            text,
            self.cast,
            mode=c.cast_mode,
            expressive=c.cartesia_expressive and c.language == "en",
            narrator_emotion=c.cartesia_emotion if c.language == "en" else None,
        )
        return cast.chunk_segments(segments, self.config.cartesia_max_chars, self.config.language)

    def synthesize(self, text: str):
        chunks = self.build_chunks(text)
        pcm = bytearray()
        words = []
        pause = b"\x00" * (int(self.config.break_duration / 1000 * BYTES_PER_SECOND) // 2 * 2)
        prev_paragraph = None
        voices_seen = []
        for chunk in chunks:
            if prev_paragraph is not None and chunk.paragraph != prev_paragraph:
                pcm += pause
            prev_paragraph = chunk.paragraph
            if chunk.voice_id not in voices_seen:
                voices_seen.append(chunk.voice_id)
                logger.info(f"Using voice {chunk.voice_id} for {chunk.speaker}")
            chunk_pcm, chunk_words = self._stream_chunk_with_retry(chunk)
            offset = len(pcm) / BYTES_PER_SECOND
            for w, s, e in chunk_words:
                if w.strip() == LAUGHTER_TAG:
                    continue
                words.append({"w": w, "s": round(offset + s, 3), "e": round(offset + e, 3), "speaker": chunk.speaker})
            pcm += chunk_pcm
        return bytes(pcm), words

    def text_to_speech(self, text: str, output_file: str, audio_tags):
        pcm, words = self.synthesize(text)
        audio = AudioSegment(data=pcm, sample_width=2, frame_rate=SAMPLE_RATE, channels=1)
        fmt = self.config.output_format
        export_args = {"bitrate": "64k"} if fmt == "mp3" else {}
        part = output_file + ".part"
        try:
            _export(audio, part, fmt, export_args)
            if fmt == "mp3":
                set_audio_tags(part, audio_tags)
            else:
                logger.debug("ID3 tags are only written for mp3 output.")
            os.replace(part, output_file)
        except BaseException:
            try:
                os.remove(part)
            except FileNotFoundError:
                pass
            raise
        if self.config.write_timings:
            timings = readalong.build_timings(
                audio_tags.idx, audio_tags.title, self.config.model_name, SAMPLE_RATE, len(audio) / 1000, words
            )
            readalong.write_sidecars(output_file, timings)
        return words

class _TrackedSubprocess:
    def __init__(self):
        self.procs: List[subprocess.Popen] = []

    def __getattr__(self, name):
        return getattr(subprocess, name)

    def Popen(self, *args, **kwargs):
        proc = subprocess.Popen(*args, **kwargs)
        self.procs.append(proc)
        return proc

def _export(audio: AudioSegment, path: str, fmt: str, export_args: dict) -> None:
    tracker = _TrackedSubprocess()
    saved_tempdir, saved_subprocess = tempfile.tempdir, pydub.audio_segment.subprocess
    with tempfile.TemporaryDirectory(prefix="audiobook-export-") as tmp:
        tempfile.tempdir = tmp
        pydub.audio_segment.subprocess = tracker
        try:
            audio.export(path, format=fmt, **export_args)
        finally:
            pydub.audio_segment.subprocess = saved_subprocess
            tempfile.tempdir = saved_tempdir
            for proc in tracker.procs:
                if proc.poll() is None:
                    proc.kill()
                    proc.wait()

def get_supported_tts_providers() -> List[str]:
    return [TTS_CARTESIA]

def get_tts_provider(config) -> CartesiaTTSProvider:
    if config.tts != TTS_CARTESIA:
        raise ValueError(f"Invalid TTS provider: {config.tts}")
    return CartesiaTTSProvider(config)
