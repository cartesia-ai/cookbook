# Article to podcast: turn any article into a two-host AI podcast

A Next.js app that turns a link or pasted text into a two-host podcast episode. An LLM writes the script, Cartesia Sonic 3.6 text to speech voices every line with two voices, and the page plays one WAV file with a transcript that follows along.

![The finished episode "Sonic Briefing" for an article about libraries lending heat pumps: a player at 0:08 of 2:33 with a Download button, and the script below it with Sam's current line highlighted in green](./docs/screenshot.png)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fcartesia-ai%2Fcookbook%2Ftree%2Fmain%2Fexamples%2Farticle-to-podcast&env=CARTESIA_API_KEY,OPENAI_API_KEY&envDescription=Cartesia%20API%20key%20for%20speech%20and%20an%20OpenAI%20key%20for%20the%20script.%20Anthropic%20and%20the%20AI%20Gateway%20also%20work%2C%20see%20the%20README.&envLink=https%3A%2F%2Fgithub.com%2Fcartesia-ai%2Fcookbook%2Ftree%2Fmain%2Fexamples%2Farticle-to-podcast%23environment-variables&project-name=article-to-podcast&repository-name=article-to-podcast)

## Run it

You need Node 22.13 or newer and pnpm.

```sh
pnpm dlx create-next-app --example https://github.com/cartesia-ai/cookbook/tree/main/examples/article-to-podcast my-podcast
cd my-podcast
cp .env.example .env.local   # add CARTESIA_API_KEY and one LLM key
pnpm dev
```

Open http://localhost:3000, paste a link to an article (or switch to Paste text), leave Length on Short and press Make podcast. A short episode is ready in five to ten seconds. Without keys the page still loads, and a request tells you which variable to set.

## Environment variables

| Name | Required | What it does |
| --- | --- | --- |
| `CARTESIA_API_KEY` | yes | Records the audio. Get one at https://play.cartesia.ai/keys |
| `AI_GATEWAY_API_KEY` | one LLM key | Any model through the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway). Wins if several keys are set |
| `ANTHROPIC_API_KEY` | one LLM key | Anthropic directly. Used if there is no gateway key |
| `OPENAI_API_KEY` | one LLM key | OpenAI directly. Used if neither of the others is set |
| `PODCAST_MODEL` | no | Replaces the model id for the provider that was picked. It never switches provider |
| `CARTESIA_VOICE_HOST_A`, `CARTESIA_VOICE_HOST_B` | no | Voice ids for the two hosts. Defaults are Skylar and Daniel |

The default model ids are in `lib/model.ts`. Providers retire models, so check the provider's model page before you set `PODCAST_MODEL`.

## How it works

```
POST /api/script   link or text -> fetch -> Readability -> generateText + Output.object -> { title, lines }
POST /api/audio    { lines }    -> client.tts.generate per line, 4 at a time -> one WAV + X-Line-Starts header
```

1. `lib/safe-fetch.ts` fetches the page. Because a server fetching user-supplied URLs is an SSRF risk, it blocks private and reserved addresses at the socket lookup, allows only ports 80 and 443, and caps redirects, size (2 MB) and time.
2. `lib/extract.ts` runs Mozilla Readability in jsdom with scripts off. A page with no readable article returns a 422 that asks for pasted text.
3. `lib/script.ts` asks the LLM for the script as JSON. Long articles are split into parts, and each part sees the last six lines of the one before. A normalizer merges same-speaker runs, splits long lines, strips markdown and allows `[laughter]` at most twice.
4. `lib/tts.ts` voices each line with one Sonic 3.6 call. Raw 16-bit PCM makes each line's duration exact, so `lib/wav.ts` can join the lines with short gaps (350 ms on a speaker change, 180 ms otherwise) and return the exact start time of every line for the transcript.

The AI SDK handles the LLM only. Speech goes through `@cartesia/cartesia-js`. This is the call each line makes:

```ts
import Cartesia from "@cartesia/cartesia-js";

const client = new Cartesia({ apiKey: process.env.CARTESIA_API_KEY });

const res = await client.tts.generate({
  model_id: "sonic-3.6",
  transcript: "Welcome to the show. Today we're talking about heat pumps.",
  voice: { mode: "id", id: "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4" },
  language: "en",
  output_format: { container: "raw", encoding: "pcm_s16le", sample_rate: 24000 },
});
const pcm = new Uint8Array(await res.arrayBuffer());
console.log(`${pcm.byteLength / 2 / 24000} seconds of audio`);
```

```
app/api/script/route.ts       fetch, extract, write the script
app/api/audio/route.ts        voice every line, return one WAV
app/_components/studio.tsx    the form and progress steps
app/_components/player.tsx    player and follow-along transcript
lib/safe-fetch.ts             SSRF-safe fetch for user URLs
lib/script.ts, lib/prompt.ts  script generation and the host prompt
lib/tts.ts, lib/wav.ts        Sonic calls and WAV assembly
lib/model.ts                  picks the LLM provider from the keys you set
lib/http.ts                   maps every error to a fixed message
```

## Models and API version

Uses `sonic-3.6` for speech and `Cartesia-Version: 2026-08-14`, which `@cartesia/cartesia-js` 4.2 sends on every request. See https://docs.cartesia.ai/build-with-cartesia/tts-models/latest for current ids and https://docs.cartesia.ai/api-reference/tts/bytes for the endpoint.

## Change it

- Use other voices: pick two at https://play.cartesia.ai/voices and set `CARTESIA_VOICE_HOST_A` and `CARTESIA_VOICE_HOST_B`. The defaults are English voices, so set voices that match the language you pick.
- Change the show: the podcast name, tagline, host roles and dialogue structure are defaults in `lib/config.ts`. The prompt is in `lib/prompt.ts`.
- Use another LLM provider: install its AI SDK package and return its model from `getModel` in `lib/model.ts`. If the model rejects `temperature`, remove `temperature: o.creativity` in `lib/script.ts`.

```ts
import { google } from "@ai-sdk/google";
export function getModel() {
  return google("<model id>");
}
```

## Before you deploy

- There is no auth and no rate limit. Both routes spend money (LLM tokens and Cartesia credits). Add a login and a rate limit to `app/api/script/route.ts` and `app/api/audio/route.ts` first. The routes already cap input size.
- Both routes set `maxDuration = 300`. A script can have up to 120 lines, and recording one that long at 4 lines at a time takes one to two minutes, so a plan with a shorter limit cuts it off.
- A five minute episode is about 14 MB of WAV, and Vercel limits non-streamed function responses to 4.5 MB. The audio route streams the body in chunks, but this has not been tried on a deployment. If it fails there, switch to mp3 or store the file and return a link.
- The fetch guard blocks private addresses at connection time, which covers DNS rebinding. Still restrict outbound network access on the host.

## FAQ

### How do I keep my Cartesia API key out of the browser?

The browser never talks to Cartesia here. It posts the script to `/api/audio`, and only `lib/env.ts` reads `CARTESIA_API_KEY`. If you want the browser to stream speech itself, mint a short-lived token on the server as described in https://docs.cartesia.ai/get-started/authenticate-your-client-applications.

### How long does an episode take?

In two runs on 2026-10-16 with `gpt-5.4-mini`, a Short episode from a 120 word article took about 5 seconds for the script (23 and 25 lines) and 3.5 seconds for two to two and a half minutes of audio. Medium and Long split the article into more LLM calls, which run one after another.

### Why one text to speech call per line instead of one long call?

Each host needs a different voice, and per-line calls give exact durations, which is what keeps the transcript in sync. The cost is that tone does not carry across lines. The short gaps hide most of it.

### What does an episode cost?

Sonic costs about 1 credit per character of script (https://docs.cartesia.ai/pricing, checked 2026-10-16). The audio route rejects scripts over 30,000 characters, so one episode is at most about 30,000 credits, plus the LLM tokens.

### Which languages work?

The Language menu has English, Spanish, French, German, Portuguese, Japanese, Hindi and Korean. The LLM writes in that language and Sonic gets the matching `language` code. The default voices are English, so for the most natural accent set host voices for that language from https://play.cartesia.ai/voices. https://docs.cartesia.ai/build-with-cartesia/capability-guides/multilingual-voices covers how a voice handles other languages.

### Can I do this in Python?

The Sonic call is the same. Start from the [generate speech to a file](https://github.com/cartesia-ai/cookbook/blob/main/content/cookbook/10-python/01-generate-speech-to-file.mdx) recipe and loop over your script lines.

## Tests

```sh
pnpm test        # script normalizer, extraction, safe fetch, WAV, routes, model choice
pnpm typecheck
```

The tests need no keys and no network. They use fake clients and `MockLanguageModelV4` from `ai/test`.

## Learn more

- Recipe: [Article to podcast](https://github.com/cartesia-ai/cookbook/blob/main/content/cookbook/01-next/02-article-to-podcast.mdx)
- Text to speech models: https://docs.cartesia.ai/build-with-cartesia/tts-models/latest
- TTS bytes API: https://docs.cartesia.ai/api-reference/tts/bytes
- Laughter, speed and emotion: https://docs.cartesia.ai/build-with-cartesia/capability-guides/volume-speed-emotion
- Cartesia docs for agents: https://docs.cartesia.ai/llms.txt
- Agent skills: `npx skills add cartesia-ai/skills`

## License

Apache-2.0, like the rest of the [Cartesia cookbook](https://github.com/cartesia-ai/cookbook/blob/main/LICENSE).
