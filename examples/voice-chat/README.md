# Voice chat: talk to an AI voice agent in the browser

A Next.js app for a real-time voice conversation with a Cartesia Managed Agent (Ink 2 speech to text, an LLM and Sonic 3.6 text to speech, run by Cartesia). The browser streams the microphone to Cartesia over a WebSocket and plays the reply as it arrives. You can interrupt the agent mid-sentence, and the transcript updates as it speaks. Your server only mints a 60 second access token, so `CARTESIA_API_KEY` never reaches the page.

![A live call: the agent greeted the user, the user asked why the tides change twice a day, and the agent's answer is streaming in under a green Speaking badge, with Mute and End call buttons below](./docs/screenshot.png)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fcartesia-ai%2Fcookbook%2Ftree%2Fmain%2Fexamples%2Fvoice-chat&env=CARTESIA_API_KEY,CARTESIA_AGENT_ID&envDescription=Cartesia%20API%20key%2C%20and%20the%20agent%20id%20that%20pnpm%20setup%3Aagent%20prints%20when%20you%20run%20it%20locally&envLink=https%3A%2F%2Fgithub.com%2Fcartesia-ai%2Fcookbook%2Ftree%2Fmain%2Fexamples%2Fvoice-chat%23environment-variables&project-name=voice-chat&repository-name=voice-chat)

## Run it

You need Node 22.13 or newer, pnpm and a Cartesia API key from https://play.cartesia.ai/keys.

```sh
pnpm dlx create-next-app --example https://github.com/cartesia-ai/cookbook/tree/main/examples/voice-chat my-voice-chat
cd my-voice-chat
cp .env.example .env.local   # add CARTESIA_API_KEY
pnpm setup:agent             # creates the agent and writes CARTESIA_AGENT_ID to .env.local
pnpm dev
```

Open http://localhost:3000, press Start call, wait for the greeting and ask a question. Talk over the answer to interrupt it. Use headphones: on speakers the microphone picks up the agent and it can interrupt itself.

`pnpm setup:agent` is safe to run again. If the saved agent still exists it does nothing. `--force` creates a new one, and `--dry-run` prints the request with no key and no network call.

## Environment variables

| Name | Required | What it does |
| --- | --- | --- |
| `CARTESIA_API_KEY` | yes | Mints call tokens and creates the agent. Get one at https://play.cartesia.ai/keys |
| `CARTESIA_AGENT_ID` | yes | Written by `pnpm setup:agent`. You can also paste the id of an agent you already have |
| `AGENT_MODEL_ID` | no | LLM for the agent, read by `pnpm setup:agent`. Default `claude-haiku-4.5`. `GET /v1/agents/models` lists the others |
| `CARTESIA_VOICE_ID` | no | Agent voice, read by `pnpm setup:agent`. Pick one at https://play.cartesia.ai/voices |

After changing `AGENT_MODEL_ID` or `CARTESIA_VOICE_ID`, run `pnpm setup:agent --force`.

## How it works

```
browser  --POST /api/token-->  your server  --accessToken.create-->  Cartesia
browser  --mic audio, 16 kHz PCM over WebSocket-->  Cartesia Managed Agent
browser  <--agent audio, transcript, turn events---  (Ink 2, LLM, Sonic 3.6)
```

1. `scripts/setup-agent.ts` creates the agent once with `POST /v1/agents`: the prompt from `scripts/prompt.ts`, a voice, an LLM and `language.primary: "en"`.
2. On Start call, the browser asks `POST /api/token` for a token with only the `agent` grant. The route answers 503 if the key is missing and 429 after 10 tokens a minute from one address.
3. `useCartesiaAgent` in `lib/agents-web/` opens `wss://api.cartesia.ai/v1/agents/websocket/{agent_id}`, sends the microphone as 16 kHz PCM with echo cancellation on, and queues the agent's audio for playback.
4. When you talk over the agent, Cartesia sends `audio_output_clear`. The client drops the queued audio at once, and the last agent bubble is cut to the words it actually said and marked "interrupted".

The token route is the only server code a call needs:

```ts
import Cartesia from "@cartesia/cartesia-js";

export async function POST(): Promise<Response> {
  const client = new Cartesia({ apiKey: process.env.CARTESIA_API_KEY });
  const { token } = await client.accessToken.create({ grants: { agent: true }, expires_in: 60 });
  return Response.json({ token }, { headers: { "Cache-Control": "no-store" } });
}
```

```tsx
const agent = useCartesiaAgent({ agentId, getToken });
```

```
app/api/token/route.ts       mints the 60 second agent token
lib/token-handler.ts         rate limit and fixed error messages for that route
components/voice-chat.tsx    wires useCartesiaAgent to the view
components/voice-chat-view.tsx  props in, UI out, so tests render every state
lib/agents-web/              WebSocket client: mic, PCM encoding, playback, barge-in
scripts/setup-agent.ts       creates the agent and saves its id
scripts/prompt.ts            the agent's instructions and greeting
byo-snippets/                bring-your-own-LLM variant from the recipe, type-checked
mock/agent-server.ts         local WebSocket server for tests
```

## Models and API version

A Managed Agent runs Ink 2, the LLM you pick and Sonic 3.6 as one stack, so there is no TTS or STT model id to set. Requests send `Cartesia-Version: 2026-08-14`, set by `@cartesia/cartesia-js` 4.2. The bring-your-own-LLM variant in `byo-snippets/` calls `ink-2` and `sonic-3.6` directly. See https://docs.cartesia.ai/agents/introduction and https://docs.cartesia.ai/agents/models.

## Change it

- Change what the agent says: edit `scripts/prompt.ts`, then run `pnpm setup:agent --force`.
- Use another voice or LLM: set `CARTESIA_VOICE_ID` or `AGENT_MODEL_ID` and run `pnpm setup:agent --force`.
- Talk in another language: set `language.primary` in `buildBody` in `scripts/setup-agent.ts` (for example `es`), write the prompt and greeting in that language, and pick a voice that speaks it. See https://docs.cartesia.ai/agents/configuration.
- Run your own LLM: the recipe's bring-your-own-LLM variant streams the mic to Ink 2, sends turns to your `/api/chat` route and speaks the reply with Sonic. The code is in `byo-snippets/`.

## Before you deploy

The token route lets anyone who can reach it start calls on your account. Its 10 per minute limit is in memory, per server instance, and keyed on `x-forwarded-for`, which a client can spoof anywhere except behind Vercel's proxy. Put the route behind your own session check. See [Browser auth with access tokens](https://github.com/cartesia-ai/cookbook/blob/main/content/cookbook/00-guides/01-browser-auth-with-access-tokens.mdx).

Cartesia checks the token only when the socket opens, so a call does not end when its token expires.

## FAQ

### How do I keep my Cartesia API key out of the browser?

Mint a short-lived token on your server and give the browser only that. `app/api/token/route.ts` calls `client.accessToken.create({ grants: { agent: true }, expires_in: 60 })`, and the token cannot be used for text to speech or speech to text. See https://docs.cartesia.ai/get-started/authenticate-your-client-applications.

### Why do my words show up only after I stop talking?

The Managed Agents WebSocket sends your text in `turn_ended`, not while you speak, so the transcript shows animated dots until your turn ends. The agent's words stream in as it says them. For live captions of the user, use the bring-your-own-LLM variant, where Ink 2 sends partial transcripts.

### Why does the agent keep interrupting itself?

The microphone is hearing the speakers. Echo cancellation is on, but laptop speakers still leak into the mic. Use headphones.

### What does a call cost?

Managed Agent calls cost $0.06 a minute plus the LLM tokens, billed in dollars separately from credits (https://docs.cartesia.ai/pricing, checked 2026-10-16). `GET /v1/agents/models` returns the token price of each model.

### Can I put this agent on a phone number?

Yes. The same agent can take phone calls; the [front-desk](https://github.com/cartesia-ai/cookbook/tree/main/examples/front-desk) example in this cookbook shows the phone setup and tools. For the WebSocket events used here, see https://docs.cartesia.ai/line/integrations/websocket-api.

## Tests

```sh
pnpm test        # setup script, token route, rate limit, UI states, protocol against a local mock
pnpm typecheck   # the app, the setup script and byo-snippets/
pnpm build       # works with no environment variables set
```

`mock/agent-server.ts` follows the documented event protocol so tests run offline. It cannot tell you how the real service behaves, and browser audio (AudioWorklet, echo cancellation) is not covered. Try a real call.

## Learn more

- Recipe: [Voice chat with a Managed Agent](https://github.com/cartesia-ai/cookbook/blob/main/content/cookbook/15-agents/02-voice-chat.mdx)
- Managed Agents: https://docs.cartesia.ai/agents/introduction
- Agent WebSocket events: https://docs.cartesia.ai/line/integrations/websocket-api
- Create an agent: https://docs.cartesia.ai/api-reference/agents/create
- Cartesia docs for agents: https://docs.cartesia.ai/llms.txt
- Agent skills: `npx skills add cartesia-ai/skills`

## License

Apache-2.0, like the rest of the [Cartesia cookbook](https://github.com/cartesia-ai/cookbook/blob/main/LICENSE).
