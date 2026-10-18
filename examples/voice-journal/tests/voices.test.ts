import { afterEach, describe, expect, it, vi } from "vitest";

const { GET } = await import("@/app/api/voices+api");

afterEach(() => vi.unstubAllEnvs());

describe("/api/voices", () => {
  it("answers 503 when the Cartesia key is not set", async () => {
    vi.stubEnv("CARTESIA_API_KEY", "");
    const res = await GET(new Request("http://x/api/voices"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "CARTESIA_API_KEY is not set. Add it to .env.local and restart." });
  });
});
