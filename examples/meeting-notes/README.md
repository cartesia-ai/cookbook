# Meeting notes: an AI meeting notes app that transcribes and summarizes recordings

A Next.js app that records or uploads a meeting, transcribes it with Cartesia Ink speech to text (`ink-whisper`), and asks an LLM for a title, a summary, the decisions and a list of action items with owners. Meetings are saved in your browser, so there is no database, no login and nothing to set up besides two environment variables.

![Notes for a 15 second meeting called Pricing sync: a three sentence summary, two decisions, and three open action items with Priya and Marcus named as owners, next to Notes and Transcript tabs and a Copy as Markdown button](./docs/screenshot.png)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fcartesia-ai%2Fcookbook%2Ftree%2Fmain%2Fexamples%2Fmeeting-notes&env=CARTESIA_API_KEY,LLM_MODEL&envDescription=Cartesia%20API%20key%20and%20an%20LLM%20as%20provider%2Fmodel%2C%20for%20example%20openai%2Fgpt-5.4-mini&envLink=https%3A%2F%2Fgithub.com%2Fcartesia-ai%2Fcookbook%2Ftree%2Fmain%2Fexamples%2Fmeeting-notes%23environment-variables&project-name=meeting-notes&repository-name=meeting-notes)

## Run it

You need Node 22.13 or newer and pnpm.

```sh
pnpm dlx create-next-app --example https://github.com/cartesia-ai/cookbook/tree/main/examples/meeting-notes my-meeting-notes
cd my-meeting-notes
cp .env.example .env.local   # add CARTESIA_API_KEY, LLM_MODEL and the matching LLM key
pnpm dev
```

Open http://localhost:3000, press Start recording and talk for a few seconds, then press Stop and write notes. Or switch to Upload, choose an audio file and press Write notes. If a key is missing, the page says which one.

## Environment variables

| Name | Required | Where to get it |
| --- | --- | --- |
| `CARTESIA_API_KEY` | yes | https://play.cartesia.ai/keys |
| `LLM_MODEL` | yes | `provider/model`, for example `openai/gpt-5.4-mini` or `anthropic/claude-haiku-4-5` |
| `OPENAI_API_KEY` | if `LLM_MODEL` starts with `openai/` | https://platform.openai.com/api-keys |
| `ANTHROPIC_API_KEY` | if `LLM_MODEL` starts with `anthropic/` | https://console.anthropic.com |
| `AI_GATEWAY_API_KEY` | for any other provider | https://vercel.com/docs/ai-gateway |

The model ids are examples. Providers retire models, so check the provider's model page before you pick one. On Vercel, a model with no matching direct key goes through the AI Gateway without `AI_GATEWAY_API_KEY`, because the deployment authenticates to it for you.

## How it works

1. The browser records with `MediaRecorder` (24 kbps Opus) or takes an uploaded file, and posts it to `POST /api/transcribe` with the language you picked.
2. The route calls `client.stt.transcribe` with `model: "ink-whisper"` and returns the text and duration. The page saves the transcript to IndexedDB right away.
3. The page posts the transcript to `POST /api/summarize`, which calls the AI SDK's `generateText` with `Output.object` and the zod schema in `lib/schema.ts`.
4. The page saves the notes. If the summary fails, the meeting keeps its transcript and shows a Retry button.

`CARTESIA_API_KEY` is read only in `lib/cartesia.ts` and stays on the server. Audio is never stored: the route transcribes it and drops it. In a run on 2026-10-16, a 15 second clip took 0.4 seconds to transcribe and 1.8 seconds to summarize with `openai/gpt-5.4-mini`.

```ts
import Cartesia from '@cartesia/cartesia-js';

const client = new Cartesia({ apiKey: process.env.CARTESIA_API_KEY });

const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_BYTES) {
    return Response.json({ error: 'Send an audio file under 4 MB' }, { status: 400 });
  }

  try {
    const res = await client.stt.transcribe({
      file,
      model: 'ink-whisper',
      language: 'en',
    });
    return Response.json({ transcript: res.text, duration: res.duration });
  } catch (err) {
    if (err instanceof Cartesia.APIError && err.status) {
      const error = err.status === 429 ? 'Too many requests. Try again shortly.' : 'Transcription failed';
      return Response.json({ error }, { status: err.status });
    }
    throw err;
  }
}
```

```
app/api/transcribe/route.ts   ink-whisper, 4 MB cap, 17 languages
app/api/summarize/route.ts    LLM call with a zod schema
app/api/health/route.ts       which keys are set, for the setup banner
app/page.tsx                  recorder, upload and the meeting list
app/meeting/[id]/page.tsx     notes, transcript, retry, delete, Copy as Markdown
app/actions/page.tsx          open action items across all meetings
lib/llm.ts                    reads LLM_MODEL and picks the provider
lib/store.ts                  the only file that touches IndexedDB
recipe-snippets/              the code shown in the recipe, type-checked
```

## Models and API version

Uses `ink-whisper` for file transcription and `Cartesia-Version: 2026-08-14`, which `@cartesia/cartesia-js` 4.2 sends on every request. `ink-2` is the streaming model and does not work on the batch endpoint. See https://docs.cartesia.ai/build-with-cartesia/stt/latest for current ids and https://docs.cartesia.ai/api-reference/stt/transcribe for the endpoint.

## Change it

- Transcribe another language: pick it in the language menu. The list is `LANGUAGES` in `lib/limits.ts`.
- Use another LLM: set `LLM_MODEL`. `lib/llm.ts` is the whole switch. For another direct provider, add its AI SDK package and one branch there.
- Change what the notes contain: edit `lib/schema.ts` and the instructions in `lib/prompt.ts`.
- Store notes on a server: replace the four async functions in `lib/store.ts` with calls to your database and keep the hooks.

## Limits

- 4 MB per upload, because Vercel rejects request bodies over 4.5 MB. The recorder stops at 3.6 MB or 20 minutes. Cartesia accepted a 45 MB, 25 minute WAV in testing, so on a host without that limit you can raise `MAX_AUDIO_BYTES` in `lib/limits.ts`.
- No chunking. Transcripts over about 120,000 characters are rejected, which is a few hours of speech.
- No speaker labels. `ink-whisper` does not return them, so an action item's owner comes only from names said in the meeting, and the prompt tells the model not to guess.
- Not tried on Safari. It records `audio/mp4` and the code handles that.

## Before you deploy

The routes have no auth. Anyone who finds the URL can spend your Cartesia and LLM credits. Put the app behind your own login or a rate limiter first.

## FAQ

### How do I keep my Cartesia API key out of the browser?

The browser posts audio to your own route, and only `lib/cartesia.ts` reads the key. If you would rather have the browser call Cartesia directly, mint a short-lived access token on the server as described in https://docs.cartesia.ai/get-started/authenticate-your-client-applications.

### Can I get a live transcript while the meeting is happening?

Not with this app. It sends the whole recording when you stop. For live captions, stream the microphone to `ink-2` over the STT WebSocket; https://docs.cartesia.ai/build-with-cartesia/stt/latest covers both models.

### Which languages work?

The language menu lists 17, from English and Spanish to Japanese and Ukrainian. `ink-whisper` accepts many more; add their ISO 639-1 codes to `LANGUAGES` in `lib/limits.ts`. The prompt tells the LLM to write the notes in the language of the transcript.

### What does a meeting cost?

Batch `ink-whisper` costs 1 credit per 2 seconds of audio, silence included, so a 30 minute meeting is 900 credits (https://docs.cartesia.ai/pricing, checked 2026-10-16). Add one LLM call for the notes.

### Can I do this in Python?

Yes. The `cartesia` package has the same call:

```python
import os
from cartesia import Cartesia

client = Cartesia(api_key=os.environ["CARTESIA_API_KEY"])
with open("meeting.wav", "rb") as f:
    res = client.stt.transcribe(file=f, model="ink-whisper", language="en")
print(res.text)
```

## Tests

```sh
pnpm test        # routes, schema, store, Markdown export, recipe snippets
pnpm typecheck   # the app and recipe-snippets/
pnpm build       # works with no environment variables set
```

## Learn more

- Recipe: [Transcribe and summarize meetings](https://github.com/cartesia-ai/cookbook/blob/main/content/cookbook/01-next/20-transcribe-and-summarize-meetings.mdx)
- Speech to text models: https://docs.cartesia.ai/build-with-cartesia/stt/latest
- Batch transcription API: https://docs.cartesia.ai/api-reference/stt/transcribe
- Cartesia docs for agents: https://docs.cartesia.ai/llms.txt
- Agent skills: `npx skills add cartesia-ai/skills`

## License

Apache-2.0, like the rest of the [Cartesia cookbook](https://github.com/cartesia-ai/cookbook/blob/main/LICENSE).
