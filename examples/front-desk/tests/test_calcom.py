import json
import logging
from datetime import date, datetime
from zoneinfo import ZoneInfo

import httpx
import pytest

from front_desk.calendars import CalComCalendar, CalendarError, make_calendar
from front_desk.config import settings
from front_desk.store import Store
from front_desk.tools import Tools


def test_calcom_slots_and_booking_requests(monkeypatch):
    monkeypatch.setenv("CALCOM_API_KEY", "cal_test")
    monkeypatch.setenv("CALCOM_EVENT_TYPE_ID", "42")
    s = settings()
    seen = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        if req.url.path == "/v2/slots":
            return httpx.Response(
                200,
                json={
                    "status": "success",
                    "data": {
                        "2026-10-17": [
                            {"start": "2026-10-17T13:00:00.000-07:00"},
                            {"start": "2026-10-17T13:30:00.000-07:00"},
                        ]
                    },
                },
            )
        return httpx.Response(201, json={"status": "success", "data": {"id": 1, "uid": "bk_1"}})

    store = Store(s.database_path)
    cal = CalComCalendar(
        s, store, httpx.Client(base_url="https://api.cal.com", transport=httpx.MockTransport(handler))
    )
    assert isinstance(make_calendar(s, store), CalComCalendar)

    slots = cal.open_slots(date(2026, 10, 17))
    assert [t.hour for t in slots] == [13, 13]
    q = seen[0]
    assert q.headers["cal-api-version"] == "2024-09-04"
    assert q.headers["authorization"] == "Bearer cal_test"
    assert q.url.params["eventTypeId"] == "42" and q.url.params["timeZone"] == "America/Los_Angeles"

    start = datetime(2026, 10, 17, 13, tzinfo=ZoneInfo("America/Los_Angeles"))
    result = cal.book(start=start, name="Dana Park", phone="+14155550123", service="cut", call_id="ac_1")
    assert result.ok and result.external_id == "bk_1"
    body = json.loads(seen[1].content)
    assert seen[1].headers["cal-api-version"] == "2026-02-25"
    assert body["start"] == "2026-10-17T20:00:00Z" and body["eventTypeId"] == 42
    assert body["attendee"] == {
        "name": "Dana Park",
        "timeZone": "America/Los_Angeles",
        "phoneNumber": "+14155550123",
    }
    assert store.list_appointments()[0]["external_id"] == "bk_1"


def _cal(monkeypatch, handler):
    monkeypatch.setenv("CALCOM_API_KEY", "cal_test")
    monkeypatch.setenv("CALCOM_EVENT_TYPE_ID", "42")
    s = settings()
    store = Store(s.database_path)
    client = httpx.Client(base_url="https://api.cal.com", transport=httpx.MockTransport(handler))
    return CalComCalendar(s, store, client), store


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, text="<html>maintenance</html>"),
        httpx.Response(200, json=[1, 2]),
        httpx.Response(200, json={"data": ["not", "a", "dict"]}),
    ],
)
def test_calcom_unreadable_slots_raise_calendar_error(monkeypatch, response):
    cal, _ = _cal(monkeypatch, lambda req: response)
    with pytest.raises(CalendarError):
        cal.open_slots(date(2026, 10, 17))


def test_calcom_booking_with_unreadable_body_still_counts(monkeypatch):
    cal, store = _cal(monkeypatch, lambda req: httpx.Response(201, text="ok"))
    start = datetime(2026, 10, 17, 13, tzinfo=ZoneInfo("America/Los_Angeles"))
    result = cal.book(start=start, name="Dana Park", phone="", service="cut", call_id="ac_1")
    assert result.ok and result.external_id == ""
    assert len(store.list_appointments()) == 1


def test_shared_calcom_client_closes_on_shutdown():
    from front_desk.calendars import calcom_client, close_calcom_client

    first = calcom_client()
    assert calcom_client() is first
    close_calcom_client()
    assert first.is_closed
    assert calcom_client() is not first
    close_calcom_client()


def test_calcom_failures_log_path_and_status_but_not_the_key(monkeypatch, caplog):
    cal, _ = _cal(monkeypatch, lambda req: httpx.Response(503, text="down"))
    with caplog.at_level(logging.WARNING, logger="front_desk.calendars"), pytest.raises(CalendarError):
        cal.open_slots(date(2026, 10, 17))
    assert "/v2/slots" in caplog.text and "503" in caplog.text
    caplog.clear()
    start = datetime(2026, 10, 17, 13, tzinfo=ZoneInfo("America/Los_Angeles"))
    with caplog.at_level(logging.WARNING, logger="front_desk.calendars"):
        assert not cal.book(start=start, name="Dana", phone="", service="", call_id="ac_1").ok
    assert "/v2/bookings" in caplog.text and "503" in caplog.text

    def boom(req):
        raise httpx.ConnectError("no route", request=req)

    cal, _ = _cal(monkeypatch, boom)
    caplog.clear()
    with caplog.at_level(logging.WARNING, logger="front_desk.calendars"), pytest.raises(CalendarError):
        cal.open_slots(date(2026, 10, 17))
    assert "/v2/slots" in caplog.text and "ConnectError" in caplog.text
    assert "cal_test" not in caplog.text and "Bearer" not in caplog.text


def test_next_open_days_asks_calcom_once(monkeypatch):
    seen = []

    def handler(req):
        seen.append(req)
        return httpx.Response(
            200,
            json={
                "data": {
                    "2026-10-19": [{"start": "2026-10-19T09:00:00.000-07:00"}],
                    "2026-10-21": [
                        {"start": "2026-10-21T10:00:00.000-07:00"},
                        {"start": "2026-10-21T15:00:00.000-07:00"},
                    ],
                    "2026-10-22": [{"start": "2026-10-22T14:00:00.000-07:00"}],
                    "2026-10-23": [{"start": "2026-10-23T11:00:00.000-07:00"}],
                }
            },
        )

    cal, store = _cal(monkeypatch, handler)
    now = datetime(2026, 10, 18, 8, tzinfo=ZoneInfo("America/Los_Angeles"))
    out = json.loads(Tools(cal.s, store, cal, now=now).run("check_availability", {}))
    assert len(seen) == 1
    assert seen[0].url.params["start"] == "2026-10-18" and seen[0].url.params["end"] == "2026-10-31"
    assert [d["date"] for d in out["next_open_days"]] == ["2026-10-19", "2026-10-21", "2026-10-22"]
    assert out["next_open_days"][1]["open_times"] == ["10 AM", "3 PM"]

    seen.clear()
    out = json.loads(
        Tools(cal.s, store, cal, now=now).run("check_availability", {"part_of_day": "afternoon"})
    )
    assert len(seen) == 1
    assert [d["date"] for d in out["next_open_days"]] == ["2026-10-21", "2026-10-22"]
