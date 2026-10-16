"""FastAPI app: the dashboard pages, the tool routes, the webhook and the browser call token.

Route map
  GET  /                         calls list (htmx refreshes it every 5 seconds)
  GET  /calls/{id}               transcript, recording, outcome, per-turn latency
  GET  /inbox                    appointments and messages
  GET  /try                      "Try it in the browser" web call
  POST /api/token                60 second access token for the browser call
  POST /api/calls/{id}/sync      pull a finished call from Cartesia (no public URL needed)
  POST /api/client-tools/{name}  tool calls from the browser call (client tool mode)
  POST /tools/{name}             tool calls from Cartesia (webhook tool mode)
  POST /webhooks/cartesia        call events from Cartesia
"""

from __future__ import annotations

import hmac
import logging
import time
from collections import defaultdict, deque
from datetime import UTC, datetime
from functools import lru_cache
from html import escape
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from . import webhooks
from .calendars import make_calendar
from .cartesia import Cartesia, CartesiaError
from .config import Settings, load_env, settings
from .store import CallRow, Store
from .tools import TOOL_NAMES, Tools

load_env()
log = logging.getLogger("front_desk")
HERE = Path(__file__).resolve().parent

app = FastAPI(title="Front desk", docs_url=None, redoc_url=None)
app.mount("/static", StaticFiles(directory=HERE / "static"), name="static")
templates = Jinja2Templates(directory=HERE / "templates")

@lru_cache(maxsize=4)
def _store(path: str) -> Store:
    return Store(Path(path))

def store() -> Store:
    return _store(str(settings().database_path))

def tools(s: Settings) -> Tools:
    st = store()
    return Tools(s, st, make_calendar(s, st))

def cartesia(s: Settings) -> Cartesia:
    if not s.cartesia_api_key:
        raise HTTPException(503, "CARTESIA_API_KEY is not set.")
    return Cartesia(s.cartesia_api_key)

def fmt_when(iso: str | None, s: Settings) -> str:
    if not iso:
        return ""
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return iso
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    local = dt.astimezone(s.tz)
    return local.strftime("%b %-d, %-I:%M %p")

def fmt_duration(secs: float | None) -> str:
    if secs is None:
        return ""
    secs = int(round(secs))
    return f"{secs // 60}:{secs % 60:02d}"

def fmt_ms(v: float | None) -> str:
    return "" if v is None else f"{v * 1000:.0f} ms"

def caller_label(call: CallRow) -> str:
    if call.caller:
        return call.caller
    if call.connection == "websocket":
        return "Browser call"
    return "Unknown caller"

def median(values: list[float]) -> float | None:
    if not values:
        return None
    v = sorted(values)
    mid = len(v) // 2
    return v[mid] if len(v) % 2 else (v[mid - 1] + v[mid]) / 2

templates.env.globals.update(fmt_duration=fmt_duration, fmt_ms=fmt_ms, caller_label=caller_label)

def page(request: Request, name: str, **ctx: Any) -> HTMLResponse:
    s = settings()
    ctx.setdefault("nav", name.split(".")[0])
    return templates.TemplateResponse(
        request, name, {"s": s, "when": lambda iso: fmt_when(iso, s), "setup": setup_state(s), **ctx}
    )

def setup_state(s: Settings) -> dict[str, bool]:
    return {"key": bool(s.cartesia_api_key), "agent": bool(s.agent_id), "webhook": bool(s.webhook_secret)}

@app.get("/", response_class=HTMLResponse)
def calls_page(request: Request) -> HTMLResponse:
    return page(request, "calls.html", calls=store().list_calls())

@app.get("/partials/calls", response_class=HTMLResponse)
def calls_partial(request: Request) -> HTMLResponse:
    return page(request, "_calls_list.html", calls=store().list_calls())

@app.get("/calls/{call_id}", response_class=HTMLResponse)
def call_page(request: Request, call_id: str) -> HTMLResponse:
    call = store().get_call(call_id)
    if call is None:
        raise HTTPException(404, "No such call.")
    stt = [t.stt_ttfb for t in call.turns if t.stt_ttfb is not None]
    tts = [t.tts_ttfb for t in call.turns if t.tts_ttfb is not None]
    scale = max([*stt, *tts, 0.5])
    stats = [
        ("Speech to text", median(stt)),
        ("Text to speech", median(tts)),
        ("LLM first text", median(call.metric_values("llm_first_text_ms"))),
        ("Agent turn", median(call.metric_values("agent_turn_ms"))),
    ]
    return page(request, "call.html", nav="calls", call=call, stats=stats, scale=scale)

@app.get("/calls/{call_id}/recording", response_class=HTMLResponse)
def recording_partial(request: Request, call_id: str) -> HTMLResponse:
    """Asks Cartesia whether a recording exists, so the page shows a player or a plain note."""
    s = settings()
    available = False
    if s.cartesia_api_key and webhooks.CALL_ID.match(call_id):
        try:
            resp = Cartesia(s.cartesia_api_key).open_call_audio(call_id)
            available = resp.status_code == 200
            resp.close()
        except Exception:  # noqa: BLE001 - any failure means "no player"
            available = False
    return page(request, "_recording.html", call_id=call_id, available=available)

@app.get("/calls/{call_id}/summary", response_class=HTMLResponse)
def summary_partial(call_id: str) -> HTMLResponse:
    """Cartesia writes the summary a few seconds after the call ends. Fetch it once if we lack it."""
    s = settings()
    call = store().get_call(call_id)
    if call and not call.summary and s.cartesia_api_key and webhooks.CALL_ID.match(call_id):
        try:
            fresh = Cartesia(s.cartesia_api_key).get_call(call_id)
            if not s.agent_id or fresh.get("agent_id") == s.agent_id:
                store().upsert_call(fresh)
                call = store().get_call(call_id)
        except CartesiaError:
            pass
    text = call.summary if call and call.summary else ""
    return HTMLResponse(f'<p class="summary">{escape(text)}</p>' if text else "")

@app.get("/calls/{call_id}/audio.wav")
def recording_audio(call_id: str) -> Response:
    s = settings()
    if not webhooks.CALL_ID.match(call_id):
        raise HTTPException(404)
    resp = cartesia(s).open_call_audio(call_id)
    if resp.status_code != 200:
        resp.close()
        raise HTTPException(404, "No recording for this call.")

    def body():
        try:
            yield from resp.iter_bytes()
        finally:
            resp.close()

    return StreamingResponse(
        body(), media_type="audio/wav", headers={"Cache-Control": "private, max-age=300"}
    )

@app.get("/inbox", response_class=HTMLResponse)
def inbox_page(request: Request) -> HTMLResponse:
    st = store()
    return page(request, "inbox.html", appointments=st.list_appointments(), messages=st.list_messages())

@app.get("/try", response_class=HTMLResponse)
def try_page(request: Request) -> HTMLResponse:
    return page(request, "try.html")

_token_hits: dict[str, deque[float]] = defaultdict(deque)

@app.post("/api/token")
def token(request: Request) -> JSONResponse:
    """Mints a 60 second token with only the `agent` grant. 10 per minute per address."""
    s = settings()
    if not s.cartesia_api_key or not s.agent_id:
        return JSONResponse({"error": "Run the setup script first: uv run scripts/setup_agent.py"}, 503)
    ip = request.client.host if request.client else "?"
    hits = _token_hits[ip]
    now = time.monotonic()
    while hits and now - hits[0] > 60:
        hits.popleft()
    if len(hits) >= 10:
        return JSONResponse({"error": "Too many calls. Wait a minute."}, 429)
    hits.append(now)
    try:
        tok = cartesia(s).mint_agent_token(60)
    except CartesiaError as e:
        log.warning("token mint failed: %s", e.status)
        return JSONResponse({"error": "Could not start a call."}, 502)
    return JSONResponse({"token": tok, "agentId": s.agent_id}, headers={"Cache-Control": "no-store"})

@app.post("/api/calls/{call_id}/sync")
def sync_call(call_id: str) -> JSONResponse:
    """Fetches a call from Cartesia and stores it the same way a call_completed webhook would."""
    s = settings()
    if not webhooks.CALL_ID.match(call_id):
        raise HTTPException(400, "Bad call id.")
    try:
        call = cartesia(s).get_call(call_id)
    except CartesiaError as e:
        return JSONResponse({"error": "Could not load the call."}, 404 if e.status == 404 else 502)
    if s.agent_id and call.get("agent_id") != s.agent_id:
        raise HTTPException(404, "No such call.")
    store().upsert_call(call)
    return JSONResponse({"stored": call_id, "status": call.get("status")})

@app.post("/api/client-tools/{name}")
async def client_tool(name: str, request: Request) -> PlainTextResponse:
    """The browser forwards client_tool_call events here. Same handlers as the webhook tools."""
    if name not in TOOL_NAMES:
        raise HTTPException(404, "Unknown tool.")
    body = await request.json()
    params = dict(body.get("parameters") or {}) if isinstance(body, dict) else {}
    params["call_id"] = str(body.get("call_id") or "") if isinstance(body, dict) else ""
    params.pop("call_direction", None)
    return PlainTextResponse(tools(settings()).run(name, params))

@app.post("/tools/{name}")
async def webhook_tool(name: str, request: Request) -> PlainTextResponse:
    s = settings()
    if name not in TOOL_NAMES:
        raise HTTPException(404, "Unknown tool.")
    given = request.headers.get("x-tool-secret", "")
    if not s.tool_secret or not hmac.compare_digest(given.encode(), s.tool_secret.encode()):
        raise HTTPException(401, "unauthorized")
    body = await request.json()
    params = body if isinstance(body, dict) else {}
    return PlainTextResponse(tools(s).run(name, params))

@app.post("/webhooks/cartesia")
async def cartesia_webhook(request: Request) -> JSONResponse:
    s = settings()
    try:
        body = await request.json()
    except ValueError:
        body = None
    verdict = webhooks.check(
        {k.lower(): v for k, v in request.headers.items()}, body, secret=s.webhook_secret, agent_id=s.agent_id
    )
    if verdict:
        return JSONResponse({"error": verdict.detail}, verdict.status)
    assert isinstance(body, dict)
    result = webhooks.ingest(store(), body)
    log.info("webhook %s %s: %s", body.get("type"), body.get("call_id"), result)
    return JSONResponse({"ok": True, "result": result})

@app.get("/api/health")
def health() -> dict[str, Any]:
    s = settings()
    return {**setup_state(s), "tool_mode": s.tool_mode, "calendar": make_calendar(s, store()).name}
