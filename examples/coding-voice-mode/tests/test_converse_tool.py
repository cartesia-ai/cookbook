import asyncio

from fastmcp import Client

from cartesia_voice_mode.server import build_server
from conftest import FakeCartesia, FakeConn, FakeMic, FakeSpeaker, chunk_event, ev

TURN = [ev("turn.start"), ev("turn.end", transcript="yes do it")]

def make(settings, conns=None, log=None):
    log = log if log is not None else []
    fake = FakeCartesia(sse_events=[chunk_event(b"xx"), ev("done")], conns=conns or [FakeConn(TURN)])
    mcp = build_server(
        settings,
        client_factory=lambda s: fake,
        speaker_factory=lambda s: FakeSpeaker(log),
        mic_factory=lambda s: FakeMic(log),
    )
    return mcp, fake, log

async def call(mcp, **args):
    async with Client(mcp) as c:
        r = await c.call_tool("converse", args)
        return r.content[0].text

async def test_speak_and_listen(settings):
    mcp, fake, log = make(settings)
    assert await call(mcp, message="Shall I continue?") == "yes do it"
    assert log.index("drain") < log.index("mic_start")

async def test_speak_only_with_string_false(settings):
    mcp, fake, log = make(settings)
    assert await call(mcp, message="Done.", wait_for_response="false") == "[spoken]"
    assert fake.ws_calls == [] and "mic_start" not in log

async def test_listen_only(settings):
    mcp, fake, log = make(settings)
    assert await call(mcp) == "yes do it"
    assert fake.sse_calls == []

async def test_overrides_reach_tts(settings):
    mcp, fake, _ = make(settings)
    await call(mcp, message="Hi.", voice="v-9", speed=1.3, wait_for_response=False)
    kw = fake.sse_calls[0]
    assert kw["voice"] == "v-9" and kw["generation_config"] == {"speed": 1.3}

async def test_no_speech_text(settings):
    mcp, _, _ = make(settings, conns=[FakeConn([ev("connected")])])
    assert await call(mcp, message="Hello?") == "[no speech heard]"

async def test_missing_key_returns_error_string():
    from cartesia_voice_mode.config import Settings

    mcp, _, _ = make(Settings(api_key=None))
    out = await call(mcp, message="Hi")
    assert out.startswith("[error: CARTESIA_API_KEY is not set")

async def test_long_message_refused(settings):
    mcp, fake, _ = make(settings)
    out = await call(mcp, message="x" * 5000)
    assert out.startswith("[error: message is 5000 characters") and fake.sse_calls == []

async def test_calls_are_serialized(settings):
    mcp, fake, log = make(settings, conns=[FakeConn(TURN), FakeConn(TURN)])
    async with Client(mcp) as c:
        await asyncio.gather(
            c.call_tool("converse", {"message": "one"}),
            c.call_tool("converse", {"message": "two"}),
        )
    assert log == ["write", "drain", "mic_start", "mic_stop"] * 2
