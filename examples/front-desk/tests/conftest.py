import pytest

ENV_KEYS = [
    "CARTESIA_API_KEY",
    "CARTESIA_AGENT_ID",
    "CARTESIA_WEBHOOK_SECRET",
    "TOOL_SECRET",
    "PUBLIC_BASE_URL",
    "BUSINESS_NAME",
    "BUSINESS_SERVICES",
    "BUSINESS_TIMEZONE",
    "BUSINESS_HOURS",
    "APPOINTMENT_MINUTES",
    "TRANSFER_NUMBER",
    "CALCOM_API_KEY",
    "CALCOM_EVENT_TYPE_ID",
    "AGENT_MODEL_ID",
    "CARTESIA_VOICE_ID",
    "CARTESIA_WEBHOOK_ID",
]

@pytest.fixture(autouse=True)
def clean_env(monkeypatch, tmp_path):
    """Every test starts from defaults and its own database, whatever is in .env."""
    for k in ENV_KEYS:
        monkeypatch.setenv(k, "")
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("BUSINESS_TIMEZONE", "America/Los_Angeles")
    yield
