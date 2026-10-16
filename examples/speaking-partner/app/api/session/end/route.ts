import { z } from "zod";
import { createAgentsApi } from "../../../../lib/agents-api";
import { getApiKey } from "../../../../lib/env";
import { clientIp, createRateLimiter, tooManyRequests } from "../../../../lib/rate-limit";
import { deleteSessionAgent, forgetSession, SessionAgentError } from "../../../../lib/session-agent";

const headers = { "Cache-Control": "no-store" };
const allow = createRateLimiter(20, 60_000);
const Body = z.object({ agentId: z.string().max(80) });

export async function POST(req: Request): Promise<Response> {
  const apiKey = getApiKey();
  if (!apiKey) return Response.json({ error: "CARTESIA_API_KEY is not set." }, { status: 503, headers });
  if (!allow(clientIp(req))) return tooManyRequests(headers);
  const parsed = Body.safeParse(await req.text().then((t) => JSON.parse(t)).catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400, headers });
  try {
    const result = await deleteSessionAgent(createAgentsApi(apiKey), parsed.data.agentId);
    forgetSession(parsed.data.agentId);
    return Response.json({ result }, { headers });
  } catch (err) {
    if (err instanceof SessionAgentError) {
      return Response.json({ error: err.message }, { status: err.code === "not_ours" ? 403 : 400, headers });
    }
    return Response.json({ error: "Could not end the session." }, { status: 502, headers });
  }
}
