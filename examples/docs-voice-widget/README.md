# Docs voice widget: talk to your docs from one script tag

Add a voice agent to any documentation website with one `<script>` tag. Visitors press a button, ask a question out loud, and a Cartesia Managed Agent answers from your docs, cites the page, and scrolls the page to the section it used. The widget is a framework-free web component; the server is Hono on Node with a local vector store.

![Demo docs page with the voice panel open. The visitor asked how big a client tool result can be, the transcript shows the answer, and the cited "Handle a tool call" section is scrolled into view and tinted green.](./docs/screenshot.png)

## Run it

```sh
cd examples/docs-voice-widget
pnpm install
cp .env.example .env.local   # add CARTESIA_API_KEY and OPENAI_API_KEY
pnpm setup:agent             # creates the agent and its two tools, saves the ids
pnpm ingest                  # embeds content/*.md into data/index.json
pnpm dev
```

Open http://localhost:4512, press **Ask the docs**, then **Start talking**, and ask "How big can a client tool result be?". The demo site is five real pages from docs.cartesia.ai.

## Add it to your site

```html
<script src="https://your-server.example.com/widget.js" defer>
</script>
```

Then set `ALLOWED_ORIGINS=https://docs.example.com` on the server and index your own pages:

```sh
pnpm ingest ./my-docs --base-url /docs/                   # a folder of .md or .mdx
pnpm ingest --sitemap https://docs.example.com/sitemap.xml # or a live site
```

Sitemap mode fetches `<page>.md` first (Mintlify and GitBook serve one) and falls back to the HTML, keeping the page's own heading ids so citations land on the right anchor. Re-running ingest only embeds pages whose content changed.

Optional attributes on the script tag: `data-theme="light|dark"` (default follows the page) and `data-title="Ask the docs"`. Host pages with a Content Security Policy need `connect-src wss://api.cartesia.ai https://your-server.example.com` and `worker-src blob:`.

## Environment variables

| Name | Required | What it does |
| --- | --- | --- |
| `CARTESIA_API_KEY` | yes | Mints access tokens and creates the agent. Get one at https://play.cartesia.ai/keys |
| `OPENAI_API_KEY` | yes | Embeddings for ingest and search (`text-embedding-3-small`, 512 dimensions) |
| `CARTESIA_AGENT_ID`, `CARTESIA_TOOL_IDS` | yes | Written by `pnpm setup:agent` |
| `ALLOWED_ORIGINS` | for your site | Comma-separated origins that may start sessions. The server's own origin is always allowed |
| `PUBLIC_URL`, `TRUST_PROXY` | behind a proxy | Public origin, and `1` to rate limit by `X-Forwarded-For` |
| `MAX_SESSION_SECS` | no | The widget ends a session after this long. Default 300 |
| `PORT`, `WIDGET_TITLE`, `DEMO_SITE` | no | Port (4512), panel title, `0` turns off the demo site |
| `AGENT_MODEL_ID`, `CARTESIA_VOICE_ID`, `AGENT_LANGUAGE` | no | Read by `pnpm setup:agent` |

Both keys stay on the server. The browser gets a 60 second token with only the `agent` grant.

## How it works

1. The widget loads `GET /api/config` for the agent id. On **Start talking** it opens the mic, then `POST /api/token` mints a token with `client.accessToken.create({ grants: { agent: true }, expires_in: 60 })`, and the vendored agents client opens `wss://api.cartesia.ai/v1/agents/websocket/{agent_id}`.
2. The agent calls the client tool `search_docs`. The browser forwards the query and the current path to `POST /api/search`, which embeds it, ranks sections by cosine similarity with a small boost for the current page, and packs the top four into a result under 3,800 bytes. Cartesia rejects client tool results over 4,096 bytes.
3. The agent calls `show_source` with a `source_id` from the results. The widget adds a source chip, and if the section is on this page it scrolls there and tints it. If the model answers without citing, the widget cites the top result itself.
4. Sources on other pages stay as chips. Clicking one during a call opens it in a new tab, since leaving the page ends the call.

Search runs as a client tool, not a webhook tool, because Cartesia only calls public HTTPS webhooks. A client tool works against `localhost` with no tunnel.

```
server/app.ts          routes: config, token (origin check + rate limit), search, widget.js
server/search.ts       ranking and the 4096-byte result packing
server/store.ts        the JSON vector store
ingest/                folder and sitemap sources, heading splitter, checksum skip
widget/src/element.ts  <cartesia-docs-agent>: button, panel, orb, transcript, sources
widget/src/tools.ts    search_docs and show_source handlers
widget/src/highlight.ts scroll-to-section and the tint box
scripts/agent-config.ts the agent prompt and tool definitions
content/               demo pages copied from docs.cartesia.ai
```

## Abuse limits

A public button that starts paid voice calls will be found. The token route checks `Origin` against `ALLOWED_ORIGINS` (403 otherwise), allows 4 tokens a minute and 30 an hour per IP, and never returns upstream errors. Search allows 30 calls a minute per IP. The agent ends calls after 60 seconds of silence and the widget ends sessions after `MAX_SESSION_SECS`. The Origin check stops other websites, not scripts, which can send any header, so the rate limit is the real guard. The limiter is in memory: one process only. Put it in Redis or your edge for more.

## Models and API version

The agent uses Cartesia `ink-2` for speech recognition and `sonic-3.6` for speech, with `gpt-4.1` as the LLM. On 2026-10-16 it was the model from `GET /v1/agents/models` that most often called `show_source` after a search and spoke answers without reading out code names. Set `AGENT_MODEL_ID` to try another, then run `pnpm setup:agent --force`. Every request sends `Cartesia-Version: 2026-08-14`. See https://docs.cartesia.ai/agents/models for the current list.

## Change it

- **Prompt and tools:** edit `scripts/agent-config.ts`, then `pnpm teardown:agent && pnpm setup:agent`.
- **Voice:** set `CARTESIA_VOICE_ID` to a voice from https://play.cartesia.ai/voices before `pnpm setup:agent`.
- **Language:** set `AGENT_LANGUAGE` to `es`, `fr`, `hi` or `ja`. The prompt already replies in the visitor's language.
- **Vector store:** `server/store.ts` is the only file that reads or writes the index. Replace it with pgvector or SQLite when a few thousand sections is not enough.
- **Look:** colors are in `widget/src/tokens.ts`, styles in `widget/src/styles.ts`.

## FAQ

### How do I keep my Cartesia API key out of the browser?
The server mints a 60 second access token with only the `agent` grant, and the widget uses it once to open the WebSocket. See https://docs.cartesia.ai/get-started/authenticate-your-client-applications.

### Why not use the Cartesia knowledge base?
Knowledge base folders work for agents too (https://docs.cartesia.ai/line/knowledge-base). This template keeps search in your server so the results carry page URLs and anchors, which the widget needs to scroll to the cited section.

### Does it work on Docusaurus, Mintlify or Nextra?
Yes, anywhere you can add a script tag. Ingest from the site's sitemap so anchors match its heading ids. The widget follows `html.dark`, `html[data-theme]` or the OS setting for dark mode.

### Why does the call end when I click a link to another page?
The call lives in the page. A multi-page site reloads on navigation, so sources on other pages open in a new tab during a call.

## Develop

```sh
pnpm test        # vitest: chunking, search packing, routes, rate limits, tools, highlight
pnpm typecheck
pnpm lint
pnpm build       # dist/widget.js, about 38 KB (13 KB gzipped)
pnpm start       # production: serves dist/widget.js
```

## Learn more

- Managed Agents: https://docs.cartesia.ai/agents/introduction
- Client tools: https://docs.cartesia.ai/agents/client-tools
- WebSocket API: https://docs.cartesia.ai/line/integrations/websocket-api
- Agent skills: `npx skills add cartesia-ai/skills`

## License

Apache-2.0, like the rest of the [Cartesia cookbook](https://github.com/cartesia-ai/cookbook/blob/main/LICENSE).
