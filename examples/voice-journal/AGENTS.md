# Agent notes for voice-journal

Expo SDK 58 app (expo-router, expo-audio) for iOS, Android and web. Cartesia `ink-whisper` transcribes entries, the AI SDK writes titles, moods, reflections and the weekly recap, Cartesia `sonic-3.6` reads the recap.

## Commands (run in this folder)

- npm (pnpm works too), Node 22.22+.
- Run: `npm run dev` (press `w` for web).
- Check: `npm run typecheck && npm run lint && npm test`. `npm run build:web` writes `dist/`; delete it after.

## Files

```
app/api/*+api.ts      API routes, the only code that reads keys (through lib/server/*)
lib/server/errors.ts  fixed error strings, 503 for missing config, rateLimited()
lib/server/llm.ts     resolves LLM_MODEL (provider/model)
lib/store.ts          the only file that touches AsyncStorage; screens use useJournal()
lib/audio-file.ts     native file handling (expo-file-system); lib/audio-file.web.ts is the web version
components/theme/tokens.ts  colors, mirrors packages/kit/theme.css
components/ui/text.tsx      all text (Inter has one font family per weight)
```

## Rules

- Models: `sonic-3.6` (TTS), `ink-whisper` (file STT, the only model on the batch endpoint), `ink-2` (streaming only). Never use sonic-2, sonic-turbo, sonic-latest, sonic-english or dated sonic-3 ids. `@cartesia/cartesia-js` sends `Cartesia-Version: 2026-08-14`. <!-- allow-model-id -->
- Keys live only in API routes (`app/api/*+api.ts`) through `lib/server/*`. Never import `lib/server` from a screen or component, and never give a key an `EXPO_PUBLIC_` prefix (Metro inlines those into the app).
- Route errors are fixed strings from `lib/server/errors.ts`. Do not forward provider error bodies to the app.
- Every route that calls Cartesia or the LLM calls `rateLimited(req, allow)` from `lib/server/errors.ts` first, with a per-route `createRateLimiter` from `lib/server/rate-limit.ts` (a byte copy of the one in the Next.js templates). The health route only reports booleans and is not rate limited. There is no password gate because the native apps call the routes directly; the README says how to add real auth.
- `MAX_AUDIO_BYTES` is 4 MB because Vercel rejects bodies over 4.5 MB. `MAX_RECORDING_SECONDS` (4 minutes at the 128 kbps preset) keeps recordings under it. Change them together.
- Platform splits use file suffixes, as in `lib/audio-file.ts` and `lib/audio-file.web.ts`.
- UI: the cookbook kit (`packages/kit/DESIGN.md`) rebuilt in React Native. Colors come only from `components/theme/tokens.ts`. Text goes through `components/ui/text.tsx`. One primary button per screen; Stop and Delete use the `stop` variant (soft red tint), never a solid red.
- No custom `app/+html.tsx`: with SDK 58 server output it dropped the bundle script tag in dev. The page title comes from `expo-router/head` in `app/_layout.tsx`.
- Voice cloning is out of scope by decision. Do not add it.
- LLM ids are never hardcoded. `LLM_MODEL` is `provider/model`; `lib/server/llm.ts` resolves it.
- Keep `PRIVACY_NOTE` (`components/journal/entry-list.tsx`, shown under the record button and in the empty list) and the 988 line on the entry screen. Change the note if you change where recordings go.

## Docs

- https://docs.cartesia.ai/llms.txt
- https://docs.expo.dev/router/web/api-routes/
