# Agent notes for speaking-partner

Language speaking practice on a Cartesia Managed Agent. Next.js 16 App Router, the AI SDK for the corrections LLM, a vendored copy of `packages/agents-web` in `lib/agents-web`, shadcn/ui with the Cartesia Verdant theme in `components/ui`.

## Commands (run from this folder)

- Install and run: `pnpm install`, then `pnpm dev` (http://localhost:3000).
- Check: `pnpm test && pnpm typecheck && pnpm build`. The build must pass with no env vars.

## Files

- `lib/session-agent.ts`: the agent body, voice pick, shared `complete_mission` tool, paged listing, the `MAX_LIVE_SESSIONS` cap, delete and sweep.
- `lib/prompts.ts`: Teacher and Immersive instructions. `data/missions.json`: the role plays. Immersive mode must still say yes when asked if it is an AI. `content/cookbook/15-agents/03-speaking-partner.mdx` quotes `IMMERSIVE`, and `tests/recipe-snippets.test.ts` fails if they drift.
- `app/api/session`, `app/api/session/end`, `app/api/token`, `app/api/correct`: the only server routes.
- `components/session-view.tsx`: the call, through `useCartesiaAgent`.
- `lib/corrections.ts` and `lib/model.ts`: the corrections call and the model switch.
- `proxy.ts`: the optional `APP_PASSWORD` gate for the whole app.
- `components/ui/*`, `components/blocks/*` and `lib/agents-web/*` are byte-identical copies of `packages/kit` and `packages/agents-web/src`. Change the package, then copy. Put template-only behavior in a new file.

## Rules

- One temporary agent per session is deliberate. Browser tokens cannot send `dynamic_variables` (the service answers `dynamic_variables_not_allowed`), so the server writes mission, role, mode and languages into the instructions. Routes take a mission id; never add a way for the browser to send free text into a prompt.
- `CARTESIA_API_KEY` is read only in `lib/env.ts`, `app/api/` and `tests/`. Never add a `NEXT_PUBLIC_` secret. The browser gets a 60 second token with only the `agent` grant.
- Only `lib/session-agent.ts` deletes agents, and only after it checks the `speaking-partner-session-` name prefix. Keep that check.
- The agent stack is managed: Ink 2 hears, Sonic 3.6 speaks. Do not add TTS or STT model fields to the agent config. The five languages (en, es, fr, hi, ja) are the Ink 2 languages; do not widen the pickers. If you add direct TTS, use `sonic-3.6`. `facts.json` at the repo root lists the retired ids.
- `lib/model.ts` reads `LLM_MODEL` as `provider/model`, the same rule as the other LLM templates: a direct `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` for that prefix wins, otherwise the full id goes to the AI Gateway (`AI_GATEWAY_API_KEY`, or on Vercel). With neither, `resolveModel` returns null and the corrections panel stays off. Do not hardcode a default model id.
- Read env at request time. Keep the user-facing error strings in the routes; tests assert them.
- Every route that spends money or touches agents has a per-address `createRateLimiter`. Keep them, and keep the 3 minute session limit and the live session cap.
- `tests/recipe-snippets.test.ts` checks that code in `content/cookbook/15-agents/03-speaking-partner.mdx` is a slice of the real files. Change both together.
- Do not commit `.env.local`. Do not print keys or tokens.

## Verify a change

Run the check line above. For anything in the call path, run a real session in the browser with headphones.

## Docs

- https://docs.cartesia.ai/llms.txt
- Managed Agents: https://docs.cartesia.ai/agents/introduction.md
- Client tools: https://docs.cartesia.ai/agents/client-tools.md
- WebSocket events: https://docs.cartesia.ai/line/integrations/websocket-api.md
- Access tokens: https://docs.cartesia.ai/get-started/authenticate-your-client-applications.md
- Skills: `npx skills add cartesia-ai/skills`
