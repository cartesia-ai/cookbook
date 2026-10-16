import { afterEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "@/lib/rate-limit";
import { createTokenRoute } from "@/lib/token-route";

const req = (ip = "1.2.3.4") =>
  new Request("http://localhost/api/token", { method: "POST", headers: { "x-forwarded-for": ip } });

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/token", () => {
  it("returns 503 without a key and never calls Cartesia", async () => {
    vi.stubEnv("CARTESIA_API_KEY", "");
    const mint = vi.fn();
    const res = await createTokenRoute(undefined, mint)(req());
    expect(res.status).toBe(503);
    expect(mint).not.toHaveBeenCalled();
  });

  it("returns a token that is not cached", async () => {
    vi.stubEnv("CARTESIA_API_KEY", "sk_test");
    const res = await createTokenRoute(undefined, async () => "tok_123")(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ token: "tok_123" });
  });

  it("rate limits per client", async () => {
    vi.stubEnv("CARTESIA_API_KEY", "sk_test");
    const route = createTokenRoute(createRateLimiter(2, 60_000), async () => "t");
    expect((await route(req())).status).toBe(200);
    expect((await route(req())).status).toBe(200);
    expect((await route(req())).status).toBe(429);
    expect((await route(req("5.6.7.8"))).status).toBe(200);
  });

  it("hides the Cartesia error behind a fixed message", async () => {
    vi.stubEnv("CARTESIA_API_KEY", "sk_test");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await createTokenRoute(undefined, async () => {
      throw new Error("401 invalid key sk_test");
    })(req());
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("sk_test");
  });
});
