import json
import stat
import tomllib
from pathlib import Path

import pytest

from cartesia_voice_mode import install as inst
from conftest import TEST_KEY

D = Path("/tmp/with space/coding-voice-mode")

def test_claude_command_exact():
    assert inst.claude_add_cmd(D, scope="user", uv="uv") == [
        "claude", "mcp", "add", "cartesia-voice", "--scope", "user", "--",
        "uv", "run", "--quiet", "--directory", str(D), "cartesia-voice-mode", "serve",
    ]
    assert "-e" in inst.claude_add_cmd(D, voice="abc")

def test_cursor_merge_keeps_others_and_is_idempotent(tmp_path):
    p = tmp_path / ".cursor" / "mcp.json"
    p.parent.mkdir()
    p.write_text(json.dumps({"mcpServers": {"other": {"command": "x"}}}))
    entry = inst.server_entry(D)
    assert inst.merge_cursor(p, entry) is True
    assert inst.merge_cursor(p, entry) is False
    data = json.loads(p.read_text())
    assert data["mcpServers"]["other"] == {"command": "x"}
    assert data["mcpServers"]["cartesia-voice"]["args"][3] == str(D)
    assert data["mcpServers"]["cartesia-voice"]["type"] == "stdio"
    baks = list(p.parent.glob("*.bak"))
    assert len(baks) == 1 and "other" in baks[0].read_text() and "cartesia" not in baks[0].read_text()

def test_cursor_refuses_malformed_json_without_touching_it(tmp_path):
    p = tmp_path / "mcp.json"
    for text in ("{not json", "[]"):
        p.write_text(text)
        with pytest.raises(inst.ConfigFileError, match="was not changed"):
            inst.merge_cursor(p, inst.server_entry(D))
        assert p.read_text() == text
    assert not list(tmp_path.glob("*.bak"))

def test_cursor_creates_file(tmp_path):
    p = tmp_path / "new" / "mcp.json"
    inst.merge_cursor(p, inst.server_entry(D))
    assert "cartesia-voice" in json.loads(p.read_text())["mcpServers"]

def test_codex_merge_keeps_others_and_is_idempotent(tmp_path):
    p = tmp_path / ".codex" / "config.toml"
    p.parent.mkdir()
    p.write_text('model = "x"\n\n[mcp_servers.other]\ncommand = "y"\n')
    entry = inst.server_entry(D, voice="vv")
    assert inst.merge_codex(p, entry) is True
    assert inst.merge_codex(p, entry) is False
    data = tomllib.loads(p.read_text())
    assert data["model"] == "x" and data["mcp_servers"]["other"] == {"command": "y"}
    ours = data["mcp_servers"]["cartesia-voice"]
    assert ours["tool_timeout_sec"] == 180 and ours["startup_timeout_sec"] == 30
    assert ours["command"] == "uv" and ours["env"] == {"CARTESIA_VOICE_ID": "vv"}
    assert len(list(p.parent.glob("*.bak"))) == 1

def test_uninstall_removes_only_ours(tmp_path):
    j, t = tmp_path / "mcp.json", tmp_path / "config.toml"
    j.write_text(json.dumps({"mcpServers": {"other": {"command": "x"}}}))
    t.write_text('[mcp_servers.other]\ncommand = "y"\n')
    inst.merge_cursor(j, inst.server_entry(D))
    inst.merge_codex(t, inst.server_entry(D))
    assert inst.remove_cursor(j) and inst.remove_codex(t)
    assert list(json.loads(j.read_text())["mcpServers"]) == ["other"]
    assert list(tomllib.loads(t.read_text())["mcp_servers"]) == ["other"]
    assert not inst.remove_cursor(j)

def test_save_key_mode_and_no_key_in_configs(tmp_path):
    p = tmp_path / "cfg" / "env"
    inst.save_key(p, TEST_KEY)
    assert stat.S_IMODE(p.stat().st_mode) == 0o600
    entry = inst.server_entry(D)
    assert TEST_KEY not in json.dumps(entry)
    assert TEST_KEY not in " ".join(inst.claude_add_cmd(D))

def test_skill_has_no_banned_words():
    text = inst.skill_text()
    assert "converse" in text and "\u2014" not in text
