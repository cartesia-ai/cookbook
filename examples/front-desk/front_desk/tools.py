from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import Any

from .calendars import CalComCalendar, Calendar, CalendarError
from .config import Settings
from .parsing import parse_date, parse_period, parse_time, spoken_date, spoken_time
from .store import Store

MAX_TIMES = 8
SEARCH_DAYS = 14

TOOL_SPECS: list[dict[str, Any]] = [
    {
        "name": "check_availability",
        "description": (
            "Lists open appointment times. Use it before offering or booking a time, and again if the "
            "caller asks about another day. Leave date empty to get the next days with openings."
        ),
        "properties": {
            "date": {
                "type": "string",
                "description": "Day the caller wants, as YYYY-MM-DD. Work it out from today's date. Empty for "
                "the next open days.",
            },
            "part_of_day": {
                "type": "string",
                "enum": ["any", "morning", "afternoon", "evening"],
                "description": "Narrow the times if the caller said morning, afternoon or evening.",
            },
        },
        "required": [],
    },
    {
        "name": "book_appointment",
        "description": (
            "Books one appointment. Use it only after you have read the date and time back to the caller "
            "and they said yes, and you have their name. The result says if it worked."
        ),
        "properties": {
            "date": {"type": "string", "description": "Appointment day as YYYY-MM-DD."},
            "time": {"type": "string", "description": "Start time from check_availability, like 2:30 PM."},
            "name": {"type": "string", "description": "Caller's full name."},
            "phone": {
                "type": "string",
                "description": "Callback number the caller gave. Empty if they did not give one.",
            },
            "service": {"type": "string", "description": "What the appointment is for, in a few words."},
        },
        "required": ["date", "time", "name"],
    },
    {
        "name": "take_message",
        "description": (
            "Saves a message for the staff. Use it when the caller wants someone to call back, or when "
            "you cannot help and a transfer is not possible."
        ),
        "properties": {
            "name": {"type": "string", "description": "Caller's name."},
            "phone": {"type": "string", "description": "Callback number. Empty if not given."},
            "message": {"type": "string", "description": "The message, in one or two sentences."},
            "urgent": {"type": "boolean", "description": "True if the caller says it is urgent."},
        },
        "required": ["name", "message"],
    },
    {
        "name": "transfer_call",
        "description": (
            "Logs that the caller wants a person and says whether a live transfer is possible right now. "
            "Use it when the caller asks for a human or has a problem you cannot solve."
        ),
        "properties": {
            "reason": {"type": "string", "description": "Why the caller wants a person, in a few words."},
            "name": {"type": "string", "description": "Caller's name if you know it."},
        },
        "required": ["reason"],
    },
]

TOOL_NAMES = {spec["name"] for spec in TOOL_SPECS}

WEBHOOK_CONTEXT = {
    "call_id": "system__conversation_id",
    "caller_number": "system__caller_id",
    "call_direction": "system__call_direction",
}


def _s(params: dict[str, Any], key: str, limit: int = 200) -> str:
    v = params.get(key)
    return str(v).strip()[:limit] if v is not None else ""


def _in_period(slots: list[datetime], period: tuple[int, int] | None) -> list[datetime]:
    return [t for t in slots if period[0] <= t.hour < period[1]] if period else slots


def _json(obj: dict[str, Any]) -> str:
    return json.dumps(obj, separators=(",", ":"))


class Tools:
    def __init__(self, settings: Settings, store: Store, calendar: Calendar, now: datetime | None = None):
        self.s = settings
        self.store = store
        self.calendar = calendar
        self._now = now

    def today(self) -> date:
        return (self._now or datetime.now(self.s.tz)).date()

    def run(self, name: str, params: dict[str, Any]) -> str:
        if name not in TOOL_NAMES:
            return _json({"error": "Unknown tool."})
        try:
            return getattr(self, name)(params)
        except CalendarError as e:
            return _json({"error": str(e), "next": "Offer to take a message instead."})

    def _times(self, day: date, period: tuple[int, int] | None) -> list[datetime]:
        return _in_period(self.calendar.open_slots(day), period)

    def _next_open_days(
        self, start: date, period: tuple[int, int] | None, days: int = 3
    ) -> list[dict[str, Any]]:
        out = []
        # Cal.com answers a two-week range in one request; the local calendar is a cheap per-day query.
        fetched = (
            self.calendar.open_slots_range(start, start + timedelta(days=SEARCH_DAYS - 1))
            if isinstance(self.calendar, CalComCalendar)
            else None
        )
        for offset in range(SEARCH_DAYS):
            d = start + timedelta(days=offset)
            times = _in_period(fetched.get(d, []), period) if fetched is not None else self._times(d, period)
            if times:
                out.append(
                    {
                        "date": d.isoformat(),
                        "day": spoken_date(d),
                        "open_times": [spoken_time(t.time()) for t in times[:4]],
                    }
                )
            if len(out) >= days:
                break
        return out

    def check_availability(self, params: dict[str, Any]) -> str:
        today = self.today()
        period = parse_period(_s(params, "part_of_day"))
        raw = _s(params, "date")
        day = parse_date(raw, today) if raw else None
        if raw and day is None:
            return _json({"error": "Could not read that date. Ask the caller for the day again."})
        if day is None:
            return _json({"next_open_days": self._next_open_days(today, period)})
        if day < today:
            return _json(
                {"error": "That date is in the past.", "next_open_days": self._next_open_days(today, period)}
            )
        times = self._times(day, period)
        if not times:
            return _json(
                {
                    "date": day.isoformat(),
                    "day": spoken_date(day),
                    "open_times": [],
                    "next_open_days": self._next_open_days(day + timedelta(days=1), period),
                }
            )
        return _json(
            {
                "date": day.isoformat(),
                "day": spoken_date(day),
                "open_times": [spoken_time(t.time()) for t in times[:MAX_TIMES]],
                "more": max(0, len(times) - MAX_TIMES),
            }
        )

    def book_appointment(self, params: dict[str, Any]) -> str:
        today = self.today()
        day = parse_date(_s(params, "date"), today)
        at = parse_time(_s(params, "time"))
        name = _s(params, "name", 100)
        if day is None or at is None:
            return _json({"booked": False, "reason": "Need a date and a time."})
        if not name:
            return _json({"booked": False, "reason": "Ask for the caller's name first."})
        phone = _s(params, "phone", 40) or _s(params, "caller_number", 40)
        start = datetime.combine(day, at, tzinfo=self.s.tz)
        result = self.calendar.book(
            start=start,
            name=name,
            phone=phone,
            service=_s(params, "service", 120),
            call_id=_s(params, "call_id", 100),
        )
        if not result.ok:
            times = self._times(day, None)
            return _json(
                {
                    "booked": False,
                    "reason": result.reason,
                    "open_times": [spoken_time(t.time()) for t in times[:MAX_TIMES]],
                }
            )
        return _json({"booked": True, "day": spoken_date(day), "time": spoken_time(at), "name": name})

    def take_message(self, params: dict[str, Any]) -> str:
        name = _s(params, "name", 100)
        body = _s(params, "message", 1000)
        if not body:
            return _json({"saved": False, "reason": "Ask what the message is."})
        phone = _s(params, "phone", 40) or _s(params, "caller_number", 40)
        urgent = params.get("urgent") in (True, "true", "True", 1)
        self.store.add_message(
            call_id=_s(params, "call_id", 100),
            name=name or "Unknown caller",
            phone=phone,
            body=body,
            urgent=urgent,
        )
        return _json({"saved": True, "callback_number_known": bool(phone)})

    def transfer_call(self, params: dict[str, Any]) -> str:
        direction = _s(params, "call_direction")
        possible = bool(self.s.transfer_number) and direction in ("inbound", "outbound")
        self.store.add_handoff(
            call_id=_s(params, "call_id", 100),
            reason=_s(params, "reason", 300),
            name=_s(params, "name", 100),
            transferred=possible,
        )
        if possible:
            return _json(
                {
                    "transfer_available": True,
                    "next": "Tell the caller you are connecting them, then use transfer_to_number.",
                }
            )
        return _json(
            {"transfer_available": False, "next": "Nobody can pick up right now. Offer to take a message."}
        )
