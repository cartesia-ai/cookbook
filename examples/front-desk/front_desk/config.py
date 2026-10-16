from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

ROOT = Path(__file__).resolve().parent.parent
CARTESIA_VERSION = "2026-08-14"
CARTESIA_BASE_URL = "https://api.cartesia.ai"
DEFAULT_MODEL_ID = "claude-haiku-4.5"
DEFAULT_VOICE_ID = "e07c00bc-4134-4eae-9ea4-1a55fb45746b"

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def load_env() -> None:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env", override=False)


@dataclass(frozen=True)
class Hours:
    by_day: dict[int, tuple[int, int]] = field(default_factory=dict)

    def describe(self) -> str:
        parts = []
        for day in range(7):
            if day in self.by_day:
                o, c = self.by_day[day]
                parts.append(f"{DAYS[day].title()} {o // 60:02d}:{o % 60:02d}-{c // 60:02d}:{c % 60:02d}")
            else:
                parts.append(f"{DAYS[day].title()} closed")
        return ", ".join(parts)


def parse_hours(spec: str) -> Hours:
    by_day: dict[int, tuple[int, int]] = {}
    for chunk in filter(None, (c.strip() for c in spec.split(";"))):
        m = re.fullmatch(r"([a-z]{3})(?:-([a-z]{3}))?\s+(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})", chunk.lower())
        if not m:
            raise ValueError(f"Could not read opening hours: {chunk!r}")
        start, end = DAYS.index(m.group(1)), DAYS.index(m.group(2) or m.group(1))
        open_min = int(m.group(3)) * 60 + int(m.group(4))
        close_min = int(m.group(5)) * 60 + int(m.group(6))
        if close_min <= open_min:
            raise ValueError(f"Closing time must be after opening time: {chunk!r}")
        for day in range(start, end + 1):
            by_day[day] = (open_min, close_min)
    return Hours(by_day)


@dataclass(frozen=True)
class Settings:
    cartesia_api_key: str
    agent_id: str
    webhook_secret: str
    tool_secret: str
    public_base_url: str
    business_name: str
    services: str
    timezone: str
    hours: Hours
    appointment_minutes: int
    transfer_number: str
    calcom_api_key: str
    calcom_event_type_id: str
    database_path: Path
    model_id: str
    voice_id: str
    dashboard_password: str = ""
    trust_proxy: bool = False

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)

    @property
    def tool_mode(self) -> str:
        return "webhook" if self.public_base_url else "client"


def settings() -> Settings:
    env = os.environ
    tz = env.get("BUSINESS_TIMEZONE") or "America/Los_Angeles"
    try:
        ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        tz = "UTC"
    try:
        minutes = int(env.get("APPOINTMENT_MINUTES") or 30)
    except ValueError:
        minutes = 30
    db = env.get("DATABASE_PATH") or str(ROOT / "data" / "front-desk.db")
    return Settings(
        cartesia_api_key=env.get("CARTESIA_API_KEY", ""),
        agent_id=env.get("CARTESIA_AGENT_ID", ""),
        webhook_secret=env.get("CARTESIA_WEBHOOK_SECRET", ""),
        tool_secret=env.get("TOOL_SECRET", ""),
        public_base_url=(env.get("PUBLIC_BASE_URL") or "").rstrip("/"),
        business_name=env.get("BUSINESS_NAME") or "Juniper Hair Studio",
        services=env.get("BUSINESS_SERVICES") or "haircuts, color, and beard trims",
        timezone=tz,
        hours=parse_hours(env.get("BUSINESS_HOURS") or "mon-fri 09:00-17:00; sat 10:00-14:00"),
        appointment_minutes=max(10, min(minutes, 240)),
        transfer_number=env.get("TRANSFER_NUMBER", ""),
        calcom_api_key=env.get("CALCOM_API_KEY", ""),
        calcom_event_type_id=env.get("CALCOM_EVENT_TYPE_ID", ""),
        database_path=Path(db),
        model_id=env.get("AGENT_MODEL_ID") or DEFAULT_MODEL_ID,
        voice_id=env.get("CARTESIA_VOICE_ID") or DEFAULT_VOICE_ID,
        dashboard_password=env.get("DASHBOARD_PASSWORD", ""),
        trust_proxy=env.get("TRUST_PROXY", "") == "1",
    )
