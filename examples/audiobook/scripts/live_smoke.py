"""Check a real Cartesia key end to end.

    uv run python scripts/live_smoke.py                 # one short paragraph to a temp mp3
    uv run python scripts/live_smoke.py --list-voices   # id, name, language

Exits 0 with "skipped" when CARTESIA_API_KEY is not set, so it is safe in CI.
Costs a few hundred characters of credits. Never prints the key.
"""
import argparse
import os
import sys
import tempfile
from types import SimpleNamespace

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

TEXT = "Alice was beginning to get very tired of sitting by her sister on the bank."

def list_voices():
    from cartesia import Cartesia

    client = Cartesia(api_key=os.environ["CARTESIA_API_KEY"])
    for voice in client.voices.list(limit=100):
        print(f"{voice.id}  {voice.name}  {voice.language}")

def speak():
    from audiobook_generator.config.general_config import GeneralConfig
    from audiobook_generator.core.audio_tags import AudioTags
    from audiobook_generator.tts_providers.cartesia_tts_provider import CartesiaTTSProvider
    from pydub import AudioSegment

    config = GeneralConfig(SimpleNamespace(tts="cartesia", language="en-US"))
    provider = CartesiaTTSProvider(config)
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "smoke.mp3")
        words = provider.text_to_speech(TEXT, out, AudioTags("Smoke", "Test", "Smoke", 1))
        seconds = len(AudioSegment.from_file(out)) / 1000
    print(f"ok: {seconds:.1f} s of audio, {len(words)} words, last word ends at {words[-1]['e']:.1f} s")

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--list-voices", action="store_true")
    args = parser.parse_args()
    if not os.environ.get("CARTESIA_API_KEY"):
        print("skipped: CARTESIA_API_KEY is not set")
        return 0
    list_voices() if args.list_voices else speak()
    return 0

if __name__ == "__main__":
    sys.exit(main())
