import pytest

from cartesia_voice_mode.config import ConfigError, RETIRED_MODELS, load_settings
from cartesia_voice_mode.install import save_key
from conftest import TEST_KEY

def test_defaults():
    s = load_settings()
    assert s.tts_model == "sonic-3.6" and s.stt_model == "ink-2"
    assert s.sample_rate_in == 16000 and s.sample_rate_out == 24000

@pytest.mark.parametrize("model", RETIRED_MODELS)
def test_retired_models_rejected(monkeypatch, model):
    monkeypatch.setenv("CARTESIA_TTS_MODEL", model)
    with pytest.raises(ConfigError, match="retired"):
        load_settings()

def test_stt_model_must_be_ink_2(monkeypatch):
    monkeypatch.setenv("CARTESIA_STT_MODEL", "ink-whisper")
    with pytest.raises(ConfigError):
        load_settings()

def test_voice_and_sample_rates_from_env(monkeypatch):
    monkeypatch.setenv("CARTESIA_VOICE_ID", "voice-a")
    monkeypatch.setenv("CARTESIA_SAMPLE_RATE_IN", "24000")
    monkeypatch.setenv("CARTESIA_SAMPLE_RATE_OUT", "44100")
    s = load_settings()
    assert (s.voice_id, s.sample_rate_in, s.sample_rate_out) == ("voice-a", 24000, 44100)

def test_speed_clamped(monkeypatch):
    monkeypatch.setenv("CARTESIA_SPEED", "9")
    assert load_settings().speed == 1.5
    monkeypatch.setenv("CARTESIA_SPEED", "0.1")
    assert load_settings().speed == 0.6

def test_turn_timeout_range(monkeypatch):
    monkeypatch.setenv("CARTESIA_TURN_END_TIMEOUT_MS", "100")
    with pytest.raises(ConfigError):
        load_settings()

def test_keyterms(monkeypatch):
    monkeypatch.setenv("CARTESIA_KEYTERMS", "pytest, asyncio ,")
    assert load_settings().keyterms == ("pytest", "asyncio")

def test_env_beats_file(monkeypatch, clean_env):
    from cartesia_voice_mode.config import key_file

    save_key(key_file(), "file-key-value")
    assert load_settings().api_key == TEST_KEY
    monkeypatch.delenv("CARTESIA_API_KEY")
    assert load_settings().api_key == "file-key-value"

def test_loose_key_file_warns(monkeypatch, capsys):
    from cartesia_voice_mode.config import key_file

    monkeypatch.delenv("CARTESIA_API_KEY")
    p = key_file()
    save_key(p, "file-key-value")
    p.chmod(0o644)
    load_settings()
    assert "chmod 600" in capsys.readouterr().err

def test_key_never_in_repr_or_errors(monkeypatch):
    s = load_settings()
    assert TEST_KEY not in repr(s) and TEST_KEY not in str(s)
    monkeypatch.setenv("CARTESIA_TTS_MODEL", RETIRED_MODELS[0])
    with pytest.raises(ConfigError) as e:
        load_settings()
    assert TEST_KEY not in str(e.value)
