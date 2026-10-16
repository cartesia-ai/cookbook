from __future__ import annotations

import base64
import binascii
import hmac
import ipaddress
import os
import sys
from collections.abc import Mapping, Sequence

from fastapi import HTTPException, Request

from .config import Settings, settings

NO_LOGIN_SET = (
    "PUBLIC_BASE_URL is set but DASHBOARD_PASSWORD is empty. "
    "Set DASHBOARD_PASSWORD so the dashboard, recordings and booking routes need a login."
)

OPEN_ON_NETWORK = (
    "This server listens on {host}, which other machines can reach, and DASHBOARD_PASSWORD is empty. "
    "Anyone on the network could open /try and spend your agent minutes. "
    "Set DASHBOARD_PASSWORD, or bind to 127.0.0.1."
)


def bind_host(argv: Sequence[str] | None = None, env: Mapping[str, str] | None = None) -> str:
    args = list(sys.argv if argv is None else argv)
    for i, arg in enumerate(args):
        if arg == "--host" and i + 1 < len(args):
            return args[i + 1]
        if arg.startswith("--host="):
            return arg.split("=", 1)[1]
    return (os.environ if env is None else env).get("UVICORN_HOST") or "127.0.0.1"


def is_loopback(host: str) -> bool:
    host = host.strip().strip("[]")
    if host.lower() == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def check_deploy_config(s: Settings, host: str = "127.0.0.1") -> None:
    if s.dashboard_password:
        return
    if s.public_base_url:
        raise RuntimeError(NO_LOGIN_SET)
    if not is_loopback(host):
        raise RuntimeError(OPEN_ON_NETWORK.format(host=host))


def _basic_password(header: str) -> str | None:
    scheme, _, encoded = header.partition(" ")
    if scheme.lower() != "basic" or not encoded:
        return None
    try:
        decoded = base64.b64decode(encoded.strip(), validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return None
    _, sep, password = decoded.partition(":")
    return password if sep else None


def require_dashboard(request: Request) -> None:
    s = settings()
    if not s.dashboard_password:
        if s.public_base_url:
            raise HTTPException(503, NO_LOGIN_SET)
        return
    given = _basic_password(request.headers.get("authorization", ""))
    if given is None or not hmac.compare_digest(given.encode(), s.dashboard_password.encode()):
        raise HTTPException(
            401, "Log in to see the dashboard.", headers={"WWW-Authenticate": 'Basic realm="app"'}
        )


def client_ip(request: Request, s: Settings) -> str:
    if s.trust_proxy:
        forwarded = request.headers.get("x-forwarded-for", "")
        last = forwarded.split(",")[-1].strip()
        if last:
            return last
    return request.client.host if request.client else "?"
