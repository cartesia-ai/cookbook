# Coding voice mode

A local MCP server that lets you talk to Claude Code, Cursor or Codex: Cartesia Sonic 3.6 reads the agent's message aloud, and Cartesia Ink 2 streaming speech to text with turn detection hears your reply.

The agent calls one tool, `converse`. Your words come back as the tool result, so the agent treats them as your next message. Ink 2 decides when you have finished talking, so there are no silence timeouts to tune and no push-to-talk key.

## Run it

You need [uv](https://docs.astral.sh/uv/), a Cartesia API key from https://play.cartesia.ai/keys, a microphone and headphones.

```sh
npx degit cartesia-ai/cookbook/examples/coding-voice-mode coding-voice-mode
cd coding-voice-mode
export CARTESIA_API_KEY=your-key
./setup.sh claude --save-key     # or cursor, codex, all
```

`pnpm dlx degit` works too. Restart the agent and say, or type, "let's talk" or "voice mode".

`setup.sh` runs `uv sync` and `uv run cartesia-voice-mode install`. Add `--dry-run` to print what would change without changing anything, and run `uv run cartesia-voice-mode uninstall <client>` to remove only this server's entry.

`--save-key` copies the key from your shell into `~/.config/cartesia-voice-mode/env` with mode 0600. The installer never writes the key into a client config, because those files are plain text. The server reads `CARTESIA_API_KEY` from its environment first, then from that file.

Check the setup and try each half on its own:

```sh
uv run cartesia-voice-mode doctor              # checks the key and lists voices
uv run cartesia-voice-mode say "Hello there."  # speak once
uv run cartesia-voice-mode hear                # listen for one turn and print it
uv run cartesia-voice-mode hear --wav in.wav   # same, from a 16 kHz mono WAV
```

On Linux install `libportaudio2` first. The macOS and Windows wheels of sounddevice include PortAudio.

### Add it to your agent by hand

Every client starts the same command. Replace `/path/to/coding-voice-mode` with the absolute path of your copy and run `uv sync` in it once first.

```sh
uv run --quiet --directory /path/to/coding-voice-mode cartesia-voice-mode serve
```

Claude Code:

```sh
claude mcp add cartesia-voice --scope user -- uv run --quiet --directory /path/to/coding-voice-mode cartesia-voice-mode serve
claude mcp get cartesia-voice
```

`--scope user` makes it available in every project. Use `--scope project` to write `.mcp.json` for your team, or `--scope local` for this project only. `./setup.sh claude --skill` also copies the usage skill to `~/.claude/skills/cartesia-voice/`.

Cursor: add this to `~/.cursor/mcp.json`, or to `.cursor/mcp.json` in a project.

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

The installer merges the same entry into the existing file and keeps one `.bak` of the original. If the file is not valid JSON, it stops with the line and column and leaves the file alone. `--project` writes `./.cursor/mcp.json` instead. If Cursor cannot find `uv`, put its full path in `command` (`which uv`).

Codex:

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

The server reads these from the environment the client gives it, and the key also from `~/.config/cartesia-voice-mode/env`. `.env.example` lists the first two.

| Name | Required | What it does |
| --- | --- | --- |
| `CARTESIA_API_KEY` | yes | https://play.cartesia.ai/keys |
| `CARTESIA_VOICE_ID` | no | A voice id from https://play.cartesia.ai/voices, `doctor`, or the `list_voices` tool. Defaults to Daniel (en-US) |
| `CARTESIA_TTS_MODEL` | no | Default `sonic-3.6`. Retired ids are refused at startup |
| `CARTESIA_LANGUAGE` | no | Language passed to Sonic. Ink 2 detects en, es, fr, hi and ja by itself |
| `CARTESIA_SPEED` | no | 0.6 to 1.5, sent as `generation_config.speed` |
| `CARTESIA_TURN_END_TIMEOUT_MS` | no | 640 to 11200. How long a pause can be before Ink 2 ends your turn |
| `CARTESIA_TURN_START_THRESHOLD`, `CARTESIA_TURN_EAGER_END_THRESHOLD`, `CARTESIA_TURN_END_THRESHOLD` | no | Ink 2 turn detection thresholds, sent only when set |
| `CARTESIA_KEYTERMS` | no | Comma-separated names to bias transcription toward, such as your repo or library names |
| `CARTESIA_NO_SPEECH_TIMEOUT_S`, `CARTESIA_MAX_LISTEN_S` | no | Safety deadlines, 20 and 120 seconds. Turn detection ends a normal turn |
| `CARTESIA_MAX_MESSAGE_CHARS` | no | 2000. Longer messages are refused so the agent summarizes instead of reading code aloud |
| `CARTESIA_INPUT_DEVICE`, `CARTESIA_OUTPUT_DEVICE` | no | sounddevice index or name |
| `CARTESIA_BASE_URL`, `CARTESIA_WS_BASE_URL` | no | For a proxy or a test server |

To set one for a client, add `-e NAME=value` after the server name in `claude mcp add`, an `"env"` object in Cursor, or `--env NAME=value` in `codex mcp add`. Keep the API key out of these.

## How it works

Open these first:

- `src/cartesia_voice_mode/tts.py`: Sonic 3.6 over `/tts/sse`, one request per group of sentences, PCM played as it arrives.
- `src/cartesia_voice_mode/stt.py`: Ink 2 over `/stt/turns/websocket` with `client.stt.auto_finalize.websocket`, deadlines and one reconnect.
- `src/cartesia_voice_mode/server.py`: the `converse` and `list_voices` tools.

1. The agent calls `converse(message="...")`. The server streams the message from Sonic and plays it.
2. While it plays, the server opens the Ink 2 WebSocket, so the handshake overlaps speech. The microphone opens only after playback ends, which keeps the agent from transcribing itself.
3. Microphone audio goes up as 16 kHz PCM. Ink 2 sends `turn.start`, `turn.update` and `turn.end`, and the server returns the `turn.end` transcript as the tool result.
4. `converse(message="...", wait_for_response=false)` only speaks, for progress reports. `[no speech heard]` and `[error: ...]` results tell the agent to stop using voice.

The `cartesia` Python SDK (4.2 or newer) sends `Cartesia-Version: 2026-08-14`, and `tests/test_cartesia_wire.py` checks it.

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

## Change it

- Voice and speed: set `CARTESIA_VOICE_ID` and `CARTESIA_SPEED` in the client's env block.
- Turn length: raise `CARTESIA_TURN_END_TIMEOUT_MS` if Ink 2 ends your turn while you are still thinking.
- How the agent uses voice: edit `src/cartesia_voice_mode/skill/SKILL.md` and the tool description in `server.py`. Keep the result strings (`[spoken]`, `[no speech heard]`, `[error: ...]`) as they are; the skill depends on them.
- Client configs: `src/cartesia_voice_mode/install.py` writes them for Claude Code, Cursor and Codex.

## Before you deploy

This runs on your machine over stdio, so there is no server to secure. The key stays in your shell or the 0600 key file and never goes into a client config, a log line or an error message.

Cost: every `converse` call bills Sonic characters for the message and Ink 2 seconds while the microphone is open. `CARTESIA_MAX_MESSAGE_CHARS` and `CARTESIA_MAX_LISTEN_S` cap both. See https://docs.cartesia.ai/pricing.

## FAQ

### Can I interrupt the agent while it talks?

No. There is no barge-in and no echo cancellation, so the microphone is closed while the agent speaks. Use headphones. Parallel `converse` calls queue, so only one conversation runs at a time.

### How fast is it?

Each call logs `tts ttfa_ms=<n>` to stderr: the milliseconds from sending the Sonic request to the first audio chunk. Run `uv run cartesia-voice-mode say "Hello there."` to see yours. Your turn ends when Ink 2 detects it, tunable with `CARTESIA_TURN_END_TIMEOUT_MS`.

### Does it work in other languages?

Ink 2 transcribes English, Spanish, French, Hindi and Japanese and detects which one you speak. Set `CARTESIA_LANGUAGE` and a matching `CARTESIA_VOICE_ID` so Sonic answers in the same language.

### How is this different from voicemode?

[mbailey/voicemode](https://github.com/mbailey/voicemode) supports local models, several providers and multi-agent voice channels. This server uses Cartesia only and keeps voicemode's `converse` tool name and parameters, so switching between the two needs no change in how the agent calls it.

### Why did the comments in my Codex config disappear?

`install codex` rewrites `~/.codex/config.toml` through a TOML parser, which drops comments. The first run keeps the original as `config.toml.bak` next to it.

## Tests

```sh
uv run pytest -q
```

The tests use mocks and local fake servers. They need no key and no audio device.

## Learn more

- Turn detection with Ink 2: https://docs.cartesia.ai/use-the-api/stt/turns
- TTS over server-sent events: https://docs.cartesia.ai/api-reference/tts/sse
- Current model ids: https://docs.cartesia.ai/build-with-cartesia/tts-models/latest and https://docs.cartesia.ai/build-with-cartesia/stt/latest
- The recipe for this server: [Voice mode for coding agents](../../content/cookbook/10-python/05-voice-mode-for-coding-agents.mdx)
- MCP setup per client: [Claude Code](https://code.claude.com/docs/en/mcp), [Cursor](https://cursor.com/docs/context/mcp), [Codex](https://developers.openai.com/codex/mcp)

## License

Apache-2.0, like the rest of the [Cartesia cookbook](https://github.com/cartesia-ai/cookbook/blob/main/LICENSE).
