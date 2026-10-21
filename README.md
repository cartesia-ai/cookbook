# Cartesia cookbook

Templates and recipes for building with Cartesia speech and voice agents: text to speech, speech to text, and Managed Agents you can talk to in the browser or on the phone.

![The voice-chat template mid-call: the agent's answer streams in under a green Speaking badge, above Mute and End call buttons](examples/voice-chat/docs/screenshot.png)

## Templates

Each folder in [`examples/`](examples) installs and runs on its own, with a README, an `.env.example` and an `AGENTS.md` for coding agents.

| Template | What you get | Stack | Setup |
| --- | --- | --- | --- |
| [voice-chat](examples/voice-chat) | Talk to an agent in the browser and interrupt it mid-sentence, with a live transcript | Next.js | Cartesia key |
| [front-desk](examples/front-desk) | An AI receptionist that answers calls, books appointments and logs every call with transcript and latency | Python, FastAPI | Cartesia key, phone number, ngrok (browser calls need only the key) |
| [coding-voice-mode](examples/coding-voice-mode) | Talk to Claude Code, Cursor or Codex through one MCP tool | Python, MCP | Cartesia key, microphone, headphones |
| [pocket-interpreter](examples/pocket-interpreter) | Real-time voice translation between two people on one phone | Next.js, AI SDK | Cartesia + LLM key |
| [audiobook](examples/audiobook) | Turn an EPUB into narrated MP3 chapters, a voice per speaker, with word timestamps | Python, Gradio | Cartesia key, ffmpeg |
| [docs-voice-widget](examples/docs-voice-widget) | A one-script-tag voice widget that answers from your docs, cites the page and scrolls to the section | Hono, Node, web component | Cartesia key (OpenAI key optional) |
| [speaking-partner](examples/speaking-partner) | Practice a language out loud in role plays, with written corrections after every line | Next.js, AI SDK | Cartesia key (LLM key for corrections) |
| [article-to-podcast](examples/article-to-podcast) | Paste a link and get a two-host episode with a transcript that follows along | Next.js, AI SDK | Cartesia + LLM key |
| [meeting-notes](examples/meeting-notes) | Record or upload a meeting, get a transcript, summary, decisions and action items | Next.js, AI SDK | Cartesia + LLM key |
| [voice-journal](examples/voice-journal) | A voice diary for iOS, Android and the web that reads a weekly recap aloud | Expo, React Native | Cartesia + LLM key |
| [story-time](examples/story-time) | An interactive story read aloud with a voice per character and word highlighting, where you choose what happens next | Next.js, AI SDK | Cartesia + LLM key |

Get a Cartesia key at [play.cartesia.ai/keys](https://play.cartesia.ai/keys). To start from one template:

```sh
npx degit cartesia-ai/cookbook/examples/voice-chat voice-chat
cd voice-chat
cp .env.example .env.local   # add CARTESIA_API_KEY
npm install
npm run setup:agent          # creates the agent and writes CARTESIA_AGENT_ID to .env.local
npm run dev
```

pnpm works too. Each template's README has its exact steps. [`templates.json`](templates.json) lists every template with its env vars, models, features, Cartesia APIs and deploy link.

## Recipes

Short guides with working code live in [`content/cookbook`](content/cookbook), and [`llms.txt`](llms.txt) lists all of them. Good places to start:

- [Use Cartesia from the browser without exposing your API key](content/cookbook/00-guides/01-browser-auth-with-access-tokens.mdx)
- [Stream text to speech in Next.js](content/cookbook/01-next/01-stream-speech.mdx)
- [Stream speech to text in real time with Ink 2](content/cookbook/05-node/04-real-time-speech-to-text.mdx)
- [Get word timestamps from Sonic text to speech](content/cookbook/05-node/03-word-timestamps.mdx)
- [Connect to a Cartesia Managed Agent from the browser](content/cookbook/15-agents/01-talk-to-a-managed-agent.mdx)
- [Clone a voice from a short recording in Python](content/cookbook/10-python/03-clone-a-voice.mdx)

## Quickstart: text to speech

Put your key in `CARTESIA_API_KEY`. Both scripts write `hello.wav`.

TypeScript, after `npm install @cartesia/cartesia-js`:

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

Run it with `npx tsx speak.mts`. The `.mts` extension matters, because top-level `await` needs an ES module.

Python, after `pip install cartesia` or `uv add cartesia`:

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

## Current models

- Text to speech: `sonic-3.6`
- Streaming speech to text with turn detection: `ink-2`
- File (batch) speech to text: `ink-whisper`

The API version header is `Cartesia-Version: 2026-08-14`. [`facts.json`](facts.json) holds these values and CI fails when a file drifts from it. Retired ids and sunset dates are in [CONTRIBUTING.md](CONTRIBUTING.md#current-models-and-api-version).

## Keep the API key on the server

`CARTESIA_API_KEY` never reaches a browser or a mobile bundle in any template. Templates that stream from the browser get a 60 second access token from a server route and open their WebSocket with it. The others call Cartesia only from server routes. See [Browser auth with access tokens](content/cookbook/00-guides/01-browser-auth-with-access-tokens.mdx) and [Authenticate your applications](https://docs.cartesia.ai/get-started/authenticate-your-client-applications).

## For coding agents

[`AGENTS.md`](AGENTS.md) has the repo rules and a docs index. [`llms.txt`](llms.txt) lists every template and recipe with raw links. Cartesia's docs are also available as Markdown at [docs.cartesia.ai/llms.txt](https://docs.cartesia.ai/llms.txt), and the Cartesia skills install with `npx skills add cartesia-ai/skills`.

## Also from Cartesia

- [InkIt](https://github.com/cartesia-ai/InkIt), a macOS dictation app built on Ink
- [cartesia-js](https://github.com/cartesia-ai/cartesia-js) and [cartesia-python](https://github.com/cartesia-ai/cartesia-python), the official SDKs
- [line](https://github.com/cartesia-ai/line), the Line SDK for writing voice agents in code

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the repo layout, how templates share code, and the checks to run before a pull request.

## Your users' data

The templates send your users' audio and text to Cartesia and to the LLM provider you configure (OpenAI, Anthropic or Vercel AI Gateway). Managed Agents record the audio and transcript of every agent call by default. Delete a call's recording with `DELETE /agents/calls/{id}`, and see the [observability docs](https://docs.cartesia.ai/line/infrastructure/observability) for recording and retention controls. If you deploy one of these apps for other people, you need your own privacy notice and terms, and consent where the law requires it.

Two templates also send text to OpenAI when `OPENAI_API_KEY` is set. story-time sends the story settings and each scene to OpenAI's moderation endpoint, and docs-voice-widget sends your docs at ingest and every search query to OpenAI embeddings.

## Thanks

Several templates started from ideas in these open source projects:

| Template | Builds on |
|-|-|
| [audiobook](examples/audiobook) | [p0n1/epub_to_audiobook](https://github.com/p0n1/epub_to_audiobook) (forked) |
| [article-to-podcast](examples/article-to-podcast) | [souzatharsis/podcastfy](https://github.com/souzatharsis/podcastfy) |
| [coding-voice-mode](examples/coding-voice-mode) | [mbailey/voicemode](https://github.com/mbailey/voicemode) |
| [docs-voice-widget](examples/docs-voice-widget) | [livekit-examples/agent-starter-embed](https://github.com/livekit-examples/agent-starter-embed) and [supabase-community/nextjs-openai-doc-search](https://github.com/supabase-community/nextjs-openai-doc-search) |
| [front-desk](examples/front-desk) | [cartesia-ai/line](https://github.com/cartesia-ai/line/tree/main/examples/form_filler) form filler and [twilio-samples/speech-assistant-openai-realtime-api-python](https://github.com/twilio-samples/speech-assistant-openai-realtime-api-python) |
| [meeting-notes](examples/meeting-notes) | [Nutlope/notesGPT](https://github.com/Nutlope/notesGPT) |
| [pocket-interpreter](examples/pocket-interpreter) | [phuc-nt/my-translator](https://github.com/phuc-nt/my-translator) |
| [speaking-partner](examples/speaking-partner) | [ZackAkil/immersive-language-learning-with-live-api](https://github.com/ZackAkil/immersive-language-learning-with-live-api) |
| [story-time](examples/story-time) | [pipecat-ai/pipecat-examples](https://github.com/pipecat-ai/pipecat-examples/tree/main/storytelling-chatbot) storytelling chatbot |
| [voice-chat](examples/voice-chat) | [livekit-examples/agent-starter-react](https://github.com/livekit-examples/agent-starter-react) |
| [voice-journal](examples/voice-journal) | [ikhare/just-speak](https://github.com/ikhare/just-speak) |

The UI is [shadcn/ui](https://ui.shadcn.com), the icons are [Lucide](https://lucide.dev), and the repo layout follows the cookbook in [vercel/ai](https://github.com/vercel/ai).

## License

These templates are examples, not production software. They are provided as is under Apache-2.0. You are responsible for privacy, consent, recording and AI-disclosure laws where you deploy.

Apache-2.0, see [LICENSE](LICENSE). Two exceptions keep their upstream MIT license: [`examples/audiobook`](examples/audiobook) is a fork of [p0n1/epub_to_audiobook](https://github.com/p0n1/epub_to_audiobook), and the UI components in `components/ui` and `packages/kit/components/ui` come from [shadcn/ui](https://ui.shadcn.com) (MIT, Copyright (c) 2023 shadcn).

Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Vercel and Next.js are trademarks of Vercel, Inc. Other product names are trademarks of their owners. Their use here does not imply affiliation or endorsement.
