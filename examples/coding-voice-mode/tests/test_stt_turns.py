import asyncio
import time

import pytest

from cartesia_voice_mode.audio import AudioError
from cartesia_voice_mode.stt import ListenError, listen_for_turn
from conftest import FakeCartesia, FakeConn, FakeMic, closed_error, ev

FULL = [
    ev("connected"),
    ev("turn.start"),
    ev("turn.update", transcript="open the"),
    ev("turn.update", transcript="open the file"),
    ev("turn.eager_end", transcript="open the file"),
    ev("turn.resume"),
    ev("turn.update", transcript="open the file main dot py"),
    ev("turn.end", transcript="open the file main.py"),
]

async def test_full_turn_returns_definitive_text(settings):
    conn = FakeConn(FULL)
    c = FakeCartesia(conns=[conn])
    mic = FakeMic()
    res = await listen_for_turn(c, settings, mic)
    assert res.text == "open the file main.py" and res.ended_by == "turn_end"
    assert conn.raw and all(len(b) == 3200 for b in conn.raw)
    assert {"type": "close"} in conn.sent and conn.closed and mic.stopped
    kw = c.ws_calls[0]
    assert (kw["encoding"], kw["model"], kw["sample_rate"]) == ("pcm_s16le", "ink-2", 16000)

async def test_turn_params_only_when_configured(settings):
    import dataclasses

    from cartesia import Omit

    c = FakeCartesia(conns=[FakeConn(FULL)])
    await listen_for_turn(c, settings, FakeMic())
    assert isinstance(c.ws_calls[0]["turn_end_timeout_ms"], Omit)
    s2 = dataclasses.replace(settings, turn_end_timeout_ms=1500, keyterms=("pytest",))
    c = FakeCartesia(conns=[FakeConn(FULL)])
    await listen_for_turn(c, s2, FakeMic())
    assert c.ws_calls[0]["turn_end_timeout_ms"] == 1500 and c.ws_calls[0]["keyterm"] == ["pytest"]

async def test_no_speech(settings):
    c = FakeCartesia(conns=[FakeConn([ev("connected")])])
    res = await listen_for_turn(c, settings, FakeMic())
    assert res.ended_by == "no_speech" and res.text == ""

async def test_error_event(settings):
    err = ev("error", status_code=429, title="Too many", message="slow down")
    c = FakeCartesia(conns=[FakeConn([err])])
    with pytest.raises(ListenError, match="429"):
        await listen_for_turn(c, settings, FakeMic())

async def test_close_mid_turn_returns_partial_before_deadline(settings):
    script = [ev("turn.start"), ev("turn.update", transcript="half a thought"), closed_error()]
    c = FakeCartesia(conns=[FakeConn(script)])
    t = time.monotonic()
    res = await listen_for_turn(c, settings, FakeMic())
    assert time.monotonic() - t < 1.5
    assert res.ended_by == "error" and res.partial and res.text == "half a thought"

async def test_close_before_speech_retries_once(settings):
    c = FakeCartesia(conns=[FakeConn([closed_error()]), FakeConn(FULL)])
    res = await listen_for_turn(c, settings, FakeMic())
    assert res.text == "open the file main.py" and len(c.ws_calls) == 2

async def test_connect_failure_retries_once(settings):
    c = FakeCartesia(conns=[OSError("boom"), FakeConn(FULL)])
    assert (await listen_for_turn(c, settings, FakeMic())).ended_by == "turn_end"
    c = FakeCartesia(conns=[OSError("boom"), OSError("boom")])
    with pytest.raises(ListenError, match="could not connect"):
        await listen_for_turn(c, settings, FakeMic())

async def test_mic_error_is_friendly(settings):
    c = FakeCartesia(conns=[FakeConn(FULL)])
    mic = FakeMic(fail=AudioError("could not open the microphone. Grant microphone access"))
    with pytest.raises(ListenError, match="microphone"):
        await listen_for_turn(c, settings, mic)

async def test_empty_turn_end_keeps_listening(settings):
    script = [ev("turn.start"), ev("turn.end", transcript="  ")] + FULL
    res = await listen_for_turn(FakeCartesia(conns=[FakeConn(script)]), settings, FakeMic())
    assert res.text == "open the file main.py"

async def test_mic_starts_after_playback(settings):
    log = []
    mic = FakeMic(log)

    async def playback():
        await asyncio.sleep(0.05)
        log.append("playback_done")

    after = asyncio.create_task(playback())
    await listen_for_turn(FakeCartesia(conns=[FakeConn(FULL)]), settings, mic, after=after)
    assert log.index("playback_done") < log.index("mic_start")

async def test_tool_listen_limit_cannot_exceed_the_env_cap(settings):
    import dataclasses

    s = dataclasses.replace(settings, no_speech_timeout_s=10.0, max_listen_s=0.3)
    script = [ev("turn.start"), ev("turn.update", transcript="still talking")]
    t = time.monotonic()
    res = await listen_for_turn(FakeCartesia(conns=[FakeConn(script)]), s, FakeMic(), max_listen_s=60)
    assert time.monotonic() - t < 1.5
    assert res.ended_by == "max_listen" and res.text == "still talking"
