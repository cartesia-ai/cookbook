import json
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from front_desk.calendars import LocalCalendar
from front_desk.config import settings
from front_desk.store import Store
from front_desk.tools import Tools

NOW = datetime(2026, 10, 16, 8, 0, tzinfo=ZoneInfo("America/Los_Angeles"))


@pytest.fixture
def tools():
    s = settings()
    store = Store(s.database_path)
    return Tools(s, store, LocalCalendar(s, store, now=NOW), now=NOW), store


def run(t, tool, **params):
    return json.loads(t.run(tool, params))


def test_availability_for_a_day(tools):
    t, _ = tools
    out = run(t, "check_availability", date="2026-10-17", part_of_day="afternoon")
    assert out["day"] == "Saturday, October 17"
    assert out["open_times"] == ["12 PM", "12:30 PM", "1 PM", "1:30 PM"]


def test_closed_day_points_to_next_open_days(tools):
    t, _ = tools
    out = run(t, "check_availability", date="Sunday")
    assert out["open_times"] == []
    assert out["next_open_days"][0]["date"] == "2026-10-19"


def test_book_then_slot_is_gone(tools):
    t, store = tools
    ok = run(t, "book_appointment", date="2026-10-17", time="1 PM", name="Dana Park", call_id="ac_1")
    assert ok == {"booked": True, "day": "Saturday, October 17", "time": "1 PM", "name": "Dana Park"}
    again = run(t, "book_appointment", date="2026-10-17", time="1 PM", name="Sam Lee")
    assert again["booked"] is False and "1 PM" not in again["open_times"]
    (appt,) = store.list_appointments()
    assert appt["call_id"] == "ac_1" and appt["start_at"] == "2026-10-17T20:00:00+00:00"


def test_book_rejects_closed_hours_and_missing_name(tools):
    t, _ = tools
    assert run(t, "book_appointment", date="2026-10-17", time="6 PM", name="Dana")["booked"] is False
    assert run(t, "book_appointment", date="2026-10-17", time="1 PM", name="")["booked"] is False


def test_message_uses_caller_number_when_none_given(tools):
    t, store = tools
    out = run(t, "take_message", name="Ana", message="Call me about color", caller_number="+14155550123")
    assert out == {"saved": True, "callback_number_known": True}
    assert store.list_messages()[0]["phone"] == "+14155550123"


def test_transfer_only_on_phone_calls_with_a_number(tools, monkeypatch):
    t, _ = tools
    assert run(t, "transfer_call", reason="billing", call_direction="inbound")["transfer_available"] is False
    monkeypatch.setenv("TRANSFER_NUMBER", "+14155550100")
    s = settings()
    t2 = Tools(s, t.store, t.calendar, now=NOW)
    assert run(t2, "transfer_call", reason="billing", call_direction="inbound")["transfer_available"] is True
    assert run(t2, "transfer_call", reason="billing", call_direction="")["transfer_available"] is False


def test_unknown_tool_and_result_size(tools):
    t, _ = tools
    assert "error" in run(t, "drop_tables")
    assert len(t.run("check_availability", {}).encode()) < 4096


def test_store_file_is_owner_only(tmp_path):
    import stat

    path = tmp_path / "fresh" / "front-desk.db"
    Store(path)
    assert stat.S_IMODE(path.parent.stat().st_mode) == 0o700
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    path.chmod(0o644)
    Store(path)
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
