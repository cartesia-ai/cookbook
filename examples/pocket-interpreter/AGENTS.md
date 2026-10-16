# Agent notes for pocket-interpreter

Two people, one device: Ink 2 streaming STT in the browser, an LLM through the AI SDK for detection plus translation, Sonic 3.6 over the TTS WebSocket. Next.js 16, shadcn/ui with the Cartesia Verdant theme vendored from packages/kit (no workspace deps).

- pnpm, Node 22.13+. Run `pnpm dev`. Check with `pnpm typecheck && pnpm test && pnpm build`, then delete `.next`.
- Cartesia SDK: `@cartesia/cartesia-js`. Models: `ink-2` (streaming STT, en es fr hi ja only), `sonic-3.6` (TTS). Never use sonic-2, sonic-turbo, sonic-latest, sonic-english or dated sonic-3 ids. `Cartesia-Version: 2026-08-14` is the SDK default. <!-- allow-model-id -->
- `CARTESIA_API_KEY` is read only in `lib/cartesia.ts`. The browser gets a 60 second token from `app/api/token` with grants `{ stt: true, tts: true }`. Never add a `NEXT_PUBLIC_` key.
- Ink 2 detects the language but `turn.end` has no language field (checked against the 2026-08-14 AsyncAPI). The speaker is decided by the first line of the `/api/translate` reply. `lib/translation.ts` parses it; the prompt in `lib/prompt.ts` and that parser change together.
- The mic must send silence while Sonic plays (`speaker.busy()` in `lib/audio/mic.ts`), or the app translates its own voice in a loop. Keep that gate if you touch audio.
- `turn.eager_end` starts a speculative translation that `turn.end` reuses when the text matches. Latency is measured from `turn.end` in `lib/interpreter.ts`.
- LLM ids are never hardcoded. `LLM_MODEL` is `provider/model`, resolved in `lib/llm.ts`. Don't pass `temperature`: reasoning models reject it.
- Live test without a mic: Chrome with `--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>%noloop`. The path must be absolute with no `..`, or Chrome sends silence.
- UI rules: `packages/kit/DESIGN.md`. One primary button per screen, End is the soft red outline, no other hues.
- Docs: https://docs.cartesia.ai/llms.txt, turn events at https://docs.cartesia.ai/use-the-api/stt/turns.
- Do not commit `.env.local`. Do not print keys. No em dashes.
