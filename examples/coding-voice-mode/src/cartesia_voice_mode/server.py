"""MCP server: `converse` speaks with Sonic 3.6 and listens with Ink 2."""

from __future__ import annotations

import asyncio
import os
import sys
from typing import Callable

os.environ.setdefault("FASTMCP_CHECK_FOR_UPDATES", "off")

from fastmcp import FastMCP  # noqa: E402

from .audio import AudioError, Mic, Speaker  # noqa: E402
from .client import MISSING_KEY, make_client  # noqa: E402
from .config import ConfigError, Settings, load_settings  # noqa: E402
from .stt import ListenError, listen_for_turn  # noqa: E402
from .tts import TtsError, speak  # noqa: E402

INSTRUCTIONS = (
    "Voice conversation with the user. Call converse to speak and hear the reply. "
    "Read skill text or the tool description for how to use it."
)

def _truthy(v: bool | str) -> bool:
    return v if isinstance(v, bool) else str(v).strip().lower() in ("true", "1", "yes", "on")

def describe(exc: BaseException) -> str:
    """One line for the agent. Status and message only, never headers or keys."""
    status = getattr(exc, "status_code", None)
    if status is not None:
        body = getattr(exc, "message", None) or str(exc)
        return f"Cartesia API error {status}: {body}"
    return str(exc) or type(exc).__name__

def build_server(
    settings: Settings | None = None,
    *,
    client_factory: Callable = make_client,
    speaker_factory: Callable | None = None,
    mic_factory: Callable | None = None,
) -> FastMCP:
    mcp = FastMCP("cartesia-voice", instructions=INSTRUCTIONS)
    lock = asyncio.Lock()

    def current() -> Settings:
        return settings or load_settings()

    @mcp.tool
    async def converse(
        message: str | None = None,
        wait_for_response: bool | str = True,
        voice: str | None = None,
        speed: float | None = None,
        listen_duration_max: float | None = None,
    ) -> str:
        """Say `message` out loud, then listen for an answer unless told not to.

        Call with just `message` to ask something. Set wait_for_response=false to
        narrate without listening; a speak-only call leaves nobody listening.
        Keep messages short and ask one thing at a time. Leave voice, speed and
        listen_duration_max unset unless the user asks. Turn detection ends the
        user's turn, there is no push to talk.

        The tool returns what the user said. Handle it the way you would a typed
        message. "[no speech heard]" means nobody answered; stop
        asking and wait for typed input.
        """
        try:
            s = current()
        except ConfigError as exc:
            return f"[error: {exc}]"
        if not s.api_key:
            return f"[error: {MISSING_KEY}]"
        if message and len(message) > s.max_message_chars:
            return (
                f"[error: message is {len(message)} characters, the limit is {s.max_message_chars}. "
                "Summarize instead of reading text aloud]"
            )
        listen = _truthy(wait_for_response)
        if not message and not listen:
            return "[error: nothing to do, give a message or wait_for_response=true]"

        async with lock:
            speaker = speaker_factory(s) if speaker_factory else Speaker(s.sample_rate_out, s.output_device)
            mic = mic_factory(s) if mic_factory else Mic(s.sample_rate_in, s.input_device)
            client = client_factory(s)
            play: asyncio.Task | None = None
            try:
                if message:

                    async def play_and_drain():
                        await speak(client, s, message, speaker, voice=voice, speed=speed)
                        await speaker.drain()

                    play = asyncio.create_task(play_and_drain())
                if not listen:
                    await play
                    return "[spoken]"
                result = await listen_for_turn(client, s, mic, after=play, max_listen_s=listen_duration_max)
                if result.ended_by == "turn_end":
                    return result.text
                if result.ended_by == "no_speech":
                    return "[no speech heard]"
                if result.text:
                    why = "listening limit reached" if result.ended_by == "max_listen" else "connection ended early"
                    return f"[partial, {why}] {result.text}"
                return "[no speech heard]" if result.ended_by == "max_listen" else "[error: listening ended early]"
            except asyncio.CancelledError:
                if play is not None:
                    play.cancel()
                speaker.stop()
                raise
            except (TtsError, ListenError, AudioError) as exc:
                return f"[error: {describe(exc)}]"
            except Exception as exc:
                return f"[error: {describe(exc)}]"
            finally:
                if play is not None and not play.done():
                    play.cancel()
                close = getattr(client, "close", None)
                if close is not None:
                    try:
                        await close()
                    except Exception:
                        pass

    @mcp.tool
    async def list_voices(language: str | None = None, limit: int = 20) -> str:
        """List Cartesia voices as `id | name | language` lines."""
        try:
            s = current()
        except ConfigError as exc:
            return f"[error: {exc}]"
        if not s.api_key:
            return f"[error: {MISSING_KEY}]"
        client = client_factory(s)
        try:
            rows = []
            async for v in client.voices.list(limit=min(limit, 100)):
                if language and getattr(v, "language", None) != language:
                    continue
                rows.append(f"{v.id} | {v.name} | {getattr(v, 'language', '')}")
                if len(rows) >= limit:
                    break
            return "\n".join(rows) or "[no voices found]"
        except Exception as exc:
            return f"[error: {describe(exc)}]"
        finally:
            close = getattr(client, "close", None)
            if close is not None:
                try:
                    await close()
                except Exception:
                    pass

    return mcp

def main() -> None:
    print("cartesia-voice-mode: serving on stdio", file=sys.stderr)
    build_server().run(transport="stdio", show_banner=False)
