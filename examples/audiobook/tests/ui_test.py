import inspect
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from audiobook_generator.ui import web_ui

FORM = dict(
    input_file=SimpleNamespace(name="/tmp/book.epub"), output_dir="out", worker_count=2,
    log_level="DEBUG", output_text=True, preview=False,
    search_and_replace_file=None, title_mode="first_few", new_line_mode="single",
    chapter_start=2, chapter_end=5, remove_endnotes=True, remove_reference_numbers=False,
    model="sonic-3.6", voice="Maya", speed=0.9, volume=1.1, output_format="wav",
    language="fr", max_chars=900,
    cast_mode="narrator", expressive=False, write_timings=False, cast_file=SimpleNamespace(name="/tmp/cast.json"),
)

class TestWebUi(unittest.TestCase):

    def test_form_function_matches_the_input_order(self):
        params = list(inspect.signature(web_ui.process_ui_form).parameters)
        self.assertEqual(params, web_ui.INPUT_ORDER)
        self.assertEqual(sorted(FORM), sorted(web_ui.INPUT_ORDER))

    def test_blocks_wire_every_input(self):
        ui, components = web_ui.build_ui("out")
        self.assertEqual(list(components), web_ui.INPUT_ORDER)
        start = [b for b in ui.blocks.values() if getattr(b, "value", None) == "Make audiobook"][0]
        fn = [f for f in ui.fns.values() if f.fn is web_ui.process_ui_form][0]
        self.assertEqual(len(fn.inputs), len(web_ui.INPUT_ORDER))
        self.assertEqual([c._id for c in fn.inputs], [components[n]._id for n in web_ui.INPUT_ORDER])
        self.assertIsNotNone(start)

    def test_defaults_are_cartesia_defaults(self):
        _, components = web_ui.build_ui("out")
        self.assertEqual(components["model"].value, "sonic-3.6")
        self.assertEqual(components["cast_mode"].value, "dialogue")
        self.assertEqual(components["output_format"].value, "mp3")
        self.assertEqual(components["language"].value, "en")

    def test_process_ui_form_builds_the_config(self):
        with patch.object(web_ui, "launch_audiobook_generator") as launch:
            web_ui.process_ui_form(**FORM)
        config = launch.call_args.args[0]
        expected = {
            "input_file": "/tmp/book.epub", "output_folder": "out", "worker_count": 2, "log": "DEBUG",
            "output_text": True, "preview": False, "no_prompt": True, "title_mode": "first_few",
            "newline_mode": "single", "chapter_start": 2, "chapter_end": 5, "remove_endnotes": True,
            "remove_reference_numbers": False, "search_and_replace_file": None, "tts": "cartesia",
            "model_name": "sonic-3.6", "voice_name": "Maya", "speed": 0.9, "cartesia_volume": 1.1,
            "output_format": "wav", "language": "fr", "cartesia_max_chars": 900,
            "cast_mode": "narrator", "cartesia_expressive": False, "write_timings": False, "cast_file": "/tmp/cast.json",
        }
        for key, value in expected.items():
            self.assertEqual(getattr(config, key), value, key)

if __name__ == "__main__":
    unittest.main()
