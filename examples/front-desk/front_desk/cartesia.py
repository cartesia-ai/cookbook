from __future__ import annotations

from typing import Any

import httpx

from .config import CARTESIA_BASE_URL, CARTESIA_VERSION


class CartesiaError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


class Cartesia:
    def __init__(
        self, api_key: str, base_url: str = CARTESIA_BASE_URL, transport: httpx.BaseTransport | None = None
    ):
        if not api_key:
            raise CartesiaError(0, "CARTESIA_API_KEY is not set.")
        self.http = httpx.Client(
            base_url=base_url,
            headers={"X-API-Key": api_key, "Cartesia-Version": CARTESIA_VERSION},
            timeout=20,
            transport=transport,
        )

    def request(self, method: str, path: str, json: Any = None, params: dict[str, Any] | None = None) -> Any:
        try:
            r = self.http.request(method, path, json=json, params=params)
        except httpx.HTTPError as e:
            raise CartesiaError(0, f"{method} {path}: network error") from e
        if r.status_code >= 400:
            raise CartesiaError(r.status_code, f"{method} {path}: {r.status_code} {r.text[:300]}")
        if r.status_code == 204 or not r.content:
            return None
        return r.json()

    def mint_agent_token(self, expires_in: int = 60) -> str:
        data = self.request(
            "POST", "/access-token", json={"grants": {"agent": True}, "expires_in": expires_in}
        )
        token = (data or {}).get("token")
        if not isinstance(token, str) or not token:
            raise CartesiaError(502, "No token in the access-token response.")
        return token

    def get_call(self, call_id: str) -> dict[str, Any]:
        return self.request("GET", f"/agents/calls/{call_id}")

    def open_call_audio(self, call_id: str) -> httpx.Response:
        req = self.http.build_request("GET", f"/agents/calls/{call_id}/audio")
        return self.http.send(req, stream=True)
