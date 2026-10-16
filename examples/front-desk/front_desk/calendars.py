"""Where appointments live: a local calendar (the default) or Cal.com.

LocalCalendar needs nothing but the opening hours in `.env`. Free slots are computed in
memory from those hours, and bookings are rows in the app's SQLite file, so a booking
survives a restart. Set CALCOM_API_KEY and CALCOM_EVENT_TYPE_ID to use Cal.com instead.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Protocol

import httpx

from .config import Settings
from .store import Store

CALCOM_BASE_URL = "https://api.cal.com"
CALCOM_SLOTS_VERSION = "2024-09-04"
CALCOM_BOOKINGS_VERSION = "2026-02-25"

class CalendarError(Exception):
    """The calendar could not answer. The message is safe to hand to the LLM."""

@dataclass
class Booking:
    ok: bool
    external_id: str = ""
    reason: str = ""

class Calendar(Protocol):
    name: str

    def open_slots(self, day: date) -> list[datetime]: ...

    def book(self, *, start: datetime, name: str, phone: str, service: str, call_id: str) -> Booking: ...

class LocalCalendar:
    name = "local"

    def __init__(self, settings: Settings, store: Store, now: datetime | None = None):
        self.s = settings
        self.store = store
        self._now = now

    def now(self) -> datetime:
        return self._now or datetime.now(self.s.tz)

    def _grid(self, day: date) -> list[datetime]:
        hours = self.s.hours.by_day.get(day.weekday())
        if not hours:
            return []
        open_min, close_min = hours
        step = self.s.appointment_minutes
        out = []
        m = open_min
        while m + step <= close_min:
            out.append(datetime.combine(day, time(m // 60, m % 60), tzinfo=self.s.tz))
            m += step
        return out

    def open_slots(self, day: date) -> list[datetime]:
        earliest = self.now() + timedelta(minutes=30)
        grid = [t for t in self._grid(day) if t >= earliest]
        if not grid:
            return []
        start = grid[0].astimezone(UTC).isoformat()
        end = (grid[-1] + timedelta(minutes=1)).astimezone(UTC).isoformat()
        taken = self.store.booked_starts(start, end)
        return [t for t in grid if t.astimezone(UTC).isoformat() not in taken]

    def book(self, *, start: datetime, name: str, phone: str, service: str, call_id: str) -> Booking:
        if start not in self.open_slots(start.date()):
            return Booking(ok=False, reason="That time is not open.")
        end = start + timedelta(minutes=self.s.appointment_minutes)
        ok = self.store.add_appointment(
            call_id=call_id,
            start_at=start.astimezone(UTC).isoformat(),
            end_at=end.astimezone(UTC).isoformat(),
            name=name,
            phone=phone,
            service=service,
            calendar=self.name,
        )
        return Booking(ok=ok, reason="" if ok else "Someone just booked that time.")

class CalComCalendar:
    """Cal.com API v2 with one API key and one event type. Docs: https://cal.com/docs/api-reference/v2"""

    name = "calcom"

    def __init__(self, settings: Settings, store: Store, client: httpx.Client | None = None):
        self.s = settings
        self.store = store
        self.client = client or httpx.Client(base_url=CALCOM_BASE_URL, timeout=10)

    def _headers(self, version: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.s.calcom_api_key}", "cal-api-version": version}

    def open_slots(self, day: date) -> list[datetime]:
        try:
            r = self.client.get(
                "/v2/slots",
                params={
                    "eventTypeId": self.s.calcom_event_type_id,
                    "start": day.isoformat(),
                    "end": day.isoformat(),
                    "timeZone": self.s.timezone,
                },
                headers=self._headers(CALCOM_SLOTS_VERSION),
            )
        except httpx.HTTPError as e:
            raise CalendarError("The calendar did not answer.") from e
        if r.status_code != 200:
            raise CalendarError("The calendar did not answer.")
        data = r.json().get("data") or {}
        out = []
        for item in data.get(day.isoformat(), []):
            raw = item.get("start") if isinstance(item, dict) else item
            try:
                out.append(datetime.fromisoformat(str(raw).replace("Z", "+00:00")).astimezone(self.s.tz))
            except ValueError:
                continue
        return out

    def book(self, *, start: datetime, name: str, phone: str, service: str, call_id: str) -> Booking:
        attendee: dict[str, str] = {"name": name, "timeZone": self.s.timezone}
        if phone.startswith("+"):
            attendee["phoneNumber"] = phone
        body = {
            "start": start.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "eventTypeId": int(self.s.calcom_event_type_id),
            "attendee": attendee,
            "metadata": {"source": "front-desk", "call_id": call_id[:100], "service": service[:100]},
        }
        try:
            r = self.client.post("/v2/bookings", json=body, headers=self._headers(CALCOM_BOOKINGS_VERSION))
        except httpx.HTTPError as e:
            raise CalendarError("The calendar did not answer.") from e
        if r.status_code not in (200, 201):
            return Booking(ok=False, reason="The calendar would not take that booking.")
        data = r.json().get("data") or {}
        uid = str(data.get("uid") or data.get("id") or "") if isinstance(data, dict) else ""
        end = start + timedelta(minutes=self.s.appointment_minutes)
        self.store.add_appointment(
            call_id=call_id,
            start_at=start.astimezone(UTC).isoformat(),
            end_at=end.astimezone(UTC).isoformat(),
            name=name,
            phone=phone,
            service=service,
            calendar=self.name,
            external_id=uid,
        )
        return Booking(ok=True, external_id=uid)

def make_calendar(settings: Settings, store: Store) -> Calendar:
    if settings.calcom_api_key and settings.calcom_event_type_id.isdigit():
        return CalComCalendar(settings, store)
    return LocalCalendar(settings, store)
