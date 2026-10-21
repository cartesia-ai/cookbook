from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any, Protocol

import httpx

from .config import Settings
from .store import Store

log = logging.getLogger("front_desk.calendars")

CALCOM_BASE_URL = "https://api.cal.com"
CALCOM_SLOTS_VERSION = "2024-09-04"
CALCOM_BOOKINGS_VERSION = "2026-02-25"


class CalendarError(Exception):
    pass


_shared_client: httpx.Client | None = None
_shared_lock = threading.Lock()


def calcom_client() -> httpx.Client:
    global _shared_client
    with _shared_lock:
        if _shared_client is None or _shared_client.is_closed:
            _shared_client = httpx.Client(base_url=CALCOM_BASE_URL, timeout=10)
        return _shared_client


def close_calcom_client() -> None:
    global _shared_client
    with _shared_lock:
        if _shared_client is not None:
            _shared_client.close()
            _shared_client = None


UNREADABLE = "The calendar sent a reply we could not read."


def _json_data(r: httpx.Response, path: str) -> dict[str, Any]:
    try:
        body = r.json()
    except ValueError as e:
        log.warning("Cal.com %s: unreadable reply, status %s", path, r.status_code)
        raise CalendarError(UNREADABLE) from e
    data = (body.get("data") or {}) if isinstance(body, dict) else None
    if not isinstance(data, dict):
        log.warning("Cal.com %s: unexpected reply shape, status %s", path, r.status_code)
        raise CalendarError(UNREADABLE)
    return data


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
    name = "calcom"

    def __init__(self, settings: Settings, store: Store, client: httpx.Client | None = None):
        self.s = settings
        self.store = store
        self._client = client

    @property
    def client(self) -> httpx.Client:
        return self._client or calcom_client()

    def _headers(self, version: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.s.calcom_api_key}", "cal-api-version": version}

    def open_slots(self, day: date) -> list[datetime]:
        return self.open_slots_range(day, day).get(day, [])

    def open_slots_range(self, start: date, end: date) -> dict[date, list[datetime]]:
        """Open times from start to end inclusive, in one Cal.com request, grouped by local date."""
        path = "/v2/slots"
        try:
            r = self.client.get(
                path,
                params={
                    "eventTypeId": self.s.calcom_event_type_id,
                    "start": start.isoformat(),
                    "end": end.isoformat(),
                    "timeZone": self.s.timezone,
                },
                headers=self._headers(CALCOM_SLOTS_VERSION),
            )
        except httpx.HTTPError as e:
            log.warning("Cal.com %s: request failed (%s)", path, type(e).__name__)
            raise CalendarError("The calendar did not answer.") from e
        if r.status_code != 200:
            log.warning("Cal.com %s: status %s", path, r.status_code)
            raise CalendarError("The calendar did not answer.")
        out: dict[date, list[datetime]] = {}
        for key, items in _json_data(r, path).items():
            try:
                day = date.fromisoformat(str(key))
            except ValueError:
                continue
            if not start <= day <= end:
                continue
            for item in items if isinstance(items, list) else []:
                raw = item.get("start") if isinstance(item, dict) else item
                try:
                    out.setdefault(day, []).append(
                        datetime.fromisoformat(str(raw).replace("Z", "+00:00")).astimezone(self.s.tz)
                    )
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
        path = "/v2/bookings"
        try:
            r = self.client.post(path, json=body, headers=self._headers(CALCOM_BOOKINGS_VERSION))
        except httpx.HTTPError as e:
            log.warning("Cal.com %s: request failed (%s)", path, type(e).__name__)
            raise CalendarError("The calendar did not answer.") from e
        if r.status_code not in (200, 201):
            log.warning("Cal.com %s: status %s", path, r.status_code)
            return Booking(ok=False, reason="The calendar would not take that booking.")
        try:
            data = _json_data(r, path)
        except CalendarError:
            data = {}
        uid = str(data.get("uid") or data.get("id") or "")
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
