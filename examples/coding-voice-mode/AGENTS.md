# Agent notes for coding-voice-mode

A local stdio MCP server (`cartesia-voice`) that gives coding agents a `converse` tool: Sonic 3.6 speaks, Ink 2 turn detection listens. Python 3.11+, uv, FastMCP 3, sounddevice.

## Commands (run from this folder)

- Install: `uv sync`. Serve: `uv run cartesia-voice-mode serve` (stdio; stdout is the MCP channel, logs go to stderr).
- Tests: `uv run pytest -q`. They use mocks and local fake HTTP and WebSocket servers, never a real key, the network or audio hardware. Keep it that way.
- Live checks (need `CARTESIA_API_KEY`, cost a few credits): `uv run cartesia-voice-mode doctor`, `say "Hello."`, `hear --wav in.wav` (16 kHz mono).
- Set `UV_PROJECT_ENVIRONMENT` to a path outside the checkout if disk is tight.

## Files

- `server.py`: the two tools, `converse` and `list_voices`, and their result strings (`[spoken]`, `[no speech heard]`, `[partial, ...]`, `[error: ...]`). Agents and the skill depend on these exact strings.
- `tts.py`: Sonic over `/tts/sse`. `stt.py`: Ink 2 over `/stt/turns/websocket` via `client.stt.auto_finalize.websocket`.
- `config.py`: settings, the 0600 key file at `~/.config/cartesia-voice-mode/env`, the retired model guard.
- `install.py` and `cli.py`: config writers for Claude Code (`claude mcp add`), Cursor (`mcp.json`) and Codex (`config.toml`). A malformed config raises `ConfigFileError`, which the CLI prints without touching the file.
- `skill/SKILL.md`: the usage skill. Tool descriptions are `description=` arguments in `server.py` and command help is `help=` in `cli.py`, since the code has no docstrings.

## Rules

- Models: `sonic-3.6` and `ink-2`. Retired ids are rejected at load in `config.py`; do not add fallbacks. `facts.json` at the repo root is the source.
- The `cartesia` SDK sends `Cartesia-Version: 2026-08-14`. `tests/test_cartesia_wire.py` asserts the header, body and query string; update it if you change a request.
- Never write an API key into a client config, a test, a log line or an error message. `describe()` in `server.py` returns status and message only.
- Never run `install` against the real home directory while testing. Use `--dry-run` or a temporary `HOME`.
- The mic opens only after playback drains, and one conversation runs at a time (`asyncio.Lock`). There is no barge-in; do not claim one.
- Codex stops tool calls after 60 seconds unless `tool_timeout_sec` is set. `install.py` writes `tool_timeout_sec = 180` and `startup_timeout_sec = 30` for Codex, and `"type": "stdio"` for Cursor. The 180 seconds cover the whole `converse` call, playback first and then up to `CARTESIA_MAX_LISTEN_S` (120) of listening, so a long message plus a full listen can run past it. `listen_duration_max` from the agent is clamped to `CARTESIA_MAX_LISTEN_S` in `stt.py`. Raise `tool_timeout_sec` if you raise either limit.
- Client config formats change. Check the official MCP docs for Claude Code, Cursor and Codex before editing `install.py`, and test against a temporary `HOME` (`claude mcp get`, `codex mcp get`).

## Docs

- https://docs.cartesia.ai/llms.txt
- Ink 2 turns: https://docs.cartesia.ai/use-the-api/stt/turns.md
- SSE TTS: https://docs.cartesia.ai/api-reference/tts/sse.md
- Skills: `npx skills add cartesia-ai/skills`
