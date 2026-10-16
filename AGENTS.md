# Agent notes for the Cartesia cookbook

Runnable templates (`examples/<name>`) and recipes (`content/cookbook`) for Cartesia speech and voice agents. Each template is standalone: it has its own `README.md`, `AGENTS.md`, `.env.example` and package file. Read the template's `AGENTS.md` before you edit it; its rules win over this file for that folder.

## Commands

- Node 22.22 or newer, pnpm 10. Inside this repo use pnpm (`pnpm dlx`, not npx); READMEs give npm commands for readers. Python templates use uv.
- `pnpm install` at the root installs every workspace package, including the templates.
- `pnpm check` runs the Node checks CI runs: `check:facts`, `check:content`, `check:catalog`, `check:copies`, `typecheck`, `test`. CI also runs `pnpm build` (no env vars) and, for front-desk, audiobook and coding-voice-mode, `uv sync --locked` and `uv run pytest` (plus ruff and mypy in front-desk).
- `pnpm check:facts` fails on any Sonic model id or `Cartesia-Version` date that `facts.json` does not allow, in any text file.
- `pnpm check:content` checks the recipe tree: `NN-name` files, frontmatter, relative links, closed fences, no em dashes.
- `pnpm check:catalog` checks `templates.json`, `llms.txt` and the root README against `examples/`, each `.env.example`, the recipe titles and `facts.json`.
- `pnpm check:copies` fails when a template's `components/ui`, `components/blocks`, `lib/agents-web` or `widget/src/agents-web` file differs from the `packages/kit` or `packages/agents-web/src` file of the same name, or when a Next template's `proxy.ts` or `lib/rate-limit.ts` (and voice-journal's `lib/server/rate-limit.ts`) differs from article-to-podcast's.

## Facts an agent cannot guess

- TTS model `sonic-3.6` (snapshot `sonic-3.6-2026-08-27`). Streaming STT with turn detection `ink-2` (en, es, fr, hi, ja). File STT `ink-whisper`; `ink-2` does not work on the batch endpoint.
- Never write `sonic-2`, `sonic-turbo`, `sonic-english`, `sonic-multilingual`, bare `sonic`, `sonic-3-2025-10-27`, `sonic-latest` or `sonic-3-latest`. `sonic`, `sonic-english` and `sonic-multilingual` were sunset on 2026-06-01. `sonic-2`, `sonic-turbo` and `sonic-3-2025-10-27` stop working on 2026-10-20. The two aliases are deprecated. <!-- allow-model-id -->
- `Cartesia-Version: 2026-08-14`. Both SDKs send it; do not override it. Raw HTTP calls must send it. Browser WebSockets pass `?cartesia_version=` because they cannot set headers.
- SDKs: `@cartesia/cartesia-js` 4.x (`new Cartesia({ apiKey })`, `client.tts.generate`, `client.stt.transcribe`, `client.accessToken.create`) and `cartesia` 4.x for Python (`Cartesia(api_key=os.environ["CARTESIA_API_KEY"])`; it does not read the env var itself).
- Managed Agents WebSocket: `wss://api.cartesia.ai/v1/agents/websocket/{agent_id}`. User text arrives only in `turn_ended`. Client tool results must be under 4096 bytes.
- docs.cartesia.ai/line/... URLs are a legacy path prefix that still hosts current Managed Agents pages; do not use the Line SDK for these templates.
- The `agent` access token grant is a boolean. It opens the Agents WebSocket for any agent on the account, not one agent id.
- The voice changer API was sunset on 2026-08-20. Do not add it.
- If `facts.json` and a doc page disagree, the doc page is newer. Update `facts.json` first, then fix what `pnpm check:facts` reports.

## Rules

- `CARTESIA_API_KEY` stays on the server. A browser or app gets an access token from a server route: `client.accessToken.create({ grants, expires_in: 60 })` with the narrowest grants (`agent`, or `tts`/`stt`). Never add a `NEXT_PUBLIC_` or `EXPO_PUBLIC_` variable for a key.
- Read env at request time, so `pnpm build` passes with no variables set.
- Routes return fixed error messages. Never forward an SDK's `error.message` or an upstream body to the client.
- Speech goes through the Cartesia SDK. The AI SDK is for LLM calls only; its Cartesia provider is out of date.
- Web UIs use `packages/kit` (shadcn/ui recolored by `theme.css`, Inter) and follow `packages/kit/DESIGN.md`. Templates copy what they use; nothing imports `packages/*` at runtime. Do not add a second component library.
- `packages/kit` and `packages/agents-web/src` are the source of truth for their copies (front-desk ships agents-web as a bundle). Fix the package first, then copy the file over. Template-only behavior goes in a differently named file.
- `.env.example` has empty values only. Never commit `.env` or `.env.local`, and never print a key.
- The repo is Apache-2.0 under the root `LICENSE`. `examples/audiobook` is an MIT fork and keeps its own `LICENSE`. Don't add per-template license or credit files for ideas you borrowed; only copied code needs its license.

## Adding or renaming a template

1. Create `examples/<name>` with `README.md`, `AGENTS.md`, `CLAUDE.md` (only `@AGENTS.md`), `.env.example`, a package file with description, keywords, repository and license, and `docs/screenshot.png`.
2. Add an entry to `templates.json` (env keys must match `.env.example`; `features` uses the tags listed in `tools/check-catalog`).
3. Add a row to the template table in the root `README.md`.
4. Add a line to `llms.txt`.
5. Run `pnpm check`.

## Where things are

- Templates: `examples/<slug>`, listed with stack, env, models and features in `templates.json`.
- Recipes: `content/cookbook/NN-section/NN-recipe.mdx`, titles in `llms.txt`.
- `facts.json`: model ids, API version, retired ids.
- `packages/kit`: UI kit, `DESIGN.md`, `theme.css`. `packages/agents-web`: Managed Agents browser client (vitest). `pnpm live` there needs `CARTESIA_API_KEY` and makes a real API call.
- `tools/`: the repo checks. Repo layout and how copies work: `CONTRIBUTING.md`.

## Docs index

Append `.md` to any docs.cartesia.ai page for Markdown. Full index: https://docs.cartesia.ai/llms.txt

- Models: https://docs.cartesia.ai/build-with-cartesia/tts-models/latest.md, https://docs.cartesia.ai/build-with-cartesia/stt/latest.md, https://docs.cartesia.ai/build-with-cartesia/stt/older-models.md, https://docs.cartesia.ai/build-with-cartesia/tts-models/api-changes.md
- Auth and tokens: https://docs.cartesia.ai/get-started/authenticate-your-client-applications.md, https://docs.cartesia.ai/api-reference/auth/access-token.md
- SDKs: https://docs.cartesia.ai/tools/client-libraries.md
- TTS endpoints: https://docs.cartesia.ai/use-the-api/compare-tts-endpoints.md, https://docs.cartesia.ai/api-reference/tts/bytes.md, https://docs.cartesia.ai/use-the-api/tts-websocket/contexts.md
- Voice control: https://docs.cartesia.ai/build-with-cartesia/capability-guides/volume-speed-emotion.md, https://docs.cartesia.ai/build-with-cartesia/capability-guides/ssml-tags.md
- STT: https://docs.cartesia.ai/use-the-api/stt/compare-endpoints.md, https://docs.cartesia.ai/use-the-api/stt/turns.md, https://docs.cartesia.ai/api-reference/stt/transcribe.md
- Managed Agents: https://docs.cartesia.ai/agents/introduction.md, https://docs.cartesia.ai/agents/models.md, https://docs.cartesia.ai/agents/tools.md, https://docs.cartesia.ai/agents/client-tools.md
- Agents WebSocket: https://docs.cartesia.ai/line/integrations/websocket-api.md
- Telephony: https://docs.cartesia.ai/line/integrations/telephony/phone-numbers.md
- Pricing: https://docs.cartesia.ai/pricing.md
