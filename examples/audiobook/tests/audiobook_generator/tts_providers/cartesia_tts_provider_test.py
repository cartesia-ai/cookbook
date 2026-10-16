import json
import logging
import os
import tempfile
import unittest
from unittest.mock import patch

from pydub import AudioSegment
from mutagen.id3 import ID3

from audiobook_generator.core.audio_tags import AudioTags
from audiobook_generator.tts_providers import cartesia_tts_provider as mod
from audiobook_generator.tts_providers.cartesia_tts_provider import get_tts_provider
from tests.fake_cartesia import FakeCartesia, FakeTTS
from tests.test_utils import get_cartesia_config

FAKE_KEY = "fake-key-do-not-leak-1234"
BRK = mod.cast.PARAGRAPH_BREAK

def make_provider(tts=None, **overrides):
    config = get_cartesia_config(**overrides)
    provider = get_tts_provider(config)
    fake = FakeCartesia()
    if tts is not None:
        fake.tts = tts
    provider._client = fake
    return provider, fake

class TestCartesiaProvider(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = os.path.join(self.tmp.name, "chapter.mp3")
        self.tags = AudioTags("Chapter One", "Lewis Carroll", "Alice", 1)
        sleeper = patch.object(mod.time, "sleep")
        sleeper.start()
        self.addCleanup(sleeper.stop)
        self.addCleanup(self.tmp.cleanup)

    def test_defaults(self):
        provider = get_tts_provider(get_cartesia_config())
        c = provider.config
        self.assertEqual(c.model_name, "sonic-3.6")
        self.assertEqual(c.output_format, "mp3")
        self.assertEqual(c.language, "en")
        self.assertEqual(c.break_duration, 600)
        self.assertEqual(c.cartesia_max_chars, 1500)
        self.assertEqual(provider.get_output_file_extension(), "mp3")

    def test_rejects_retired_models(self):
        for model in ["sonic-2", "sonic-turbo", "sonic-latest", "sonic-english", "sonic-3-2025-10-27"]:  # allow-model-id
            with self.assertRaises(ValueError, msg=model):
                get_tts_provider(get_cartesia_config(model_name=model))

    def test_rejects_bad_values(self):
        for bad in [dict(speed=2.0), dict(output_format="ogg"), dict(cartesia_max_chars=50),
                    dict(cartesia_volume=3.0), dict(break_duration="9000"), dict(language="xx"),
                    dict(voice_name="not a voice")]:
            with self.assertRaises(ValueError, msg=str(bad)):
                get_tts_provider(get_cartesia_config(**bad))

    def test_voice_name_and_raw_id(self):
        p = get_tts_provider(get_cartesia_config(voice_name="maya"))
        self.assertEqual(p.narrator_voice_id, mod.cast.VOICE_POOL["Maya"])
        raw = "11111111-2222-3333-4444-555555555555"
        self.assertEqual(get_tts_provider(get_cartesia_config(voice_name=raw)).narrator_voice_id, raw)

    def test_model_lists_have_no_retired_ids(self):
        for m in mod.get_cartesia_supported_models():
            self.assertFalse(mod._RETIRED_MODELS.match(m), m)

    def test_sdk_derived_lists(self):
        self.assertIn("calm", mod.get_cartesia_supported_emotions())
        self.assertIn("en", mod.get_cartesia_supported_languages())
        self.assertGreater(len(mod.get_cartesia_supported_languages()), 40)

    def test_no_key_preview_path_works_and_synthesis_names_the_variable(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("CARTESIA_API_KEY", None)
            provider = get_tts_provider(get_cartesia_config())
            self.assertEqual(provider.get_break_string(), BRK)
            self.assertEqual(provider.estimate_cost(1000), 0.0)
            with self.assertRaises(RuntimeError) as ctx:
                provider.text_to_speech("Hello there.", self.out, self.tags)
            self.assertIn("CARTESIA_API_KEY", str(ctx.exception))

    def test_key_is_passed_to_the_client_and_never_logged(self):
        with patch.dict(os.environ, {"CARTESIA_API_KEY": FAKE_KEY}), \
                patch.object(mod, "Cartesia", FakeCartesia):
            FakeCartesia.instances.clear()
            provider = get_tts_provider(get_cartesia_config())
            with self.assertLogs(level="DEBUG") as logs:
                logging.getLogger("x").debug("start")
                provider.text_to_speech("Hello there. " + BRK + " More text.", self.out, self.tags)
            self.assertEqual(FakeCartesia.instances[0].kwargs["api_key"], FAKE_KEY)
            everything = [str(provider), str(provider.config), "\n".join(logs.output)]
            for text in everything:
                self.assertNotIn(FAKE_KEY, text)

    def test_request_shape(self):
        provider, fake = make_provider()
        provider.text_to_speech("Hello there. How are you?", self.out, self.tags)
        call = fake.tts.calls[0]
        self.assertEqual(call["model_id"], "sonic-3.6")
        self.assertEqual(call["output_format"], {"container": "raw", "encoding": "pcm_s16le", "sample_rate": 44100})
        self.assertIs(call["add_timestamps"], True)
        self.assertIsInstance(call["voice"], str)
        self.assertEqual(call["language"], "en")
        self.assertNotIn("locale", call)
        self.assertNotIn("generation_config", call)

    def test_generation_config_carries_speed_volume_and_emotion(self):
        provider, fake = make_provider(speed=0.8, cartesia_volume=1.2, cartesia_emotion="calm")
        provider.text_to_speech("Hello there.", self.out, self.tags)
        self.assertEqual(fake.tts.calls[0]["generation_config"], {"emotion": "calm", "speed": 0.8, "volume": 1.2})

    def test_emotion_is_english_only(self):
        provider, fake = make_provider(language="fr-FR", cartesia_emotion="calm")
        provider.text_to_speech("Bonjour.", self.out, self.tags)
        self.assertNotIn("generation_config", fake.tts.calls[0])
        self.assertEqual(fake.tts.calls[0]["language"], "fr")

    def test_long_chapter_is_chunked(self):
        sentence = "The rabbit ran across the field and into the wood. "
        text = sentence * 100
        provider, fake = make_provider(cartesia_max_chars=1500)
        provider.text_to_speech(text, self.out, self.tags)
        sent = [c["transcript"] for c in fake.tts.calls]
        self.assertGreaterEqual(len(sent), 4)
        self.assertTrue(all(len(t) <= 1500 for t in sent))
        self.assertEqual(" ".join(sent).split(), text.split())

    def test_timestamps_are_offset_per_chunk_and_paragraph_gap_counted(self):
        provider, fake = make_provider()
        text = f"First paragraph here. {BRK} Second paragraph here."
        words = provider.text_to_speech(text, self.out, self.tags)
        self.assertEqual(len(fake.tts.calls), 2)
        second_start = next(w for w in words if w["w"] == "Second")["s"]
        self.assertGreaterEqual(second_start, 1.6 - 1e-6)
        audio = AudioSegment.from_file(self.out)
        self.assertAlmostEqual(len(audio) / 1000, 2.6, delta=0.15)

    def test_retries_a_dropped_stream(self):
        from cartesia import APIConnectionError
        import httpx
        err = APIConnectionError(request=httpx.Request("POST", "https://example.invalid"))
        provider, fake = make_provider(tts=FakeTTS(failures=[err]))
        provider.text_to_speech("Hello there.", self.out, self.tags)
        self.assertEqual(len(fake.tts.calls), 2)

    def test_gives_up_after_the_retry_limit(self):
        from cartesia import APIConnectionError
        import httpx
        err = APIConnectionError(request=httpx.Request("POST", "https://example.invalid"))
        provider, fake = make_provider(tts=FakeTTS(failures=[err, err, err]))
        with self.assertRaises(APIConnectionError):
            provider.text_to_speech("Hello there.", self.out, self.tags)
        self.assertEqual(len(fake.tts.calls), 3)

    def test_error_event_is_raised_without_retry_for_client_errors(self):
        from types import SimpleNamespace
        ev = SimpleNamespace(type="error", status_code=400, title="Bad request", message="nope")
        provider, fake = make_provider(tts=FakeTTS(error_event=ev))
        with self.assertRaises(mod.CartesiaStreamError):
            provider.text_to_speech("Hello there.", self.out, self.tags)
        self.assertEqual(len(fake.tts.calls), 1)

    def test_mp3_output_has_tags(self):
        provider, _ = make_provider()
        provider.text_to_speech("Hello there.", self.out, self.tags)
        tags = ID3(self.out)
        self.assertEqual(str(tags["TIT2"]), "Chapter One")
        self.assertEqual(str(tags["TALB"]), "Alice")

    def test_wav_output_skips_tags(self):
        provider, _ = make_provider(output_format="wav")
        wav = os.path.join(self.tmp.name, "c.wav")
        provider.text_to_speech("Hello there.", wav, self.tags)
        self.assertAlmostEqual(len(AudioSegment.from_file(wav)) / 1000, 1.0, delta=0.05)

    def test_sidecars_are_written_and_hold_no_secret(self):
        with patch.dict(os.environ, {"CARTESIA_API_KEY": FAKE_KEY}):
            provider, _ = make_provider()
            text = f"First paragraph here. {BRK} Second paragraph here."
            provider.text_to_speech(text, self.out, self.tags)
        base = os.path.splitext(self.out)[0]
        with open(base + ".timings.json", encoding="utf-8") as f:
            raw = f.read()
        data = json.loads(raw)
        with open(base + ".vtt", encoding="utf-8") as f:
            vtt = f.read()
        self.assertNotIn(FAKE_KEY, raw + vtt)
        self.assertEqual(data["model"], "sonic-3.6")
        self.assertEqual(data["chapter"], 1)
        self.assertAlmostEqual(data["duration"], 2.6, delta=0.15)
        last = data["words"][-1]
        self.assertAlmostEqual(last["e"], data["duration"], delta=0.7)
        self.assertTrue(vtt.startswith("WEBVTT"))
        self.assertIn("Second paragraph here.", vtt)

    def test_no_timings_flag(self):
        provider, _ = make_provider(write_timings=False)
        provider.text_to_speech("Hello there.", self.out, self.tags)
        base = os.path.splitext(self.out)[0]
        self.assertFalse(os.path.exists(base + ".timings.json"))
        self.assertFalse(os.path.exists(base + ".vtt"))

    def test_estimate_cost_is_never_negative(self):
        provider, _ = make_provider()
        self.assertGreaterEqual(provider.estimate_cost(0), 0)
        self.assertGreaterEqual(provider.estimate_cost(10**6), 0)

class TestDialogue(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.out = os.path.join(self.tmp.name, "c.mp3")
        self.tags = AudioTags("T", "A", "B", 1)
        sleeper = patch.object(mod.time, "sleep")
        sleeper.start()
        self.addCleanup(sleeper.stop)

    TEXT = ('Alice looked up. “Oh, very good,” Alice laughed. '
            + BRK + ' “Who is there?” asked the Rabbit. '
            + BRK + ' “Go away!” shouted Alice.')

    def test_voices_emotion_and_laughter_reach_the_request(self):
        provider, fake = make_provider(output_folder=self.tmp.name)
        words = provider.text_to_speech(self.TEXT, self.out, self.tags)
        calls = fake.tts.calls
        voices = {c["voice"] for c in calls}
        self.assertEqual(len(voices), 3)
        laugh = [c for c in calls if c["transcript"].startswith("[laughter] ")]
        self.assertEqual(len(laugh), 1)
        emotions = [c.get("generation_config", {}).get("emotion") for c in calls]
        self.assertIn("curious", emotions)
        self.assertIn("angry", emotions)
        for c in calls:
            if c["voice"] == provider.narrator_voice_id:
                self.assertNotIn("generation_config", c)
        self.assertEqual({w["speaker"] for w in words}, {"narrator", "Alice", "Rabbit"})

    def test_laughter_word_is_dropped_from_timestamps(self):
        provider, _ = make_provider(output_folder=self.tmp.name)
        words = provider.text_to_speech(self.TEXT, self.out, self.tags)
        self.assertNotIn("[laughter]", [w["w"] for w in words])

    def test_narrator_mode_uses_one_voice_and_no_cues(self):
        provider, fake = make_provider(cast_mode="narrator", output_folder=self.tmp.name)
        provider.text_to_speech(self.TEXT, self.out, self.tags)
        self.assertEqual(len({c["voice"] for c in fake.tts.calls}), 1)
        self.assertTrue(all("[laughter]" not in c["transcript"] for c in fake.tts.calls))
        self.assertTrue(all("generation_config" not in c for c in fake.tts.calls))

    def test_non_english_has_no_cues_but_still_gets_voices(self):
        provider, fake = make_provider(language="fr", output_folder=self.tmp.name)
        provider.text_to_speech(self.TEXT, self.out, self.tags)
        self.assertTrue(all("[laughter]" not in c["transcript"] for c in fake.tts.calls))
        self.assertTrue(all("generation_config" not in c for c in fake.tts.calls))

    def test_no_expressive_flag(self):
        provider, fake = make_provider(cartesia_expressive=False, output_folder=self.tmp.name)
        provider.text_to_speech(self.TEXT, self.out, self.tags)
        self.assertTrue(all("[laughter]" not in c["transcript"] for c in fake.tts.calls))
        self.assertTrue(all("generation_config" not in c for c in fake.tts.calls))

    def test_global_emotion_applies_to_narrator_only(self):
        provider, fake = make_provider(cartesia_emotion="calm", output_folder=self.tmp.name)
        provider.text_to_speech(self.TEXT, self.out, self.tags)
        for c in fake.tts.calls:
            emo = c.get("generation_config", {}).get("emotion")
            if c["voice"] == provider.narrator_voice_id:
                self.assertEqual(emo, "calm")
            else:
                self.assertNotEqual(emo, "calm")

class TestProviderLookup(unittest.TestCase):

    def test_only_cartesia_is_supported(self):
        self.assertEqual(mod.get_supported_tts_providers(), ["cartesia"])

    def test_get_tts_provider_invalid(self):
        config = get_cartesia_config()
        config.tts = "invalid_tts_provider"
        with self.assertRaises(ValueError):
            get_tts_provider(config)

if __name__ == "__main__":
    unittest.main()
