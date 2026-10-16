# Agent notes for voice-chat

Browser voice chat with a Cartesia Managed Agent: Next.js 16 App Router, shadcn/ui in `components/ui/` recolored in `app/globals.css`, and the Managed Agents WebSocket client vendored into `lib/agents-web/`. The folder is self-contained: no `workspace:*` dependencies and no imports from outside it.

## Commands (run in this folder)

- First run: `cp .env.example .env.local`, add `CARTESIA_API_KEY`, `pnpm setup:agent`, `pnpm dev`
- Agent setup without a key: `pnpm setup:agent --dry-run`. New agent: `--force`
- Check: `pnpm test && pnpm typecheck && pnpm build`. Tests run against `mock/agent-server.ts`; the build must pass with no env set.

## Files

```
app/api/token/route.ts      POST, 60 second token with only the agent grant
lib/token-handler.ts        rate limit (10/min/address, in memory), 503 and 429 messages
lib/env.ts                  reads CARTESIA_API_KEY and CARTESIA_AGENT_ID at request time
components/voice-chat.tsx   useCartesiaAgent wired to the view
components/voice-chat-view.tsx  pure view, every call state is a prop
lib/agents-web/             copy of packages/agents-web: socket, mic, playback, barge-in
scripts/setup-agent.ts      POST /v1/agents, writes CARTESIA_AGENT_ID to .env.local
scripts/prompt.ts           agent instructions and greeting
byo-snippets/               bring-your-own-LLM code shown in the recipe
```

## Rules

- `CARTESIA_API_KEY` is read only in `lib/env.ts` (used by `lib/token-handler.ts`) and `scripts/setup-agent.ts`. Never import it from a client component and never add a `NEXT_PUBLIC_` variable for it. Tokens get only `{ agent: true }`.
- The agent stack (Ink 2, an LLM, Sonic 3.6) is managed by Cartesia. Don't add a TTS or STT model field to the agent config. Where `byo-snippets/` calls Cartesia directly, use `ink-2` and `sonic-3.6` only; older Sonic ids are retired (see `facts.json` at the repo root). The SDK sends `Cartesia-Version: 2026-08-14`.
- `@cartesia/cartesia-js` 4.2 has no typed `agents.create`, so setup uses the client's generic `post` with the path in `scripts/paths.ts`. Keep it that way until the SDK adds the method.
- `scripts/` must stay erasable TypeScript with `.ts` import extensions: Node runs it with `--experimental-strip-types`.
- Token route errors are fixed strings from `lib/token-handler.ts` and `lib/agents-web/server.ts`. Don't return SDK error text.
- User captions arrive only in `turn_ended`. That is the service, not a bug; don't try to fake partial user text.
- `byo-snippets/` must match `content/cookbook/15-agents/02-voice-chat.mdx` in the cookbook repo. `tests/recipe-snippets.test.ts` fails when they differ, so edit both. The test skips outside the monorepo.
- If you change `lib/agents-web/`, make the same change in `packages/agents-web` in the cookbook repo.
- `next.config.ts` sets `agentRules: false` so `next dev` leaves this file alone.
- Don't commit `.env.local`. Don't print keys or tokens in logs or tests. No em dashes.

## Verify a change

1. `pnpm test && pnpm typecheck`.
2. `pnpm dev`, press Start call with headphones on, ask a question, and talk over the answer. The agent should stop and the bubble should show "interrupted".
3. Docs: https://docs.cartesia.ai/llms.txt, agent WebSocket https://docs.cartesia.ai/line/integrations/websocket-api.md, create agent https://docs.cartesia.ai/api-reference/agents/create.md.
