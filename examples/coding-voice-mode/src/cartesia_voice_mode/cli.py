from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import sys
from pathlib import Path

import click

from . import __version__, install as inst
from .client import MISSING_KEY, make_client
from .config import ConfigError, Settings, key_file, load_settings

CLIENTS = ("claude", "cursor", "codex")

def _settings() -> Settings:
    try:
        return load_settings()
    except ConfigError as exc:
        raise click.ClickException(str(exc))

@click.group(invoke_without_command=True)
@click.version_option(__version__)
@click.pass_context
def main(ctx: click.Context) -> None:
    """Cartesia voice mode for coding agents."""
    if ctx.invoked_subcommand is None:
        ctx.invoke(serve)

@main.command()
def serve() -> None:
    """Run the MCP server on stdio."""
    from .server import main as run

    run()

def _install_one(name: str, opts: dict) -> str:
    home = Path.home()
    directory = inst.project_dir()
    uv = shutil.which("uv") or "uv"
    entry = inst.server_entry(directory, uv=uv, voice=opts["voice"])
    dry = opts["dry_run"]
    if name == "claude":
        cmd = inst.claude_add_cmd(directory, scope=opts["scope"], uv=uv, voice=opts["voice"])
        if dry or not shutil.which("claude"):
            why = "dry run" if dry else "claude not found on PATH, run this yourself"
            return f"claude ({why}):\n  {' '.join(cmd)}"
        r = subprocess.run(cmd, capture_output=True, text=True)
        return "claude: added" if r.returncode == 0 else f"claude: failed ({(r.stderr or r.stdout).strip()})"
    if name == "cursor":
        path = inst.cursor_path(home, Path.cwd() if opts["project"] else None)
        if dry:
            return f"cursor (dry run): would write {path}"
        return f"cursor: {'updated' if inst.merge_cursor(path, entry) else 'already set up'} {path}"
    path = inst.codex_path(home)
    if dry:
        return f"codex (dry run): would write {path}"
    return f"codex: {'updated' if inst.merge_codex(path, entry) else 'already set up'} {path}"

def _present(name: str) -> bool:
    home = Path.home()
    return {
        "claude": bool(shutil.which("claude")),
        "cursor": (home / ".cursor").exists() or bool(shutil.which("cursor")),
        "codex": (home / ".codex").exists() or bool(shutil.which("codex")),
    }[name]

@main.command()
@click.argument("client", type=click.Choice([*CLIENTS, "all"]))
@click.option("--scope", type=click.Choice(["user", "project", "local"]), default="user", show_default=True, help="Claude Code scope.")
@click.option("--project", is_flag=True, help="Cursor: write ./.cursor/mcp.json instead of the user file.")
@click.option("--voice", help="Voice id to store in the client config (not a secret).")
@click.option("--save-key", is_flag=True, help="Copy CARTESIA_API_KEY from this shell into a 0600 file. The key never goes into a client config.")
@click.option("--skill", is_flag=True, help="Claude Code: also install the skill into ~/.claude/skills.")
@click.option("--dry-run", is_flag=True, help="Print what would happen, change nothing.")
def install(client, scope, project, voice, save_key, skill, dry_run) -> None:
    """Register the server with a coding agent."""
    opts = dict(scope=scope, project=project, voice=voice, dry_run=dry_run)
    if save_key:
        key = os.environ.get("CARTESIA_API_KEY")
        if not key:
            raise click.ClickException("--save-key needs CARTESIA_API_KEY set in this shell")
        if dry_run:
            click.echo(f"dry run: would write the key to {key_file()} (mode 0600)")
        else:
            inst.save_key(key_file(), key)
            click.echo(f"saved the key to {key_file()} (mode 0600)")
    names = [c for c in CLIENTS if _present(c)] if client == "all" else [client]
    if client == "all":
        for c in CLIENTS:
            if c not in names:
                click.echo(f"{c}: not found, skipped")
    for n in names:
        click.echo(_install_one(n, opts))
    want_skill = skill or (
        "claude" in names and not dry_run and sys.stdin.isatty()
        and click.confirm("Install the skill into ~/.claude/skills?", default=False)
    )
    if want_skill and "claude" in names and not dry_run:
        click.echo(f"skill: {inst.install_skill(Path.home())}")
    if not (save_key or os.environ.get("CARTESIA_API_KEY") or load_settings().api_key):
        click.echo("note: no API key found yet. Set CARTESIA_API_KEY or run install again with --save-key.")

@main.command()
@click.argument("client", type=click.Choice(CLIENTS))
@click.option("--scope", type=click.Choice(["user", "project", "local"]), default="user")
@click.option("--project", is_flag=True)
@click.option("--dry-run", is_flag=True)
def uninstall(client, scope, project, dry_run) -> None:
    """Remove only this server's entry."""
    home = Path.home()
    if client == "claude":
        cmd = inst.claude_remove_cmd(scope)
        if dry_run or not shutil.which("claude"):
            click.echo(" ".join(cmd))
        else:
            subprocess.run(cmd)
    elif client == "cursor":
        path = inst.cursor_path(home, Path.cwd() if project else None)
        click.echo("removed" if not dry_run and inst.remove_cursor(path) else "nothing to remove")
    else:
        click.echo("removed" if not dry_run and inst.remove_codex(inst.codex_path(home)) else "nothing to remove")

@main.command()
def doctor() -> None:
    """Check the setup. Never prints the key."""
    import cartesia

    ok = True

    def line(good: bool, text: str) -> None:
        nonlocal ok
        ok = ok and good
        click.echo(f"{'PASS' if good else 'FAIL'}  {text}")

    try:
        s = load_settings()
    except ConfigError as exc:
        line(False, f"config: {exc}")
        sys.exit(1)
    line(True, f"models: tts {s.tts_model}, stt {s.stt_model}")
    line(True, f"cartesia sdk {cartesia.__version__}")
    try:
        from .audio import _sd

        sd = _sd()
        ins = [d["name"] for d in sd.query_devices() if d["max_input_channels"] > 0]
        outs = [d["name"] for d in sd.query_devices() if d["max_output_channels"] > 0]
        line(bool(ins), f"input devices: {len(ins)}")
        line(bool(outs), f"output devices: {len(outs)}")
    except Exception as exc:
        line(False, f"audio: {exc}")
    if not s.api_key:
        line(False, MISSING_KEY)
        click.echo("live checks skipped: no API key")
        sys.exit(1)
    line(True, "api key present")

    async def live() -> None:
        client = make_client(s)
        try:
            rows = []
            async for v in client.voices.list(limit=10):
                rows.append(f"{v.id}  {v.name}  {getattr(v, 'language', '')}")
                if len(rows) >= 10:
                    break
            line(True, "key accepted by the API")
            click.echo("voices:\n  " + "\n  ".join(rows))
        except Exception as exc:
            from .server import describe

            line(False, f"api: {describe(exc)}")
        finally:
            await client.close()

    asyncio.run(live())
    sys.exit(0 if ok else 1)

def _need_key() -> Settings:
    s = _settings()
    if not s.api_key:
        raise click.ClickException(MISSING_KEY)
    return s

@main.command()
@click.argument("text")
@click.option("--voice")
@click.option("--speed", type=float)
def say(text, voice, speed) -> None:
    """Speak text once (smoke test)."""
    from .audio import Speaker
    from .tts import speak

    s = _need_key()

    async def run() -> None:
        client, sp = make_client(s), Speaker(s.sample_rate_out, s.output_device)
        try:
            await speak(client, s, text, sp, voice=voice, speed=speed)
            await sp.drain()
        finally:
            await client.close()

    asyncio.run(run())

@main.command()
@click.option("--wav", type=click.Path(exists=True), help="Stream a 16 kHz mono WAV instead of the microphone.")
def hear(wav) -> None:
    """Listen for one turn and print the transcript."""
    from .audio import Mic, WavMic
    from .stt import listen_for_turn

    s = _need_key()

    async def run():
        client = make_client(s)
        mic = WavMic(wav, s.sample_rate_in) if wav else Mic(s.sample_rate_in, s.input_device)
        try:
            return await listen_for_turn(client, s, mic)
        finally:
            await client.close()

    res = asyncio.run(run())
    click.echo(res.text if res.text else f"[{res.ended_by}]")
