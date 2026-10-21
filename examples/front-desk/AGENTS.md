# Agent notes for front-desk

AI receptionist on a Cartesia Managed Agent. Python 3.12, FastAPI, Jinja plus htmx, SQLite through the stdlib, httpx for Cartesia and Cal.com. No Node at runtime.

## Commands (run from this folder)

- Install and run: `uv sync && uv run uvicorn front_desk.main:app --port 8000`
- Create or update the agent: `uv run scripts/setup_agent.py` (`--dry-run` needs no key, `--delete` cleans up)
- Fake a phone call for the dashboard: `uv run scripts/send_test_webhook.py --url http://localhost:8000/webhooks/cartesia`
- Check: `uv run pytest && uv run ruff check . && uv run ruff format --check . && uv run mypy front_desk scripts`
- Maintainers only, inside the cookbook monorepo: rebuild `front_desk/static/vendor/agents-web.js` after `packages/agents-web` changes with `scripts/vendor-agents-web.sh`. It exits with a message in a standalone copy. Do not edit the bundle by hand.

## Rules

- `CARTESIA_API_KEY` is read only in `front_desk/config.py` and used only in `front_desk/cartesia.py`. Never send it to a template or `static/`. The browser gets a 60 second token with only the `agent` grant from `POST /api/token`.
- Read settings with `settings()` at request time. Nothing reads env at import, so tests and a bare `uvicorn` start with no `.env`.
- `TOOL_SPECS` in `front_desk/tools.py` is the one tool definition. Setup turns it into client tools (no `PUBLIC_BASE_URL`) or webhook tools. Both routes call `Tools.run`. Keep results short JSON under 4096 bytes.
- Every route except `/tools/*`, `/webhooks/cartesia` and `/static` goes on the `dashboard` router in `main.py`, which needs `DASHBOARD_PASSWORD` over HTTP Basic (`front_desk/auth.py`). The app refuses to start without it when `PUBLIC_BASE_URL` is set, or when uvicorn's `--host` (or `UVICORN_HOST`) is not loopback. New routes go on that router unless Cartesia calls them.
- The token rate limit keys on `client_ip()`, which reads the last `X-Forwarded-For` entry (the one the proxy appended) only when `TRUST_PROXY=1`.
- Routes that read a JSON body use `_json_object()`, which returns 400 with a fixed message on bad JSON.
- `POST /api/client-tools/<name>` returns 415 unless `Content-Type` is `application/json`, so a cross-site form can't drive it with a cached Basic login. Keep that check on any new dashboard route that changes data.
- `HostCheck` in `main.py` wraps Starlette's `TrustedHostMiddleware` and accepts only loopback names plus the `PUBLIC_BASE_URL` host (any host when bound off loopback with a password). Tests add `testserver` in `tests/conftest.py`.
- Webhooks are not signed by Cartesia. Keep the constant-time `x-webhook-secret` check, the `agent_id` check and the `webhook_request_id` dedupe in `front_desk/webhooks.py`. The dedupe claims the id with `INSERT OR IGNORE` before applying the event and releases it if applying fails.
- Only `front_desk/store.py` runs SQL. The local calendar computes free slots from `BUSINESS_HOURS`; bookings are rows in the same file.
- Send `Cartesia-Version: 2026-08-14` (in `config.py`). Agent and tool create, read, update and delete in `scripts/setup_agent.py` use `/v1/agents...` and `/v1/agents/tools...`. Attaching the webhook uses the unversioned `PATCH /agents/{id}`, the same path the Python SDK 4.2 `client.agents.update` sends to. Calls and webhooks are `/agents/calls...` and `/agents/webhooks...`, as the API reference lists them. Check https://docs.cartesia.ai/llms.txt before adding an endpoint.
- The agent's speech model is managed by Cartesia. If you add direct TTS, use `sonic-3.6` and nothing older; `facts.json` at the repo root lists the retired ids.
- UI follows `packages/kit/DESIGN.md` with the tokens copied into `front_desk/static/app.css`: Inter only, header shows the app name only, one primary button per screen, End call is a soft red tint. Check light and dark at 1280 and 390 px.
- The greeting in `front_desk/prompt.py` tells callers they are talking to an AI and that the call may be recorded. Keep both.
- Transfers only work on Twilio or SIP calls. `transfer_call` says so and the browser route always reports no transfer.
- Do not commit `.env` or `data/`. Do not print keys.

## Docs

- Managed Agents: https://docs.cartesia.ai/agents/introduction.md
- Tools: https://docs.cartesia.ai/agents/webhook-tools.md, https://docs.cartesia.ai/agents/client-tools.md, https://docs.cartesia.ai/agents/system-tools.md
- Webhooks and recordings: https://docs.cartesia.ai/line/infrastructure/observability.md
- Calls API: https://docs.cartesia.ai/api-reference/agents/calls/get-call.md
- WebSocket events: https://docs.cartesia.ai/line/integrations/websocket-api.md
- Cal.com v2: https://cal.com/docs/api-reference/v2/slots/get-available-time-slots-for-an-event-type.md
