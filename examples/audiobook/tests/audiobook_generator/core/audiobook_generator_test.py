import json
import os
import tempfile
import unittest
from unittest.mock import patch

from ebooklib import epub

from audiobook_generator.core import audiobook_generator as gen
from audiobook_generator.tts_providers import cartesia_tts_provider as mod
from tests.fake_cartesia import FakeCartesia
from tests.test_utils import get_cartesia_config

def make_epub(path):
    book = epub.EpubBook()
    book.set_title("Tiny")
    book.add_author("Nobody")
    chapters = []
    for i, body in enumerate([
        "<p>“Hi,” said Alice.</p><p>“Hello,” said Tom.</p>",
        "<p>“Again,” said Tom.</p><p>“Yes,” said Mary.</p>",
    ], start=1):
        c = epub.EpubHtml(title=f"Chapter {i}", file_name=f"c{i}.xhtml", lang="en")
        c.content = f"<html><body><h1>Chapter {i}</h1>{body}</body></html>"
        book.add_item(c)
        chapters.append(c)
    book.toc = tuple(chapters)
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    book.spine = ["nav"] + chapters
    epub.write_epub(path, book)

class InProcessPool:
    """Stands in for multiprocessing.Pool so fakes and patches apply."""
    def __init__(self, processes=None, initializer=None, initargs=()):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def imap_unordered(self, fn, tasks):
        return (fn(t) for t in tasks)

class TestRun(unittest.TestCase):

    def run_book(self, **overrides):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        book = os.path.join(tmp.name, "tiny.epub")
        make_epub(book)
        out = os.path.join(tmp.name, "out")
        overrides.setdefault("no_prompt", True)
        config = get_cartesia_config(input_file=book, output_folder=out,
                                     worker_count=1, **overrides)
        config.log_file = os.path.join(tmp.name, "log.txt")
        FakeCartesia.instances.clear()
        with patch.dict(os.environ, {"CARTESIA_API_KEY": "fake-key"}), \
                patch.object(mod, "Cartesia", FakeCartesia), \
                patch.object(mod.time, "sleep"), \
                patch.object(gen.multiprocessing, "Pool", InProcessPool):
            self.exit_code = gen.AudiobookGenerator(config).run()
        return out

    def test_success_returns_zero(self):
        self.run_book()
        self.assertEqual(self.exit_code, 0)

    def test_failed_chapter_returns_non_zero(self):
        with patch.object(gen.AudiobookGenerator, "process_chapter", return_value=False):
            self.run_book()
        self.assertEqual(self.exit_code, 1)

    def test_prompt_without_a_terminal_fails_fast(self):
        class NotATty:
            def isatty(self):
                return False
        with patch.object(gen.sys, "stdin", NotATty()), patch("builtins.input") as fake_input:
            self.run_book(no_prompt=False)
        fake_input.assert_not_called()
        self.assertEqual(self.exit_code, 1)
        self.assertEqual(FakeCartesia.instances, [])

    def test_prompt_eof_and_no_answer_abort(self):
        class Tty:
            def isatty(self):
                return True
        for side_effect in (EOFError(), ["n"]):
            with patch.object(gen.sys, "stdin", Tty()), patch("builtins.input", side_effect=side_effect):
                with self.assertRaises(gen.ConversionAborted):
                    gen.confirm_conversion()

    def test_cast_json_is_written_and_voices_are_stable_across_chapters(self):
        out = self.run_book()
        with open(os.path.join(out, "cast.json")) as f:
            saved = json.load(f)
        self.assertEqual(list(saved["speakers"]), ["Alice", "Tom", "Mary"])
        voices = {}
        for inst in FakeCartesia.instances:
            for call in inst.tts.calls:
                voices.setdefault(call["transcript"], set()).add(call["voice"])
        tom = [v for t, v in voices.items() if t.startswith(("Hello", "Again"))]
        self.assertEqual(len({next(iter(v)) for v in tom}), 1)
        self.assertGreaterEqual(len([f for f in os.listdir(out) if f.endswith(".mp3")]), 2)

    def test_preview_writes_cast_json_without_a_key_or_audio(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        book = os.path.join(tmp.name, "tiny.epub")
        make_epub(book)
        out = os.path.join(tmp.name, "out")
        config = get_cartesia_config(input_file=book, output_folder=out, no_prompt=True,
                                     preview=True, worker_count=1)
        config.log_file = os.path.join(tmp.name, "log.txt")
        with patch.dict(os.environ, {}, clear=False), patch.object(gen.multiprocessing, "Pool", InProcessPool):
            os.environ.pop("CARTESIA_API_KEY", None)
            gen.AudiobookGenerator(config).run()
        self.assertTrue(os.path.isfile(os.path.join(out, "cast.json")))
        self.assertEqual([f for f in os.listdir(out) if f.endswith(".mp3")], [])

if __name__ == "__main__":
    unittest.main()
