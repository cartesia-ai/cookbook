# @cartesia-cookbook/agents-web

A small TypeScript client for talking to a Cartesia Managed Agent from the browser. It opens the agents WebSocket with a short-lived token your server mints, captures the microphone with an AudioWorklet, plays the agent's audio through a jitter buffer, and drops that audio the moment the agent is interrupted.

It is private to this repo and source-exported, like `packages/kit`: there is no build step and no npm release. In a Next.js app add it to `transpilePackages`.

The protocol is Cartesia's. This package is original code and copies nothing from a third party.

## Quick start

Three parts: a token route on your server, the hook in a client component, or the framework-free client.

### 1. Token route (server)

```ts
import { createAgentTokenHandler } from '@cartesia-cookbook/agents-web/server';

export const POST = createAgentTokenHandler({
  authorize: async (req) => isSignedIn(req),
});
```

The helper reads `CARTESIA_API_KEY`, mints a token with `client.accessToken.create({ grants: { agent: true }, expires_in: 60 })` and returns `{ token }` with `Cache-Control: no-store`. The token carries only the `agent` grant, so it cannot be used for speech synthesis or transcription. Failures return a generic 502 and never include the key or the upstream body. For other frameworks call `mintAgentToken()` directly. Importing the module never throws when the key is missing.

### 2. React hook (client)

```tsx
'use client';
import { useCartesiaAgent } from '@cartesia-cookbook/agents-web/react';

export function Talk({ agentId }: { agentId: string }) {
  const agent = useCartesiaAgent({
    agentId,
    getToken: async () => (await (await fetch('/api/agent-token', { method: 'POST' })).json()).token,
    tools: { get_time: () => new Date().toISOString() },
  });
  return (
    <>
      <button onClick={agent.status === 'ready' ? agent.stop : agent.start}>
        {agent.status === 'ready' ? 'Hang up' : 'Talk'}
      </button>
      {agent.messages.map((m) => <p key={m.turn}>{m.role}: {m.text}</p>)}
    </>
  );
}
```

Call `start` from a click. The hook never starts on its own, and unmounting stops the call. The hook returns `status`, `isSpeaking` (`{ user, agent }`), `messages`, `error`, `callId`, `muted`, `start`, `stop`, `setMuted` and `sendToolResult`. Pass `onEvent` to see every typed event.

### 3. Without React

```ts
import { CartesiaAgentClient } from '@cartesia-cookbook/agents-web';

const client = new CartesiaAgentClient({ agentId, getToken });
client.on('transcript', (e) => console.log(e.role, e.text, e.final));
client.on('client_tool_call', (e) => e.respond(JSON.stringify({ ok: true })));
await client.start();
await client.stop();
```

## Events

| Event | Payload |
| --- | --- |
| `status` | `idle`, `connecting`, `ready`, `closing`, `closed` or `error` |
| `ready` | `callId`, `agentId`, `agentVersionId` |
| `turn_started` / `turn_ended` | turn number, role, times. `turn_ended` has the final text, `interrupted`, `toolCalls` and `synthetic` |
| `turn_delta` | new `text` and the running `fullText` |
| `transcript` | the chat-UI event: running text per turn, then `final: true` with the server's text |
| `client_tool_call` | `toolCallId`, `toolName`, `parameters`, `expectsResponse` and a `respond()` helper |
| `barge_in` | `audio_output_clear` arrived. Playback is already cleared when you hear about it |
| `speaking` | `user`, `agent` or `none` |
| `error` | `code`, `message`, `fatal`, `source` (`server` or `client`) |
| `close` | `code`, `reason`, `clean` |
| `raw` | events this version does not know, and `dtmf_output` |

`respond()` sends `client_tool_result` once, cuts the result to 4096 bytes on a character boundary, and does nothing if the agent did not ask for a response. The `tools` option is shorthand: a handler for the tool name runs, its return value is sent (JSON for non-strings), and a throw is sent with `is_error: true`. If nothing answers a call that expects a response, the agent waits until its own timeout.

## Audio

- Input defaults to `pcm_16000`: mono, 16-bit, little-endian, sent in 40 ms chunks (`chunkMs`, 20 to 100). The browser captures at the AudioContext rate (often 44.1 or 48 kHz), so the client asks for a 16 kHz context first and resamples itself when the browser ignores that. 16 kHz is a third of the bytes of 44.1 kHz and enough for speech. `pcm_24000` and `pcm_44100` are available through `inputFormat`. `mulaw_8000` is telephony only and not offered.
- The resampler averages the input span of each output sample. It has no proper low-pass filter, which is fine for speech recognition.
- Output defaults to `as_available`: the server sends audio as fast as it has it and the client plays it on its own clock, starting 80 ms late (`prerollMs`) so a late chunk does not cause a gap. This gives the lowest latency, but the client owns barge-in, which is why `audio_output_clear` empties the queue synchronously. Set `outputDelivery: 'speaking_pace'` to let the server pace instead.
- Muting sends silence rather than stopping, because the server closes a session after 120 seconds without a valid client event.
- If the queue grows past 30 s (a stalled tab), the backlog is dropped.

## Errors and closing

`start()` never hangs. One timer (`connectTimeoutMs`, default 15 s) covers the socket opening through `session_ready`.

| Situation | What happens |
| --- | --- |
| `getToken` rejects or returns nothing | `start()` rejects with `token_failed`, no socket is opened |
| Mic blocked or missing | rejects with `mic_denied` or `mic_unavailable`, nothing is left open |
| No `session_ready` in time | rejects with `connect_timeout` and closes the socket |
| Close 1008 | protocol error, usually a bad or expired token or a bad first event |
| Close 1009 | a message was over 32 KiB |
| Close 1011 | the agent failed |
| Close 1006 | the connection dropped, which is also how a socket that never opened ends |
| `error` with `fatal: false` | emitted, the session continues |
| `error` with `fatal: true` | emitted, rejects a pending `start()`, otherwise waits for the server's close and force-closes after 2 s |
| Agent hangs up mid-turn | the open turn gets a `turn_ended` with `interrupted: true` and `synthetic: true` |

`stop()` closes with 1000, waits up to 1 s for the server's close, then releases the mic and the AudioContext regardless. It is safe to call twice. A client can be started again after it closes.

## Limits and requirements

- JSON messages up to 32 KiB, tool results up to 4096 bytes, first event within 10 s, 120 s idle timeout.
- `getUserMedia` needs HTTPS or localhost. Safari needs the first `start()` inside a click.
- CSP: the capture worklet loads from a Blob URL, so allow `worker-src blob:` and `connect-src wss://api.cartesia.ai`.
- The token travels in the WebSocket query string because browsers cannot set headers. It lives 60 seconds by default and only has the `agent` grant, but it can still show up in proxy logs.
- A background tab can suspend the AudioContext (Safari does). The client emits a non-fatal `audio_suspended` error and does nothing else.

## Not included

- Reconnecting. A reconnect would be a new call with new server state, so the app decides.
- DTMF. `dtmf_output` arrives as a `raw` event.
- Dynamic variables. Browser access tokens may not set them (the server answers `dynamic_variables_not_allowed`). Use a server-side proxy for per-session variables.
- Telephony audio (`mulaw_8000`).

## Develop

```sh
pnpm --filter @cartesia-cookbook/agents-web typecheck
pnpm --filter @cartesia-cookbook/agents-web test
```

Tests run offline against a fake WebSocket and a fake AudioContext timeline. They check scheduling math, not browser audio, so try a real call once with a microphone.

`pnpm --filter @cartesia-cookbook/agents-web live` mints a token, opens the socket, sends one second of silence and closes, with no microphone. Load your key into the environment first (`set -a; . path/to/.env; set +a`). Each run creates one real call record on your account, so it runs a single call. It takes `CARTESIA_AGENT_ID`, or uses the first agent on the account.

## Docs

- https://docs.cartesia.ai/line/integrations/websocket-api (guide: connect, session, audio, tools, limits)
- https://docs.cartesia.ai/api-reference/agents/agent-websocket (event reference)
- https://docs.cartesia.ai/api-reference/auth/access-token (the `agent` grant)
- https://docs.cartesia.ai/get-started/authenticate-your-client-applications
- https://docs.cartesia.ai/agents/client-tools
