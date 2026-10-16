import { after } from "next/server";
import { z } from "zod";
import { createAgentsApi } from "../../../lib/agents-api";
import { clientKey, getApiKey } from "../../../lib/env";
import { LANGUAGE_CODES } from "../../../lib/languages";
import { MODES } from "../../../lib/modes";
import { createRateLimiter } from "../../../lib/rate-limit";
import { createSessionAgent, SessionAgentError, sweepStaleAgents } from "../../../lib/session-agent";

const headers = { "Cache-Control": "no-store" };
const allow = createRateLimiter(6, 60_000);

const Body = z
  .object({
    native: z.enum(LANGUAGE_CODES),
    target: z.enum(LANGUAGE_CODES),
    mode: z.enum(MODES),
    missionId: z.number().int(),
  })
  .refine((b) => b.native !== b.target, "native and target must differ");

export async function POST(req: Request): Promise<Response> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return Response.json({ error: "CARTESIA_API_KEY is not set. Add it to .env.local and restart." }, { status: 503, headers });
  }
  if (!allow(clientKey(req))) {
    return Response.json({ error: "Too many sessions from this network. Try again in a minute." }, { status: 429, headers });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400, headers });

  const api = createAgentsApi(apiKey);
  try {
    const agentId = await createSessionAgent(api, parsed.data);
    after(() => sweepStaleAgents(api).catch(() => undefined));
    return Response.json({ agentId }, { headers });
  } catch (err) {
    if (err instanceof SessionAgentError && (err.code === "no_voice" || err.code === "bad_mission")) {
      return Response.json({ error: err.message }, { status: 422, headers });
    }
    return Response.json({ error: "Could not create the session." }, { status: 502, headers });
  }
}
