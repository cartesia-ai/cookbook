"""Replay a recorded-shape call to your webhook, so the dashboard has a phone call to show.

    uv run scripts/send_test_webhook.py                       # http://localhost:8000
    uv run scripts/send_test_webhook.py --url http://localhost:4511/webhooks/cartesia

It sends call_started, one call_turn per transcript turn, call_completed and
post_call_analysis, built from tests/fixtures/*.json, with the same headers and envelope
Cartesia uses. It signs nothing, because Cartesia does not sign: it sends your
CARTESIA_WEBHOOK_SECRET in `x-webhook-secret` and your CARTESIA_AGENT_ID in the envelope.
Run it twice and the second run is ignored as a retry, by `webhook_request_id`.
"""

from __future__ import annotations

import copy
import json
import os
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from front_desk.config import load_env  # noqa: E402

FIXTURES = ROOT / "tests" / "fixtures"

def events(agent_id: str) -> list[dict]:
    completed = json.loads((FIXTURES / "call_completed.json").read_text())
    analysis = json.loads((FIXTURES / "post_call_analysis.json").read_text())
    call = completed["call"]
    base = {k: completed[k] for k in ("call_id", "webhook_id")} | {"agent_id": agent_id}
    call["agent_id"] = agent_id

    started_call = {k: v for k, v in call.items() if k not in ("end_time", "end_reason", "transcript")}
    started_call["status"] = "started"
    out = [
        base
        | {
            "type": "call_started",
            "webhook_request_id": "webhook_req_sim_started_1",
            "timestamp": call["start_time"],
            "call": started_call,
        }
    ]
    for i, turn in enumerate(call["transcript"]):
        out.append(
            base
            | {
                "type": "call_turn",
                "webhook_request_id": f"webhook_req_sim_turn_{i}",
                "timestamp": call["start_time"],
                "turn": {"id": i, **turn},
            }
        )
    out.append(completed | {"agent_id": agent_id})
    out.append(analysis | {"agent_id": agent_id})
    return copy.deepcopy(out)

def main(argv: list[str]) -> int:
    load_env()
    url = argv[argv.index("--url") + 1] if "--url" in argv else "http://localhost:8000/webhooks/cartesia"
    secret = os.environ.get("CARTESIA_WEBHOOK_SECRET", "")
    agent_id = os.environ.get("CARTESIA_AGENT_ID", "") or "agent_simulated"
    if not secret:
        print("CARTESIA_WEBHOOK_SECRET is empty. Put any long random string in .env for local tests.")
        return 1
    with httpx.Client(timeout=10) as http:
        for ev in events(agent_id):
            r = http.post(url, json=ev, headers={"x-webhook-secret": secret, "user-agent": "front-desk-test"})
            print(f"{ev['type']:<20} {r.status_code} {r.text[:80]}")
            if r.status_code >= 400:
                return 1
    print(f"Open http://{httpx.URL(url).netloc.decode()}/calls/{ev['call_id']}")
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
