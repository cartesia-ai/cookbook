# Front desk

An AI phone receptionist for a small business that books appointments, takes messages and logs every call, built on a Cartesia Managed Agent with a Python FastAPI dashboard.

![Call detail page in light mode: a simulated phone call from +14155550123 marked Booked, latency medians (speech to text 178 ms, text to speech 88 ms) and a transcript that opens with "I'm an AI assistant, and this call may be recorded", with check_availability and book_appointment tool calls inline](./docs/screenshot.png)

The agent runs Ink 2 speech to text, an LLM and Sonic 3.6 text to speech as one managed stack. It books into Cal.com or a built-in calendar, hands callers to a person, and the dashboard shows each call's transcript, recording and per-turn latency. You can try it in the browser with only a Cartesia API key, no phone number needed.

## Run it

You need Python 3.12 or newer, [uv](https://docs.astral.sh/uv/) and a Cartesia API key from https://play.cartesia.ai/keys.

```sh
npx degit cartesia-ai/cookbook/examples/front-desk front-desk
cd front-desk
cp .env.example .env                  # put your key in CARTESIA_API_KEY
uv sync
uv run scripts/setup_agent.py         # creates the agent and its tools, writes CARTESIA_AGENT_ID to .env
uv run uvicorn front_desk.main:app --port 8000
```

`pnpm dlx degit` works too.

Open http://localhost:8000/try, press Start call and say "I'd like to book a haircut tomorrow afternoon." When you hang up, the call shows up under Calls with its transcript, recording and latency, and the booking shows up under Inbox. Use headphones, or the agent hears itself.

To see a phone call in the dashboard without a phone, replay a recorded-shape webhook. The script and the server need the same `CARTESIA_WEBHOOK_SECRET`. If that line in `.env` is still empty, fill it in place with the output of `openssl rand -hex 24` (don't append a second line), then stop and restart uvicorn, because the server reads `.env` once at startup. Skip this if setup already wrote a secret.

```sh
uv run scripts/send_test_webhook.py   # posts call_started, call_turn x9, call_completed, post_call_analysis
```

Pass `--url https://your-host.example.com/webhooks/cartesia` to send to another address. Run it twice and the second run is ignored as a retry.

## Environment variables

| Name | Required | What it does |
| --- | --- | --- |
| `CARTESIA_API_KEY` | yes | https://play.cartesia.ai/keys. Read only in `front_desk/config.py`, used only in `front_desk/cartesia.py`. |
| `CARTESIA_AGENT_ID` | written by setup | The agent the browser call and the webhook belong to. |
| `DASHBOARD_PASSWORD` | when deployed | HTTP Basic password (any username) for the dashboard, recordings, the browser call and its tool routes. The app refuses to start if `PUBLIC_BASE_URL` is set and this is empty. |
| `UVICORN_HOST` | no | Address uvicorn binds when you don't pass `--host`. The app reads it (or `--host`) to refuse starting on a non-loopback address without `DASHBOARD_PASSWORD`, and to decide which `Host` headers it answers. |
| `TRUST_PROXY` | no | Set to `1` behind a proxy such as Render, Fly or Railway, so the token rate limit keys on the last `X-Forwarded-For` address, the one your proxy appended, instead of the proxy's. Leave it unset when clients reach the server directly, or they can fake the header. |
| `BUSINESS_NAME`, `BUSINESS_SERVICES`, `BUSINESS_TIMEZONE`, `BUSINESS_HOURS`, `APPOINTMENT_MINUTES` | no | Your business. Defaults to a hair salon in Los Angeles. Run setup again after changing them. |
| `TRANSFER_NUMBER` | no | E.164 number for live handoff on phone calls. |
| `PUBLIC_BASE_URL` | for phone calls | Public HTTPS address of this server. Switches the tools to webhook tools and turns on call webhooks. |
| `TOOL_SECRET`, `CARTESIA_WEBHOOK_ID`, `CARTESIA_WEBHOOK_SECRET` | written by setup | Shared secrets Cartesia sends back to you. |
| `CALCOM_API_KEY`, `CALCOM_EVENT_TYPE_ID` | no | Book into Cal.com instead of the local calendar. |
| `AGENT_MODEL_ID`, `CARTESIA_VOICE_ID`, `DATABASE_PATH` | no | Overrides. The model default is `claude-haiku-4.5`. |

## How it works

Open these first:

- `scripts/setup_agent.py` creates the agent with `POST /v1/agents`, four tools with `POST /v1/agents/tools`, and, when `PUBLIC_BASE_URL` is set, a call webhook with `POST /agents/webhooks`, attached through `webhook_id`. Run it again and it updates the same agent and tools instead of making new ones. `--dry-run` prints the requests without a key, and `--delete` removes the agent, its tools and its webhook.
- `front_desk/tools.py` defines `check_availability`, `book_appointment`, `take_message` and `transfer_call` once.
- `front_desk/main.py` has every route: pages, token, sync, tools and the webhook.

How Cartesia reaches the tools depends on where the server runs:

- On your laptop (no `PUBLIC_BASE_URL`) they are [client tools](https://docs.cartesia.ai/agents/client-tools). Cartesia sends `client_tool_call` over the browser's WebSocket, `front_desk/static/call.js` posts it to `POST /api/client-tools/<name>`, and the reply goes back as `client_tool_result`. Only the browser call can use them.
- Deployed or tunneled, they are [webhook tools](https://docs.cartesia.ai/agents/webhook-tools). Cartesia posts to `POST /tools/<name>` with an `X-Tool-Secret` header, and fills `call_id`, `caller_number` and `call_direction` from the system variables `system__conversation_id`, `system__caller_id` and `system__call_direction`. This works for phone and browser calls.

Call data arrives two ways. On a deploy, Cartesia posts `call_started`, `call_turn`, `call_completed` and `post_call_analysis` to `POST /webhooks/cartesia`. Locally, the browser call asks `POST /api/calls/<id>/sync`, which reads `GET /agents/calls/<id>`. Both paths store the same call object in SQLite. Per-turn `tts_ttfb` and `stt_ttfb` come from the transcript turns; `llm_first_text_ms` and `agent_turn_ms` come from the `log_metric` system turns. The recording streams through `GET /calls/<id>/audio.wav` from `GET /agents/calls/<id>/audio` and is never saved here.

Cartesia does not sign webhook bodies. It echoes the secret you registered in `x-webhook-secret`. `front_desk/webhooks.py` compares it in constant time, rejects events whose `agent_id` is not yours, and claims each `webhook_request_id` with one `INSERT OR IGNORE` before storing the event, so a retry that arrives mid-delivery is skipped:

```python
given = headers.get("x-webhook-secret", "")
if not hmac.compare_digest(given.encode(), secret.encode()):
    return Verdict(401, "unauthorized")
if agent_id and body.get("agent_id") != agent_id:
    return Verdict(400, "Event is for another agent.")
```

All Cartesia requests send `Cartesia-Version: 2026-08-14`. Cal.com requests send `cal-api-version: 2024-09-04` for slots and `2026-02-25` for bookings.

```
front_desk/main.py         routes: pages, token, sync, tools, webhook
front_desk/auth.py         dashboard password, client address for the rate limit
front_desk/tools.py        tool specs and handlers
front_desk/calendars.py    local calendar and Cal.com v2
front_desk/webhooks.py     secret check, dedupe, ingest
front_desk/store.py        SQLite (the only SQL)
front_desk/prompt.py       instructions and greeting
front_desk/static/call.js  browser call, client tool forwarding
scripts/setup_agent.py     idempotent agent, tools and webhook setup
```

## Change it

- Your business: set the `BUSINESS_*` variables and run setup again. The hours format is `mon-fri 09:00-17:00; sat 10:00-14:00`.
- What the receptionist says: edit `front_desk/prompt.py`, then run setup. Keep the AI and recording disclosure in the greeting.
- Another voice: pick one at https://play.cartesia.ai/voices and set `CARTESIA_VOICE_ID`.
- Another tool: add a spec and a method to `front_desk/tools.py`. Setup creates the Cartesia tool and both routes pick it up.
- Cal.com: create an event type, make phone the required attendee field (or make email optional), then set `CALCOM_API_KEY` and `CALCOM_EVENT_TYPE_ID`. Booked slots still show in Inbox.

`scripts/vendor-agents-web.sh` is a maintainer script. It rebuilds `front_desk/static/vendor/agents-web.js` from `packages/agents-web` and only runs inside the cartesia-ai/cookbook repo. A standalone copy already has the bundle and never needs it.

## Before you deploy

### Login

Set `DASHBOARD_PASSWORD`. Every page, the recordings, `POST /api/token`, `POST /api/calls/<id>/sync` and `POST /api/client-tools/<name>` then ask for HTTP Basic auth with that password and any username. The browser sends the login with the call page's own requests, so the web call keeps working. `/tools/*` and `/webhooks/cartesia` skip it because Cartesia calls them, and they check their own secrets instead. When `PUBLIC_BASE_URL` is set and `DASHBOARD_PASSWORD` is empty, the app refuses to start. Locally, with neither set, the dashboard is open. Without `PUBLIC_BASE_URL`, the app also refuses to start with no `DASHBOARD_PASSWORD` when uvicorn binds anything other than `127.0.0.1`, `::1` or `localhost` (for example `--host 0.0.0.0`).

Two more checks stop other web pages from using a logged-in or local dashboard. `POST /api/client-tools/<name>` only accepts `Content-Type: application/json`, which a cross-site form cannot send without a CORS preflight, so a page you visit can't book appointments with your cached login. And the app answers only requests whose `Host` is `127.0.0.1`, `localhost`, `[::1]` or the host in `PUBLIC_BASE_URL`, which blocks DNS rebinding against a server on your laptop. When uvicorn binds a non-loopback address and `DASHBOARD_PASSWORD` is set, any `Host` is accepted, since the password guards it.

### Limits and cost

`POST /api/token` allows 10 tokens a minute per client address, in memory and per process. It slows casual abuse; the password is the real guard. Behind a proxy, set `TRUST_PROXY=1` or every caller shares the proxy's address. Every call, browser or phone, uses agent minutes on your Cartesia plan; see https://docs.cartesia.ai/pricing.

### Legal

This is not legal advice. Check the rules where you and your callers are.

- Tell callers they are talking to an AI. The default greeting does.
- Cartesia records the audio and transcript of every agent call by default ([observability](https://docs.cartesia.ai/line/infrastructure/observability#call-recordings)). Tell your users, and delete calls you don't need with `DELETE /agents/calls/{call_id}`.
- Some US states, such as California, Florida, Illinois and Washington, require every party's consent to record. The default greeting says the call may be recorded.
- Calls, transcripts and caller numbers stay in `data/front-desk.db` and in Cartesia until you delete them. Pick a retention period.
- In February 2024 the FCC ruled that AI-generated voices count as artificial voices under the TCPA ([FCC 24-17](https://docs.fcc.gov/public/attachments/FCC-24-17A1.pdf)), so outbound AI calls need the called person's prior express consent. This template only answers calls.

### Put it on a phone number

This template does not buy or attach a number for you. When you are ready:

1. Deploy the server (Render, Fly, Railway, any host with HTTPS), or run a tunnel such as `ngrok http 8000`. Cartesia blocks private and non-HTTPS addresses.
2. Set `PUBLIC_BASE_URL` to that address, set `DASHBOARD_PASSWORD`, and run `uv run scripts/setup_agent.py` again. It swaps the client tools for webhook tools and registers the call webhook.
3. Attach a number to the agent:
   - A free US number from Cartesia: [Cartesia numbers](https://docs.cartesia.ai/line/integrations/telephony/cartesia-numbers). Every plan includes at least one.
   - Outside the US, or to keep a number you already have: [import a Twilio number](https://docs.cartesia.ai/line/integrations/telephony/twilio/integration). You pay Twilio for the number and minutes.
   - Your own carrier: [SIP trunking](https://docs.cartesia.ai/line/integrations/telephony/sip-trunking).

   Then assign it to the agent as described in [Phone numbers](https://docs.cartesia.ai/line/integrations/telephony/phone-numbers).
4. Set `TRANSFER_NUMBER` and run setup again if you want live handoff. Transfers only work on Twilio or SIP calls. On browser calls the agent offers to take a message instead.

## FAQ

### How do I build an AI receptionist without a phone number?

Run it locally and use the Try it page. It is the same agent and the same tools a phone call uses, over a WebSocket from the browser. The browser gets a 60 second access token from `POST /api/token`, never your API key; [browser auth with access tokens](https://github.com/cartesia-ai/cookbook/blob/main/content/cookbook/00-guides/01-browser-auth-with-access-tokens.mdx) explains the pattern.

### Does Cartesia sign its webhooks?

No. It sends the secret you registered in the `x-webhook-secret` header. Compare it in constant time, check `agent_id`, and deduplicate on `webhook_request_id`, as `front_desk/webhooks.py` does.

### Why is speech to text latency empty for some browser calls?

Cartesia may leave `stt_ttfb` off user turns of WebSocket calls. The page shows it when it is there and falls back to the `llm_first_text_ms` and `agent_turn_ms` metrics.

## Tests

```sh
uv run pytest
uv run ruff check . && uv run ruff format --check . && uv run mypy front_desk scripts
```

## Learn more

- Recipe: https://github.com/cartesia-ai/cookbook/blob/main/content/cookbook/20-telephony/01-ai-receptionist-that-books-appointments.mdx
- Managed Agents: https://docs.cartesia.ai/agents/introduction
- Tools: https://docs.cartesia.ai/agents/tools
- Call webhooks and recordings: https://docs.cartesia.ai/line/infrastructure/observability
- Agent skills: `npx skills add cartesia-ai/skills`

## License

Apache-2.0, like the rest of the [Cartesia cookbook](https://github.com/cartesia-ai/cookbook/blob/main/LICENSE).

Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
