from __future__ import annotations

from cartesia import AsyncCartesia

from .config import Settings

MISSING_KEY = "CARTESIA_API_KEY is not set, run cartesia-voice-mode doctor"

def make_client(s: Settings) -> AsyncCartesia:
    return AsyncCartesia(
        api_key=s.api_key,
        base_url=s.base_url,
        websocket_base_url=s.ws_base_url,
        max_retries=2,
        timeout=30.0,
    )
