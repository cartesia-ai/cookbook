import importlib.util
from pathlib import Path

from front_desk.config import settings
from front_desk.tools import TOOL_SPECS

spec = importlib.util.spec_from_file_location(
    "setup_agent", Path(__file__).parent.parent / "scripts" / "setup_agent.py"
)
setup_agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup_agent)


def test_client_tools_without_a_public_url():
    s = settings()
    body = setup_agent.tool_body(TOOL_SPECS[1], s, "x")
    assert body["type"] == "client" and body["expects_response"] is True
    assert "call_id" not in body["parameters"]["properties"]


def test_webhook_tools_with_a_public_url(monkeypatch):
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://desk.example.com/")
    s = settings()
    body = setup_agent.tool_body(TOOL_SPECS[1], s, "tool-secret")
    api = body["api_schema"]
    assert api["url"] == "https://desk.example.com/tools/book_appointment"
    assert api["request_body_schema"]["properties"]["call_id"] == {
        "type": "string",
        "dynamic_variable": "system__conversation_id",
    }
    assert api["request_headers"]["X-Tool-Secret"] == {"type": "secret", "secret_value": "tool-secret"}


def test_agent_body(monkeypatch):
    s = settings()
    body = setup_agent.agent_body(s, ["t1"])
    cfg = body["config"]
    assert cfg["tools"] == [{"id": "t1"}]
    assert cfg["system_tools"]["transfer_to_number"] is None
    assert "Juniper Hair Studio" in cfg["initial_message"]
    assert "{{system__time}}" in cfg["instructions"]
    monkeypatch.setenv("TRANSFER_NUMBER", "+14155550100")
    cfg = setup_agent.agent_body(settings(), [])["config"]
    assert (
        cfg["system_tools"]["transfer_to_number"]["transfers"][0]["destination"]["phone_number"]
        == "+14155550100"
    )


def test_upsert_env(tmp_path):
    p = tmp_path / ".env"
    p.write_text("A=1\nCARTESIA_AGENT_ID=\n")
    setup_agent.upsert_env(p, "CARTESIA_AGENT_ID", "agent_x")
    setup_agent.upsert_env(p, "NEW", "y")
    assert p.read_text() == "A=1\nCARTESIA_AGENT_ID=agent_x\nNEW=y\n"
