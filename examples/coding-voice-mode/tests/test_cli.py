import json
import os
import queue
import subprocess
import sys
import threading
import time

from click.testing import CliRunner

from cartesia_voice_mode import cli
from conftest import TEST_KEY

def test_doctor_without_key_runs_offline_checks(monkeypatch):
    monkeypatch.delenv("CARTESIA_API_KEY")
    r = CliRunner().invoke(cli.main, ["doctor"])
    assert "PASS  models: tts sonic-3.6, stt ink-2" in r.output
    assert "live checks skipped" in r.output

def test_install_claude_without_cli_prints_command(monkeypatch):
    monkeypatch.setattr(cli.shutil, "which", lambda name: None)
    r = CliRunner().invoke(cli.main, ["install", "claude"])
    assert r.exit_code == 0
    assert "claude mcp add cartesia-voice --scope user --" in r.output
    assert TEST_KEY not in r.output

def test_install_cursor_and_codex_use_temp_home(clean_env):
    runner = CliRunner()
    assert runner.invoke(cli.main, ["install", "cursor"]).exit_code == 0
    assert runner.invoke(cli.main, ["install", "codex"]).exit_code == 0
    assert (clean_env / ".cursor" / "mcp.json").exists()
    assert (clean_env / ".codex" / "config.toml").exists()
    assert TEST_KEY not in (clean_env / ".cursor" / "mcp.json").read_text()

def test_save_key_writes_0600_file_and_never_prints(clean_env):
    r = CliRunner().invoke(cli.main, ["install", "cursor", "--save-key"])
    assert r.exit_code == 0 and TEST_KEY not in r.output
    f = clean_env / ".config" / "cartesia-voice-mode" / "env"
    assert oct(f.stat().st_mode & 0o777) == "0o600"

def test_dry_run_changes_nothing(clean_env):
    CliRunner().invoke(cli.main, ["install", "all", "--dry-run"])
    assert not (clean_env / ".cursor").exists() and not (clean_env / ".codex").exists()

def test_serve_speaks_clean_jsonrpc_on_stdout(tmp_path):
    env = {k: v for k, v in os.environ.items() if not k.startswith("CARTESIA_")}
    env["HOME"] = str(tmp_path)
    env["XDG_CONFIG_HOME"] = str(tmp_path / ".config")
    frames = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
            "protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t", "version": "0"}}},
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "converse", "arguments": {"message": "hi"}}},
    ]
    p = subprocess.Popen(
        [sys.executable, "-m", "cartesia_voice_mode", "serve"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, env=env,
    )
    lines: queue.Queue = queue.Queue()
    threading.Thread(target=lambda: [lines.put(ln) for ln in p.stdout], daemon=True).start()
    out = []
    try:
        for f in frames:
            p.stdin.write(json.dumps(f) + "\n")
            p.stdin.flush()
        deadline = time.monotonic() + 30
        while {o.get("id") for o in out} != {1, 2, 3} and time.monotonic() < deadline:
            try:
                out.append(json.loads(lines.get(timeout=1)))
            except queue.Empty:
                pass
    finally:
        p.kill()
    assert {o["id"] for o in out} == {1, 2, 3}
    tools = {t["name"] for t in next(o for o in out if o["id"] == 2)["result"]["tools"]}
    assert tools == {"converse", "list_voices"}
    text = next(o for o in out if o["id"] == 3)["result"]["content"][0]["text"]
    assert text.startswith("[error: CARTESIA_API_KEY is not set")
