"""Cartesia call webhooks: check the request, then store what it says.

Cartesia does not sign webhook bodies. It sends the secret you registered in the
`x-webhook-secret` header (https://docs.cartesia.ai/line/infrastructure/observability#webhooks).
So this module compares that header in constant time, rejects events for other agents, and
drops retries by `webhook_request_id`, which stays the same across delivery attempts.
"""

from __future__ import annotations

import hmac
import re
from dataclasses import dataclass
from typing import Any

from .store import Store

CALL_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")

@dataclass
class Verdict:
    status: int
    detail: str

def check(headers: dict[str, str], body: Any, *, secret: str, agent_id: str) -> Verdict | None:
    """Returns a rejection, or None when the event should be processed."""
    if not secret:
        return Verdict(503, "CARTESIA_WEBHOOK_SECRET is not set.")
    given = headers.get("x-webhook-secret", "")
    if not hmac.compare_digest(given.encode(), secret.encode()):
        return Verdict(401, "unauthorized")
    if not isinstance(body, dict) or not isinstance(body.get("type"), str):
        return Verdict(400, "Not a webhook event.")
    if agent_id and body.get("agent_id") != agent_id:
        return Verdict(400, "Event is for another agent.")
    call_id = body.get("call_id")
    if not isinstance(call_id, str) or not CALL_ID.match(call_id):
        return Verdict(400, "Missing call_id.")
    return None

def ingest(store: Store, event: dict[str, Any]) -> str:
    """Stores one event. Returns what happened, for the response body and logs."""
    request_id = event.get("webhook_request_id")
    if isinstance(request_id, str) and request_id:
        if store.seen(request_id):
            return "duplicate"
        result = _apply(store, event)
        store.first_delivery(request_id)
        return result
    return _apply(store, event)

def _apply(store: Store, event: dict[str, Any]) -> str:
    kind = event["type"]
    call_id = event["call_id"]
    if kind in ("call_started", "call_completed", "call_failed"):
        call = dict(event.get("call") or {})
        call.setdefault("id", call_id)
        call.setdefault("agent_id", event.get("agent_id"))
        if not call.get("transcript") and isinstance(event.get("body"), list):
            call["transcript"] = event["body"]
        call.setdefault("end_reason", event.get("end_reason"))
        if kind == "call_started":
            call.setdefault("status", "started")
        store.upsert_call(call)
        return "stored call"
    if kind == "call_turn":
        turn = event.get("turn") or event.get("body")
        if isinstance(turn, dict):
            store.upsert_turn(call_id, turn)
            return "stored turn"
        return "ignored"
    if kind == "post_call_analysis":
        summary = (event.get("analysis") or {}).get("summary")
        if isinstance(summary, str) and summary:
            store.set_summary(call_id, summary)
        return "stored summary"
    return "ignored"
