# Agent notes for audiobook

EPUB to audiobook with Cartesia Sonic 3.6. Python 3.12 (`.python-version`), uv, Gradio for the web app, ffmpeg on the PATH. Fork of p0n1/epub_to_audiobook (MIT): keep its copyright notice in `LICENSE` and the credit in `README.md`. This folder is MIT; the rest of the repo is Apache-2.0.

## Commands (run from this folder)

- Install: `uv sync`. Preview with no key: `uv run python main.py samples/alice_sample.epub out --preview --no_prompt`.
- Web app: `uv run python main_ui.py` (http://127.0.0.1:7860).
- Tests: `uv run pytest`. `tests/conftest.py` unsets `CARTESIA_API_KEY` so nothing goes live by accident.
- Lint: `uv run --with ruff ruff check --isolated --select E9,F,B audiobook_generator/core audiobook_generator/tts_providers audiobook_generator/ui tests main.py main_ui.py`.
- Live runs cost about 1 credit per character. Keep them short and write audio outside the repo.

## Files

- `audiobook_generator/tts_providers/cartesia_tts_provider.py`: the only file that calls Cartesia.
- `audiobook_generator/core/cast.py`: speaker detection, voice pool, emotion and laughter cues, `PARAGRAPH_BREAK`.
- `audiobook_generator/core/readalong.py`: `.timings.json` and `.vtt`.
- `audiobook_generator/ui/web_ui.py` and `ui/theme.py`: the Gradio 6 app and its kit-based theme. Theme and CSS go to `launch()`, not `gr.Blocks()`. The log panel is a `gr.Textbox` that a `gr.Timer` refreshes from the log file every second while a run is going. Start turns the timer on; the first tick after the run ends reads the log once more and turns it off.
- `samples/`: the sample EPUB, its source text and a sample cast file. `scripts/make_sample_epub.py` rebuilds the EPUB.
- `readalong.html`: a static page that plays an mp3 with its `.timings.json`. Nothing generates it.

## Rules

- Model: `sonic-3.6` (or its snapshot `sonic-3.6-2026-08-27`). The provider rejects retired ids on purpose; keep that guard. `facts.json` at the repo root lists them.
- The `cartesia` 4.2 client does not read `CARTESIA_API_KEY` itself. The provider reads it and passes `api_key=`, only on first use, so preview mode works without a key.
- Stream `/tts/sse` and join raw PCM. Only the streaming endpoints return word timestamps; do not switch to `/tts/bytes`. Keep `use_normalized_timestamps=False` so read-along words match the book text.
- Paragraphs are separated by `core.cast.PARAGRAPH_BREAK`, not a newline. The EPUB parser collapses whitespace.
- Voices are fixed in `prepare_run` before worker processes start. Never assign voices inside a worker.
- `INPUT_ORDER` in `ui/web_ui.py` must match the parameters of `process_ui_form`. `tests/ui_test.py` checks it.
- Emotion goes only on English dialogue unless the user passes `--cartesia_emotion`. Emotion is a beta model feature.
- Never write a key, a header or a full request to logs, docs or tests. Tests use a fake key and assert it never appears.
- Do not add other speech providers or a Docker path.

## Verify a change

Run the tests and lint above, then a `--preview` run on the sample. For provider changes, also convert one short chapter with a key (`--chapter_start 1 --chapter_end 1`).

## Docs

- https://docs.cartesia.ai/llms.txt
- SSE endpoint: https://docs.cartesia.ai/api-reference/tts/sse.md
- Emotion, speed, volume: https://docs.cartesia.ai/build-with-cartesia/capability-guides/volume-speed-emotion.md
- Skills: `npx skills add cartesia-ai/skills`
