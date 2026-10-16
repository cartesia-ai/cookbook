import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp, createRateLimiter } from "../lib/rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit, then blocks, then recovers after the window", () => {
    let t = 0;
    const allow = createRateLimiter(3, 1000, () => t);
    expect([allow("a"), allow("a"), allow("a"), allow("a")]).toEqual([true, true, true, false]);
    expect(allow("b")).toBe(true);
    t = 999;
    expect(allow("a")).toBe(false);
    t = 1000;
    expect(allow("a")).toBe(true);
  });
});

describe("clientIp", () => {
  const req = (xff?: string) => new Request("http://localhost/", { headers: xff ? { "x-forwarded-for": xff } : {} });

  afterEach(() => vi.unstubAllEnvs());

  it("ignores x-forwarded-for unless the host is trusted", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("TRUST_PROXY", "");
    expect(clientIp(req("1.1.1.1, 2.2.2.2"))).toBe("global");
  });

  it("uses the first entry on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    expect(clientIp(req("1.1.1.1, 2.2.2.2"))).toBe("1.1.1.1");
  });

  it("uses the entry your proxy appended when TRUST_PROXY is 1", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("TRUST_PROXY", "1");
    expect(clientIp(req("6.6.6.6, 3.3.3.3"))).toBe("3.3.3.3");
    expect(clientIp(req())).toBe("global");
  });
});
