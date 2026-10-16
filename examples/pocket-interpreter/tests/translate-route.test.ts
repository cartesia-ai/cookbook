import { afterEach, describe, expect, it, vi } from "vitest";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { createRateLimiter } from "@/lib/rate-limit";
import { createTranslateRoute } from "@/lib/translate-route";

function streaming(parts: string[]) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "t" },
          ...parts.map((delta) => ({ type: "text-delta" as const, id: "t", delta })),
          { type: "text-end", id: "t" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: { total: 3, noCache: 3, cacheRead: undefined, cacheWrite: undefined },
              outputTokens: { total: 5, text: 5, reasoning: undefined },
            },
          },
        ],
      }),
    }),
  });
}

const post = (route: ReturnType<typeof createTranslateRoute>, body: unknown, ip = "1.2.3.4") =>
  route(
    new Request("http://localhost/api/translate", {
      method: "POST",
      headers: { "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
  );

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/translate", () => {
  it("streams the language line and the translation", async () => {
    const model = streaming(["es\n", "¿Dónde está ", "la estación?"]);
    const res = await post(createTranslateRoute(() => model), { text: "Where is the station?", pair: ["en", "es"] });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("es\n¿Dónde está la estación?");
    const call = model.doStreamCalls[0]!;
    expect(JSON.stringify(call.prompt)).toContain("Where is the station?");
    expect(JSON.stringify(call.prompt)).toContain("English (en) or Spanish (es)");
  });

  it("rejects the same language twice", async () => {
    const res = await post(createTranslateRoute(() => streaming([])), { text: "hi", pair: ["en", "en"] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Send one turn of text and two different languages.");
  });

  it("rejects languages Ink 2 does not stream", async () => {
    const res = await post(createTranslateRoute(() => streaming([])), { text: "hallo", pair: ["en", "de"] });
    expect(res.status).toBe(400);
  });

  it("rejects empty and oversized turns", async () => {
    const route = createTranslateRoute(() => streaming([]));
    expect((await post(route, { text: "   ", pair: ["en", "es"] })).status).toBe(400);
    expect((await post(route, { text: "a".repeat(2001), pair: ["en", "es"] })).status).toBe(400);
  });

  it("returns 503 with a fixed message when no model is configured", async () => {
    const route = createTranslateRoute(() => {
      throw new Error("LLM_MODEL is not set");
    });
    const res = await post(route, { text: "hola", pair: ["en", "es"] });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("Translation is not set up. Set LLM_MODEL and its key.");
  });

  it("rate limits each client before calling the model", async () => {
    vi.stubEnv("TRUST_PROXY", "1");
    const model = streaming(["es\n", "hola"]);
    const route = createTranslateRoute(() => model, createRateLimiter(1, 60_000));
    const ok = await post(route, { text: "hi", pair: ["en", "es"] });
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("es\nhola");
    const res = await post(route, { text: "hi", pair: ["en", "es"] });
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("Too many requests. Try again in a minute.");
    expect(model.doStreamCalls).toHaveLength(1);
    expect((await post(route, { text: "hi", pair: ["en", "es"] }, "5.6.7.8")).status).toBe(200);
  });
});
