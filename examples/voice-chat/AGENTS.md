# Agent notes for voice-chat

Browser voice chat with a Cartesia Managed Agent: Next.js 16 App Router, shadcn/ui in `components/ui/` recolored in `app/globals.css`, and the Managed Agents WebSocket client copied into `lib/agents-web/`. The folder is self-contained: no `workspace:*` dependencies and no imports from outside it.

## Commands (run in this folder)

- First run: `cp .env.example .env.local`, add `CARTESIA_API_KEY`, `npm run setup:agent`, `npm run dev`
- Agent setup without a key: `npm run setup:agent -- --dry-run`. New agent: `-- --force`
- Check: `npm test && npm run typecheck && npm run build`. The build must pass with no env set.

## Files

```
proxy.ts                    APP_PASSWORD gate (401, or 503 in a production build when unset)
app/api/token/route.ts      POST, calls createTokenRoute()
lib/token-handler.ts        60 second agent-only token, rate limit (10/min/address, in memory), 503 and 429 messages
lib/env.ts                  reads CARTESIA_API_KEY and CARTESIA_AGENT_ID at request time
components/voice-chat.tsx   useCartesiaAgent wired to the view
components/voice-chat-view.tsx  pure view, every call state is a prop
lib/agents-web/             byte-identical copy of packages/agents-web/src
components/ui, components/blocks  byte-identical copies of packages/kit files
scripts/setup-agent.ts      POST /v1/agents, writes CARTESIA_AGENT_ID to .env.local (run with tsx)
scripts/prompt.ts           agent instructions and greeting
```

## Rules

- `CARTESIA_API_KEY` is read only on the server: in `lib/env.ts` (used by `lib/token-handler.ts`), in `scripts/setup-agent.ts`, and as a fallback in `lib/agents-web/server.ts` when no `apiKey` is passed. Never import it from a client component and never add a `NEXT_PUBLIC_` variable for it. Tokens get only `{ agent: true }`.
- The agent stack (Ink 2, an LLM, Sonic 3.6) is managed by Cartesia. Don't add a TTS or STT model field to the agent config. The SDK sends `Cartesia-Version: 2026-08-14`.
- `@cartesia/cartesia-js` 4.2 has no typed `agents.create`, so setup uses the client's generic `post` with the path in `scripts/paths.ts`. Keep it that way until the SDK adds the method.
- Token route errors are fixed strings from `lib/token-handler.ts` and `lib/agents-web/server.ts`. Don't return SDK error text.
- User captions arrive only in `turn_ended`. That is the service, not a bug; don't try to fake partial user text.
- Don't edit `lib/agents-web/`, `components/ui/` or `components/blocks/` here. Change `packages/agents-web` or `packages/kit` in the cookbook repo and copy the file over. Its tests live in the package.
- `next.config.ts` sets `agentRules: false` so `next dev` leaves this file alone.
- Don't commit `.env.local`. Don't print keys or tokens in logs or tests.

## Verify a change

1. `npm test && npm run typecheck`.
2. `npm run dev`, press Start call with headphones on, ask a question, and talk over the answer. The agent should stop and the bubble should show "interrupted".
3. Docs: https://docs.cartesia.ai/llms.txt, agent WebSocket https://docs.cartesia.ai/line/integrations/websocket-api.md, create agent https://docs.cartesia.ai/api-reference/agents/create.md.
