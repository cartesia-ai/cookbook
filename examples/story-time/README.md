# Story time

Writes an interactive bedtime story with an LLM, reads it aloud with Cartesia Sonic 3.6 in a different voice for each character, and lets your child choose what happens next by speaking to Cartesia Ink 2.

![Story time reading scene one of Mia's Star Ride: the first narrator line is read, the word moonlight is highlighted in the second, and Mia's line and the narrator's question are still grey, with a Stop button at the top right](./docs/screenshot.png)

Each story has three short scenes, and the page highlights each word as it is spoken. Nothing is stored on a server, and microphone audio is never recorded.

## Run it

```sh
npx degit cartesia-ai/cookbook/examples/story-time story-time
cd story-time
cp .env.example .env.local
npm install
npm run dev
```

Before `npm run dev`, add `CARTESIA_API_KEY`, `LLM_MODEL` and the matching provider key to `.env.local`. pnpm works too. Node 22.22 or newer.

Open [localhost:3000](http://localhost:3000), type a first name, pick a theme and press Start the story. When the narrator asks what to do, say "the first one", "the rocket", or tap a choice. If a key is missing, the page says which one.

## Environment variables

| Name | Required | Where to get it |
| --- | --- | --- |
| `CARTESIA_API_KEY` | yes | [play.cartesia.ai/keys](https://play.cartesia.ai/keys) |
| `LLM_MODEL` | yes | `provider/model`, for example `openai/gpt-5.4-mini` |
| `OPENAI_API_KEY` | if `LLM_MODEL` starts with `openai/` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `ANTHROPIC_API_KEY` | if `LLM_MODEL` starts with `anthropic/` | [console.anthropic.com](https://console.anthropic.com) |
| `AI_GATEWAY_API_KEY` | for any other provider | [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) |
| `APP_PASSWORD` | on Vercel | Optional locally. Required on Vercel (production and preview): a password for the whole app, or `none` to make it public. |
| `TRUST_PROXY` | no | Set to `1` behind your own reverse proxy so rate limits use the last `X-Forwarded-For` entry. Leave empty on Vercel. |

The model ids above are examples. Providers retire models, so check the provider's model page before you pick one.

## How it works

Open these first:

- `lib/narrate.ts` opens the Sonic WebSocket, one context per line, and schedules the audio.
- `lib/listen.ts` streams the microphone to Ink 2 and waits for the end of the turn.
- `app/api/scene/route.ts` asks the LLM for the next scene and runs the safety checks.

1. `POST /api/scene` sends the hero's name, the theme and the story so far to the LLM with `generateText` and a zod schema (`lib/story.ts`). The model returns 4 to 7 lines, each with a speaker and an emotion, plus two choices (none in the last scene).
2. `POST /api/token` mints a 60 second Cartesia access token with the `tts` and `stt` grants. The browser gets a fresh one for every WebSocket, so `CARTESIA_API_KEY` stays on the server.
3. The browser opens one Sonic WebSocket per scene and one context per line, with that speaker's voice, the line's emotion and `add_timestamps`. Audio chunks are scheduled back to back on a Web Audio clock, and the word timestamps drive the read-along highlight.
4. When the scene ends, the browser streams the microphone to Ink 2 on `/stt/turns/websocket`. On `turn.eager_end` or `turn.end` it matches the words to a choice (`lib/match-choice.ts`). Only the chosen option goes back to the LLM, never what the child said.
5. The story, and the recorded narration with its timestamps, are saved in IndexedDB. Replaying a scene from the library makes no API calls.

```ts
const c = ws.context({
  model_id: "sonic-3.6",
  voice: { mode: "id", id: voiceOf(line.speaker) },
  output_format: { container: "raw", encoding: "pcm_f32le", sample_rate: 24000 },
  language: "en",
  add_timestamps: true,
  use_normalized_timestamps: false,
});
await c.push({
  transcript: spokenText(line.text),
  ...(line.emotion === "neutral" ? {} : { generation_config: { emotion: line.emotion } }),
});
await c.no_more_inputs();
for await (const ev of c.receive()) {
  if (ev.type === "chunk") play(ev.audio);
  else if (ev.type === "timestamps") words.push(...ev.word_timestamps.words);
}
```

```
app/api/scene/route.ts    writes a scene with the LLM, checks the format, the word list and moderation
app/api/token/route.ts    60 second Cartesia token, rate limited
app/story/[id]            the player: read-along, choices, replay
lib/narrate.ts            Sonic WebSocket, scheduling, recording
lib/listen.ts             mic capture and Ink 2 turns
lib/prompt.ts             storyteller and safety rules
lib/store.ts              the only file that touches IndexedDB
```

Uses `sonic-3.6` for narration, `ink-2` for the spoken choice, and `Cartesia-Version: 2026-08-14` (set by `@cartesia/cartesia-js`). See the [TTS models](https://docs.cartesia.ai/build-with-cartesia/tts-models/latest) and [STT models](https://docs.cartesia.ai/build-with-cartesia/stt/latest) pages for current ids. Emotion control is in beta and English only; the voices in `lib/story.ts` are the ones the docs list as the most emotive.

### Keeping it kid-safe

- The only free text on the setup screen is a first name, limited to letters, spaces, hyphens and apostrophes. Themes and ages are presets.
- The system prompt in `lib/prompt.ts` bans violence, romance, real people, brands and frightening content, and tells the model to treat the name as a name only.
- When `OPENAI_API_KEY` is set, the scene route sends the hero name and themes, and then every scene before it is narrated, to OpenAI's moderation endpoint (`omni-moderation-latest`, free to call). This runs whatever `LLM_MODEL` writes the story. A flagged name stops the request with a fixed message. A flagged scene is written again once, then the page says "This story wandered somewhere it shouldn't. Let's start a new one." If the moderation call fails, no scene is sent. Without the key, the setup banner says moderation is off. See the [OpenAI moderation guide](https://platform.openai.com/docs/guides/moderation).
- A short word list in `lib/safety.ts` runs on the name, the title and every scene as a backstop, with or without moderation. It also catches swear words in a name, which the moderation model lets through.
- Speech is matched to a choice in the browser. Ink 2 transcribes it, nothing records it, and the transcript is never sent to the LLM.
- Stories live in the browser that made them. There are no accounts, analytics or server storage.

Moderation and a word list lower the risk; they do not remove it. Before you ship this to the public, test it with your own prompts and read up on COPPA and similar rules where you operate.

## Change it

- Use different voices: edit `VOICES`, `NARRATORS` and `CHARACTER_POOL` in `lib/story.ts`. Pick ids from the [voice library](https://play.cartesia.ai/voices).
- Make longer stories: change `TOTAL_SCENES` in `lib/story.ts`. Each scene costs one LLM call and its narration in Sonic.
- Tell stories in Spanish, French, Hindi or Japanese: Ink 2 and Sonic both speak them. Set `language` in `lib/narrate.ts` and `lib/listen.ts`, add the language to the prompt, and drop `generation_config.emotion`, which is English only.
- Swap the LLM: set `LLM_MODEL`. `lib/llm.ts` is the whole switch.

## Before you deploy

Set `APP_PASSWORD` before you deploy. `proxy.ts` then asks for that password (HTTP Basic auth, any username) on every page and API route. On Vercel (production and preview) the app returns 503 until `APP_PASSWORD` is set, or set to `none` to make the app public. On hosts other than Vercel, set `APP_PASSWORD` yourself, because the gate only enforces it on Vercel. `/api/token` and `/api/scene` also have an in-memory rate limit of 10 requests a minute per client IP. It is per process and only slows casual abuse; the password is the real guard. On Vercel the limiter keys on the client IP. On other hosts every caller shares one bucket, unless the app runs behind a proxy that appends the client IP to `x-forwarded-for` and you set `TRUST_PROXY=1`.

## FAQ

The browser never sees `CARTESIA_API_KEY`. [Browser auth with access tokens](https://github.com/cartesia-ai/cookbook/blob/main/content/cookbook/00-guides/01-browser-auth-with-access-tokens.mdx) explains the token route.

### How do I give each character a different voice?

Open one Sonic WebSocket and create a context per line with that line's voice id. Contexts on one connection are independent, so the narrator, the hero and a talking dragon can alternate without reconnecting. `lib/cast.ts` gives each new speaker the next voice in the pool.

### How does the read-along highlight work?

Sonic sends `timestamps` events with word start times when `add_timestamps` is on. The page knows when each line started on the Web Audio clock, so on every animation frame it finds the word whose start time has passed. `lib/align.ts` maps Sonic's words onto the words on screen.

### Can a child just say the answer?

Yes. Ink 2 detects when they stop talking, so there is no button to hold. "The second one", "number two", "the rocket" and "hop" all work. If the answer is unclear the page says so and keeps listening, and the buttons always work.

### Why does the first scene take a few seconds?

The LLM writes the whole scene before Sonic starts, so a smaller model makes the wait shorter. Narration starts on the first audio chunk, and later lines are generated while earlier ones play.

## Tests

```sh
npm test
```

## Learn more

- [Cartesia docs](https://docs.cartesia.ai)
- [Contexts on the TTS WebSocket](https://docs.cartesia.ai/use-the-api/tts-websocket/contexts)
- [Turn detection with Ink 2](https://docs.cartesia.ai/use-the-api/stt/turns)
- [Volume, speed and emotion](https://docs.cartesia.ai/build-with-cartesia/capability-guides/volume-speed-emotion)
- Agent skills: `npx skills add cartesia-ai/skills`

## License

Apache-2.0, like the rest of the [Cartesia cookbook](https://github.com/cartesia-ai/cookbook/blob/main/LICENSE).
