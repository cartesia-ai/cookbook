# Agent notes for story-time

Interactive stories where the listener picks what happens next: Next.js 16 App Router, the AI SDK writes scenes, Sonic 3.6 reads them over the TTS WebSocket, Ink 2 hears the spoken choice. UI is shadcn/ui with the Cartesia Verdant theme, vendored from packages/kit (no workspace deps).

## Commands (run in this folder)

- npm (pnpm works too), Node 22.22+.
- Run: `npm run dev`.
- Check: `npm test && npm run typecheck && npm run build`.

## Files

```
proxy.ts                   optional APP_PASSWORD gate
app/api/token/route.ts     60 second token for each WebSocket the browser opens
app/api/scene/route.ts     writes a scene with the LLM, word-list check, moderation
app/api/health/route.ts    booleans for the setup banner
lib/cartesia.ts            reads CARTESIA_API_KEY
lib/llm.ts                 resolves LLM_MODEL (provider/model)
lib/narrate.ts             one TTS context per line, scheduled on one Web Audio clock
lib/align.ts               maps Sonic word timestamps to the text on screen
lib/store.ts               the only file that touches IndexedDB
lib/safety.ts, lib/story.ts, lib/prompt.ts, lib/moderation.ts   content safety
```

## Rules

- Cartesia SDK: `@cartesia/cartesia-js`. Models: `sonic-3.6` (TTS), `ink-2` (streaming STT). Use no other Sonic id: older ones are retired or deprecated (see facts.json at the repo root). The SDK sends `Cartesia-Version: 2026-08-14`.
- `CARTESIA_API_KEY` is read only in `lib/cartesia.ts` and the health route. The browser gets a 60 second token from `app/api/token/route.ts` for every WebSocket it opens (one per scene for Sonic, one per choice for Ink 2). Never add a `NEXT_PUBLIC_` key. Read env at request time so `next build` passes with no variables.
- `LLM_MODEL` is `provider/model`; `lib/llm.ts` is the only switch. Don't hardcode model ids in code. Missing config answers 503.
- Content safety stays on. Keep these: the optional name check and preset-only themes and tones (`lib/safety.ts`, `lib/story.ts`), the content rules in `lib/prompt.ts`, the word-list check on every scene in `app/api/scene/route.ts`, and the moderation pass in `lib/moderation.ts` (`omni-moderation-latest` on the settings, title and every scene; it fails closed when the call fails).
- The mic opens only when the user presses Answer out loud. Never start listening on your own after a scene. The transcript stays in the browser; only the chosen option index goes to the server. Don't store mic audio.
- Keep it a general story app with no age settings or age-targeted copy. Check changes against https://www.cartesia.ai/legal/acceptable-use.
- If you change what data leaves the browser, update the footer text in `components/story-form.tsx`, the listen text in `components/story-player.tsx` and "Where data goes" in the README.
- Saved scenes hold Float32 PCM at 24 kHz plus word timings, so replay needs no API calls.
- One TTS context per line is deliberate: each line has its own voice and `generation_config.emotion` (beta, English only, must match the words). Lines are generated in order. Don't open contexts for all lines at once; it can hit concurrency limits.
- Sonic returns `[laughter]` as a timestamped word. `lib/align.ts` skips it when mapping words to the text on screen.
- `proxy.ts` gates every page and API route behind HTTP Basic auth when `APP_PASSWORD` is set, and returns 503 in a production build (`next start` or any Vercel deployment) when it is unset. `APP_PASSWORD=none` makes the app public. `/api/token` and `/api/scene` are rate limited per IP with `lib/rate-limit.ts`.
- `next.config.ts` sets `agentRules: false` so `next dev` does not overwrite this file.

## Docs

- https://docs.cartesia.ai/llms.txt
- TTS contexts: https://docs.cartesia.ai/use-the-api/tts-websocket/contexts.md
- Turns: https://docs.cartesia.ai/use-the-api/stt/turns.md
- Emotions: https://docs.cartesia.ai/build-with-cartesia/capability-guides/volume-speed-emotion.md
- Auth: https://docs.cartesia.ai/get-started/authenticate-your-client-applications.md
