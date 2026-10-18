# Agent notes for article-to-podcast

Article to two-host podcast: Next.js 16 App Router. The AI SDK writes the script, Cartesia Sonic 3.6 voices each line through `@cartesia/cartesia-js`, the server joins the lines into one WAV.

## Commands (run in this folder)

- Install and run: `npm install` (or `pnpm install`), `cp .env.example .env.local`, `npm run dev`
- Check: `pnpm test && pnpm typecheck && pnpm build`. Tests mock the Cartesia SDK module and use `MockLanguageModelV4`, so they need no keys and no network.

## Files

```
app/api/script/route.ts   link or text in, { title, lines } out
app/api/audio/route.ts    lines in, WAV out, line start times in X-Line-Starts
app/api/health/route.ts   booleans for the setup banner, never values
components/studio.tsx     the form, the two requests, progress steps
components/player.tsx     audio player and the follow-along script
components/setup-banner.tsx "Finish setup" notice from /api/health
lib/safe-fetch.ts         the only outbound fetch of user URLs (SSRF guard)
lib/extract.ts            Readability in jsdom, scripts off
lib/script.ts             LLM call, chunking, line normalizer
lib/tts.ts                one Sonic call per line, 4 lines at a time
lib/wav.ts                PCM concat, gaps, 44-byte header
lib/llm.ts                LLM_MODEL "provider/model" to an AI SDK model (shared copy)
lib/env.ts                the only file that reads CARTESIA_API_KEY and the voice ids
lib/http.ts               error to fixed message and status, 400 helper, chunked body
lib/rate-limit.ts         in-memory per-IP limiter, client IP, 429 response (shared copy)
proxy.ts                  APP_PASSWORD Basic auth gate (shared copy)
tests/                    vitest, no keys and no network
```

## Rules

- Speech uses `client.tts.generate` with `model_id: "sonic-3.6"` and raw `pcm_s16le` at 24 kHz. Don't use the AI SDK speech API, and don't use any other Sonic id: older ones are retired or deprecated (see `facts.json` at the repo root). The SDK sends `Cartesia-Version: 2026-08-14`.
- The LLM goes through `generateText` with `Output.object`. `generateObject` is deprecated.
- `LLM_MODEL` is `provider/model`, the same rule as the other LLM templates: a direct `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` for that prefix wins, otherwise the full id goes to the AI Gateway (`AI_GATEWAY_API_KEY`, or on Vercel). Do not hardcode a default model id. `lib/llm.ts`, `lib/rate-limit.ts`, `proxy.ts` and `tests/proxy.test.ts` must stay byte-identical to the other templates' copies (`pnpm check:copies` at the repo root); put template-only behavior in another file.
- Only files under `lib/` read keys, and nothing under `app/` or `components/` mentions one. The health route asks `lib/env.ts` and `lib/llm.ts` whether keys are set. The browser never talks to Cartesia.
- Both routes that spend money check `createRateLimiter` first. `proxy.ts` gates the whole app when `APP_PASSWORD` is set and refuses to serve on Vercel (production or preview) without it.
- Every route error goes through `errorResponse` in `lib/http.ts`, which returns a fixed message. Missing config (`ConfigError` from `lib/env.ts`, `LlmConfigError` from `lib/llm.ts`) returns 503 with a message that names the variable. Never forward `error.message` from the Cartesia or LLM SDKs; they can echo request details.
- Fetched pages are untrusted input. Keep the article inside `<material>` tags in the prompt, render script lines as text only, and keep all fetching in `lib/safe-fetch.ts`.
- Keep the input caps: 60,000 characters of article, 30,000 characters of script.
- Read env inside functions so `next build` passes with no variables.
- UI is shadcn/ui with the Cartesia Verdant theme (`components/ui/`, blocks in `components/blocks/`, tokens in `app/globals.css`), copied byte for byte from `packages/kit`. Change behavior in a new file, not in a copy. No other component library.
- `next.config.ts` sets `agentRules: false` so `next dev` leaves this file alone.
- Don't commit `.env.local`. Don't print keys.

## Verify a change

1. `pnpm test && pnpm typecheck && pnpm build`.
2. `pnpm dev`, paste a paragraph, keep Length on Short, press Make podcast, and check that the episode plays and the highlighted line follows the audio.
3. Docs: https://docs.cartesia.ai/llms.txt, TTS bytes https://docs.cartesia.ai/api-reference/tts/bytes.md.
