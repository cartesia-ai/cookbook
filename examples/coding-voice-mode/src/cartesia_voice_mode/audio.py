from __future__ import annotations

import asyncio
import wave
from pathlib import Path
from typing import AsyncIterator

CHUNK_MS = 100

class AudioError(Exception):
    pass

def _device(value: str | None):
    if value is None:
        return None
    return int(value) if value.isdigit() else value

def _sd():
    try:
        import sounddevice as sd
    except OSError as exc:
        raise AudioError("PortAudio is not installed. On Linux run: sudo apt install libportaudio2") from exc
    return sd

class Mic:

    def __init__(self, sample_rate: int, device: str | None = None):
        self.sample_rate = sample_rate
        self.device = _device(device)
        self._queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=200)
        self._stream = None

    async def start(self) -> None:
        sd = _sd()
        loop = asyncio.get_running_loop()
        size = self.sample_rate * CHUNK_MS // 1000

        def callback(indata, frames, time_info, status):
            data = bytes(indata)
            loop.call_soon_threadsafe(self._put, data)

        try:
            self._stream = sd.RawInputStream(
                samplerate=self.sample_rate, channels=1, dtype="int16",
                blocksize=size, device=self.device, callback=callback,
            )
            self._stream.start()
        except sd.PortAudioError as exc:
            raise AudioError(
                "could not open the microphone. Grant microphone access to your terminal "
                "in System Settings, or set CARTESIA_INPUT_DEVICE"
            ) from exc

    def _put(self, data: bytes) -> None:
        if self._queue.full():
            self._queue.get_nowait()
        self._queue.put_nowait(data)

    async def chunks(self) -> AsyncIterator[bytes]:
        while True:
            yield await self._queue.get()

    async def stop(self) -> None:
        if self._stream is not None:
            self._stream.stop()
            self._stream.close()
            self._stream = None

class WavMic:

    def __init__(self, path: str | Path, sample_rate: int = 16000, tail_s: float = 4.0, realtime: bool = True):
        self.path, self.sample_rate, self.tail_s, self.realtime = Path(path), sample_rate, tail_s, realtime

    async def start(self) -> None:
        with wave.open(str(self.path), "rb") as w:
            if (w.getframerate(), w.getnchannels(), w.getsampwidth()) != (self.sample_rate, 1, 2):
                raise AudioError(f"{self.path} must be {self.sample_rate} Hz mono 16-bit WAV")
            self._data = w.readframes(w.getnframes())

    async def chunks(self) -> AsyncIterator[bytes]:
        step = self.sample_rate * CHUNK_MS // 1000 * 2
        data = self._data + b"\x00" * int(self.tail_s * self.sample_rate * 2)
        for i in range(0, len(data), step):
            yield data[i : i + step].ljust(step, b"\x00")
            if self.realtime:
                await asyncio.sleep(CHUNK_MS / 1000)

    async def stop(self) -> None:
        return None

class Speaker:

    def __init__(self, sample_rate: int, device: str | None = None):
        self.sample_rate = sample_rate
        self.device = _device(device)
        self._stream = None

    def _open(self):
        sd = _sd()
        try:
            self._stream = sd.RawOutputStream(samplerate=self.sample_rate, channels=1, dtype="int16", device=self.device)
            self._stream.start()
        except sd.PortAudioError as exc:
            raise AudioError("could not open the speaker, set CARTESIA_OUTPUT_DEVICE") from exc

    async def write(self, pcm: bytes) -> None:
        if self._stream is None:
            self._open()
        await asyncio.to_thread(self._stream.write, pcm)

    async def drain(self) -> None:
        stream, self._stream = self._stream, None
        if stream is not None:
            await asyncio.to_thread(stream.stop)
            stream.close()

    def stop(self) -> None:
        stream, self._stream = self._stream, None
        if stream is not None:
            stream.abort()
            stream.close()
