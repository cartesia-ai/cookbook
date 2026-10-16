class GeneralConfig:
    def __init__(self, args):
        self.input_file = getattr(args, 'input_file', None)
        self.output_folder = getattr(args, 'output_folder', None)
        self.preview = getattr(args, 'preview', None)
        self.output_text = getattr(args, 'output_text', None)
        self.log = getattr(args, 'log', None)
        self.log_file = None
        self.no_prompt = getattr(args, 'no_prompt', None)
        self.worker_count = getattr(args, 'worker_count', None)

        self.title_mode = getattr(args, 'title_mode', None)
        self.newline_mode = getattr(args, 'newline_mode', None)
        self.chapter_start = getattr(args, 'chapter_start', None)
        self.chapter_end = getattr(args, 'chapter_end', None)
        self.remove_endnotes = getattr(args, 'remove_endnotes', None)
        self.remove_reference_numbers = getattr(args, 'remove_reference_numbers', None)
        self.search_and_replace_file = getattr(args, 'search_and_replace_file', None)

        self.tts = getattr(args, 'tts', None)
        self.language = getattr(args, 'language', None)
        self.voice_name = getattr(args, 'voice_name', None)
        self.output_format = getattr(args, 'output_format', None)
        self.model_name = getattr(args, 'model_name', None)

        self.cartesia_max_chars = getattr(args, 'cartesia_max_chars', None)
        self.cartesia_volume = getattr(args, 'cartesia_volume', None)
        self.cartesia_emotion = getattr(args, 'cartesia_emotion', None)
        self.cartesia_expressive = getattr(args, 'cartesia_expressive', None)
        self.cast_mode = getattr(args, 'cast_mode', None)
        self.cast_file = getattr(args, 'cast_file', None)
        self.write_timings = getattr(args, 'write_timings', None)
        self.speed = getattr(args, 'speed', None)
        self.break_duration = getattr(args, 'break_duration', None)

    def __str__(self):
        return ",\n".join(f"{key}={value}" for key, value in self.__dict__.items())
