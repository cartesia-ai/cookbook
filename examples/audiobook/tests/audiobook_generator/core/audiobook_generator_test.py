import json
import os
import signal
import subprocess
import sys
import tempfile
import textwrap
import time
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
    def __init__(self, processes=None, initializer=None, initargs=()):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def imap_unordered(self, fn, tasks):
        return (fn(t) for t in tasks)

class SigtermPool(InProcessPool):
    terminated = False
    exit_exc = None

    def __exit__(self, exc_type, exc, tb):
        SigtermPool.exit_exc = exc_type
        self.terminate()
        return False

    def terminate(self):
        SigtermPool.terminated = True

    def imap_unordered(self, fn, tasks):
        os.kill(os.getpid(), signal.SIGTERM)
        time.sleep(1)
        return iter(())

WORKER_SCRIPT = textwrap.dedent('''
    import multiprocessing, os, sys, time
    multiprocessing.set_start_method("fork", force=True)
    from audiobook_generator.core import audiobook_generator as gen
    from tests.test_utils import get_cartesia_config

    marker_dir = sys.argv[1]

    class SlowProvider:
        def get_break_string(self):
            return " "
        def estimate_cost(self, chars):
            return 0
        def prepare_run(self, chapters):
            pass
        def get_output_file_extension(self):
            return "mp3"
        def text_to_speech(self, text, output_file, audio_tags):
            open(os.path.join(marker_dir, str(os.getpid())), "w").close()
            time.sleep(30)

    gen.get_tts_provider = lambda config: SlowProvider()
    config = get_cartesia_config(input_file=sys.argv[2], output_folder=sys.argv[3],
                                 worker_count=2, no_prompt=True)
    config.log_file = os.path.join(sys.argv[3], "log.txt")
    sys.exit(gen.AudiobookGenerator(config).run())
''')

EXPORT_SCRIPT = textwrap.dedent('''
    import multiprocessing, sys
    multiprocessing.set_start_method("fork", force=True)
    from pydub import AudioSegment
    from audiobook_generator.core import audiobook_generator as gen
    from audiobook_generator.tts_providers import cartesia_tts_provider as mod
    from tests.test_utils import get_cartesia_config

    AudioSegment.converter = sys.argv[3]

    class LongProvider(mod.CartesiaTTSProvider):
        def synthesize(self, text):
            return b"\\x00" * mod.BYTES_PER_SECOND * 30, []

    gen.get_tts_provider = lambda config: LongProvider(config)
    config = get_cartesia_config(input_file=sys.argv[1], output_folder=sys.argv[2],
                                 worker_count=1, no_prompt=True, cast_mode="narrator")
    config.log_file = sys.argv[2] + ".log"
    sys.exit(gen.AudiobookGenerator(config).run())
''')

FAKE_FFMPEG = '''#!/bin/sh
echo $$ > "$MARKER"
exec sleep 30
'''

def pid_alive(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True

class TestSigterm(unittest.TestCase):

    def test_sigterm_raises_system_exit_and_terminates_pool(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        book = os.path.join(tmp.name, "tiny.epub")
        make_epub(book)
        config = get_cartesia_config(input_file=book, output_folder=os.path.join(tmp.name, "out"),
                                     worker_count=1, no_prompt=True, preview=True)
        config.log_file = os.path.join(tmp.name, "log.txt")
        before = signal.getsignal(signal.SIGTERM)
        with patch.object(gen.multiprocessing, "Pool", SigtermPool):
            with self.assertRaises(SystemExit) as caught:
                gen.AudiobookGenerator(config).run()
        self.assertEqual(caught.exception.code, 143)
        self.assertIs(SigtermPool.exit_exc, SystemExit)
        self.assertTrue(SigtermPool.terminated)
        self.assertEqual(signal.getsignal(signal.SIGTERM), before)

    @unittest.skipIf(sys.platform == "win32", "needs fork and SIGTERM")
    def test_sigterm_stops_real_pool_workers(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        book = os.path.join(tmp.name, "tiny.epub")
        make_epub(book)
        markers = os.path.join(tmp.name, "markers")
        out = os.path.join(tmp.name, "out")
        os.makedirs(markers)
        root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
        proc = subprocess.Popen([sys.executable, "-c", WORKER_SCRIPT, markers, book, out], cwd=root,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.addCleanup(proc.kill)
        deadline = time.time() + 20
        while len(os.listdir(markers)) < 2 and time.time() < deadline:
            time.sleep(0.05)
        worker_pids = [int(name) for name in os.listdir(markers)]
        self.assertEqual(len(worker_pids), 2)
        proc.send_signal(signal.SIGTERM)
        self.assertEqual(proc.wait(timeout=10), 143)
        deadline = time.time() + 5
        while any(pid_alive(pid) for pid in worker_pids) and time.time() < deadline:
            time.sleep(0.05)
        self.assertFalse(any(pid_alive(pid) for pid in worker_pids))

    @unittest.skipIf(sys.platform == "win32", "needs fork and SIGTERM")
    def test_sigterm_mid_export_leaves_no_partial_or_temp_files(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        book = os.path.join(tmp.name, "tiny.epub")
        make_epub(book)
        out = os.path.join(tmp.name, "out")
        sys_tmp = os.path.join(tmp.name, "tmp")
        os.makedirs(sys_tmp)
        marker = os.path.join(tmp.name, "ffmpeg.pid")
        ffmpeg = os.path.join(tmp.name, "ffmpeg")
        with open(ffmpeg, "w") as f:
            f.write(FAKE_FFMPEG)
        os.chmod(ffmpeg, 0o755)
        root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
        env = dict(os.environ, TMPDIR=sys_tmp, MARKER=marker)
        proc = subprocess.Popen([sys.executable, "-c", EXPORT_SCRIPT, book, out, ffmpeg], cwd=root, env=env,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.addCleanup(proc.kill)
        deadline = time.time() + 20
        while not os.path.exists(marker) and time.time() < deadline:
            time.sleep(0.05)
        time.sleep(0.2)
        with open(marker) as f:
            ffmpeg_pid = int(f.read())
        self.assertTrue([n for n in os.listdir(out) if n.endswith(".part")])
        proc.send_signal(signal.SIGTERM)
        self.assertEqual(proc.wait(timeout=10), 143)
        deadline = time.time() + 5
        while pid_alive(ffmpeg_pid) and time.time() < deadline:
            time.sleep(0.05)
        self.assertFalse(pid_alive(ffmpeg_pid))
        self.assertEqual([n for n in os.listdir(out) if n.endswith((".part", ".mp3"))], [])
        self.assertEqual(os.listdir(sys_tmp), [])

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
