# Agent notes for story-time

Interactive bedtime stories: Next.js 16 App Router, the AI SDK writes scenes, Sonic 3.6 reads them over the TTS WebSocket, Ink 2 hears the spoken choice. UI is shadcn/ui with the Cartesia Verdant theme, vendored from packages/kit (no workspace deps).

- npm (pnpm works too). Node 22.22+. From this directory: `npm run dev`, `npm test`, `npm run typecheck`, `npm run build`.
- Cartesia SDK: `@cartesia/cartesia-js`. Models: `sonic-3.6` (TTS), `ink-2` (streaming STT). Use no other Sonic id: older ones are retired or deprecated (see facts.json at the repo root). The SDK sends `Cartesia-Version: 2026-08-14`.
- `CARTESIA_API_KEY` is read only in `lib/cartesia.ts` and the health route. The browser gets a 60 second token from `app/api/token/route.ts` for every WebSocket it opens (one per scene for Sonic, one per choice for Ink 2). Never add a `NEXT_PUBLIC_` key. Read env at request time so `next build` passes with no variables.
- `LLM_MODEL` is `provider/model`; `lib/llm.ts` is the only switch. Don't hardcode model ids in code.
- Kid safety is a feature, not decoration. Keep these: the name check and preset-only themes (`lib/safety.ts`), the safety block in `lib/prompt.ts`, the word-list check on every scene in `app/api/scene/route.ts`, the moderation pass in `lib/moderation.ts` (`omni-moderation-latest` on the name, themes, title and every scene; it fails closed when the call fails), and the rule that the child's transcript stays in the browser (only the chosen option index goes to the server). Don't store mic audio.
- `lib/store.ts` is the only file that touches IndexedDB. Saved scenes hold Float32 PCM at 24 kHz plus word timings, so replay needs no API calls.
- One TTS context per line is deliberate: each line has its own voice and `generation_config.emotion` (beta, English only, must match the words). Lines are generated in order and scheduled on one Web Audio clock in `lib/narrate.ts`. Don't open contexts for all lines at once; it can hit concurrency limits.
- Sonic returns `[laughter]` as a timestamped word. `lib/align.ts` skips it when mapping words to the text on screen.
- `proxy.ts` gates every page and API route behind HTTP Basic auth when `APP_PASSWORD` is set, and returns 503 on Vercel (production or preview) when it is unset. `APP_PASSWORD=none` makes the app public. `/api/token` and `/api/scene` are rate limited per IP with `lib/rate-limit.ts`.
- `next.config.ts` sets `agentRules: false` so `next dev` does not overwrite this file.
- Docs: https://docs.cartesia.ai/llms.txt, TTS contexts `use-the-api/tts-websocket/contexts.md`, turns `use-the-api/stt/turns.md`, emotions `build-with-cartesia/capability-guides/volume-speed-emotion.md`, auth `get-started/authenticate-your-client-applications.md`.
