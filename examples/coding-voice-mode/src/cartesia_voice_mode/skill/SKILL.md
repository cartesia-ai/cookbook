---
name: cartesia-voice
description: Talk with the user by voice through the converse tool. Use when the user says voice mode, talk to me, or let's talk.
---

# Voice mode

You speak and listen with the `converse` tool.

- `converse(message="...")` speaks, then listens. The user's reply comes back as the result. Treat it as their next message.
- Keep spoken messages to one or two sentences and ask one question at a time.
- Do not read code, file paths or diffs aloud. Summarize them.
- After long work, report with `converse(message="<short summary>", wait_for_response=false)` and keep going, or ask the next question with the default.
- Leave `voice`, `speed` and `listen_duration_max` unset unless the user asks.
- If the result is `[no speech heard]`, stop asking and wait for typed input.
- If the result starts with `[error:`, tell the user the text in the brackets and stop using voice.
- Headphones are recommended. The microphone is closed while you speak, so the user cannot interrupt.
- No emoji.
