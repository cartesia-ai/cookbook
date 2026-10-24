import inspect
import unittest
from types import SimpleNamespace
import os
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
        with patch.object(web_ui, "launch_audiobook_generator") as launch, \
                patch.dict(os.environ, {"CARTESIA_API_KEY": "sk_car_test"}):
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

    def test_process_ui_form_refuses_to_start_without_a_key(self):
        import gradio as gr
        env = {k: v for k, v in os.environ.items() if k != "CARTESIA_API_KEY"}
        with patch.object(web_ui, "launch_audiobook_generator") as launch, patch.dict(os.environ, env, clear=True):
            with self.assertRaises(gr.Error):
                web_ui.process_ui_form(**FORM)
            web_ui.process_ui_form(**{**FORM, "preview": True})
        self.assertEqual(launch.call_count, 1)

    def test_log_timer_starts_inactive_and_follows_the_run(self):
        ui, _ = web_ui.build_ui("out")
        import gradio as gr
        timers = [b for b in ui.blocks.values() if isinstance(b, gr.Timer)]
        self.assertEqual(len(timers), 1)
        self.assertFalse(timers[0].active)
        fns = {f.fn for f in ui.fns.values()}
        self.assertIn(web_ui.start_log_refresh, fns)
        self.assertIn(web_ui.refresh_log, fns)
        self.assertIn(web_ui.stop_and_refresh_log, fns)

    def test_refresh_log_stops_the_timer_after_the_run(self):
        web_ui.build_ui("out")
        web_ui.webui_log_file.write_text("chapter 1 done\n")
        alive = SimpleNamespace(is_alive=lambda: True)
        with patch.object(web_ui, "running_process", alive):
            text, timer = web_ui.refresh_log()
        self.assertEqual(text, "chapter 1 done\n")
        self.assertTrue(timer.active)
        with patch.object(web_ui, "running_process", None):
            text, timer = web_ui.refresh_log()
        self.assertEqual(text, "chapter 1 done\n")
        self.assertFalse(timer.active)

if __name__ == "__main__":
    unittest.main()
