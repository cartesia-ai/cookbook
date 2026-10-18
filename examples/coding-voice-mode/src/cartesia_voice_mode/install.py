from __future__ import annotations

import json
import os
import shutil
import stat
import tomllib
from pathlib import Path

import tomli_w

NAME = "cartesia-voice"

class ConfigFileError(Exception):
    pass

def _read_json(path: Path) -> dict:
    text = path.read_text() if path.exists() else ""
    if not text.strip():
        return {}
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ConfigFileError(
            f"{path} is not valid JSON (line {exc.lineno}, column {exc.colno}). Fix it or move it aside, then run this again. The file was not changed."
        ) from None
    if not isinstance(data, dict) or not isinstance(data.get("mcpServers", {}), dict):
        raise ConfigFileError(f"{path} must be a JSON object with an \"mcpServers\" object. The file was not changed.")
    return data

def _read_toml(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return tomllib.loads(path.read_text())
    except tomllib.TOMLDecodeError as exc:
        raise ConfigFileError(f"{path} is not valid TOML ({exc}). Fix it, then run this again. The file was not changed.") from None

def read_cursor(path: Path) -> dict:
    return _read_json(path)

def read_codex(path: Path) -> dict:
    return _read_toml(path)

def project_dir() -> Path:
    return Path(__file__).resolve().parents[2]

def server_args(directory: Path | str) -> list[str]:
    return ["run", "--quiet", "--directory", str(directory), "cartesia-voice-mode", "serve"]

def server_entry(directory: Path | str, *, uv: str = "uv", voice: str | None = None) -> dict:
    entry: dict = {"command": uv, "args": server_args(directory)}
    entry["env"] = {"CARTESIA_VOICE_ID": voice} if voice else {}
    return entry

def claude_add_cmd(directory: Path | str, *, scope: str = "user", uv: str = "uv", voice: str | None = None) -> list[str]:
    cmd = ["claude", "mcp", "add", NAME, "--scope", scope]
    if voice:
        cmd += ["-e", f"CARTESIA_VOICE_ID={voice}"]
    return cmd + ["--", uv, *server_args(directory)]

def claude_remove_cmd(scope: str = "user") -> list[str]:
    return ["claude", "mcp", "remove", NAME, "--scope", scope]

def _backup_once(path: Path) -> None:
    bak = path.with_name(path.name + ".bak")
    if path.exists() and not bak.exists():
        shutil.copy2(path, bak)

def _atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        mode = stat.S_IMODE(path.stat().st_mode)
    except FileNotFoundError:
        mode = 0o600
    tmp = path.with_name(path.name + ".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, mode)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        os.fchmod(f.fileno(), mode)
        f.write(text)
    os.replace(tmp, path)

def cursor_path(home: Path, project: Path | None = None) -> Path:
    return (project / ".cursor" / "mcp.json") if project else home / ".cursor" / "mcp.json"

def codex_path(home: Path) -> Path:
    return home / ".codex" / "config.toml"

def merge_cursor(path: Path, entry: dict) -> bool:
    data = _read_json(path)
    entry = {"type": "stdio", **entry}
    servers = data.setdefault("mcpServers", {})
    if servers.get(NAME) == entry:
        return False
    _backup_once(path)
    servers[NAME] = entry
    _atomic_write(path, json.dumps(data, indent=2) + "\n")
    return True

def remove_cursor(path: Path) -> bool:
    if not path.exists():
        return False
    data = _read_json(path)
    if NAME not in data.get("mcpServers", {}):
        return False
    _backup_once(path)
    del data["mcpServers"][NAME]
    _atomic_write(path, json.dumps(data, indent=2) + "\n")
    return True

def merge_codex(path: Path, entry: dict) -> bool:
    data = _read_toml(path)
    codex_entry = {k: v for k, v in entry.items() if v}
    codex_entry |= {"startup_timeout_sec": 30, "tool_timeout_sec": 180}
    servers = data.setdefault("mcp_servers", {})
    if servers.get(NAME) == codex_entry:
        return False
    _backup_once(path)
    servers[NAME] = codex_entry
    _atomic_write(path, tomli_w.dumps(data))
    return True

def remove_codex(path: Path) -> bool:
    if not path.exists():
        return False
    data = _read_toml(path)
    if NAME not in data.get("mcp_servers", {}):
        return False
    _backup_once(path)
    del data["mcp_servers"][NAME]
    _atomic_write(path, tomli_w.dumps(data))
    return True

def save_key(path: Path, key: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(f"CARTESIA_API_KEY={key}\n")
    os.chmod(path, 0o600)

def skill_text() -> str:
    return (Path(__file__).parent / "skill" / "SKILL.md").read_text()

def install_skill(home: Path) -> Path:
    dest = home / ".claude" / "skills" / NAME / "SKILL.md"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(skill_text())
    return dest
