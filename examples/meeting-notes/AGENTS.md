# Agent notes for meeting-notes

AI meeting notes: Next.js 16 App Router. Cartesia `ink-whisper` transcribes the audio, the AI SDK writes the notes, IndexedDB stores them.

## Commands (run in this folder)

- Install and run: `pnpm install`, `cp .env.example .env.local`, `pnpm dev`
- Check: `pnpm test && pnpm typecheck && pnpm build`. Tests need no keys and no network. The build must pass with no env set.

## Files

```
app/api/transcribe/route.ts   audio in, ink-whisper text out
app/api/summarize/route.ts    transcript in, notes out (generateText + Output.object)
app/api/health/route.ts       booleans for the setup banner, never values
lib/cartesia.ts               the only Cartesia client; reads the key at call time
lib/llm.ts                    LLM_MODEL "provider/model" to an AI SDK model
lib/store.ts                  the only file that touches IndexedDB
lib/limits.ts                 4 MB upload cap, recorder limits, language list
recipe-snippets/              code shown in the recipe, compared by a test
```

## Rules

- `CARTESIA_API_KEY` is read only in `lib/cartesia.ts` and `app/api/health/route.ts`. Never import it into a component or add a `NEXT_PUBLIC_` variable. The browser posts audio to `/api/transcribe` and never talks to Cartesia.
- Read env inside functions, not at module load.
- `ink-whisper` is the file model. `ink-2` is streaming only and fails on the batch `/stt` endpoint. If you add speech output, use `sonic-3.6`; older Sonic ids are retired (see `facts.json` at the repo root). The SDK sends `Cartesia-Version: 2026-08-14`.
- Never hardcode an LLM id in code. `LLM_MODEL` is the only switch; new providers get a branch in `lib/llm.ts`.
- Error bodies are short fixed strings, plus env var names from `LlmConfigError`. The transcribe route passes the Cartesia `APIError` message through; don't add LLM error text, stack traces or request details to any response.
- Audio is never stored. Only the transcript and notes go to IndexedDB.
- `recipe-snippets/` must match `content/cookbook/01-next/20-transcribe-and-summarize-meetings.mdx` in the cookbook repo. `tests/recipe-snippets.test.ts` fails when they differ, so edit both.
- UI is shadcn/ui with the Cartesia Verdant theme in `app/globals.css`, vendored from `packages/kit`. No other component library.
- `next.config.ts` sets `agentRules: false` so `next dev` leaves this file alone.
- Don't commit `.env.local`. Don't print keys. No em dashes in docs or UI copy.

## Verify a change

1. `pnpm test && pnpm typecheck`.
2. `pnpm dev`, upload a short WAV or record ten seconds, and check that the notes page shows a summary and action items.
3. Docs: https://docs.cartesia.ai/llms.txt, batch STT https://docs.cartesia.ai/api-reference/stt/transcribe.md.
