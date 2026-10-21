import logging
import multiprocessing
import os
import signal
import sys
import threading

from audiobook_generator.book_parsers.base_book_parser import get_book_parser
from audiobook_generator.config.general_config import GeneralConfig
from audiobook_generator.core.audio_tags import AudioTags
from audiobook_generator.tts_providers.cartesia_tts_provider import get_tts_provider
from audiobook_generator.utils.log_handler import setup_logging
from audiobook_generator.utils.filename_sanitizer import make_safe_filename

logger = logging.getLogger(__name__)

class ConversionAborted(Exception):
    pass

NOT_A_TTY_MESSAGE = (
    "Standard input is not a terminal, so the cost prompt cannot be answered. "
    "Pass --yes (or -y) to skip it."
)

def confirm_conversion():
    if not sys.stdin or not sys.stdin.isatty():
        raise ConversionAborted(NOT_A_TTY_MESSAGE)
    logger.info("Do you want to continue? (y/n)")
    try:
        answer = input()
    except EOFError:
        raise ConversionAborted(NOT_A_TTY_MESSAGE) from None
    if answer.strip().lower() != "y":
        raise ConversionAborted("Aborted.")

def _exit_on_sigterm(signum, frame):
    raise SystemExit(128 + signal.SIGTERM)

def _init_worker(log_level, log_file, is_worker):
    signal.signal(signal.SIGTERM, _exit_on_sigterm)
    setup_logging(log_level, log_file, is_worker)

def get_total_chars(chapters):
    total_characters = 0
    for _title, text in chapters:
        total_characters += len(text)
    return total_characters

class AudiobookGenerator:
    def __init__(self, config: GeneralConfig):
        self.config = config

    def __str__(self) -> str:
        return f"{self.config}"

    def process_chapter(self, idx, title, text, book_parser):
        try:
            logger.info(f"Processing chapter {idx}: {title}")
            tts_provider = get_tts_provider(self.config)

            if self.config.output_text:
                safe_txt_name = make_safe_filename(
                    title=title,
                    idx=idx,
                    output_dir=self.config.output_folder,
                    ext=".txt",
                    collision_check=False,
                )
                text_file = os.path.join(self.config.output_folder, safe_txt_name)
                with open(text_file, "w", encoding="utf-8") as f:
                    f.write(text)

            if self.config.preview:
                return True

            audio_ext = "." + tts_provider.get_output_file_extension()
            safe_audio_name = make_safe_filename(
                title=title,
                idx=idx,
                output_dir=self.config.output_folder,
                ext=audio_ext,
                collision_check=False,
            )
            output_file = os.path.join(self.config.output_folder, safe_audio_name)

            audio_tags = AudioTags(
                title, book_parser.get_book_author(), book_parser.get_book_title(), idx
            )
            tts_provider.text_to_speech(text, output_file, audio_tags)

            logger.info(f"✅ Converted chapter {idx}: {title}, output file: {output_file}")

            return True
        except Exception as e:
            logger.exception(f"Error processing chapter {idx}, error: {e}")
            return False

    def process_chapter_wrapper(self, args):
        idx, title, text, book_parser = args
        return idx, self.process_chapter(idx, title, text, book_parser)

    def run(self):
        previous_sigterm = None
        if threading.current_thread() is threading.main_thread():
            previous_sigterm = signal.signal(signal.SIGTERM, _exit_on_sigterm)
        try:
            logger.info("Starting audiobook generation...")
            book_parser = get_book_parser(self.config)
            tts_provider = get_tts_provider(self.config)

            os.makedirs(self.config.output_folder, exist_ok=True)
            chapters = book_parser.get_chapters(tts_provider.get_break_string())
            chapters = [(title, text) for title, text in chapters if text.strip()]

            logger.info(f"Chapters count: {len(chapters)}.")

            if self.config.chapter_start < 1 or self.config.chapter_start > len(chapters):
                raise ValueError(
                    f"Chapter start index {self.config.chapter_start} is out of range. Check your input."
                )
            if self.config.chapter_end < -1 or self.config.chapter_end > len(chapters):
                raise ValueError(
                    f"Chapter end index {self.config.chapter_end} is out of range. Check your input."
                )
            if self.config.chapter_end == -1:
                self.config.chapter_end = len(chapters)
            if self.config.chapter_start > self.config.chapter_end:
                raise ValueError(
                    f"Chapter start index {self.config.chapter_start} is larger than chapter end index {self.config.chapter_end}. Check your input."
                )

            logger.info(
                f"Converting chapters from {self.config.chapter_start} to {self.config.chapter_end}."
            )

            total_characters = get_total_chars(
                chapters[self.config.chapter_start - 1 : self.config.chapter_end]
            )
            logger.info(f"Total characters in selected book chapters: {total_characters}")
            rough_price = tts_provider.estimate_cost(total_characters)
            if rough_price:
                logger.info(f"Estimate book voiceover would cost you roughly: ${rough_price:.2f}\n")

            if self.config.no_prompt:
                logger.info("Skipping prompt as passed parameter no_prompt")
            elif self.config.preview:
                logger.info("Skipping prompt as in preview mode")
            else:
                confirm_conversion()

            chapters_to_process = chapters[self.config.chapter_start - 1 : self.config.chapter_end]
            tts_provider.prepare_run(chapters_to_process)

            tasks = [
                (idx, title, text, book_parser)
                for idx, (title, text) in enumerate(
                    chapters_to_process, start=self.config.chapter_start
                )
            ]

            failed_chapters = []

            with multiprocessing.Pool(
                processes=self.config.worker_count,
                initializer=_init_worker,
                initargs=(self.config.log, self.config.log_file, True)
            ) as pool:
                results = list(pool.imap_unordered(self.process_chapter_wrapper, tasks))

                for idx, success in results:
                    if not success:
                        chapter_title = chapters_to_process[idx - self.config.chapter_start][0]
                        failed_chapters.append((idx, chapter_title))

            if failed_chapters:
                logger.warning("The following chapters failed to convert:")
                for idx, title in failed_chapters:
                    logger.warning(f"  - Chapter {idx}: {title}")
                logger.error(f"Conversion completed with {len(failed_chapters)} failed chapters. Check your output directory: {self.config.output_folder} and log file: {self.config.log_file} for more details.")
                return 1
            if self.config.preview:
                logger.info("Preview done, no audio written.")
                return 0
            logger.info(f"All chapters converted successfully. Check your output directory: {self.config.output_folder}")
            return 0

        except ConversionAborted as e:
            logger.error(str(e))
            return 1
        except KeyboardInterrupt:
            logger.info("Audiobook generation process interrupted by user (Ctrl+C).")
            return 130
        except Exception as e:
            logger.exception(f"Error during audiobook generation: {e}")
            return 1
        finally:
            if previous_sigterm is not None:
                signal.signal(signal.SIGTERM, previous_sigterm)
            logger.debug("AudiobookGenerator.run() method finished.")

