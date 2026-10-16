import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTokenRoute } from "../lib/token-handler";
import { createRateLimiter } from "../lib/rate-limit";

const FAKE_KEY = "test-key-not-real-0002";
let server: Server | undefined;
let seen: { url: string; auth?: string; body: unknown }[] = [];
const saved = { key: process.env.CARTESIA_API_KEY, base: process.env.CARTESIA_BASE_URL };

beforeEach(async () => {
  seen = [];
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      seen.push({ url: req.url!, auth: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString() || "null") });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ token: "tok_abc" }));
    });
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  process.env.CARTESIA_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((r) => server!.close(() => r()));
  for (const [k, v] of [["CARTESIA_API_KEY", saved.key], ["CARTESIA_BASE_URL", saved.base]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const req = (ip = "1.1.1.1") => new Request("http://localhost/api/token", { method: "POST", headers: { "x-forwarded-for": ip } });

describe("token route", () => {
  it("mints a 60 second agent-only token and never returns the key", async () => {
    process.env.CARTESIA_API_KEY = FAKE_KEY;
    const res = await createTokenRoute()(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ token: "tok_abc" });
    expect(text).not.toContain(FAKE_KEY);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe("/access-token");
    expect(seen[0]!.body).toEqual({ grants: { agent: true }, expires_in: 60 });
    expect(seen[0]!.auth).toMatch(/^Bearer .+/);
  });

  it("answers 503 with a plain message when the key is missing", async () => {
    delete process.env.CARTESIA_API_KEY;
    const res = await createTokenRoute()(req());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: expect.stringContaining("CARTESIA_API_KEY") });
    expect(seen).toHaveLength(0);
  });

  it("answers 429 after the limit and does not call Cartesia", async () => {
    process.env.CARTESIA_API_KEY = FAKE_KEY;
    const route = createTokenRoute(createRateLimiter(2, 60_000));
    expect((await route(req())).status).toBe(200);
    expect((await route(req())).status).toBe(200);
    const blocked = await route(req());
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("cache-control")).toBe("no-store");
    expect(seen).toHaveLength(2);
    expect((await route(req("2.2.2.2"))).status).toBe(200);
  });
});
