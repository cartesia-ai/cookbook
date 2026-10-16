# Cartesia cookbook: voice AI app templates and recipes

Runnable templates and recipes for Cartesia: Sonic text to speech, Ink speech to text and voice agents in Next.js, Python, Node and Expo. Each template runs with a Cartesia API key, keeps that key on the server, and uses the current models (`sonic-3.6`, `ink-2`, `ink-whisper`).

There are 11 templates in [`examples/`](examples) and short written recipes in [`content/cookbook/`](content/cookbook). Every template has its own README with a one-command clone, an `.env.example`, and an `AGENTS.md` for coding agents.

## Templates

### Voice agents

| Template | What you get | Stack | Cartesia APIs |
| --- | --- | --- | --- |
| [voice-chat](examples/voice-chat) | Talk to an agent in the browser and interrupt it mid-sentence, with a live transcript | Next.js, TypeScript | Managed Agents WebSocket, Agents API, access tokens |
| [speaking-partner](examples/speaking-partner) | Practice a language out loud in role plays, with written corrections after every line | Next.js, TypeScript, AI SDK | Managed Agents WebSocket, Agents API, client tools, access tokens |
| [docs-voice-widget](examples/docs-voice-widget) | A one-script-tag voice widget that answers from your docs, cites the page and scrolls to the section | Hono, Node, web component | Managed Agents WebSocket, client tools, access tokens |
| [coding-voice-mode](examples/coding-voice-mode) | Talk to Claude Code, Cursor or Codex through one MCP tool | Python, MCP | Sonic over SSE, Ink 2 streaming STT with turn detection |

### Speech generation

| Template | What you get | Stack | Cartesia APIs |
| --- | --- | --- | --- |
| [article-to-podcast](examples/article-to-podcast) | Paste a link and get a two-host episode with a transcript that follows along | Next.js, TypeScript, AI SDK | Sonic TTS bytes |
| [audiobook](examples/audiobook) | Turn an EPUB into narrated MP3 chapters, a voice per speaker, with word timestamps | Python, Gradio | Sonic over SSE with timestamps |
| [story-time](examples/story-time) | An interactive bedtime story read aloud with a voice per character and word highlighting | Next.js, TypeScript, AI SDK | Sonic WebSocket contexts, Ink 2 streaming STT, access tokens |

### Transcription and translation

| Template | What you get | Stack | Cartesia APIs |
| --- | --- | --- | --- |
| [meeting-notes](examples/meeting-notes) | Record or upload a meeting, get a transcript, summary, decisions and action items | Next.js, TypeScript, AI SDK | Ink batch STT (`ink-whisper`) |
| [pocket-interpreter](examples/pocket-interpreter) | Real-time voice translation between two people on one phone | Next.js, TypeScript, AI SDK | Ink 2 streaming STT, Sonic WebSocket, access tokens |

### Telephony

| Template | What you get | Stack | Cartesia APIs |
| --- | --- | --- | --- |
| [front-desk](examples/front-desk) | An AI receptionist that answers calls, books appointments and logs every call with transcript and latency | Python, FastAPI | Managed Agents, webhook and client tools, call webhooks, Calls API, phone numbers |

### Mobile

| Template | What you get | Stack | Cartesia APIs |
| --- | --- | --- | --- |
| [voice-journal](examples/voice-journal) | A voice diary for iOS, Android and the web that reads a weekly recap aloud | Expo, React Native, TypeScript | Ink batch STT, Sonic TTS bytes |

The same list, with env vars, models, search phrases and deploy links, is in [`templates.json`](templates.json).

## Find a template by task

- Build a voice agent in Next.js that you can interrupt: [voice-chat](examples/voice-chat)
- Add a voice assistant to a documentation site: [docs-voice-widget](examples/docs-voice-widget)
- Build an AI receptionist that answers phone calls and books appointments: [front-desk](examples/front-desk)
- Talk to Claude Code or Cursor with your voice: [coding-voice-mode](examples/coding-voice-mode)
- Build a language learning app for speaking practice: [speaking-partner](examples/speaking-partner)
- Turn a blog post or article into a podcast: [article-to-podcast](examples/article-to-podcast)
- Convert an EPUB ebook into an audiobook with different voices: [audiobook](examples/audiobook)
- Read a story aloud with a different voice per character and highlight each word: [story-time](examples/story-time)
- Transcribe a meeting recording and pull out action items: [meeting-notes](examples/meeting-notes)
- Translate a conversation in real time, speech to speech: [pocket-interpreter](examples/pocket-interpreter)
- Add speech to text and text to speech to an Expo or React Native app: [voice-journal](examples/voice-journal)
- Stream speech to text with turn detection in the browser: [pocket-interpreter](examples/pocket-interpreter) and [story-time](examples/story-time)
- Generate speech to a WAV file from a script: [Node recipe](content/cookbook/05-node/01-generate-speech-to-file.mdx) or [Python recipe](content/cookbook/10-python/01-generate-speech-to-file.mdx)
- Stream text to speech through a Next.js route handler: [Stream speech in Next.js](content/cookbook/01-next/01-stream-speech.mdx)
- Use Cartesia from the browser without exposing the API key: [Browser auth with access tokens](content/cookbook/00-guides/01-browser-auth-with-access-tokens.mdx)

## Quickstart: text to speech with Sonic 3.6

Get an API key at [play.cartesia.ai/keys](https://play.cartesia.ai/keys) and put it in `CARTESIA_API_KEY`. Both scripts write `hello.wav`.

TypeScript, with `pnpm add @cartesia/cartesia-js`:

```ts
import { writeFile } from "node:fs/promises";
import Cartesia from "@cartesia/cartesia-js";

const client = new Cartesia({ apiKey: process.env.CARTESIA_API_KEY });

const response = await client.tts.generate({
  model_id: "sonic-3.6",
  transcript: "Hello from Cartesia.",
  voice: { mode: "id", id: "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4" },
  output_format: { container: "wav", encoding: "pcm_s16le", sample_rate: 44100 },
});

await writeFile("hello.wav", Buffer.from(await response.arrayBuffer()));
```

Run it with `pnpm dlx tsx speak.mts`. The `.mts` extension matters, because top-level `await` needs an ES module.

Python, with `pip install cartesia` or `uv add cartesia`:

```python
import os

from cartesia import Cartesia

client = Cartesia(api_key=os.environ["CARTESIA_API_KEY"])

response = client.tts.generate(
    model_id="sonic-3.6",
    transcript="Hello from Cartesia.",
    voice={"mode": "id", "id": "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4"},
    output_format={"container": "wav", "encoding": "pcm_s16le", "sample_rate": 44100},
)

response.write_to_file("hello.wav")
```

Run it with `python speak.py`. Pass the key explicitly, because the 4.x Python client does not read it from the environment. Both SDKs send the `Cartesia-Version` header for you. The voice id is a stock English voice (Skylar). Browse others at [play.cartesia.ai/voices](https://play.cartesia.ai/voices).

Both snippets were run against the live API with `@cartesia/cartesia-js` 4.2.0 and `cartesia` 4.2.0 on 2026-10-16.

## Current models and API version

[`facts.json`](facts.json) holds these values, and `pnpm check:facts` fails CI when any file in the repo drifts from it.

| Use | Model id | Notes |
| --- | --- | --- |
| Text to speech | `sonic-3.6` | Pinned snapshot `sonic-3.6-2026-08-27` |
| Streaming speech to text with turn detection | `ink-2` | English, Spanish, French, Hindi and Japanese |
| File (batch) speech to text | `ink-whisper` | `ink-2` does not work on the batch endpoint |
| API version header | `Cartesia-Version: 2026-08-14` | The SDKs set it |

Do not use older ids. `sonic`, `sonic-english` and `sonic-multilingual` were sunset on 2026-06-01 and return a `model_sunsetted` error. `sonic-2`, `sonic-turbo` and `sonic-3-2025-10-27` stop working on 2026-10-20. The aliases `sonic-latest` and `sonic-3-latest` are deprecated. <!-- allow-model-id -->

Check the current lists at [Sonic 3.6](https://docs.cartesia.ai/build-with-cartesia/tts-models/latest), [Ink 2](https://docs.cartesia.ai/build-with-cartesia/stt/latest) and [deprecated models](https://docs.cartesia.ai/build-with-cartesia/tts-models/api-changes).

## Keep the API key on the server

`CARTESIA_API_KEY` never reaches a browser or a mobile bundle in any template. Browser templates call a server route that mints an access token with `client.accessToken.create({ grants, expires_in: 60 })`, and the page opens its WebSocket with that token. The grants are the narrowest that work: `agent` for Managed Agents, `tts` and `stt` for direct speech. Templates that only call Cartesia from server routes (meeting-notes, article-to-podcast, voice-journal) skip tokens. See [Browser auth with access tokens](content/cookbook/00-guides/01-browser-auth-with-access-tokens.mdx) and [Authenticate your applications](https://docs.cartesia.ai/get-started/authenticate-your-client-applications).

## Recipes

Recipes are short guides with working code. Each section has an `index.mdx`.

- [Guides](content/cookbook/00-guides/index.mdx): [Use Cartesia from the browser without exposing your API key](content/cookbook/00-guides/01-browser-auth-with-access-tokens.mdx)
- [Next.js](content/cookbook/01-next/index.mdx): [Stream text to speech in Next.js](content/cookbook/01-next/01-stream-speech.mdx), [Turn an article into a podcast in Next.js](content/cookbook/01-next/02-article-to-podcast.mdx), [Transcribe and summarize meetings in Next.js](content/cookbook/01-next/20-transcribe-and-summarize-meetings.mdx), [Narrate a story with a different voice per character and highlight each word](content/cookbook/01-next/30-multi-voice-narration-with-word-timestamps.mdx), [Build a real-time two-way voice translator with Ink 2 and Sonic](content/cookbook/01-next/40-real-time-voice-translation.mdx)
- [Node.js](content/cookbook/05-node/index.mdx): [Convert text to speech and save a WAV file in Node](content/cookbook/05-node/01-generate-speech-to-file.mdx), [Stream text to speech from an LLM token stream](content/cookbook/05-node/02-stream-llm-text-to-speech.mdx), [Get word timestamps from Sonic text to speech](content/cookbook/05-node/03-word-timestamps.mdx), [Stream speech to text in real time with Ink 2](content/cookbook/05-node/04-real-time-speech-to-text.mdx)
- [Python](content/cookbook/10-python/index.mdx): [Convert text to speech and save a WAV file in Python](content/cookbook/10-python/01-generate-speech-to-file.mdx), [Transcribe an audio file with ink-whisper in Python](content/cookbook/10-python/02-transcribe-an-audio-file.mdx), [Clone a voice from a short recording in Python](content/cookbook/10-python/03-clone-a-voice.mdx), [Add voice mode to Claude Code, Cursor or Codex](content/cookbook/10-python/05-voice-mode-for-coding-agents.mdx), [Turn an EPUB ebook into an audiobook with Python](content/cookbook/10-python/10-ebook-to-audiobook.mdx)
- [Agents](content/cookbook/15-agents/index.mdx): [Connect to a Cartesia Managed Agent from the browser](content/cookbook/15-agents/01-talk-to-a-managed-agent.mdx), [Build a browser voice chat with a Managed Agent](content/cookbook/15-agents/02-voice-chat.mdx), [Build an AI language speaking partner with a Managed Agent](content/cookbook/15-agents/03-speaking-partner.mdx), [Add voice search to your docs with a Managed Agent and client tools](content/cookbook/15-agents/04-voice-search-for-your-docs.mdx)
- [Telephony](content/cookbook/20-telephony/index.mdx): [Build an AI receptionist that answers the phone and books appointments](content/cookbook/20-telephony/01-ai-receptionist-that-books-appointments.mdx)
- [Mobile](content/cookbook/25-mobile/index.mdx): [Record and transcribe voice notes in an Expo app with ink-whisper](content/cookbook/25-mobile/01-voice-notes-in-expo.mdx)

## How the templates share code

Each template installs and builds on its own. Nothing imports from `packages/` at runtime. Shared code is copied in, so you can clone one folder and own all of it.

- [`packages/kit`](packages/kit) is the design kit: [shadcn/ui](https://ui.shadcn.com) components recolored through the CSS variables in `theme.css` (Verdant green primary, light and dark, Inter), plus layout and form blocks. [`DESIGN.md`](packages/kit/DESIGN.md) sets the rules every screen follows. Next.js templates copy the components into `components/ui` and `components/blocks`. The others carry the same tokens in their own form: hand-written CSS in docs-voice-widget and front-desk, a Gradio theme in audiobook, and React Native components in voice-journal.
- [`packages/agents-web`](packages/agents-web) is a small browser client for the Managed Agents WebSocket. It mints nothing itself: you pass a `getToken` function. It captures the microphone with an AudioWorklet, plays agent audio through a jitter buffer, drops it on barge-in, and answers client tool calls. voice-chat and speaking-partner copy it to `lib/agents-web`, docs-voice-widget to `widget/src/agents-web`, and front-desk ships it as a bundled `static/vendor/agents-web.js`. Fix bugs in the package first, then copy.

## Repo layout

```
examples/<name>/      runnable templates, one folder each
content/cookbook/     recipes, NN-section/NN-recipe.mdx
packages/kit/         shared UI kit and design rules
packages/agents-web/  browser client for Managed Agents
tools/                checks for facts.json drift and the recipe tree
facts.json            current model ids and API version
templates.json        machine-readable template catalog
llms.txt              index for agents and docs tools
```

To work on the repo itself you need Node 22.13 or newer and pnpm 10:

```sh
pnpm install
pnpm check         # facts, recipes, typecheck, tests
```

## For coding agents

[`AGENTS.md`](AGENTS.md) has the repo rules and a docs index. [`llms.txt`](llms.txt) lists every template and recipe with raw links. Cartesia's docs are also available as Markdown: [docs.cartesia.ai/llms.txt](https://docs.cartesia.ai/llms.txt), and the Cartesia skills install with `npx skills add cartesia-ai/skills`.

## Also from Cartesia

- [InkIt](https://github.com/cartesia-ai/InkIt), a macOS dictation app built on Ink
- [cartesia-js](https://github.com/cartesia-ai/cartesia-js) and [cartesia-python](https://github.com/cartesia-ai/cartesia-python), the official SDKs
- [line](https://github.com/cartesia-ai/line), the Line SDK for writing voice agents in code

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Run `pnpm check` before you open a pull request.

## License

Apache-2.0, see [LICENSE](LICENSE). Two exceptions keep their upstream MIT license: [`examples/audiobook`](examples/audiobook) is a fork of [p0n1/epub_to_audiobook](https://github.com/p0n1/epub_to_audiobook), and the UI components in `components/ui` and `packages/kit/components/ui` come from [shadcn/ui](https://ui.shadcn.com) (MIT, Copyright (c) 2023 shadcn).
