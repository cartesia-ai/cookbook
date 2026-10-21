import base64
import sys

import pytest
from fastapi.testclient import TestClient

from front_desk import main
from front_desk.auth import allowed_hosts, bind_host, check_deploy_config
from front_desk.cartesia import Cartesia
from front_desk.config import settings

ALL = "0.0.0.0"  # noqa: S104
SECRET = "test-webhook-secret-0123456789"
PROTECTED_GETS = [
    "/",
    "/partials/calls",
    "/calls/ac_x",
    "/calls/ac_x/recording",
    "/inbox",
    "/try",
    "/api/health",
]
PROTECTED_POSTS = ["/api/token", "/api/calls/ac_x/sync", "/api/client-tools/take_message"]


def basic(password, user="anyone"):
    token = base64.b64encode(f"{user}:{password}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


@pytest.fixture
def locked(monkeypatch):
    monkeypatch.setenv("DASHBOARD_PASSWORD", "open-sesame")
    monkeypatch.setenv("CARTESIA_AGENT_ID", "agent_simulated")
    monkeypatch.setenv("CARTESIA_WEBHOOK_SECRET", SECRET)
    return TestClient(main.app)


def test_every_dashboard_route_needs_the_password(locked):
    for path in PROTECTED_GETS:
        r = locked.get(path)
        assert r.status_code == 401, path
        assert r.headers["www-authenticate"] == 'Basic realm="app"'
    for path in PROTECTED_POSTS:
        assert locked.post(path, json={}).status_code == 401, path
    assert locked.get("/", headers=basic("wrong")).status_code == 401
    assert locked.get("/", headers={"Authorization": "Basic !!!"}).status_code == 401
    assert locked.get("/", headers={"Authorization": "Bearer open-sesame"}).status_code == 401


def test_right_password_with_any_username_gets_in(locked):
    assert locked.get("/", headers=basic("open-sesame")).status_code == 200
    assert locked.get("/inbox", headers=basic("open-sesame", user="")).status_code == 200
    r = locked.post(
        "/api/client-tools/take_message",
        json={"call_id": "ac_web", "parameters": {"name": "Ana", "message": "hi"}},
        headers=basic("open-sesame"),
    )
    assert r.status_code == 200


def test_webhook_tools_and_static_skip_the_password(locked, monkeypatch):
    assert locked.get("/static/app.css").status_code == 200
    r = locked.post("/webhooks/cartesia", json={}, headers={"x-webhook-secret": SECRET})
    assert r.status_code == 400
    assert locked.post("/webhooks/cartesia", json={}).status_code == 401
    monkeypatch.setenv("TOOL_SECRET", "tool-secret")
    r = locked.post(
        "/tools/take_message",
        json={"name": "Ana", "message": "hi", "call_id": "ac_x"},
        headers={"x-tool-secret": "tool-secret"},
    )
    assert r.status_code == 200


def test_local_run_with_no_password_is_open():
    with TestClient(main.app) as client:
        assert client.get("/").status_code == 200


def test_deployed_without_a_password_refuses_to_start(monkeypatch):
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://front-desk.example.com")
    with pytest.raises(RuntimeError, match="DASHBOARD_PASSWORD"):
        with TestClient(main.app):
            pass
    assert TestClient(main.app).get("/").status_code == 503


@pytest.mark.parametrize("host", [ALL, "192.168.1.20", "::", "front-desk.internal"])
def test_client_mode_on_a_network_host_without_a_password_refuses_to_start(host):
    with pytest.raises(RuntimeError, match="DASHBOARD_PASSWORD"):
        check_deploy_config(settings(), host)


@pytest.mark.parametrize("host", ["127.0.0.1", "::1", "[::1]", "localhost", "LOCALHOST"])
def test_client_mode_on_loopback_without_a_password_starts(host):
    check_deploy_config(settings(), host)


def test_client_mode_on_a_network_host_with_a_password_starts(monkeypatch):
    monkeypatch.setenv("DASHBOARD_PASSWORD", "open-sesame")
    check_deploy_config(settings(), ALL)


def test_bind_host_reads_uvicorn_args_then_env():
    assert bind_host(["uvicorn", "front_desk.main:app", "--host", ALL], {}) == ALL
    assert bind_host(["uvicorn", "front_desk.main:app", "--host=::"], {}) == "::"
    assert bind_host(["uvicorn", "front_desk.main:app"], {"UVICORN_HOST": "10.0.0.5"}) == "10.0.0.5"
    assert bind_host(["uvicorn", "front_desk.main:app"], {}) == "127.0.0.1"


def test_app_refuses_to_start_when_uvicorn_binds_all_interfaces(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["uvicorn", "front_desk.main:app", "--host", ALL])
    with pytest.raises(RuntimeError, match=ALL):
        with TestClient(main.app):
            pass


def test_deployed_with_a_password_starts(monkeypatch):
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://front-desk.example.com")
    monkeypatch.setenv("DASHBOARD_PASSWORD", "open-sesame")
    with TestClient(main.app) as client:
        assert client.get("/").status_code == 401
        assert client.get("/", headers=basic("open-sesame")).status_code == 200


def mint(client, ip, spoofed="198.51.100.7"):
    return client.post("/api/token", headers={"x-forwarded-for": f"{spoofed}, {ip}"})


@pytest.fixture
def token_client(monkeypatch):
    monkeypatch.setenv("CARTESIA_API_KEY", "sk_test")
    monkeypatch.setenv("CARTESIA_AGENT_ID", "agent_simulated")
    monkeypatch.setattr(Cartesia, "mint_agent_token", lambda self, expires_in=60: "tok_123")
    return TestClient(main.app)


def test_token_limit_ignores_forwarded_for_by_default(token_client):
    codes = [mint(token_client, f"203.0.113.{i}").status_code for i in range(11)]
    assert codes[:10] == [200] * 10 and codes[10] == 429


def test_token_limit_uses_last_forwarded_for_behind_a_proxy(token_client, monkeypatch):
    monkeypatch.setenv("TRUST_PROXY", "1")
    for i in range(10):
        assert mint(token_client, "203.0.113.1", spoofed=f"198.51.100.{i}").status_code == 200
    assert mint(token_client, "203.0.113.1", spoofed="198.51.100.99").status_code == 429
    assert mint(token_client, "203.0.113.2").status_code == 200


def test_token_buckets_are_evicted():
    main._token_hits.clear()
    for i in range(1001):
        assert main._allow_token(f"ip{i}", 0.0)
    assert main._allow_token("late", 120.0)
    assert set(main._token_hits) == {"late"}


def test_client_tools_refuse_non_json_bodies(locked):
    # A cross-site <form> or no-cors fetch can only send text/plain, form or multipart bodies.
    body = b'{"call_id": "ac_x", "parameters": {"name": "Eve", "message": "spam"}}'
    for ctype in ("text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", ""):
        r = locked.post(
            "/api/client-tools/take_message",
            content=body,
            headers={"Content-Type": ctype, **basic("open-sesame")},
        )
        assert r.status_code == 415, ctype
        assert r.json() == {"detail": "Send JSON."}
    assert main.store().list_messages() == []
    r = locked.post(
        "/api/client-tools/take_message",
        content=body,
        headers={"Content-Type": "application/json; charset=utf-8", **basic("open-sesame")},
    )
    assert r.status_code == 200 and len(main.store().list_messages()) == 1


def test_unknown_host_headers_are_refused():
    for base in ("http://localhost:8000", "http://127.0.0.1:8000", "http://[::1]:8000"):
        assert TestClient(main.app, base_url=base).get("/").status_code == 200, base
    r = TestClient(main.app, base_url="http://rebind.attacker.example:8000").get("/")
    assert r.status_code == 400 and r.text == "Invalid host header"
    assert TestClient(main.app, base_url="http://localhost.attacker.example").get("/").status_code == 400


def test_public_base_url_host_is_allowed(monkeypatch):
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://front-desk.example.com")
    monkeypatch.setenv("DASHBOARD_PASSWORD", "open-sesame")
    ok = TestClient(main.app, base_url="https://front-desk.example.com")
    assert ok.get("/", headers=basic("open-sesame")).status_code == 200
    assert TestClient(main.app, base_url="https://other.example.com").get("/").status_code == 400


def test_allowed_hosts():
    s = settings()
    assert allowed_hosts(s) == ["127.0.0.1", "localhost", "[::1]"]
    assert allowed_hosts(s, ALL) == ["127.0.0.1", "localhost", "[::1]"]


def test_allowed_hosts_open_up_only_on_a_network_bind_with_a_password(monkeypatch):
    monkeypatch.setenv("DASHBOARD_PASSWORD", "open-sesame")
    s = settings()
    assert allowed_hosts(s, ALL) == ["*"]
    assert allowed_hosts(s, "127.0.0.1") == ["127.0.0.1", "localhost", "[::1]"]
    monkeypatch.setattr(sys, "argv", ["uvicorn", "front_desk.main:app", "--host", ALL])
    assert TestClient(main.app, base_url="http://anything.example").get("/").status_code == 401
