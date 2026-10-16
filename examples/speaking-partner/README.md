# Speaking partner: practice a language out loud with an AI voice agent

A Next.js app for language speaking practice. You pick the language you speak and the one you are learning, choose a role play such as ordering a coffee or negotiating rent, and talk to a Cartesia Managed Agent that plays the other person. The agent hears you with Ink 2 speech to text and answers with a native Sonic 3.6 voice, while a side panel writes down what to fix after every line you say.

![Speaking partner during the "Order a coffee" mission in Spanish, Teacher mode. The learner's line "Pero yo tengo solo un billete de veinte euros. ¿Es problema?" is in the transcript, the barista answers in Spanish with a short tip, and the corrections panel shows a Grammar card with the fixed sentence "Pero solo tengo un billete de veinte euros. ¿Es un problema?"](./docs/screenshot.png)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fcartesia-ai%2Fcookbook%2Ftree%2Fmain%2Fexamples%2Fspeaking-partner&env=CARTESIA_API_KEY&envDescription=Cartesia%20API%20key.%20Add%20ANTHROPIC_API_KEY%20or%20OPENAI_API_KEY%20later%20for%20the%20corrections%20panel.&envLink=https%3A%2F%2Fplay.cartesia.ai%2Fkeys&project-name=speaking-partner&repository-name=speaking-partner)

## Run it

You need Node 22.13 or newer, pnpm 10, a Cartesia API key and a microphone.

```sh
pnpm dlx create-next-app --example https://github.com/cartesia-ai/cookbook/tree/main/examples/speaking-partner my-partner
cd my-partner
cp .env.example .env.local   # add CARTESIA_API_KEY, and ANTHROPIC_API_KEY or OPENAI_API_KEY for corrections
pnpm dev
```

Open http://localhost:3000, pick your languages and a mission, press Start speaking, and speak first. A session lasts 3 minutes. Use headphones: on speakers the microphone can pick up the partner's voice and it may interrupt itself. M mutes and Escape ends the session.

Without an LLM key everything works except the corrections panel, which says which key to add. Without a Cartesia key the page shows setup help.

## Environment variables

| Name | Required | Where to get it |
| --- | --- | --- |
| `CARTESIA_API_KEY` | yes | https://play.cartesia.ai/keys |
| `ANTHROPIC_API_KEY` | for corrections (or OpenAI) | https://console.anthropic.com |
| `OPENAI_API_KEY` | for corrections (or Anthropic) | https://platform.openai.com/api-keys |
| `CORRECTIONS_MODEL` | no | `anthropic:<model-id>` or `openai:<model-id>`. Defaults to `claude-haiku-4-5` or `gpt-5-mini` |
| `AGENT_MODEL_ID` | no | The partner's LLM, from `GET /v1/agents/models`. Defaults to `claude-haiku-4.5` |
| `VOICE_ID_EN`, `VOICE_ID_ES`, `VOICE_ID_FR`, `VOICE_ID_HI`, `VOICE_ID_JA` | no | Pin a voice per language. Ids from https://play.cartesia.ai/voices |

Agent minutes and the agent's LLM are billed to your Cartesia account. Each line you say also makes one small call to the corrections model.

## How it works

1. `POST /api/session` takes your languages, mode and a mission id. The server writes them into the instructions of a new Managed Agent, picks a native Sonic voice for the target language, and returns the agent id.
2. `POST /api/token` mints a 60 second access token with only the `agent` grant. `CARTESIA_API_KEY` never leaves the server.
3. The browser opens the Managed Agents WebSocket with `useCartesiaAgent` from `lib/agents-web`, which handles the microphone, 16 kHz PCM, playback and barge-in.
4. After each of your turns, `POST /api/correct` sends that one line to your LLM with a schema (`hasIssue`, `corrected`, `explanation`, `category`) and the panel shows the result.
5. When the partner calls the `complete_mission` client tool, or you leave, the page shows a summary and `POST /api/session/end` deletes the agent.

Why one agent per session: a browser access token cannot send `dynamic_variables` (the service answers `dynamic_variables_not_allowed`, and `pnpm live` shows it), so the mission has to be in the agent's instructions before the call starts. Creating an agent took 130 to 550 ms when we measured it. The recipe weighs the alternatives.

```tsx
const agent = useCartesiaAgent({
  agentId,
  getToken: fetchToken, // POST /api/token
  tools: {
    [COMPLETE_TOOL_NAME]: (params) => {
      if (completion.current) return;
      completion.current = parseCompletion(params);
      setCompleted(true);
    },
  },
});
```

```
app/api/session/route.ts      creates the session agent, sweeps ones older than 30 minutes
app/api/session/end/route.ts  deletes it when you leave
app/api/token/route.ts        60 second token with the agent grant, rate limited
app/api/correct/route.ts      one correction per line through the AI SDK
lib/session-agent.ts          agent body, voice pick, shared complete_mission tool, delete by name prefix
lib/prompts.ts                Teacher and Immersive instructions
lib/agents-web/               vendored Managed Agents WebSocket client
data/missions.json            the nine role plays
```

## Models and API version

The Managed Agent runs Ink 2 (`ink-2`) for your speech and Sonic 3.6 (`sonic-3.6`) for the partner's voice. Cartesia picks both, so the agent config sets only a language, a voice id and the LLM. The server sends `Cartesia-Version: 2026-08-14` (set by `@cartesia/cartesia-js`). See https://docs.cartesia.ai/build-with-cartesia/tts-models/latest and https://docs.cartesia.ai/build-with-cartesia/stt/latest for current ids.

The five languages, English, Spanish, French, Hindi and Japanese, are the ones Ink 2 transcribes. You speak both of yours (your own when the partner explains something in Teacher mode), so both pickers are limited to these five.

## Change it

- Pick the partner's voice: set `VOICE_ID_ES` and the others. Without them the server lists voices and takes the first native speaker with a friendly description, which is stable but arbitrary.
- Add a role play: add an entry to `data/missions.json`. Routes take the mission id, so the browser never sends free text into a prompt.
- Change the teaching style: edit `lib/prompts.ts`. Teacher mode nudges and explains in your language. Immersive mode stays in character and gives a Tiro, Proficiens or Peritus rating at the end.
- Use another corrections model: set `CORRECTIONS_MODEL`, for example `openai:gpt-5`.
- Reuse the shared tool: set `CARTESIA_TOOL_ID_COMPLETE` to the id of an existing `complete_mission` tool. Otherwise the server finds or creates one on your account.

## FAQ

### How do I keep my Cartesia API key out of the browser?

The browser only ever gets a token from `app/api/token/route.ts`, which calls `accessToken.create` with the `agent` grant and `expires_in: 60`. See https://docs.cartesia.ai/get-started/authenticate-your-client-applications.

### Why does my own line appear only after I stop talking?

The Managed Agents WebSocket sends your words in `turn_ended`, once per turn. The partner's words stream in as it speaks. The corrections panel updates at the same moment your line appears.

### Can I practice a language other than these five?

Not with a Managed Agent, because Ink 2 transcribes only English, Spanish, French, Hindi and Japanese. For other languages, build your own pipeline with `ink-whisper` for speech to text, your LLM and Sonic.

### Is it safe to deploy as is?

No. `/api/session` creates agents on your account and `/api/token` hands out access to them. Each route has an in-memory limit per address (6 and 12 a minute) that resets on restart and is not shared across instances. A token carries the `agent` grant for your whole account, not one agent. Put both routes behind your own login first.

### What happens to agents if a tab crashes?

Closing the tab sends a `keepalive` request that deletes the agent. `/api/session` also deletes `speaking-partner-session-` agents older than 30 minutes. A crashed server can leave one behind until the next session starts.

## Tests

```sh
pnpm test            # prompts, agent lifecycle, routes, corrections, UI states, protocol against a local mock
pnpm typecheck
pnpm build           # works with no environment variables set
pnpm live            # real API: creates an agent per language, opens the socket, deletes it
pnpm live:talk es    # real API: a short conversation fed from Sonic audio instead of a microphone
```

Browser audio and the quality of the conversation are not covered by tests. Ink 2 is pinned to the target language, and mixed-language speech from real microphones is not measured.

## Learn more

- Cartesia docs: https://docs.cartesia.ai
- Managed Agents: https://docs.cartesia.ai/agents/introduction
- Client tools: https://docs.cartesia.ai/agents/client-tools
- Agents WebSocket events: https://docs.cartesia.ai/line/integrations/websocket-api
- The recipe for this app: [Language Speaking Partner](../../content/cookbook/15-agents/03-speaking-partner.mdx)
- Agent skills: `npx skills add cartesia-ai/skills`

## License

Apache-2.0, like the rest of the [Cartesia cookbook](https://github.com/cartesia-ai/cookbook/blob/main/LICENSE).
