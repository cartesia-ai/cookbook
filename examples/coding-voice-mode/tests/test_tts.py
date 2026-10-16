import asyncio

import pytest

from cartesia_voice_mode.tts import TtsError, speak, split_text
from conftest import FakeCartesia, FakeSpeaker, chunk_event, ev

async def test_request_shape_and_playback(settings):
    c = FakeCartesia(sse_events=[
        chunk_event(b"aa"), ev("timestamps"), ev("phoneme_timestamps"), chunk_event(b"bb"), ev("done"),
    ])
    sp = FakeSpeaker()
    stats = await speak(c, settings, "Hello there.", sp, speed=1.2)
    kw = c.sse_calls[0]
    assert kw["model_id"] == "sonic-3.6"
    assert isinstance(kw["voice"], str)
    assert kw["output_format"] == {"container": "raw", "encoding": "pcm_s16le", "sample_rate": 24000}
    assert kw["generation_config"] == {"speed": 1.2}
    assert sp.audio == [b"aa", b"bb"]
    assert stats.ttfa_ms is not None
    assert c.streams[0].closed

async def test_voice_override_and_no_speed(settings):
    c = FakeCartesia(sse_events=[ev("done")])
    await speak(c, settings, "Hi.", FakeSpeaker(), voice="v-1")
    assert c.sse_calls[0]["voice"] == "v-1"
    assert "generation_config" in c.sse_calls[0] and not isinstance(c.sse_calls[0]["generation_config"], dict)

async def test_error_event_raises(settings):
    c = FakeCartesia(sse_events=[ev("error", title="Bad", message="nope")])
    sp = FakeSpeaker()
    with pytest.raises(TtsError, match="Bad: nope"):
        await speak(c, settings, "Hi.", sp)
    assert "stop" in sp.log and c.streams[0].closed

async def test_cancel_stops_speaker_and_closes_stream(settings):
    class Slow(FakeCartesia):
        pass

    c = FakeCartesia(sse_events=[chunk_event(b"a")] * 50)
    sp = FakeSpeaker()

    async def slow_write(pcm):
        await asyncio.sleep(0.05)

    sp.write = slow_write
    task = asyncio.create_task(speak(c, settings, "Hi.", sp))
    await asyncio.sleep(0.1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert "stop" in sp.log and c.streams[0].closed

def test_split_sentences():
    parts = split_text("One. Two! Three? " + "word " * 200, limit=100)
    assert all(len(p) <= 100 for p in parts)
    assert parts[0].startswith("One. Two!")
    assert len(parts) > 3

async def test_long_text_makes_several_requests(settings):
    c = FakeCartesia(sse_events=[ev("done")])
    await speak(c, settings, ("Sentence number one is here. " * 40), FakeSpeaker())
    assert len(c.sse_calls) >= 3
