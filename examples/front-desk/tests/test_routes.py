import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from front_desk import main
from front_desk.cartesia import Cartesia, CartesiaError

FIXTURES = Path(__file__).parent / "fixtures"
SECRET = "test-webhook-secret-0123456789"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("CARTESIA_AGENT_ID", "agent_simulated")
    monkeypatch.setenv("CARTESIA_WEBHOOK_SECRET", SECRET)
    return TestClient(main.app)


def fixture(name):
    return json.loads((FIXTURES / name).read_text())


def post_event(client, event, secret=SECRET):
    return client.post("/webhooks/cartesia", json=event, headers={"x-webhook-secret": secret})


def test_pages_render_with_no_data(client):
    for path in ("/", "/inbox", "/try", "/partials/calls"):
        r = client.get(path)
        assert r.status_code == 200, path
    assert "No calls yet" in client.get("/").text


def test_unknown_call_renders_a_not_found_page(client):
    r = client.get("/calls/ac_missing")
    assert r.status_code == 404
    assert r.headers["content-type"].startswith("text/html")
    assert "Call not found" in r.text and 'href="/"' in r.text and "All calls" in r.text


def test_inbox_names_the_configured_database(client, tmp_path):
    assert str(tmp_path / "test.db") in client.get("/inbox").text


def test_webhook_rejects_bad_secret_other_agent_and_missing_config(client, monkeypatch):
    ev = fixture("call_completed.json")
    assert post_event(client, ev, secret="nope").status_code == 401
    assert post_event(client, ev | {"agent_id": "agent_other"}).status_code == 400
    monkeypatch.setenv("CARTESIA_WEBHOOK_SECRET", "")
    assert post_event(client, ev).status_code == 503


def test_call_completed_fills_the_dashboard_once(client):
    ev = fixture("call_completed.json")
    assert post_event(client, ev).json()["result"] == "stored call"
    assert post_event(client, ev).json()["result"] == "duplicate"
    assert post_event(client, fixture("post_call_analysis.json")).json()["result"] == "stored summary"

    page = client.get("/").text
    assert "+14155550123" in page and "Booked" in page and "Dana Park booked a haircut" in page

    detail = client.get("/calls/ac_sim_7Kq2mXbR9cLdNfPz").text
    assert "182 ms" in detail
    assert "check_availability" in detail and "book_appointment" in detail
    assert "88 ms" in detail


def test_call_turn_events_build_a_transcript(client):
    base = {"type": "call_turn", "call_id": "ac_turns", "agent_id": "agent_simulated"}
    post_event(
        client,
        base
        | {
            "webhook_request_id": "r1",
            "turn": {
                "id": 0,
                "role": "assistant",
                "text": "Hi",
                "start_timestamp": 0.1,
                "end_timestamp": 1,
                "tts_ttfb": 0.09,
            },
        },
    )
    post_event(
        client,
        base
        | {
            "webhook_request_id": "r2",
            "turn": {
                "id": 1,
                "role": "user",
                "text": "Hello",
                "start_timestamp": 1.5,
                "end_timestamp": 2,
                "stt_ttfb": 0.2,
            },
        },
    )
    call = main.store().get_call("ac_turns")
    assert [t.text for t in call.visible_turns] == ["Hi", "Hello"]


def test_webhook_tools_need_the_tool_secret(client, monkeypatch):
    assert client.post("/tools/check_availability", json={}).status_code == 401
    monkeypatch.setenv("TOOL_SECRET", "tool-secret")
    r = client.post(
        "/tools/take_message",
        json={"name": "Ana", "message": "hi", "call_id": "ac_x"},
        headers={"x-tool-secret": "tool-secret"},
    )
    assert r.status_code == 200 and json.loads(r.text)["saved"] is True
    assert client.post("/tools/rm_rf", json={}, headers={"x-tool-secret": "tool-secret"}).status_code == 404


def test_client_tool_route_never_allows_a_transfer(client, monkeypatch):
    monkeypatch.setenv("TRANSFER_NUMBER", "+14155550100")
    r = client.post(
        "/api/client-tools/transfer_call",
        json={"call_id": "ac_web", "parameters": {"reason": "x", "call_direction": "inbound"}},
    )
    assert json.loads(r.text)["transfer_available"] is False


def test_token_route(client, monkeypatch):
    assert client.post("/api/token").status_code == 503
    monkeypatch.setenv("CARTESIA_API_KEY", "sk_test")
    monkeypatch.setattr(Cartesia, "mint_agent_token", lambda self, expires_in=60: "tok_123")
    r = client.post("/api/token")
    assert r.json() == {"token": "tok_123", "agentId": "agent_simulated"}
    assert r.headers["cache-control"] == "no-store"
    assert "sk_test" not in r.text


def test_sync_stores_only_this_agents_calls(client, monkeypatch):
    monkeypatch.setenv("CARTESIA_API_KEY", "sk_test")
    call = fixture("call_completed.json")["call"] | {"id": "ac_live", "agent_id": "agent_simulated"}
    monkeypatch.setattr(Cartesia, "get_call", lambda self, cid: call)
    assert client.post("/api/calls/ac_live/sync").json()["status"] == "completed"
    assert main.store().get_call("ac_live").outcome == "Booked"

    monkeypatch.setattr(Cartesia, "get_call", lambda self, cid: call | {"agent_id": "agent_other"})
    assert client.post("/api/calls/ac_live/sync").status_code == 404

    def missing(self, cid):
        raise CartesiaError(404, "gone")

    monkeypatch.setattr(Cartesia, "get_call", missing)
    assert client.post("/api/calls/ac_nope/sync").status_code == 404
    assert client.post("/api/calls/bad id!/sync").status_code in (400, 404)


def test_tool_routes_reject_malformed_json(client, monkeypatch):
    bad = {"content": b"{not json", "headers": {"Content-Type": "application/json"}}
    r = client.post("/api/client-tools/take_message", **bad)
    assert r.status_code == 400 and r.json() == {"detail": "Request body must be a JSON object."}
    assert client.post("/api/client-tools/take_message", json=[1, 2]).status_code == 400
    monkeypatch.setenv("TOOL_SECRET", "tool-secret")
    bad["headers"]["x-tool-secret"] = "tool-secret"
    assert client.post("/tools/take_message", **bad).status_code == 400


def test_webhook_retry_after_a_failed_apply_is_not_dropped(client, monkeypatch):
    from front_desk import webhooks

    ev = fixture("call_completed.json")
    real = webhooks._apply

    def boom(store, event):
        raise RuntimeError("disk full")

    monkeypatch.setattr(webhooks, "_apply", boom)
    with pytest.raises(RuntimeError):
        post_event(client, ev)
    monkeypatch.setattr(webhooks, "_apply", real)
    assert post_event(client, ev).json()["result"] == "stored call"
    assert post_event(client, ev).json()["result"] == "duplicate"


def test_tool_routes_run_tools_off_the_event_loop(client, monkeypatch):
    import asyncio

    from front_desk.tools import Tools

    loops = []

    def fake_run(self, name, params):
        try:
            loops.append(asyncio.get_running_loop())
        except RuntimeError:
            loops.append(None)
        return "{}"

    monkeypatch.setattr(Tools, "run", fake_run)
    monkeypatch.setenv("TOOL_SECRET", "tool-secret")
    client.post("/api/client-tools/take_message", json={"call_id": "ac_web", "parameters": {}})
    client.post("/tools/take_message", json={}, headers={"x-tool-secret": "tool-secret"})
    assert loops == [None, None]


def test_late_call_started_does_not_undo_completed(client):
    done = fixture("call_completed.json")
    post_event(client, done)
    started = {
        "type": "call_started",
        "call_id": done["call_id"],
        "agent_id": "agent_simulated",
        "webhook_request_id": "webhook_req_late_start",
    }
    assert post_event(client, started).json()["result"] == "stored call"
    assert main.store().get_call(done["call_id"]).status == "completed"


def test_cartesia_client_closes_its_http_client():
    with Cartesia("sk_test") as api:
        pass
    assert api.http.is_closed
