# Agent notes for article-to-podcast

Article to two-host podcast: Next.js 16 App Router. The AI SDK writes the script, Cartesia Sonic 3.6 voices each line through `@cartesia/cartesia-js`, the server joins the lines into one WAV.ts`.

## Commands (run in this folder)

- Install and run: `pnpm install`, `cp .env.example .env.local`, `pnpm dev`
- Check: `pnpm test && pnpm typecheck && pnpm build`. Tests use fakes and `MockLanguageModelV4`, so they need no keys and no network.

## Files

```
app/api/script/route.ts   link or text in, { title, lines } out
app/api/audio/route.ts    lines in, WAV out, line start times in X-Line-Starts
lib/safe-fetch.ts         the only outbound fetch of user URLs (SSRF guard)
lib/extract.ts            Readability in jsdom, scripts off
lib/script.ts             LLM call, chunking, line normalizer
lib/tts.ts                one Sonic call per line, 4 in flight
lib/wav.ts                PCM concat, gaps, 44-byte header
lib/model.ts              provider from the keys that are set
lib/env.ts                the only file that reads CARTESIA_API_KEY
lib/http.ts               error to fixed message
```

## Rules

- Speech uses `client.tts.generate` with `model_id: "sonic-3.6"` and raw `pcm_s16le` at 24 kHz. Don't use the AI SDK speech API, and don't use any other Sonic id: older ones are retired or deprecated (see `facts.json` at the repo root). The SDK sends `Cartesia-Version: 2026-08-14`.
- The LLM goes through `generateText` with `Output.object`. `generateObject` is deprecated.
- Only files under `lib/` read keys, and nothing under `app/` mentions one. The browser never talks to Cartesia.
- Every route error goes through `errorResponse` in `lib/http.ts`, which returns a fixed message. Never forward `error.message` from the Cartesia or LLM SDKs; they can echo request details.
- Fetched pages are untrusted input. Keep the article inside `<material>` tags in the prompt, render script lines as text only, and keep all fetching in `lib/safe-fetch.ts`.
- Keep the input caps: 60,000 characters of article, 30,000 characters of script.
- Read env inside functions so `next build` passes with no variables.
- UI is shadcn/ui with the Cartesia Verdant theme (`components/ui/`, blocks in `components/blocks/`, tokens in `app/globals.css`), vendored from `packages/kit`. No other component library.
- `next.config.ts` sets `agentRules: false` so `next dev` leaves this file alone.
- Don't commit `.env.local`. Don't print keys. No em dashes in docs or UI copy.

## Verify a change

1. `pnpm test && pnpm typecheck`.
2. `pnpm dev`, paste a paragraph, keep Length on Short, press Make podcast, and check that the episode plays and the highlighted line follows the audio.
3. Docs: https://docs.cartesia.ai/llms.txt, TTS bytes https://docs.cartesia.ai/api-reference/tts/bytes.md.
