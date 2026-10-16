"""Turn what a caller says ("Friday", "the 24th", "2pm", "afternoon") into dates and times.

Adapted from `examples/form_filler/appointment_scheduler.py` in cartesia-ai/line
(Apache-2.0): ordinal stripping, month and weekday tokens, and the morning / afternoon /
evening periods. Changed to return real dates and times instead of matching a mock slot list.
"""

from __future__ import annotations

import re
from datetime import date, time, timedelta

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
MONTHS = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
]
PERIODS = {"morning": (6, 12), "afternoon": (12, 17), "evening": (17, 21)}

def _strip_ordinal(token: str) -> str:
    for suffix in ("st", "nd", "rd", "th"):
        if token.endswith(suffix) and token[: -len(suffix)].isdigit():
            return token[: -len(suffix)]
    return token

def parse_date(text: str, today: date) -> date | None:
    """Accepts 2026-10-17, today, tomorrow, a weekday (the next one), "October 17" or "the 17th"."""
    s = text.lower().strip().replace(",", " ")
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        pass
    if s in ("today", "now"):
        return today
    if s == "tomorrow":
        return today + timedelta(days=1)
    tokens = [_strip_ordinal(t) for t in s.split() if t not in ("the", "of", "on", "next", "this")]
    for t in tokens:
        if t in WEEKDAYS:
            ahead = (WEEKDAYS.index(t) - today.weekday()) % 7
            if ahead == 0 and "next" in s.split():
                ahead = 7
            return today + timedelta(days=ahead)
    month = next((MONTHS.index(t) + 1 for t in tokens if t in MONTHS), None)
    day = next((int(t) for t in tokens if t.isdigit() and 1 <= int(t) <= 31), None)
    if day is None:
        return None
    if month is None:
        month = today.month if day >= today.day else today.month % 12 + 1
    year = today.year
    try:
        candidate = date(year, month, day)
    except ValueError:
        return None
    if candidate < today:
        try:
            candidate = date(year + 1, month, day)
        except ValueError:
            return None
    return candidate

def parse_time(text: str) -> time | None:
    """Accepts 2pm, 2:30 PM, 14:00 or 9. Bare hours from 1 to 7 are read as afternoon."""
    s = text.lower().strip().replace(".", "")
    m = re.fullmatch(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", s)
    if not m:
        return None
    hour, minute, ampm = int(m.group(1)), int(m.group(2) or 0), m.group(3)
    if ampm == "pm" and hour != 12:
        hour += 12
    elif ampm == "am" and hour == 12:
        hour = 0
    elif ampm is None and 1 <= hour <= 7:
        hour += 12
    if hour > 23 or minute > 59:
        return None
    return time(hour, minute)

def parse_period(text: str) -> tuple[int, int] | None:
    s = text.lower()
    for name, hours in PERIODS.items():
        if name in s:
            return hours
    return None

def spoken_date(d: date) -> str:
    return f"{WEEKDAYS[d.weekday()].title()}, {MONTHS[d.month - 1].title()} {d.day}"

def spoken_time(t: time) -> str:
    hour = t.hour % 12 or 12
    suffix = "AM" if t.hour < 12 else "PM"
    return f"{hour}:{t.minute:02d} {suffix}" if t.minute else f"{hour} {suffix}"
