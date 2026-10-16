"""Create or update the receptionist agent, its four tools and its call webhook.

    uv run scripts/setup_agent.py             create, or update what already exists
    uv run scripts/setup_agent.py --dry-run   print the requests, no key or network needed
    uv run scripts/setup_agent.py --delete    delete the agent, its tools and its webhook

Safe to run again after you change `.env` or `front_desk/prompt.py`: it reads
CARTESIA_AGENT_ID from `.env`, updates that agent and the tools attached to it, and only
creates what is missing. IDs and generated secrets are written back to `.env`.

Tool mode follows PUBLIC_BASE_URL. With it set, the tools are webhook tools that Cartesia
calls at PUBLIC_BASE_URL/tools/<name>, and the call webhook points at
PUBLIC_BASE_URL/webhooks/cartesia. Without it, the tools are client tools that only the
"Try it in the browser" page can run, and there is no call webhook.
"""

from __future__ import annotations

import json
import re
import secrets
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from front_desk.cartesia import Cartesia, CartesiaError  # noqa: E402
from front_desk.config import ROOT, Settings, load_env, settings  # noqa: E402
from front_desk.prompt import greeting, instructions  # noqa: E402
from front_desk.tools import TOOL_SPECS, WEBHOOK_CONTEXT  # noqa: E402

ENV_PATH = ROOT / ".env"
AGENT_NAME_PREFIX = "Front desk"

def tool_body(spec: dict[str, Any], s: Settings, tool_secret: str) -> dict[str, Any]:
    common = {
        "name": spec["name"],
        "description": spec["description"],
        "pre_tool_speech": "auto",
        "execution_mode": "immediate",
        "response_timeout_secs": 15,
    }
    if s.tool_mode == "client":
        return {
            "type": "client",
            **common,
            "expects_response": True,
            "parameters": {"type": "object", "properties": spec["properties"], "required": spec["required"]},
        }
    props = dict(spec["properties"])
    for field, variable in WEBHOOK_CONTEXT.items():
        props[field] = {"type": "string", "dynamic_variable": variable}
    return {
        "type": "webhook",
        **common,
        "api_schema": {
            "url": f"{s.public_base_url}/tools/{spec['name']}",
            "method": "POST",
            "request_body_schema": {"type": "object", "properties": props, "required": spec["required"]},
            "request_headers": {"X-Tool-Secret": {"type": "secret", "secret_value": tool_secret}},
        },
        "assignments": [],
    }

def agent_body(s: Settings, tool_ids: list[str]) -> dict[str, Any]:
    transfer: dict[str, Any] | None = None
    if s.transfer_number:
        transfer = {
            "description": None,
            "pre_tool_speech": "force",
            "transfers": [
                {
                    "destination": {"type": "phone", "phone_number": s.transfer_number},
                    "condition": "transfer_call said a transfer is available and the caller still wants a person.",
                }
            ],
        }
    return {
        "name": f"{AGENT_NAME_PREFIX}: {s.business_name}"[:64],
        "description": "Receptionist from examples/front-desk in the Cartesia cookbook.",
        "config": {
            "instructions": instructions(s),
            "initial_message": greeting(s),
            "timezone": s.timezone,
            "model": {"id": s.model_id, "temperature": 0.4},
            "language": {"primary": "en"},
            "audio": {
                "input": {"noise_suppression": "auto", "keyterms": [s.business_name]},
                "output": {"voice_id": s.voice_id},
            },
            "turn": {"inactivity_check_in_secs": 10, "inactivity_end_call_secs": 120},
            "tools": [{"id": i} for i in tool_ids],
            "system_tools": {
                "end_call": {"description": None, "pre_tool_speech": "force"},
                "transfer_to_number": transfer,
            },
        },
    }

def upsert_env(path: Path, key: str, value: str) -> None:
    lines = path.read_text().splitlines() if path.exists() else []
    pattern = re.compile(rf"^\s*{re.escape(key)}\s*=")
    for i, line in enumerate(lines):
        if pattern.match(line):
            lines[i] = f"{key}={value}"
            break
    else:
        lines.append(f"{key}={value}")
    path.write_text("\n".join(lines) + "\n")
    path.chmod(0o600)

def existing_agent(api: Cartesia, agent_id: str) -> dict[str, Any] | None:
    if not agent_id:
        return None
    try:
        return api.request("GET", f"/v1/agents/{agent_id}")
    except CartesiaError as e:
        if e.status == 404:
            print(f"Agent {agent_id} no longer exists. Creating a new one.")
            return None
        raise

def sync_tools(
    api: Cartesia, s: Settings, agent: dict[str, Any] | None, tool_secret: str
) -> tuple[list[str], list[str]]:
    """Returns (tool ids to attach, old tool ids to delete after the agent no longer uses them)."""
    current: dict[str, dict[str, Any]] = {}
    for ref in ((agent or {}).get("config") or {}).get("tools") or []:
        try:
            tool = api.request("GET", f"/v1/agents/tools/{ref['id']}")
        except CartesiaError as e:
            if e.status == 404:
                continue
            raise
        current[tool["name"]] = tool
    keep, retire = [], []
    for spec in TOOL_SPECS:
        body = tool_body(spec, s, tool_secret)
        old = current.pop(spec["name"], None)
        if old and old.get("type") == body["type"]:
            patch = {k: v for k, v in body.items() if k != "type"}
            api.request("PATCH", f"/v1/agents/tools/{old['id']}", json=patch)
            keep.append(old["id"])
            print(f"Updated {body['type']} tool {spec['name']} ({old['id']})")
            continue
        if old:
            retire.append(old["id"])
        created = api.request("POST", "/v1/agents/tools", json=body)
        keep.append(created["id"])
        print(f"Created {body['type']} tool {spec['name']} ({created['id']})")
    retire.extend(t["id"] for t in current.values())
    return keep, retire

def sync_webhook(api: Cartesia, s: Settings, env_webhook_id: str) -> str | None:
    if s.tool_mode != "webhook":
        return None
    url = f"{s.public_base_url}/webhooks/cartesia"
    if env_webhook_id and s.webhook_secret:
        try:
            api.request("PATCH", f"/agents/webhooks/{env_webhook_id}", json={"url": url})
            print(f"Updated webhook {env_webhook_id} -> {url}")
            return env_webhook_id
        except CartesiaError as e:
            if e.status != 404:
                raise
    secret = secrets.token_urlsafe(32)
    created = api.request(
        "POST", "/agents/webhooks", json={"url": url, "secret": secret, "display_name": "front-desk"}
    )
    upsert_env(ENV_PATH, "CARTESIA_WEBHOOK_ID", created["id"])
    upsert_env(ENV_PATH, "CARTESIA_WEBHOOK_SECRET", secret)
    print(f"Created webhook {created['id']} -> {url} (secret saved to .env)")
    return str(created["id"])

def attach_webhook(api: Cartesia, agent_id: str, webhook_id: str | None) -> None:
    api.request("PATCH", f"/agents/{agent_id}", json={"webhook_id": webhook_id})

def delete_all(api: Cartesia, s: Settings, webhook_id: str) -> int:
    agent = existing_agent(api, s.agent_id)
    tool_ids = [t["id"] for t in ((agent or {}).get("config") or {}).get("tools") or []]
    if agent:
        api.request("DELETE", f"/v1/agents/{agent['id']}")
        print(f"Deleted agent {agent['id']}")
    for tid in tool_ids:
        try:
            api.request("DELETE", f"/v1/agents/tools/{tid}")
            print(f"Deleted tool {tid}")
        except CartesiaError as e:
            print(f"Could not delete tool {tid} ({e.status}). It may be used by another agent.")
    if webhook_id:
        try:
            api.request("DELETE", f"/agents/webhooks/{webhook_id}")
            print(f"Deleted webhook {webhook_id}")
        except CartesiaError as e:
            print(f"Could not delete webhook {webhook_id} ({e.status}).")
    for key in ("CARTESIA_AGENT_ID", "CARTESIA_WEBHOOK_ID", "CARTESIA_WEBHOOK_SECRET"):
        upsert_env(ENV_PATH, key, "")
    return 0

def main(argv: list[str]) -> int:
    load_env()
    import os

    s = settings()
    if s.public_base_url and not s.public_base_url.startswith("https://"):
        print("PUBLIC_BASE_URL must start with https://. Cartesia only calls HTTPS endpoints.")
        return 1
    tool_secret = s.tool_secret or "<generated on first run>"

    if "--dry-run" in argv:
        print(f"Tool mode: {s.tool_mode}")
        for spec in TOOL_SPECS:
            print("POST /v1/agents/tools", json.dumps(tool_body(spec, s, "***"), indent=2))
        print("POST /v1/agents", json.dumps(agent_body(s, ["<tool ids>"]), indent=2))
        return 0

    if not s.cartesia_api_key:
        print("CARTESIA_API_KEY is empty. Copy .env.example to .env, add your key, and run this again.")
        return 1
    api = Cartesia(s.cartesia_api_key)
    webhook_id = os.environ.get("CARTESIA_WEBHOOK_ID", "")

    if "--delete" in argv:
        return delete_all(api, s, webhook_id)

    try:
        api.request("GET", f"/voices/{s.voice_id}")
    except CartesiaError as e:
        print(
            f"Voice {s.voice_id} is not available ({e.status}). Set CARTESIA_VOICE_ID to a voice you can use."
        )
        return 1

    if s.tool_mode == "webhook" and not s.tool_secret:
        tool_secret = secrets.token_urlsafe(32)
        upsert_env(ENV_PATH, "TOOL_SECRET", tool_secret)
        print("Generated TOOL_SECRET and saved it to .env")

    agent = existing_agent(api, s.agent_id)
    tool_ids, retire = sync_tools(api, s, agent, tool_secret)
    body = agent_body(s, tool_ids)
    if agent:
        api.request("PATCH", f"/v1/agents/{agent['id']}", json=body)
        agent_id = agent["id"]
        print(f"Updated agent {agent_id}")
    else:
        agent_id = api.request("POST", "/v1/agents", json=body)["id"]
        upsert_env(ENV_PATH, "CARTESIA_AGENT_ID", agent_id)
        print(f"Created agent {agent_id} and saved CARTESIA_AGENT_ID to .env")

    for tid in retire:
        try:
            api.request("DELETE", f"/v1/agents/tools/{tid}")
            print(f"Deleted old tool {tid}")
        except CartesiaError as e:
            print(f"Left old tool {tid} in place ({e.status}).")

    hook = sync_webhook(api, s, webhook_id)
    if hook or webhook_id:
        attach_webhook(api, agent_id, hook)
        print(f"Webhook {'attached' if hook else 'detached'}.")

    print(
        f"Done. Tool mode: {s.tool_mode}. Start the app with: uv run uvicorn front_desk.main:app --port 8000"
    )
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except CartesiaError as e:
        print(f"Cartesia said: {e}")
        sys.exit(1)
