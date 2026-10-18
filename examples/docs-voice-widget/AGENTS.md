# Agent notes

Docs voice widget: a framework-free web component (`widget/src`, bundled by esbuild into one `widget.js`) plus a Hono server on Node (`server/`). The agent is a Cartesia Managed Agent with two client tools. Search is a JSON index: OpenAI embeddings when `OPENAI_API_KEY` is set at ingest, BM25 keyword scoring (`server/keyword.ts`) otherwise. The index's `model` field decides which one search uses.

## Commands

Run from this directory. Node 22.22 or newer; inside the monorepo use pnpm.

- `pnpm dev` serves the demo docs site and the widget on http://localhost:4512, rebuilding `widget.js` on every request.
- `pnpm test`, `pnpm typecheck`, `pnpm build` (writes `dist/`, delete it after checking).
- `pnpm ingest [folder]` or `pnpm ingest --sitemap <url>` writes `data/index.json`. Sitemap ingest only fetches the sitemap's own host.
- `pnpm setup:agent` creates the agent and tools and writes ids to `.env.local`. Delete any agent you create for testing.

## Rules

- `CARTESIA_API_KEY` and `OPENAI_API_KEY` are read only in `server/`, `ingest/` and `scripts/`. Nothing under `widget/` may mention them.
- Tool names and parameters are defined twice: `scripts/agent-config.ts` (Cartesia side) and `widget/src/tools.ts` (browser side). Change both.
- Client tool results must stay under 4096 bytes. `server/search.ts` packs to 3800; keep a test on it.
- The token route keeps its Origin check and rate limit. Do not add a wildcard origin. `/health` returns only `{ ok: true }`.
- Links built from index data (`sourceHref`, the demo's `safeHref`) allow only http(s) and relative URLs.
- Widget UI follows `packages/kit/DESIGN.md` with hand-written CSS in `widget/src/styles.ts` and tokens in `widget/src/tokens.ts`.
- Errors shown to visitors are the fixed strings in `errorFor` (`widget/src/element.ts`). Never show upstream text.
- The idle status in `STATUS` (`widget/src/element.ts`) tells visitors they are talking to an AI and that Cartesia records the audio. Keep both.
- `widget/src/agents-web/` is a byte-identical copy of files in `packages/agents-web/src`. Fix bugs there first, then copy.
- `content/` holds the two demo pages. Do not commit `.env.local`, `data/` or `dist/`.

## Docs

- https://docs.cartesia.ai/agents/client-tools
- https://docs.cartesia.ai/agents/tools
- https://docs.cartesia.ai/api-reference/agents/create
- https://docs.cartesia.ai/line/integrations/websocket-api
