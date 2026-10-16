"""The real SDK against local fake servers. Catches SDK drift: headers, body and query string."""

import asyncio
import base64
import json
from urllib.parse import parse_qs, urlsplit

from websockets.asyncio.server import serve

from cartesia_voice_mode.audio import WavMic
from cartesia_voice_mode.client import make_client
from cartesia_voice_mode.config import Settings
from cartesia_voice_mode.stt import listen_for_turn
from cartesia_voice_mode.tts import speak
from conftest import TEST_KEY, FakeSpeaker

async def start_http(seen: list, pcm: bytes):
    async def handle(reader, writer):
        head = await reader.readuntil(b"\r\n\r\n")
        lines = head.decode().split("\r\n")
        headers = {k.lower(): v for k, v in (h.split(": ", 1) for h in lines[1:] if ": " in h)}
        body = await reader.readexactly(int(headers.get("content-length", 0)))
        seen.append({"request": lines[0], "headers": headers, "body": json.loads(body)})
        events = [
            {"type": "chunk", "data": base64.b64encode(pcm).decode(), "done": False, "status_code": 206, "step_time": 1.0},
            {"type": "done", "done": True, "status_code": 200},
        ]
        payload = "".join(f"data: {json.dumps(e)}\n\n" for e in events).encode()
        writer.write(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n"
                     + f"Content-Length: {len(payload)}\r\n\r\n".encode() + payload)
        await writer.drain()
        writer.close()

    server = await asyncio.start_server(handle, "127.0.0.1", 0)
    return server, server.sockets[0].getsockname()[1]

async def test_tts_wire():
    seen: list = []
    server, port = await start_http(seen, b"\x00\x01\x02\x03")
    s = Settings(api_key=TEST_KEY, base_url=f"http://127.0.0.1:{port}")
    sp = FakeSpeaker()
    client = make_client(s)
    try:
        await speak(client, s, "Hello from the wire test.", sp, speed=1.1)
    finally:
        await client.close()
        server.close()
    req = seen[0]
    assert req["request"].startswith("POST /tts/sse")
    assert req["headers"]["cartesia-version"] == "2026-08-14"
    assert req["headers"]["authorization"] == f"Bearer {TEST_KEY}"
    body = req["body"]
    assert body["model_id"] == "sonic-3.6" and isinstance(body["voice"], str)
    assert body["output_format"] == {"container": "raw", "encoding": "pcm_s16le", "sample_rate": 24000}
    assert body["generation_config"] == {"speed": 1.1}
    assert sp.audio == [b"\x00\x01\x02\x03"]

async def test_stt_wire(tmp_path):
    import wave

    seen: dict = {}

    async def handler(ws):
        seen["path"] = ws.request.path
        seen["headers"] = {k.lower(): v for k, v in ws.request.headers.items()}
        await ws.send(json.dumps({"type": "connected", "request_id": "r"}))
        got = await ws.recv()
        seen["first_frame"] = len(got)
        await ws.send(json.dumps({"type": "turn.start", "request_id": "r"}))
        await ws.send(json.dumps({"type": "turn.update", "request_id": "r", "transcript": "run the"}))
        await ws.send(json.dumps({"type": "turn.end", "request_id": "r", "transcript": "run the tests"}))
        try:
            async for msg in ws:
                if isinstance(msg, str):
                    seen["control"] = json.loads(msg)
        except Exception:
            pass

    wav = tmp_path / "in.wav"
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1), w.setsampwidth(2), w.setframerate(16000)
        w.writeframes(b"\x00\x00" * 16000)
    async with serve(handler, "127.0.0.1", 0) as server:
        port = server.sockets[0].getsockname()[1]
        s = Settings(api_key=TEST_KEY, ws_base_url=f"ws://127.0.0.1:{port}", keyterms=("pytest",), turn_end_timeout_ms=1500)
        client = make_client(s)
        try:
            res = await listen_for_turn(client, s, WavMic(wav, 16000, tail_s=0.2, realtime=False), max_listen_s=5)
        finally:
            await client.close()
    assert res.text == "run the tests" and res.ended_by == "turn_end"
    url = urlsplit(seen["path"])
    assert url.path.endswith("/stt/turns/websocket")
    q = parse_qs(url.query)
    assert q["model"] == ["ink-2"] and q["encoding"] == ["pcm_s16le"] and q["sample_rate"] == ["16000"]
    assert q["keyterm"] == ["pytest"] and q["turn_end_timeout_ms"] == ["1500"]
    assert "turn_start_threshold" not in q and "turn_end_threshold" not in q
    assert seen["headers"]["cartesia-version"] == "2026-08-14"
    assert seen["headers"]["authorization"] == f"Bearer {TEST_KEY}"
    assert seen["first_frame"] == 3200
