import json
from datetime import date, datetime
from zoneinfo import ZoneInfo

import httpx

from front_desk.calendars import CalComCalendar, make_calendar
from front_desk.config import settings
from front_desk.store import Store


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
