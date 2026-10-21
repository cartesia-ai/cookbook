from types import SimpleNamespace

SAMPLE_RATE = 44100

def silence(seconds):
    return b"\x00" * (int(seconds * SAMPLE_RATE) * 2)

class FakeStream:
    def __init__(self, events):
        self._events = events
        self.closed = False

    def __iter__(self):
        return self._events

    def close(self):
        self.closed = True
        self._events.close()

class FakeTTS:
    def __init__(self, seconds_per_call=1.0, failures=None, error_event=None):
        self.calls = []
        self.seconds_per_call = seconds_per_call
        self.failures = list(failures or [])
        self.error_event = error_event
        self.streams = []

    def generate_sse(self, **kwargs):
        self.calls.append(kwargs)
        if self.failures:
            raise self.failures.pop(0)
        stream = FakeStream(self._events(kwargs["transcript"]))
        self.streams.append(stream)
        return stream

    def _events(self, transcript):
        if self.error_event:
            yield self.error_event
            return
        words = transcript.split()
        step = self.seconds_per_call / max(len(words), 1)
        yield SimpleNamespace(type="chunk", audio=silence(self.seconds_per_call))
        yield SimpleNamespace(
            type="timestamps",
            word_timestamps=SimpleNamespace(
                words=words,
                start=[round(i * step, 4) for i in range(len(words))],
                end=[round((i + 1) * step, 4) for i in range(len(words))],
            ),
        )
        yield SimpleNamespace(type="done")
        yield SimpleNamespace(type="chunk", audio=b"")

class FakeCartesia:
    instances = []

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.tts = FakeTTS()
        FakeCartesia.instances.append(self)
