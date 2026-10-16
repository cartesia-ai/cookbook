import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  posts: [] as [string, unknown][],
  deletes: [] as string[],
  agentName: "speaking-partner-session-fr-x",
  agents: [] as { id: string; name: string; created_at: string }[],
  nextId: 0,
  tokenStatus: 200,
}));

vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock("@/lib/agents-web/server", () => ({
  createAgentTokenHandler: () => async () =>
    state.tokenStatus === 200 ? Response.json({ token: "tok_test" }) : Response.json({ error: "upstream" }, { status: state.tokenStatus }),
}));
vi.mock("../lib/agents-api", async (orig) => ({
  ...(await orig<typeof import("../lib/agents-api")>()),
  createAgentsApi: () => ({
    get: async (path: string) => (path.endsWith("/tools") ? { data: [] } : path === "/v1/agents" ? { summaries: state.agents } : { name: state.agentName }),
    post: async (path: string, body: unknown) => {
      state.posts.push([path, body]);
      if (path.endsWith("/tools")) return { id: "agent_tool_x" };
      const id = `agent_session${String(++state.nextId).padStart(5, "0")}`;
      state.agents.push({ id, name: `speaking-partner-session-fr-${id}`, created_at: new Date().toISOString() });
      return { id };
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
  state.agents = [];
  state.nextId = 0;
  state.tokenStatus = 200;
  process.env.CARTESIA_API_KEY = "test-key-not-real";
  process.env.TRUST_PROXY = "1";
  vi.resetModules();
});

afterEach(() => {
  delete process.env.TRUST_PROXY;
});

async function sessionRoute() {
  return (await import("../app/api/session/route")).POST;
}

describe("POST /api/session", () => {
  it("creates an agent and returns only its id", async () => {
    const res = await (await sessionRoute())(post("/api/session", good));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ agentId: "agent_session00001" });
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

  it("limits each address to 10 session requests a minute", async () => {
    const route = await sessionRoute();
    for (let i = 0; i < 10; i++) {
      expect((await route(post("/api/session", good, "5.5.5.5"))).status).not.toBe(429);
      state.agents.length = 0;
    }
    const res = await route(post("/api/session", good, "5.5.5.5"));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Too many requests. Try again in a minute." });
    expect((await route(post("/api/session", good, "6.6.6.6"))).status).toBe(200);
  });

  it("allows two live sessions per address and frees a slot when one ends", async () => {
    const route = await sessionRoute();
    const end = (await import("../app/api/session/end/route")).POST;
    const first = await (await route(post("/api/session", good, "4.4.4.4"))).json();
    expect((await route(post("/api/session", good, "4.4.4.4"))).status).toBe(200);
    const third = await route(post("/api/session", good, "4.4.4.4"));
    expect(third.status).toBe(503);
    expect((await third.json()).error).toBe("You already have 2 practice sessions open. End one and try again.");
    expect((await route(post("/api/session", good, "8.8.8.8"))).status).toBe(200);
    expect((await end(post("/api/session/end", { agentId: first.agentId }, "4.4.4.4"))).status).toBe(200);
    expect((await route(post("/api/session", good, "4.4.4.4"))).status).toBe(200);
  });

  it("refuses a new session when 10 live session agents already exist", async () => {
    const now = new Date().toISOString();
    state.agents = Array.from({ length: 10 }, (_, i) => ({ id: `agent_live${i}`, name: `speaking-partner-session-fr-${i}`, created_at: now }));
    const res = await (await sessionRoute())(post("/api/session", good));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("Too many practice sessions are running right now. Try again in a few minutes.");
    expect(state.posts.some(([p]) => p === "/v1/agents")).toBe(false);
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

  it("limits each address to 20 calls a minute", async () => {
    const route = await end();
    for (let i = 0; i < 20; i++) await route(post("/api/session/end", { agentId: "agent_abcdefghij1234" }, "7.7.7.7"));
    const res = await route(post("/api/session/end", { agentId: "agent_abcdefghij1234" }, "7.7.7.7"));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Too many requests. Try again in a minute." });
  });
});

describe("POST /api/token", () => {
  it("returns a token, 503 without a key, and 429 past the limit", async () => {
    const route = (await import("../app/api/token/route")).POST;
    expect(await (await route(post("/api/token", {}, "2.2.2.2"))).json()).toEqual({ token: "tok_test" });
    for (let i = 0; i < 9; i++) await route(post("/api/token", {}, "2.2.2.2"));
    const blocked = await route(post("/api/token", {}, "2.2.2.2"));
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "Too many requests. Try again in a minute." });
    delete process.env.CARTESIA_API_KEY;
    expect((await route(post("/api/token", {}, "3.3.3.3"))).status).toBe(503);
  });

  it("maps an upstream 401 to a fixed 502, not a rate limit", async () => {
    const route = (await import("../app/api/token/route")).POST;
    state.tokenStatus = 401;
    const res = await route(post("/api/token", {}, "2.2.2.2"));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Could not get a Cartesia token. Check the API key." });
  });
});
