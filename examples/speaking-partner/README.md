# Speaking partner

A Next.js app for practicing a language out loud with a Cartesia Managed Agent that plays the other person in a role play, while a side panel writes down what to fix after every line you say.

![Speaking partner during the "Order a coffee" mission in Spanish, Teacher mode. The learner's line "Pero yo tengo solo un billete de veinte euros. ¿Es problema?" is in the transcript, the barista answers in Spanish with a short tip, and the corrections panel shows a Grammar card with the fixed sentence "Pero solo tengo un billete de veinte euros. ¿Es un problema?"](./docs/screenshot.png)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fcartesia-ai%2Fcookbook%2Ftree%2Fmain%2Fexamples%2Fspeaking-partner&env=CARTESIA_API_KEY%2CAPP_PASSWORD&envDescription=Cartesia%20API%20key%20and%20a%20password%20for%20the%20app%20%28or%20none%29.%20Add%20LLM_MODEL%20later%20for%20the%20corrections%20panel.&envLink=https%3A%2F%2Fgithub.com%2Fcartesia-ai%2Fcookbook%2Ftree%2Fmain%2Fexamples%2Fspeaking-partner%23environment-variables&project-name=speaking-partner&repository-name=speaking-partner)

## Run it

Node 22.22 or newer. You need a Cartesia API key from https://play.cartesia.ai/keys and a microphone.

```sh
npx degit cartesia-ai/cookbook/examples/speaking-partner speaking-partner
cd speaking-partner
cp .env.example .env.local   # add CARTESIA_API_KEY, and LLM_MODEL plus its key for corrections
npm install
npm run dev
```

pnpm works too: `pnpm install`, `pnpm dev`.

Open http://localhost:3000, pick your languages and a mission, press Start speaking, and speak first. A session lasts 3 minutes. Use headphones: on speakers the microphone can pick up the partner's voice and it may interrupt itself. M mutes and Escape ends the session.

Without `LLM_MODEL` and a matching key everything works except the corrections panel, which says what to add. Without a Cartesia key the page shows setup help.

## Environment variables

| Name | Required | What it does |
| --- | --- | --- |
| `CARTESIA_API_KEY` | yes | Creates session agents and mints call tokens. Get one at https://play.cartesia.ai/keys |
| `LLM_MODEL` | for corrections | The corrections model as `provider/model`, for example `openai/gpt-5.4-mini` or `anthropic/claude-haiku-4-5` |
| `OPENAI_API_KEY` | if `LLM_MODEL` starts with `openai/` | https://platform.openai.com/api-keys |
| `ANTHROPIC_API_KEY` | if `LLM_MODEL` starts with `anthropic/` | https://console.anthropic.com |
| `AI_GATEWAY_API_KEY` | for any other provider | Routes the model through the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway). Not needed on a Vercel deployment |
| `AGENT_MODEL_ID` | no | The partner's LLM, from `GET /v1/agents/models`. Defaults to `claude-haiku-4.5` |
| `VOICE_ID_EN`, `VOICE_ID_ES`, `VOICE_ID_FR`, `VOICE_ID_HI`, `VOICE_ID_JA` | no | Pin a voice per language. Ids from https://play.cartesia.ai/voices |
| `CARTESIA_TOOL_ID_COMPLETE` | no | Id of an existing `complete_mission` tool. Otherwise the server finds or creates one |
| `APP_PASSWORD` | no | Optional locally. Required on Vercel (production and preview): a password for the whole app, or `none` to make it public. |
| `TRUST_PROXY` | no | Set to `1` behind your own reverse proxy so rate limits use the last `X-Forwarded-For` entry. Leave empty on Vercel. |

The model ids are examples. Providers retire models, so check the provider's model page before you pick one. On Vercel, a model with no matching direct key goes through the AI Gateway without `AI_GATEWAY_API_KEY`, because the deployment authenticates to it for you.

## How it works

Open these first:

- `lib/session-agent.ts` builds the agent body, picks a native Sonic voice and creates the agent with `POST /v1/agents`. It also lists, counts and deletes session agents.
- `components/session-view.tsx` runs the call through `useCartesiaAgent` from `lib/agents-web/`.
- `app/api/correct/route.ts` checks one line through the AI SDK.

1. `POST /api/session` takes your languages, mode and a mission id. The server writes them into the instructions of a new Managed Agent and returns the agent id. It refuses with 503 when 10 session agents are already live on the account.
2. `POST /api/token` mints a 60 second access token with only the `agent` grant. `CARTESIA_API_KEY` never leaves the server.
3. The browser opens the Managed Agents WebSocket. `useCartesiaAgent` handles the microphone, 16 kHz PCM, playback and barge-in.
4. After each of your turns, `POST /api/correct` sends that one line to your LLM with a schema (`hasIssue`, `corrected`, `explanation`, `category`) and the panel shows the result.
5. When the partner calls the `complete_mission` client tool, or you leave, the page shows a summary and `POST /api/session/end` deletes the agent.

Why one agent per session: a browser access token cannot send `dynamic_variables` (the service answers `dynamic_variables_not_allowed`), so the mission has to be in the agent's instructions before the call starts. The recipe weighs the alternatives.

```tsx
const agent = useCartesiaAgent({
  agentId,
  getToken: fetchToken,
  tools: {
    [COMPLETE_TOOL_NAME]: (params) => {
      if (completion.current) return;
      completion.current = parseCompletion(params);
      setCompleted(true);
    },
  },
});
```

The Managed Agent runs Ink 2 (`ink-2`) for your speech and Sonic 3.6 (`sonic-3.6`) for the partner's voice. Cartesia picks both, so the agent config sets only a language, a voice id and the LLM. The server sends `Cartesia-Version: 2026-08-14` (set by `@cartesia/cartesia-js`). The five languages, English, Spanish, French, Hindi and Japanese, are the ones Ink 2 transcribes, so both pickers are limited to them.

## Change it

- Pick the partner's voice: set `VOICE_ID_ES` and the others. Without them the server lists voices and takes the first native speaker with a friendly description, which is stable but arbitrary.
- Add a role play: add an entry to `data/missions.json`. Routes take the mission id, so the browser never sends free text into a prompt.
- Change the teaching style: edit `lib/prompts.ts`. Teacher mode nudges and explains in your language. Immersive mode stays in character and gives a Tiro, Proficiens or Peritus rating at the end.
- Use another corrections model: set `LLM_MODEL`, for example `anthropic/claude-haiku-4-5`. A direct key for the prefix wins; any other prefix goes through the AI Gateway.
- Allow more parallel sessions: change `MAX_LIVE_SESSIONS` in `lib/session-agent.ts`.

## Before you deploy

Set `APP_PASSWORD`. On Vercel (production and preview) the app answers 503 until you set it to a password or to `none`. On hosts other than Vercel, set `APP_PASSWORD` yourself, because the gate only enforces it on Vercel. `/api/session` creates agents on your account, and a token carries the `agent` grant for your whole account, not one agent.

Each route has an in-memory limit per address: 10 sessions, 10 tokens, 10 corrections and 20 session ends a minute. The limiter is per process, resets on restart and is not shared across instances, so it only slows casual abuse. The password is the real guard. On Vercel the limiter keys on the client IP. On other hosts every caller shares one bucket, unless the app runs behind a proxy that appends the client IP to `x-forwarded-for` and you set `TRUST_PROXY=1`. On top of that, `/api/session` refuses new sessions while 10 session agents are live or the same address already has 2 open, and each session ends after 3 minutes.

Closing the tab sends a `keepalive` request that deletes the agent. Each new session also deletes `speaking-partner-session-` agents older than 30 minutes, so a crashed tab or server leaves one behind only until the next session starts.

Agent minutes and the agent's LLM are billed to your Cartesia account. Each line you say also makes one small call to the corrections model. See https://docs.cartesia.ai/pricing.

## FAQ

### Why does my own line appear only after I stop talking?

The Managed Agents WebSocket sends your words in `turn_ended`, once per turn. The partner's words stream in as it speaks. The corrections panel updates at the same moment your line appears.

### Can I practice a language other than these five?

Not with a Managed Agent, because Ink 2 transcribes only English, Spanish, French, Hindi and Japanese. For other languages, build your own pipeline with `ink-whisper` for speech to text, your LLM and Sonic.

### How does the browser connect without my API key?

It gets a short-lived access token from `app/api/token/route.ts`. See [Browser auth with access tokens](../../content/cookbook/00-guides/01-browser-auth-with-access-tokens.mdx).

## Tests

```sh
npm test
npm run typecheck
npm run build        # works with no environment variables set
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
