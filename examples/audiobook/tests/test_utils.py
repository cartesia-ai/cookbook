from types import SimpleNamespace

from audiobook_generator.config.general_config import GeneralConfig

SAMPLE_BOOK = 'samples/alice_sample.epub'

def get_cartesia_config(**overrides):
    values = dict(
        input_file=SAMPLE_BOOK,
        output_folder='output',
        preview=False,
        output_text=False,
        title_mode='auto',
        log='INFO',
        newline_mode='double',
        chapter_start=1,
        chapter_end=-1,
        remove_endnotes=False,
        tts='cartesia',
        language='en-US',
        voice_name=None,
        output_format=None,
        model_name=None,
        speed=1.0,
        break_duration=None,
    )
    values.update(overrides)
    return GeneralConfig(SimpleNamespace(**values))
