import { after } from "next/server";
import { z } from "zod";
import { createAgentsApi } from "../../../lib/agents-api";
import { getApiKey } from "../../../lib/env";
import { LANGUAGE_CODES } from "../../../lib/languages";
import { MODES } from "../../../lib/modes";
import { clientIp, createRateLimiter, tooManyRequests } from "../../../lib/rate-limit";
import {
  countClientSessions,
  countLiveSessions,
  createSessionAgent,
  listSessionAgents,
  MAX_LIVE_SESSIONS,
  MAX_SESSIONS_PER_CLIENT,
  rememberClientSession,
  SessionAgentError,
  sweepStaleAgents,
} from "../../../lib/session-agent";

const headers = { "Cache-Control": "no-store" };
const allow = createRateLimiter(10, 60_000);

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
  const client = clientIp(req);
  if (!allow(client)) return tooManyRequests(headers);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400, headers });

  const api = createAgentsApi(apiKey);
  try {
    const existing = await listSessionAgents(api);
    after(() => sweepStaleAgents(api, existing).catch(() => undefined));
    if (countLiveSessions(existing) >= MAX_LIVE_SESSIONS) {
      return Response.json({ error: "Too many practice sessions are running right now. Try again in a few minutes." }, { status: 503, headers });
    }
    if (countClientSessions(client, existing) >= MAX_SESSIONS_PER_CLIENT) {
      return Response.json({ error: `You already have ${MAX_SESSIONS_PER_CLIENT} practice sessions open. End one and try again.` }, { status: 503, headers });
    }
    const agentId = await createSessionAgent(api, parsed.data);
    rememberClientSession(client, agentId);
    return Response.json({ agentId }, { headers });
  } catch (err) {
    if (err instanceof SessionAgentError && (err.code === "no_voice" || err.code === "bad_mission")) {
      return Response.json({ error: err.message }, { status: 422, headers });
    }
    return Response.json({ error: "Could not create the session." }, { status: 502, headers });
  }
}
