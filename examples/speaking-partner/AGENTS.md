# Agent notes for speaking-partner

Language speaking practice on a Cartesia Managed Agent. Next.js 16 App Router, the AI SDK for the corrections LLM, a vendored copy of `packages/agents-web` in `lib/agents-web`, shadcn/ui with the Cartesia Verdant theme in `components/ui`.

## Commands (run from this folder)

- Install and run: `pnpm install`, then `pnpm dev` (http://localhost:3000).
- Check: `pnpm test && pnpm typecheck && pnpm build`. The build must pass with no env vars.
- Real API, no microphone: `pnpm live` (one agent per language, created and deleted) and `pnpm live:talk es` (a short conversation from Sonic audio). Both need `CARTESIA_API_KEY` and both make real agents.

## Files

- `lib/session-agent.ts`: the agent body, voice pick, shared `complete_mission` tool, delete and sweep.
- `lib/prompts.ts`: Teacher and Immersive instructions. `data/missions.json`: the role plays.
- `app/api/session`, `app/api/session/end`, `app/api/token`, `app/api/correct`: the only server routes.
- `components/session-view.tsx`: the call, through `useCartesiaAgent`.
- `lib/corrections.ts` and `lib/model.ts`: the corrections call and the model switch.

## Rules

- One temporary agent per session is deliberate. Browser tokens cannot send `dynamic_variables` (the service answers `dynamic_variables_not_allowed`), so the server writes mission, role, mode and languages into the instructions. Routes take a mission id; never add a way for the browser to send free text into a prompt.
- `CARTESIA_API_KEY` is read only in `lib/env.ts`, `app/api/`, `scripts/` and `tests/`. Never add a `NEXT_PUBLIC_` secret. The browser gets a 60 second token with only the `agent` grant.
- Only `lib/session-agent.ts` deletes agents, and only after it checks the `speaking-partner-session-` name prefix. Keep that check.
- The agent stack is managed: Ink 2 hears, Sonic 3.6 speaks. Do not add TTS or STT model fields to the agent config. The five languages (en, es, fr, hi, ja) are the Ink 2 languages; do not widen the pickers. If you add direct TTS, use `sonic-3.6`. `facts.json` at the repo root lists the retired ids.
- Corrections model ids in `lib/model.ts` must exist in the `@ai-sdk/anthropic` and `@ai-sdk/openai` model unions. Check the package source, not memory.
- Read env at request time. Keep the user-facing error strings in the routes; tests assert them.
- `tests/recipe-snippets.test.ts` checks that code in `content/cookbook/15-agents/03-speaking-partner.mdx` is a slice of the real files. Change both together.
- Do not commit `.env.local`. Do not print keys or tokens. No em dashes.

## Verify a change

Run the check line above. For anything in the call path, also run `pnpm live:talk es` and read what Ink 2 heard and what the partner said. Browser audio still needs a real session with headphones.

## Docs

- https://docs.cartesia.ai/llms.txt
- Managed Agents: https://docs.cartesia.ai/agents/introduction.md
- Client tools: https://docs.cartesia.ai/agents/client-tools.md
- WebSocket events: https://docs.cartesia.ai/line/integrations/websocket-api.md
- Access tokens: https://docs.cartesia.ai/get-started/authenticate-your-client-applications.md
- Skills: `npx skills add cartesia-ai/skills`
