from __future__ import annotations

import asyncio
import sys
from dataclasses import dataclass
from typing import Awaitable

from cartesia import omit
from websockets.exceptions import ConnectionClosed

from .audio import AudioError
from .config import Settings

CONNECT_TIMEOUT_S = 10.0

class ListenError(Exception):
    pass

@dataclass
class TurnResult:
    text: str
    started: bool
    ended_by: str
    ttf_turn_ms: float | None = None
    partial: bool = False

def open_turns(client, s: Settings):
    return client.stt.auto_finalize.websocket(
        encoding="pcm_s16le",
        model=s.stt_model,
        sample_rate=s.sample_rate_in,
        keyterm=list(s.keyterms) or omit,
        turn_start_threshold=s.turn_start_threshold if s.turn_start_threshold is not None else omit,
        turn_eager_end_threshold=s.turn_eager_end_threshold if s.turn_eager_end_threshold is not None else omit,
        turn_end_threshold=s.turn_end_threshold if s.turn_end_threshold is not None else omit,
        turn_end_timeout_ms=s.turn_end_timeout_ms if s.turn_end_timeout_ms is not None else omit,
    )

async def _connect(client, s: Settings):
    last: Exception | None = None
    for _ in range(2):
        try:
            return await asyncio.wait_for(open_turns(client, s).__aenter__(), CONNECT_TIMEOUT_S)
        except Exception as exc:
            last = exc
    status = getattr(getattr(last, "response", None), "status_code", None)
    detail = f"HTTP {status}" if status else type(last).__name__
    hint = ", check CARTESIA_API_KEY" if status in (401, 403) else ""
    raise ListenError(f"could not connect to Cartesia speech-to-text ({detail}{hint})") from None

async def _pump(conn, mic) -> None:
    async for chunk in mic.chunks():
        await conn.send_raw(chunk)

async def _close(conn) -> None:
    try:
        async with asyncio.timeout(2):
            await conn.send({"type": "close"})
            await conn.close()
    except Exception:
        pass

async def _one_attempt(conn, mic, s: Settings, t0: float, deadline_start: float, deadline_hard: float):
    loop = asyncio.get_running_loop()
    pump = asyncio.create_task(_pump(conn, mic))
    started = False
    partial = ""
    turn_started_at: float | None = None
    recv: asyncio.Task | None = None
    try:
        while True:
            limit = deadline_hard if started else min(deadline_start, deadline_hard)
            remaining = limit - loop.time()
            if remaining <= 0:
                return TurnResult(partial, started, "max_listen" if started else "no_speech", partial=bool(partial))
            if recv is None:
                recv = asyncio.create_task(conn.recv())
            waiting = {recv} | ({pump} if not pump.done() else set())
            await asyncio.wait(waiting, timeout=remaining, return_when=asyncio.FIRST_COMPLETED)
            if pump.done() and not pump.cancelled() and pump.exception() is not None:
                exc = pump.exception()
                if isinstance(exc, ConnectionClosed):
                    if not started:
                        return None
                    return TurnResult(partial, True, "error", partial=True)
                raise exc
            if not recv.done():
                continue
            task, recv = recv, None
            try:
                ev = task.result()
            except ConnectionClosed:
                if not started:
                    return None
                return TurnResult(partial, True, "error", partial=True)
            kind = ev.type
            if kind == "turn.start":
                started = True
                turn_started_at = turn_started_at or loop.time()
            elif kind == "turn.update":
                partial = ev.transcript
            elif kind == "turn.end":
                if ev.transcript.strip():
                    return TurnResult(ev.transcript.strip(), True, "turn_end", (loop.time() - t0) * 1000)
                started, partial = False, ""
            elif kind == "error":
                raise ListenError(f"speech-to-text error {ev.status_code}: {ev.title}. {ev.message}")
    finally:
        if recv is not None:
            recv.cancel()
        pump.cancel()
        await asyncio.gather(pump, return_exceptions=True)

async def listen_for_turn(
    client,
    s: Settings,
    mic,
    *,
    after: Awaitable | None = None,
    max_listen_s: float | None = None,
) -> TurnResult:
    loop = asyncio.get_running_loop()
    conn = await _connect(client, s)
    try:
        if after is not None:
            await after
            await asyncio.sleep(0.2)
        try:
            await mic.start()
        except AudioError as exc:
            raise ListenError(str(exc)) from None
        t0 = loop.time()
        hard = t0 + (max_listen_s or s.max_listen_s)
        start_by = t0 + s.no_speech_timeout_s
        try:
            for attempt in range(2):
                res = await _one_attempt(conn, mic, s, t0, start_by, hard)
                if res is not None:
                    print(f"stt ended_by={res.ended_by} ttf_turn_ms={res.ttf_turn_ms}", file=sys.stderr)
                    return res
                if attempt == 0:
                    await _close(conn)
                    conn = await _connect(client, s)
            raise ListenError("the speech-to-text connection kept closing")
        finally:
            await mic.stop()
    finally:
        await _close(conn)
