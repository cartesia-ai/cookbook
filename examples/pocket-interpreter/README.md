# Pocket interpreter

Two people who don't share a language talk through one phone: Cartesia Ink 2 streams each turn to text, an LLM translates it, and Cartesia Sonic 3.6 speaks it in the other language.

![A phone-width screen split in two. The top half, turned upside down for the person across the table, shows the conversation in Spanish. The bottom half shows it in English, with "heard, translated 0.53 s, speaking 1.17 s" under the translated turn.](./docs/screenshot-phone.png)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fcartesia-ai%2Fcookbook%2Ftree%2Fmain%2Fexamples%2Fpocket-interpreter&env=CARTESIA_API_KEY%2CLLM_MODEL%2COPENAI_API_KEY%2CAPP_PASSWORD&envDescription=Your%20Cartesia%20API%20key%2C%20LLM_MODEL%20as%20provider%2Fmodel%20%28for%20example%20openai%2Fgpt-5.4-mini%29%2C%20and%20the%20key%20for%20that%20provider.&envLink=https%3A%2F%2Fplay.cartesia.ai%2Fkeys&project-name=pocket-interpreter&repository-name=pocket-interpreter)

The screen splits in two so each person reads the conversation in their own language, and one half can turn upside down for a phone lying flat between you. Languages: English, Spanish, French, Hindi and Japanese, any two of them. These are the five languages Ink 2 streams today.

## Run it

```sh
npx degit cartesia-ai/cookbook/examples/pocket-interpreter pocket-interpreter
cd pocket-interpreter
cp .env.example .env.local
npm install
npm run dev
```

Before `npm run dev`, add `CARTESIA_API_KEY`, `LLM_MODEL` and the matching provider key to `.env.local`. pnpm works too. Node 22.22 or newer.

Open http://localhost:3000, pick the two languages, press Start talking and say something. If a key is missing, the page says which one. A phone needs HTTPS for the microphone, so to try it on one, deploy it or use a tunnel such as `cloudflared tunnel --url http://localhost:3000`.

## Environment variables

| Name | Required | Where to get it |
| --- | --- | --- |
| `CARTESIA_API_KEY` | yes | https://play.cartesia.ai/keys |
| `LLM_MODEL` | yes | `provider/model`, for example `openai/gpt-5.4-mini` or `anthropic/claude-haiku-4-5` |
| `OPENAI_API_KEY` | if `LLM_MODEL` starts with `openai/` | https://platform.openai.com/api-keys |
| `ANTHROPIC_API_KEY` | if `LLM_MODEL` starts with `anthropic/` | https://console.anthropic.com |
| `AI_GATEWAY_API_KEY` | for any other provider | https://vercel.com/docs/ai-gateway |
| `APP_PASSWORD` | on Vercel | Optional locally. Required on Vercel (production and preview): a password for the whole app, or `none` to make it public. |
| `TRUST_PROXY` | no | Set to `1` behind your own reverse proxy so rate limits use the last `X-Forwarded-For` entry. Leave empty on Vercel. |

Those model ids are examples. Providers retire models, so check the provider's model page first.

## How it works

Open these first:

- `lib/audio/listener.ts` opens the Ink 2 turns WebSocket in the browser.
- `lib/translate-route.ts` streams the language code and the translation from the LLM.
- `lib/interpreter.ts` runs the turn loop: Ink 2 turns in, translation, Sonic out, latency.

1. Start talking calls `POST /api/token`. The route uses `CARTESIA_API_KEY` to mint a 60 second access token with the `stt` and `tts` grants and nothing else. The key never reaches the browser.
2. The browser opens two WebSockets with that token: Ink 2 on `/stt/turns/websocket` for the microphone, and Sonic for speech. A sixty second token is enough because each socket only needs it to connect. If a socket closes later, the page asks for a new token.
3. Ink 2 sends `turn.start`, `turn.update` (the live caption), `turn.eager_end` and `turn.end`. On `turn.eager_end` the page already asks `POST /api/translate` for a translation. If `turn.end` arrives with the same words, that request is reused, which saves most of the LLM's time to first token. If the speaker keeps going (`turn.resume`), the request is cancelled.
4. Ink 2 detects the language on its own but does not report it, so `/api/translate` does both jobs in one streamed reply: the language code of the turn on the first line, the translation after it. The code says who spoke, and that decides which voice and which side of the screen.
5. Sentences go to Sonic 3.6 while the LLM is still writing, in a voice made for the target language. Audio is played with Web Audio as chunks arrive.
6. While a translation plays, the microphone sends silence to Ink 2. Otherwise the app would hear its own voice and translate it back, forever.

Under each translated turn, a small line shows the time from the end of the turn to the first translated word, then to the first audio. Use it to compare models on your own network.

The Ink 2 connection in the browser, from `lib/audio/listener.ts`:

```ts
import Cartesia from "@cartesia/cartesia-js";

const client = new Cartesia({ token });
const ws = client.stt.autoFinalize.websocket({
  model: "ink-2",
  encoding: "pcm_f32le",
  sample_rate: audioCtx.sampleRate,
});
for await (const event of ws.stream()) {
  if (event.type !== "message") continue;
  if (event.message.type === "turn.end") onTurnEnd(event.message.transcript);
}
```

The streaming part of the translate route, from `lib/translate-route.ts`. `translatePrompt` asks for the language code on the first line. The page cancels a speculative translation by aborting its fetch, and `abortSignal` passes that on to the LLM.

```ts
import { streamText } from "ai";

const result = streamText({
  model,
  system: translatePrompt(pair),
  prompt: text,
  maxOutputTokens: 600,
  abortSignal: req.signal,
});
return result.toTextStreamResponse();
```

```
app/api/token        mints the 60 second browser token
app/api/translate    streams "<code>\n<translation>" from the LLM
app/api/health       booleans for the setup banner
proxy.ts             optional password for the whole app
lib/interpreter.ts   the turn loop: Ink 2 turns in, translation, Sonic out, latency
lib/audio/           mic capture with the mute gate, Ink 2 listener, Sonic speaker
lib/languages.ts     the five languages, their voices, and each side's words
components/          setup form and the split conversation
```

![The desktop layout: English on the left and Spanish on the right, with the status, larger-text, Flip and End controls above.](./docs/screenshot.png)

Uses `ink-2` for streaming speech to text, `sonic-3.6` for speech, and `Cartesia-Version: 2026-08-14` (the SDK sends it). See https://docs.cartesia.ai/build-with-cartesia/stt/latest and https://docs.cartesia.ai/build-with-cartesia/tts-models/latest for current ids.

## Change it

- Use a different voice: change `VOICES` in `lib/languages.ts`. Pick one from https://play.cartesia.ai/voices whose language is the target language, or use your own clone, only with the speaker's permission.
- Change the words on each side: `COPY` in `lib/languages.ts`.
- Swap the LLM: set `LLM_MODEL`. `lib/llm.ts` is the whole switch.
- Change how the model translates (formal or casual, keep units): edit `lib/prompt.ts`. Keep the first-line language code, the parser in `lib/translation.ts` depends on it.
- Tune turn detection: pass `turn_end_threshold` or `turn_end_timeout_ms` to the websocket call in `lib/audio/listener.ts`. See https://docs.cartesia.ai/use-the-api/stt/turns.

## Before you deploy

Set `APP_PASSWORD`. `proxy.ts` then asks for that password (HTTP Basic auth, any username) on every page and API route. On Vercel (production and preview) the app returns 503 until `APP_PASSWORD` is set, or set to `none` to make the app public. On hosts other than Vercel, set `APP_PASSWORD` yourself, because the gate only enforces it on Vercel.

`/api/token` and `/api/translate` also have an in-memory rate limit of 10 requests a minute per client IP. It is per process and only slows casual abuse; the password is the real guard. On Vercel the limiter keys on the client IP. On other hosts every caller shares one bucket, unless the app runs behind a proxy that appends the client IP to `x-forwarded-for` and you set `TRUST_PROXY=1`.

A session costs Ink 2 time while the microphone is open, one LLM call per turn, and Sonic characters for each translation. See https://docs.cartesia.ai/pricing and your LLM provider's pricing page.

## FAQ

The browser never sees `CARTESIA_API_KEY`. [Browser auth with access tokens](https://github.com/cartesia-ai/cookbook/blob/main/content/cookbook/00-guides/01-browser-auth-with-access-tokens.mdx) explains the token route.

### Can both people talk at the same time?

No. There is one microphone, and the app handles one turn at a time. While a translation plays, the microphone is muted for Ink 2, so wait for it to finish. Ink 2 can tell a pause from the end of a sentence, so you don't need to press anything between turns.

### Why only five languages?

Ink 2 streams English, Spanish, French, Hindi and Japanese. Sonic speaks more, so if you only need the voice side in another language, the speaker in `lib/audio/speaker.ts` already takes any Sonic language code.

### Does it work on a phone?

Yes, the layout is built for a phone first. Browsers only allow the microphone on HTTPS or localhost, so serve it over HTTPS. It was tested in desktop Chrome with a recorded voice as the microphone, not on a real phone.

### Does it need headphones?

No. The app mutes its own input while it speaks, plus 0.35 seconds for the echo. In a loud room, background voices can still start a stray turn.

## Tests

```sh
npm test
```

## Learn more

- Cartesia docs: https://docs.cartesia.ai
- Ink 2 turn events: https://docs.cartesia.ai/use-the-api/stt/turns
- Agent skills: `npx skills add cartesia-ai/skills`

## License

Apache-2.0, like the rest of the [Cartesia cookbook](https://github.com/cartesia-ai/cookbook/blob/main/LICENSE).
