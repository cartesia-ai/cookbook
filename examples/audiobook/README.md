# Ebook to audiobook

Turns an EPUB into one mp3 per chapter with a voice per speaker and read-along word timestamps, using Cartesia Sonic 3.6 streamed over `/tts/sse`.

![The Audiobook web app after a preview run of alice_sample.epub: Preview only is ticked, cast mode is Per speaker with Archie as narrator and English as the language, and the log reports about 15065 Cartesia credits, voices Alice = Maya and Mouse = Leo, and both chapters processed](./docs/screenshot.png)

## Run it

You need Python 3.10 to 3.12, [uv](https://docs.astral.sh/uv/) and `ffmpeg` (`brew install ffmpeg` or `apt install ffmpeg`). The API returns raw PCM and ffmpeg encodes it to mp3.

```sh
npx degit cartesia-ai/cookbook/examples/audiobook audiobook
cd audiobook
uv sync
uv run python main.py samples/alice_sample.epub out --preview --no_prompt
```

Preview mode needs no API key. It splits the sample book into chapters, counts characters (15,065 for the sample, so about 15,000 credits) and writes the speaker to voice table to `out/cast.json`. To make the audio, add your key and drop `--preview`:

```sh
cp .env.example .env            # add CARTESIA_API_KEY from https://play.cartesia.ai/keys
set -a; . ./.env; set +a
uv run python main.py samples/alice_sample.epub out --no_prompt
```

```
out/0001_Down_the_RabbitHole.mp3
out/0001_Down_the_RabbitHole.timings.json   word start and end times
out/0001_Down_the_RabbitHole.vtt            subtitles, about 8 words per cue
out/cast.json                               which voice reads which speaker
```

For the web app, run `uv run python main_ui.py` and open http://127.0.0.1:7860. `CARTESIA_API_KEY` must be set in the shell that starts it.

## Environment variables

| Name | Required | Where to get it |
| --- | --- | --- |
| `CARTESIA_API_KEY` | to make audio, not for `--preview` | https://play.cartesia.ai/keys |

## How it works

Open `audiobook_generator/tts_providers/cartesia_tts_provider.py` first. It is the only file that calls Cartesia. Then `audiobook_generator/core/cast.py` for speakers and voices, and `audiobook_generator/core/readalong.py` for the timestamp files.

1. `book_parsers/epub_book_parser.py` splits the EPUB into chapters and paragraphs.
2. In `--cast_mode dialogue` (the default), `core/cast.py` splits each chapter on quotation marks, works out who speaks from tags such as "said Alice" or "the Mouse cried", and gives each speaker a voice from a pool of Cartesia library voices. A quote with no tag goes to the previous speaker. Voices are fixed once, before any chapter is converted, so parallel workers and reruns agree.
3. In English dialogue, a cue such as "whispered", "shouted" or "sobbed" next to a quote sets `generation_config.emotion` for that quote, and "laughed" adds a `[laughter]` tag.
4. `tts_providers/cartesia_tts_provider.py` sends text in requests of at most 1,500 characters, split on sentence boundaries and never across a paragraph. It streams each one from `/tts/sse` with `add_timestamps`, because the streaming endpoints are the ones that return word timestamps. A stream that drops halfway is retried twice for that chunk only.
5. The PCM is joined with 600 ms of silence between paragraphs and encoded to mp3 with ID3 tags. Timestamps are shifted to positions in the final file and written as `.timings.json` and `.vtt`.

This is the core call, as a standalone script:

```python
import os

from cartesia import Cartesia

client = Cartesia(api_key=os.environ["CARTESIA_API_KEY"])

pcm, words = bytearray(), []
for ev in client.tts.generate_sse(
    model_id="sonic-3.6",
    transcript='"Curiouser and curiouser!" cried Alice.',
    voice={"mode": "id", "id": "ef191366-f52f-447a-a398-ed8c0f2943a1"},
    language="en",
    output_format={"container": "raw", "encoding": "pcm_s16le", "sample_rate": 44100},
    add_timestamps=True,
    use_normalized_timestamps=False,
    generation_config={"emotion": "surprised"},
):
    if ev.type == "chunk" and ev.audio:
        pcm += ev.audio
    elif ev.type == "timestamps":
        wt = ev.word_timestamps
        words += zip(wt.words, wt.start, wt.end)

print(f"{len(pcm)} bytes of PCM, first words: {words[:3]}")
```

`use_normalized_timestamps=False` keeps the words as written ("$5") instead of the spoken form ("five dollars"), so the read-along matches the book text.

```
main.py                                      command line entry
main_ui.py                                   Gradio web app entry
audiobook_generator/core/cast.py             speaker detection, voice pool, emotion cues
audiobook_generator/core/readalong.py        timings.json and WebVTT
audiobook_generator/tts_providers/cartesia_tts_provider.py   Sonic requests, chunking, retries
audiobook_generator/ui/                      web app and its theme
readalong.html                               open an mp3 and its timings to follow the words
samples/alice_sample.epub                    two public-domain chapters for testing
```

The tool uses `sonic-3.6` over `/tts/sse`, with `Cartesia-Version: 2026-08-14` sent by the `cartesia` Python SDK (pinned in `uv.lock`). `--model_name` also accepts the dated snapshot `sonic-3.6-2026-08-27`, and the provider refuses retired ids. See https://docs.cartesia.ai/build-with-cartesia/tts-models/latest for current ids.

## Change it

- Pick voices: edit `out/cast.json` and run again, or pass your own with `--cast_file samples/sample_cast.json`. Values are pool names (Archie, Maya, Leo, Marian, Kyle, Tessa, Jace, Gemma, Gavin, Dana) or any voice id from https://play.cartesia.ai/voices.
- One voice for the whole book: `--cast_mode narrator`, with `--voice_name` for the narrator.
- Another language: `--language fr` (a region suffix such as `-FR` is dropped). Voices per speaker still work. Emotion and laughter cues are English only.
- Pace and loudness: `--speed` (0.6 to 1.5), `--cartesia_volume` (0.5 to 2.0), `--break_duration` in milliseconds between paragraphs.
- Part of a book: `--chapter_start 3 --chapter_end 5`.
- Scripts and CI: add `-y` (or `--yes`) to skip the cost prompt. Without it, a run whose standard input is not a terminal stops before any request and exits 1.
- Faster runs: `--worker_count 4` converts chapters in parallel. Each worker is another concurrent request, so stay within your plan's concurrency limit.
- Fix pronunciations: `--search_and_replace_file` takes one `<search>==<replace>` regex per line.

`uv run python main.py --help` lists every option, including the upstream ones for chapter titles, newlines and endnotes.

## Before you deploy

- Auth: the web app has no login. Keep the default host `127.0.0.1`. Anyone who can reach the app spends your credits.
- Limits: `--worker_count` sets how many requests run at once. Stay within your plan's concurrency limit.
- Cost: Sonic bills about one credit per character, and the pauses between paragraphs are added locally for free. Run with `--preview` first to get the character count. What a credit costs depends on your plan, see https://docs.cartesia.ai/pricing.

## FAQ

### How good is the speaker detection?

It is a heuristic over English dialogue tags, and plenty of real novels defeat it: speakers who are only implied get missed, and untagged back-and-forth between two people can swap. Check `cast.json` after `--preview`, fix it, and use `--cast_mode narrator` when a book is not worth the trouble. Straight single quotes are never read as quote marks, because they are apostrophes too often.

### How do I follow along with the text?

Open `readalong.html` in a browser and pick a chapter's mp3 and its `.timings.json`. The current word is highlighted, and clicking a word jumps to it. The `.vtt` file works as subtitles in most players. `--no_timings` skips both files.

### Can I put the result in an audiobook server?

The mp3 files carry ID3 title, author, album and track tags, so servers such as Audiobookshelf can sort them into one book. ID3 tags are written only for mp3, not `wav` or `flac`.

### Why not `/tts/bytes`?

It returns audio only. The read-along files need word timestamps, which come from the streaming endpoints.

## Tests

```sh
uv run pytest
```

The tests use a fake client, unset `CARTESIA_API_KEY` before they run and never call the API. `uv run python scripts/make_sample_epub.py` rebuilds the sample book.

## Learn more

- Cartesia docs: https://docs.cartesia.ai
- TTS over server-sent events: https://docs.cartesia.ai/api-reference/tts/sse
- Volume, speed and emotion: https://docs.cartesia.ai/build-with-cartesia/capability-guides/volume-speed-emotion
- The recipe for this tool: [Turn an ebook into an audiobook](../../content/cookbook/10-python/10-ebook-to-audiobook.mdx)
- Agent skills: `npx skills add cartesia-ai/skills`

## License

MIT, unlike the rest of the cookbook. This folder is a fork of [p0n1/epub_to_audiobook](https://github.com/p0n1/epub_to_audiobook), which supplies the EPUB parsing, chapter handling, preview mode, search-and-replace and the Gradio app, and `LICENSE` keeps its copyright notice. `samples/alice_ch1_2.txt` holds two excerpts of *Alice's Adventures in Wonderland* from Project Gutenberg, public domain in the United States.
