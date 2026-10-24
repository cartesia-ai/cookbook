import argparse
import os
import sys
from pathlib import Path

from audiobook_generator.config.general_config import GeneralConfig
from audiobook_generator.core.audiobook_generator import AudiobookGenerator
from audiobook_generator.tts_providers.cartesia_tts_provider import (
    get_supported_tts_providers,
)
from audiobook_generator.utils.log_handler import setup_logging, generate_unique_log_path

def handle_args():
    parser = argparse.ArgumentParser(description="Convert an EPUB to an audiobook with Cartesia Sonic")
    parser.add_argument("input_file", help="Path to the EPUB file")
    parser.add_argument("output_folder", help="Path to the output folder")
    parser.add_argument(
        "--tts",
        choices=get_supported_tts_providers(),
        default=get_supported_tts_providers()[0],
        help="TTS provider (default: cartesia). Needs the environment variable CARTESIA_API_KEY.",
    )
    parser.add_argument(
        "--log",
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        default="INFO",
        help="Log level (default: INFO), can be DEBUG, INFO, WARNING, ERROR, CRITICAL",
    )
    parser.add_argument(
        "--preview",
        action="store_true",
        help="Enable preview mode. In preview mode, the script will not convert the text to speech. Instead, it will print the chapter index, titles, and character counts.",
    )
    parser.add_argument(
        "-y",
        "--yes",
        "--no_prompt",
        dest="no_prompt",
        action="store_true",
        help="Skip the 'continue? (y/n)' prompt after the cost estimate. Required when stdin is not a terminal (scripts, CI, pipes).",
    )
    parser.add_argument(
        "--language",
        default="en-US",
        help="Language of the book (default: en-US). Cartesia takes the base code (en, fr, de, ...), so a region suffix such as -US is dropped. Emotion and laughter cues only apply to English. The code also steers how long text is split, especially for Chinese. For Chinese books use zh.",
    )
    parser.add_argument(
        "--newline_mode",
        choices=["single", "double", "none"],
        default="double",
        help="Choose the mode of detecting new paragraphs: 'single', 'double', or 'none'. 'single' means a single newline character, while 'double' means two consecutive newline characters. 'none' means all newline characters will be replace with blank so paragraphs will not be detected. (default: double, works for most ebooks but will detect less paragraphs for some ebooks)",
    )
    parser.add_argument(
        "--title_mode",
        choices=["auto", "tag_text", "first_few"],
        default="auto",
        help="Choose the parse mode for chapter title, 'tag_text' search 'title','h1','h2','h3' tag for title, 'first_few' set first 60 characters as title, 'auto' auto apply the best mode for current chapter.",
    )
    parser.add_argument(
        "--chapter_start",
        default=1,
        type=int,
        help="Chapter start index (default: 1, starting from 1)",
    )
    parser.add_argument(
        "--chapter_end",
        default=-1,
        type=int,
        help="Chapter end index (default: -1, meaning to the last chapter)",
    )
    parser.add_argument(
        "--output_text",
        action="store_true",
        help="Enable Output Text. This will export a plain text file for each chapter specified and write the files to the output folder specified.",
    )
    parser.add_argument(
        "--remove_endnotes",
        action="store_true",
        help="This will remove endnote numbers from the end or middle of sentences. This is useful for academic books.",
    )

    parser.add_argument(
        "--remove_reference_numbers",
        action="store_true",
        help="This will remove reference numbers from the end or middle of sentences (e.g [3] or [12.1]). Also useful for academic books."
    )

    parser.add_argument(
        "--search_and_replace_file",
        default="",
        help="""Path to a file that contains 1 regex replace per line, to help with fixing pronunciations, etc. The format is:
        <search>==<replace>
        Note that you may have to specify word boundaries, to avoid replacing parts of words.
        """,
    )

    parser.add_argument(
        "--worker_count",
        type=int,
        default=1,
        help="Specifies the number of parallel workers to use for audiobook generation. "
        "Increasing this value can significantly speed up the process by processing multiple chapters simultaneously. "
        "Note: Chapters may not be processed in sequential order, but this will not affect the final audiobook.",
    )

    parser.add_argument(
        "--voice_name",
        help="Narrator voice: a Cartesia voice id, or a name from the built-in pool (default: Archie).",
    )

    parser.add_argument(
        "--output_format",
        help="Output format: mp3, wav or flac (default: mp3).",
    )

    parser.add_argument(
        "--model_name",
        help="Cartesia model id (default: sonic-3.6).",
    )

    parser.add_argument(
        "--speed",
        default=1.0,
        type=float,
        help="Speaking speed, from 0.6 to 1.5 (default: 1.0).",
    )

    parser.add_argument(
        "--break_duration",
        default=None,
        help="Pause between paragraphs in milliseconds (default: 600).",
    )

    cartesia_group = parser.add_argument_group(title="cartesia specific")
    cartesia_group.add_argument(
        "--cartesia_max_chars",
        type=int,
        default=None,
        help="Largest transcript sent in one request, 200 to 4000 (default: 1500). Longer paragraphs are split on sentence boundaries.",
    )
    cartesia_group.add_argument(
        "--cartesia_volume",
        type=float,
        default=None,
        help="Volume from 0.5 to 2.0 (default: 1.0).",
    )
    cartesia_group.add_argument(
        "--cartesia_emotion",
        default=None,
        help="Emotion for narration, for example calm or content (default: none, the model decides). English only.",
    )

    cartesia_group.add_argument(
        "--cast_mode",
        choices=["dialogue", "narrator"],
        default="dialogue",
        help="dialogue (default): quoted speech gets a voice per speaker and the rest is read by the narrator. narrator: the whole book in the narrator voice.",
    )
    cartesia_group.add_argument(
        "--cast_file",
        default=None,
        help="JSON file that maps speakers to voices: {\"narrator\": \"Archie\", \"speakers\": {\"Alice\": \"Maya\"}}. Values are voice names from the built-in pool or Cartesia voice ids. The voices used in a run are also written to cast.json in the output folder.",
    )
    cartesia_group.add_argument(
        "--no_expressive",
        dest="cartesia_expressive",
        action="store_false",
        help="Turn off emotion and laughter cues. They only apply to English dialogue anyway.",
    )

    cartesia_group.add_argument(
        "--no_timings",
        dest="write_timings",
        action="store_false",
        help="Do not write the word timestamps (<chapter>.timings.json) and subtitles (<chapter>.vtt) next to each audio file.",
    )

    args = parser.parse_args()
    return GeneralConfig(args)

def main(config=None, log_file=None):
    if not config:
        config = handle_args()
        if not config.preview and not os.environ.get("CARTESIA_API_KEY"):
            print(
                "CARTESIA_API_KEY is not set. Export it or load your .env file "
                "(set -a; . .env; set +a) before converting.",
                file=sys.stderr,
            )
            return 1

    if log_file:
        effective_log_file = Path(log_file)
    else:
        effective_log_file = generate_unique_log_path("EtA")

    config.log_file = effective_log_file

    setup_logging(config.log, str(effective_log_file))

    return AudiobookGenerator(config).run()

if __name__ == "__main__":
    sys.exit(main())
