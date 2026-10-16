from typing import List

from audiobook_generator.config.general_config import GeneralConfig

TTS_CARTESIA = "cartesia"

class BaseTTSProvider:
    def __init__(self, config: GeneralConfig):
        self.config = config
        self.validate_config()

    def __str__(self) -> str:
        return f"{self.config}"

    def validate_config(self):
        raise NotImplementedError

    def text_to_speech(self, *args, **kwargs):
        raise NotImplementedError

    def estimate_cost(self, total_chars):
        raise NotImplementedError

    def prepare_run(self, chapters):
        """Called once with the (title, text) chapters about to be converted,
        before any worker process starts. Optional."""

    def get_break_string(self):
        raise NotImplementedError

    def get_output_file_extension(self):
        raise NotImplementedError

def get_supported_tts_providers() -> List[str]:
    return [TTS_CARTESIA]

def get_tts_provider(config) -> BaseTTSProvider:
    if config.tts == TTS_CARTESIA:
        from audiobook_generator.tts_providers.cartesia_tts_provider import (
            CartesiaTTSProvider,
        )

        return CartesiaTTSProvider(config)
    else:
        raise ValueError(f"Invalid TTS provider: {config.tts}")
