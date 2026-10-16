# Agent notes for voice-journal

Expo SDK 58 app (expo-router, expo-audio) for iOS, Android and web. Cartesia `ink-whisper` transcribes entries, the AI SDK writes titles, moods, reflections and the weekly recap, Cartesia `sonic-3.6` reads the recap.

- pnpm only, Node 22.22+. From this directory: `pnpm dev` (press `w` for web), `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build:web` (writes `dist/`, delete it after).
- Models: `sonic-3.6` (TTS), `ink-whisper` (file STT, the only model on the batch endpoint), `ink-2` (streaming only). Never use sonic-2, sonic-turbo, sonic-latest, sonic-english or dated sonic-3 ids. `@cartesia/cartesia-js` sends `Cartesia-Version: 2026-08-14`. <!-- allow-model-id -->
- Keys live only in API routes (`app/api/*+api.ts`) through `lib/server/*`. Never import `lib/server` from a screen or component, and never give a key an `EXPO_PUBLIC_` prefix (Metro inlines those into the app).
- Route errors are fixed strings from `lib/server/errors.ts`. Do not forward provider error bodies to the app.
- Every route calls `rateLimited(req, allow)` from `lib/server/errors.ts` first, with a per-route `createRateLimiter` from `lib/server/rate-limit.ts` (a byte copy of the one in the Next.js templates). There is no password gate because the native apps call the routes directly; the README says how to add real auth.
- `MAX_AUDIO_BYTES` is 4 MB because Vercel rejects bodies over 4.5 MB. `MAX_RECORDING_SECONDS` (4 minutes at the 128 kbps preset) keeps recordings under it. Change them together.
- `lib/store.ts` is the only file that touches AsyncStorage. Screens use `useJournal()`.
- Platform splits use file suffixes: `lib/audio-file.ts` (native, expo-file-system) and `lib/audio-file.web.ts` (blob URL).
- UI: the cookbook kit (`packages/kit/DESIGN.md`) rebuilt in React Native. Colors come only from `components/theme/tokens.ts`, which mirrors `packages/kit/theme.css`. Text goes through `components/ui/text.tsx` (Inter has one font family per weight). One primary button per screen; Stop and Delete use the `stop` variant (soft red tint), never a solid red.
- No custom `app/+html.tsx`: with SDK 58 server output it dropped the bundle script tag in dev. The page title comes from `expo-router/head` in `app/_layout.tsx`.
- Voice cloning is out of scope by decision. Do not add it.
- LLM ids are never hardcoded. `LLM_MODEL` is `provider/model`; `lib/server/llm.ts` resolves it.
- Docs: https://docs.cartesia.ai/llms.txt, https://docs.expo.dev/router/web/api-routes/.
