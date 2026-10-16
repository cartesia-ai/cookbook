# Agent notes

Docs voice widget: a framework-free web component (`widget/src`, bundled by esbuild into one `widget.js`) plus a Hono server on Node (`server/`). The agent is a Cartesia Managed Agent with two client tools. Search is OpenAI embeddings over a JSON file.

## Commands

Run from this directory with pnpm and Node 22.13 or newer.

- `pnpm dev` serves the demo docs site and the widget on http://localhost:4512, rebuilding `widget.js` on every request.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` (writes `dist/`, delete it after checking).
- `pnpm ingest [folder]` or `pnpm ingest --sitemap <url>` writes `data/index.json`. Needs `OPENAI_API_KEY`.
- `pnpm setup:agent` creates the agent and tools and writes ids to `.env.local`. `pnpm teardown:agent` deletes them. Delete any agent you create for testing.

## Rules

- `CARTESIA_API_KEY` and `OPENAI_API_KEY` are read only in `server/` and `scripts/`. Nothing under `widget/` may mention them; `pnpm lint` checks this.
- Tool names and parameters are defined twice: `scripts/agent-config.ts` (Cartesia side) and `widget/src/tools.ts` (browser side). Change both.
- Client tool results must stay under 4096 bytes. `server/search.ts` packs to 3800; keep a test on it.
- The token route keeps its origin check and rate limit. Do not add a wildcard origin.
- Widget UI follows `packages/kit/DESIGN.md` with hand-written CSS in `widget/src/styles.ts` and tokens in `widget/src/tokens.ts`: Inter only, one primary button, soft red tint for End.
- Errors shown to visitors are the fixed strings in `errorFor` (`widget/src/element.ts`). Never show upstream text.
- `widget/src/agents-web/` is vendored from `packages/agents-web`. Fix bugs there first, then copy.
- Models: `sonic-3.6`, `ink-2`, `Cartesia-Version: 2026-08-14`. Run `node tools/check-facts/index.mjs .` from the repo root.
- No em dashes. Do not commit `.env.local`, `data/` or `dist/`.

## Docs

- https://docs.cartesia.ai/agents/client-tools
- https://docs.cartesia.ai/agents/tools (result limits, execution settings)
- https://docs.cartesia.ai/api-reference/agents/create
- https://docs.cartesia.ai/line/integrations/websocket-api
- https://docs.cartesia.ai/get-started/authenticate-your-client-applications
