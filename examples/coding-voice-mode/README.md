# Coding voice mode: talk to Claude Code, Cursor or Codex with an MCP server

<!-- mcp-name: io.github.cartesia-ai/cartesia-voice-mode -->

A local MCP server that adds voice mode to coding agents. The agent calls one tool, `converse`. Cartesia Sonic 3.6 text to speech reads the message aloud, Cartesia Ink 2 speech to text listens, and Ink 2's turn detection decides when you have finished talking. Your words come back as the tool result, so the agent treats them as your next message. There are no silence timeouts to tune and no push-to-talk key.

## Run it

You need [uv](https://docs.astral.sh/uv/), a Cartesia API key from https://play.cartesia.ai/keys, a microphone and headphones.

```sh
pnpm dlx degit cartesia-ai/cookbook/examples/coding-voice-mode coding-voice-mode
cd coding-voice-mode
export CARTESIA_API_KEY=your-key
./setup.sh claude --save-key     # or cursor, codex, all
```

Restart the agent and say, or type, "let's talk" or "voice mode". `setup.sh` runs `uv sync` and `cartesia-voice-mode install`. Add `--dry-run` to print what would change without changing anything, and run `uv run cartesia-voice-mode uninstall <client>` to remove only this server's entry.

`--save-key` copies the key from your shell into `~/.config/cartesia-voice-mode/env` with mode 0600. The installer never writes the key into a client config, because those files are plain text. The server reads `CARTESIA_API_KEY` from its environment first, then from that file.

## Add it to your agent by hand

Every client starts the same command. Replace `/path/to/coding-voice-mode` with the absolute path of your copy and run `uv sync` in it once first.

```sh
uv run --quiet --directory /path/to/coding-voice-mode cartesia-voice-mode serve
```

### Claude Code

```sh
claude mcp add cartesia-voice --scope user -- uv run --quiet --directory /path/to/coding-voice-mode cartesia-voice-mode serve
claude mcp get cartesia-voice    # Status: ✔ Connected
```

`--scope user` makes it available in every project. Use `--scope project` to write `.mcp.json` for your team, or `--scope local` for this project only. `./setup.sh claude --skill` also copies the usage skill to `~/.claude/skills/cartesia-voice/`. Claude Code's tool timeout defaults to about 28 hours, so long replies are fine.

### Cursor

Add this to `~/.cursor/mcp.json`, or to `.cursor/mcp.json` in a project:

```json
{
  "mcpServers": {
    "cartesia-voice": {
      "type": "stdio",
      "command": "uv",
      "args": ["run", "--quiet", "--directory", "/path/to/coding-voice-mode", "cartesia-voice-mode", "serve"]
    }
  }
}
```

The installer merges the same entry, without `type`, into the existing file and keeps one `.bak` of the original. `--project` writes `./.cursor/mcp.json` instead. If Cursor cannot find `uv`, put its full path in `command` (`which uv`).

### Codex

```sh
codex mcp add cartesia-voice -- uv run --quiet --directory /path/to/coding-voice-mode cartesia-voice-mode serve
```

Then raise the tool timeout in `~/.codex/config.toml`. Codex stops a tool call after 60 seconds by default, and one `converse` call lasts as long as you take to answer:

```toml
[mcp_servers.cartesia-voice]
command = "uv"
args = ["run", "--quiet", "--directory", "/path/to/coding-voice-mode", "cartesia-voice-mode", "serve"]
startup_timeout_sec = 30
tool_timeout_sec = 180
```

`./setup.sh codex` writes this whole block, timeouts included. It rewrites the file through a TOML parser, so comments are lost; the `.bak` next to it has the original. A project-level `.codex/config.toml` also works in trusted projects.

## Environment variables

`.env.example` lists the two you are most likely to set. The server reads them from the environment the client gives it, and the key also from `~/.config/cartesia-voice-mode/env`.

| Name | Required | Where to get it |
| --- | --- | --- |
| `CARTESIA_API_KEY` | yes | https://play.cartesia.ai/keys |
| `CARTESIA_VOICE_ID` | no | A voice id from https://play.cartesia.ai/voices, `doctor`, or the `list_voices` tool. Defaults to Daniel (en-US) |

Optional tuning, all unset by default:

| Name | What it does |
| --- | --- |
| `CARTESIA_TTS_MODEL` | Default `sonic-3.6`. Retired ids are refused at startup |
| `CARTESIA_LANGUAGE` | Language passed to Sonic. Ink 2 detects en, es, fr, hi and ja by itself |
| `CARTESIA_SPEED` | 0.6 to 1.5, sent as `generation_config.speed` |
| `CARTESIA_TURN_END_TIMEOUT_MS` | 640 to 11200. How long a pause can be before Ink 2 ends your turn |
| `CARTESIA_TURN_START_THRESHOLD`, `CARTESIA_TURN_EAGER_END_THRESHOLD`, `CARTESIA_TURN_END_THRESHOLD` | Ink 2 turn detection thresholds, sent only when set |
| `CARTESIA_KEYTERMS` | Comma-separated names to bias transcription toward, such as your repo or library names |
| `CARTESIA_NO_SPEECH_TIMEOUT_S`, `CARTESIA_MAX_LISTEN_S` | Safety deadlines, 20 and 120 seconds. Turn detection ends a normal turn |
| `CARTESIA_MAX_MESSAGE_CHARS` | 2000. Longer messages are refused so the agent summarizes instead of reading code aloud |
| `CARTESIA_INPUT_DEVICE`, `CARTESIA_OUTPUT_DEVICE` | sounddevice index or name |
| `CARTESIA_BASE_URL`, `CARTESIA_WS_BASE_URL` | For a proxy or a test server |

To set one for a client, add `-e NAME=value` after the server name in `claude mcp add` (for example `claude mcp add cartesia-voice --scope user -e CARTESIA_VOICE_ID=<id> -- uv run ...`), an `"env"` object in Cursor, or `--env NAME=value` in `codex mcp add`. Keep the API key out of these.

## How it works

1. The agent calls `converse(message="...")`. The server streams the message from Sonic 3.6 over `/tts/sse` and plays the PCM as it arrives, one request per group of sentences.
2. While it plays, the server opens the Ink 2 WebSocket at `/stt/turns/websocket`, so the handshake overlaps speech. The microphone opens only after playback ends, which keeps the agent from transcribing itself.
3. Microphone audio goes up as 16 kHz PCM. Ink 2 sends `turn.start`, `turn.update` and `turn.end`, and the server returns the `turn.end` transcript as the tool result.
4. `converse(message="...", wait_for_response=false)` only speaks, for progress reports. `[no speech heard]` and `[error: ...]` results tell the agent to stop using voice.

This is the listening half as a standalone script. It sends a 16 kHz mono WAV instead of the microphone, like `cartesia-voice-mode hear --wav`:

```python
import asyncio
import os
import sys
import wave

from cartesia import AsyncCartesia

async def one_turn(path: str) -> str:
    client = AsyncCartesia(api_key=os.environ["CARTESIA_API_KEY"])
    async with client.stt.auto_finalize.websocket(model="ink-2", encoding="pcm_s16le", sample_rate=16000) as conn:

        async def send_audio():
            with wave.open(path) as w:
                while chunk := w.readframes(1600):
                    await conn.send_raw(chunk)
                    await asyncio.sleep(0.1)

        sender = asyncio.create_task(send_audio())
        try:
            while True:
                ev = await conn.recv()
                if ev.type == "turn.end" and ev.transcript.strip():
                    return ev.transcript.strip()
        finally:
            sender.cancel()
            await client.close()

print(asyncio.run(one_turn(sys.argv[1])))
```

Run it with `uv run python turn.py question.wav` from this folder.

```
src/cartesia_voice_mode/server.py    the MCP server: converse and list_voices
src/cartesia_voice_mode/tts.py       Sonic 3.6 over SSE, sentence chunking
src/cartesia_voice_mode/stt.py       Ink 2 turns over WebSocket, deadlines, one reconnect
src/cartesia_voice_mode/audio.py     microphone and speaker through sounddevice
src/cartesia_voice_mode/config.py    settings, the 0600 key file, retired model guard
src/cartesia_voice_mode/install.py   client config writers for Claude Code, Cursor and Codex
src/cartesia_voice_mode/skill/       the agent skill installed by --skill
server.json                          MCP registry entry
```

## Models and API version

Uses `sonic-3.6` for speech and `ink-2` for streaming transcription with turn detection. The `cartesia` Python SDK (4.2 or newer) sends `Cartesia-Version: 2026-08-14`, and `tests/test_cartesia_wire.py` checks it. See https://docs.cartesia.ai/build-with-cartesia/tts-models/latest and https://docs.cartesia.ai/build-with-cartesia/stt/latest for current ids.

## Commands

```sh
uv run cartesia-voice-mode doctor              # checks the key and lists voices
uv run cartesia-voice-mode say "Hello there."  # speak once
uv run cartesia-voice-mode hear                # listen for one turn and print it
uv run cartesia-voice-mode hear --wav in.wav   # same, from a 16 kHz mono WAV
uv run pytest -q                               # mocked and local fake servers only, no key or audio device
```

The two tests in `tests/test_recipe_snippets.py` compare the code against the recipe in the cookbook repo, so they skip in a standalone copy.

On Linux install `libportaudio2` first. The macOS and Windows wheels of sounddevice include PortAudio.

## FAQ

### Does my API key end up in the agent's config?

No. The installer writes only the command and arguments, and the key lives in your shell or in `~/.config/cartesia-voice-mode/env` (mode 0600). Error messages and logs never include it.

### Can I interrupt the agent while it talks?

No. There is no barge-in and no echo cancellation, so the microphone is closed while the agent speaks. Use headphones. Parallel `converse` calls queue, so only one conversation runs at a time.

### How fast is it?

In our test on a laptop the first Sonic audio arrived 118 ms after the tool call. The server prints that number to stderr as `tts ttfa_ms` on every call, so you can check yours. Your turn ends when Ink 2 detects it, tunable with `CARTESIA_TURN_END_TIMEOUT_MS`.

### Does it work in other languages?

Ink 2 transcribes English, Spanish, French, Hindi and Japanese and detects which one you speak. Set `CARTESIA_LANGUAGE` and a matching `CARTESIA_VOICE_ID` so Sonic answers in the same language.

### How is this different from voicemode?

[mbailey/voicemode](https://github.com/mbailey/voicemode) supports local models, several providers and multi-agent voice channels. This server uses Cartesia only and keeps voicemode's `converse` tool name and parameters, so switching between the two needs no change in how the agent calls it.

## MCP registry listing

`server.json` follows the official MCP Registry schema (`2025-12-11`) and validates against it. The listing needs the package on PyPI as `cartesia-voice-mode`, and the registry checks the `mcp-name` comment at the top of this README to prove ownership.

- Name: `io.github.cartesia-ai/cartesia-voice-mode`
- Description: "Talk to your coding agent. Cartesia Sonic 3.6 speaks, Ink 2 turn detection hears your reply."
- Transport: stdio. Tools: `converse`, `list_voices`. Environment: `CARTESIA_API_KEY` (required, secret), `CARTESIA_VOICE_ID` (optional).

## Learn more

- Cartesia docs: https://docs.cartesia.ai
- Turn detection with Ink 2: https://docs.cartesia.ai/use-the-api/stt/turns
- TTS over server-sent events: https://docs.cartesia.ai/api-reference/tts/sse
- The recipe for this server: [Voice mode for coding agents](../../content/cookbook/10-python/05-voice-mode-for-coding-agents.mdx)
- MCP setup per client: [Claude Code](https://code.claude.com/docs/en/mcp), [Cursor](https://cursor.com/docs/context/mcp), [Codex](https://developers.openai.com/codex/mcp)
- Agent skills: `npx skills add cartesia-ai/skills`

## License

Apache-2.0, like the rest of the [Cartesia cookbook](https://github.com/cartesia-ai/cookbook/blob/main/LICENSE).
