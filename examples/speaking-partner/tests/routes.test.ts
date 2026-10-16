import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  posts: [] as [string, unknown][],
  deletes: [] as string[],
  agentName: "speaking-partner-session-fr-x",
}));

vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock("@/lib/agents-web/server", () => ({
  createAgentTokenHandler: (o: { authorize: (r: Request) => boolean }) => async (req: Request) =>
    o.authorize(req) ? Response.json({ token: "tok_test" }) : Response.json({ error: "unauthorized" }, { status: 401 }),
}));
vi.mock("../lib/agents-api", async (orig) => ({
  ...(await orig<typeof import("../lib/agents-api")>()),
  createAgentsApi: () => ({
    get: async (path: string) => (path.endsWith("/tools") ? { data: [] } : path === "/v1/agents" ? { data: [] } : { name: state.agentName }),
    post: async (path: string, body: unknown) => {
      state.posts.push([path, body]);
      return { id: path.endsWith("/tools") ? "agent_tool_x" : "agent_session12345" };
    },
    delete: async (path: string) => void state.deletes.push(path),
    voices: async function* () {
      yield { id: "v-fr", name: "Zoé", accents: [{ locale: "fr-FR", is_native: true }] };
      yield { id: "v-en", name: "Ann", accents: [{ locale: "en-US", is_native: true }] };
    },
  }),
}));

const post = (url: string, body: unknown, ip = "9.9.9.9", raw = false) =>
  new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body: raw ? (body as string) : JSON.stringify(body),
  });

const good = { native: "en", target: "fr", mode: "teacher", missionId: 5 };

beforeEach(() => {
  state.posts.length = 0;
  state.deletes.length = 0;
  state.agentName = "speaking-partner-session-fr-x";
  process.env.CARTESIA_API_KEY = "test-key-not-real";
  vi.resetModules();
});

async function sessionRoute() {
  return (await import("../app/api/session/route")).POST;
}

describe("POST /api/session", () => {
  it("creates an agent and returns only its id", async () => {
    const res = await (await sessionRoute())(post("/api/session", good));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ agentId: "agent_session12345" });
    expect(text).not.toContain("test-key-not-real");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(state.posts.some(([p]) => p === "/v1/agents")).toBe(true);
  });

  it("answers 503 with a plain message when the key is missing", async () => {
    delete process.env.CARTESIA_API_KEY;
    const res = await (await sessionRoute())(post("/api/session", good));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("CARTESIA_API_KEY");
    expect(state.posts).toHaveLength(0);
  });

  it.each([
    ["same language", { ...good, native: "fr" }],
    ["a language outside the Ink-2 five", { ...good, target: "de" }],
    ["a mode that does not exist", { ...good, mode: "hard" }],
    ["a string mission id", { ...good, missionId: "5" }],
    ["no body", null],
  ])("answers 400 for %s", async (_name, body) => {
    const res = await (await sessionRoute())(post("/api/session", body));
    expect(res.status).toBe(400);
    expect(state.posts).toHaveLength(0);
  });

  it("answers 422 for an unknown mission", async () => {
    const res = await (await sessionRoute())(post("/api/session", { ...good, missionId: 999 }));
    expect(res.status).toBe(422);
  });

  it("limits each address to 6 sessions a minute", async () => {
    const route = await sessionRoute();
    for (let i = 0; i < 6; i++) expect((await route(post("/api/session", good, "5.5.5.5"))).status).toBe(200);
    expect((await route(post("/api/session", good, "5.5.5.5"))).status).toBe(429);
    expect((await route(post("/api/session", good, "6.6.6.6"))).status).toBe(200);
  });
});

describe("POST /api/session/end", () => {
  const end = async () => (await import("../app/api/session/end/route")).POST;

  it("deletes a session agent, including from a sendBeacon text/plain body", async () => {
    const res = await (await end())(post("/api/session/end", JSON.stringify({ agentId: "agent_abcdefghij1234" }), "1.1.1.1", true));
    expect(res.status).toBe(200);
    expect(state.deletes).toEqual(["/v1/agents/agent_abcdefghij1234"]);
  });

  it("answers 403 for an agent that is not ours and deletes nothing", async () => {
    state.agentName = "Customer support";
    const res = await (await end())(post("/api/session/end", { agentId: "agent_abcdefghij1234" }));
    expect(res.status).toBe(403);
    expect(state.deletes).toHaveLength(0);
  });

  it("answers 400 for a bad id or a bad body", async () => {
    expect((await (await end())(post("/api/session/end", { agentId: "../agents" }))).status).toBe(400);
    expect((await (await end())(post("/api/session/end", "not json", "1.1.1.1", true))).status).toBe(400);
  });
});

describe("POST /api/token", () => {
  it("returns a token, 503 without a key, and 429 past the limit", async () => {
    const route = (await import("../app/api/token/route")).POST;
    expect(await (await route(post("/api/token", {}, "2.2.2.2"))).json()).toEqual({ token: "tok_test" });
    for (let i = 0; i < 11; i++) await route(post("/api/token", {}, "2.2.2.2"));
    expect((await route(post("/api/token", {}, "2.2.2.2"))).status).toBe(429);
    delete process.env.CARTESIA_API_KEY;
    expect((await route(post("/api/token", {}, "3.3.3.3"))).status).toBe(503);
  });
});
