# Agent notes for front-desk

AI receptionist on a Cartesia Managed Agent. Python 3.12, FastAPI, Jinja plus htmx, SQLite through the stdlib, httpx for Cartesia and Cal.com. No Node at runtime.

## Commands (run from this folder)

- Install and run: `uv run uvicorn front_desk.main:app --port 8000`
- Create or update the agent: `uv run scripts/setup_agent.py` (`--dry-run` needs no key, `--delete` cleans up)
- Fake a phone call for the dashboard: `uv run scripts/send_test_webhook.py --url http://localhost:8000/webhooks/cartesia`
- Check: `uv run pytest && uv run ruff check . && uv run ruff format --check . && uv run mypy front_desk scripts`
- Rebuild the browser client bundle after `packages/agents-web` changes: `scripts/vendor-agents-web.sh`

## Rules

- `CARTESIA_API_KEY` is read only in `front_desk/config.py` and used only in `front_desk/cartesia.py`. Never send it to a template or `static/`. The browser gets a 60 second token with only the `agent` grant from `POST /api/token`.
- Read settings with `settings()` at request time. Nothing reads env at import, so tests and a bare `uvicorn` start with no `.env`.
- `TOOL_SPECS` in `front_desk/tools.py` is the one tool definition. Setup turns it into client tools (no `PUBLIC_BASE_URL`) or webhook tools. Both routes call `Tools.run`. Keep results short JSON under 4096 bytes.
- Webhooks are not signed by Cartesia. Keep the constant-time `x-webhook-secret` check, the `agent_id` check and the `webhook_request_id` dedupe in `front_desk/webhooks.py`.
- Only `front_desk/store.py` runs SQL. The local calendar computes free slots from `BUSINESS_HOURS`; bookings are rows in the same file.
- Send `Cartesia-Version: 2026-08-14` (in `config.py`). Agent paths are `/v1/agents...`; calls and webhooks are `/agents/calls...` and `/agents/webhooks...`, as the API reference lists them. Check https://docs.cartesia.ai/llms.txt before adding an endpoint.
- The agent's speech model is managed by Cartesia. If you add direct TTS, use `sonic-3.6` and nothing older; `facts.json` at the repo root lists the retired ids.
- UI follows `packages/kit/DESIGN.md` with the tokens copied into `static/app.css`: Inter only, header shows the app name only, one primary button per screen, End call is a soft red tint. Check light and dark at 1280 and 390 px.
- Transfers only work on Twilio or SIP calls. `transfer_call` says so and the browser route always reports no transfer.
- Do not commit `.env` or `data/`. Do not print keys. No em dashes in docs.

## Docs

- Managed Agents: https://docs.cartesia.ai/agents/introduction.md
- Tools: https://docs.cartesia.ai/agents/webhook-tools.md, https://docs.cartesia.ai/agents/client-tools.md, https://docs.cartesia.ai/agents/system-tools.md
- Webhooks and recordings: https://docs.cartesia.ai/line/infrastructure/observability.md
- Calls API: https://docs.cartesia.ai/api-reference/agents/calls/get-call.md
- WebSocket events: https://docs.cartesia.ai/line/integrations/websocket-api.md
- Cal.com v2: https://cal.com/docs/api-reference/v2/slots/get-available-time-slots-for-an-event-type.md
