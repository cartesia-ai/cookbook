from __future__ import annotations

import asyncio
import base64
from types import SimpleNamespace as NS

import pytest
from websockets.exceptions import ConnectionClosedError

from cartesia_voice_mode.config import Settings

TEST_KEY = "test-key-not-real-0000"

@pytest.fixture(autouse=True)
def clean_env(monkeypatch, tmp_path):
    import os

    for name in list(os.environ):
        if name.startswith(("CARTESIA_", "FASTMCP_")):
            monkeypatch.delenv(name)
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("XDG_CONFIG_HOME", str(home / ".config"))
    monkeypatch.setenv("CARTESIA_API_KEY", TEST_KEY)
    return home

@pytest.fixture
def settings():
    return Settings(api_key=TEST_KEY, no_speech_timeout_s=0.3, max_listen_s=2.0)

class FakeSpeaker:
    def __init__(self, log=None):
        self.log = log if log is not None else []
        self.audio = []

    async def write(self, pcm):
        self.audio.append(pcm)
        self.log.append("write")

    async def drain(self):
        await asyncio.sleep(0)
        self.log.append("drain")

    def stop(self):
        self.log.append("stop")

class FakeMic:
    def __init__(self, log=None, fail=None):
        self.log = log if log is not None else []
        self.fail = fail
        self.stopped = False

    async def start(self):
        if self.fail:
            raise self.fail
        self.log.append("mic_start")

    async def chunks(self):
        while True:
            await asyncio.sleep(0.005)
            yield b"\x01\x00" * 1600

    async def stop(self):
        self.stopped = True
        self.log.append("mic_stop")

def chunk_event(pcm: bytes):
    return NS(type="chunk", data=base64.b64encode(pcm).decode())

class FakeStream:
    def __init__(self, events):
        self.events, self.closed = events, False

    def __aiter__(self):
        return self._it()

    async def _it(self):
        for e in self.events:
            await asyncio.sleep(0)
            yield e

    async def close(self):
        self.closed = True

class FakeConn:

    def __init__(self, script):
        self.script, self.raw, self.sent, self.closed = list(script), [], [], False

    async def recv(self):
        await asyncio.sleep(0.01)
        if not self.script:
            await asyncio.Event().wait()
        item = self.script.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    async def send_raw(self, data):
        self.raw.append(data)

    async def send(self, msg):
        self.sent.append(msg)

    async def close(self):
        self.closed = True

class FakeManager:
    def __init__(self, outcome):
        self.outcome = outcome

    async def __aenter__(self):
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome

class FakeCartesia:

    def __init__(self, sse_events=None, conns=None):
        self.sse_events = sse_events or []
        self.conns = list(conns or [])
        self.sse_calls, self.ws_calls, self.streams = [], [], []
        outer = self

        class TTS:
            async def generate_sse(self, **kw):
                outer.sse_calls.append(kw)
                st = FakeStream(outer.sse_events)
                outer.streams.append(st)
                return st

        class AutoFinalize:
            def websocket(self, **kw):
                outer.ws_calls.append(kw)
                return FakeManager(outer.conns.pop(0))

        self.tts = TTS()
        self.stt = NS(auto_finalize=AutoFinalize())

    async def close(self):
        pass

def ev(type_, **kw):
    return NS(type=type_, **kw)

def closed_error():
    return ConnectionClosedError(None, None)
