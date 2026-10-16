import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ text: "" }));

vi.mock("@/lib/llm", async () => {
  const { MockLanguageModelV4 } = await import("ai/test");
  class LlmConfigError extends Error {}
  return {
    LlmConfigError,
    getModel: () =>
      new MockLanguageModelV4({
        doGenerate: async () => ({
          finishReason: { unified: "stop", raw: "stop" },
          usage: {
            inputTokens: { total: 3, noCache: 3, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 10, text: 10, reasoning: undefined },
          },
          warnings: [],
          content: [{ type: "text", text: state.text }],
        }),
      }),
  };
});

import { POST } from "@/app/api/summarize/route";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/summarize", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/summarize", () => {
  it("returns decisions and action items", async () => {
    state.text = JSON.stringify({
      title: "Launch sync",
      summary: "The team agreed on a Friday launch.",
      decisions: ["Ship on Friday."],
      actionItems: [{ task: "Update the docs by Wednesday", owner: "Priya" }],
    });
    const res = await post({ transcript: "We decided to ship on Friday. Priya will update the docs." });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.decisions).toEqual(["Ship on Friday."]);
    expect(body.actionItems).toEqual([{ task: "Update the docs by Wednesday", owner: "Priya" }]);
  });

  it("returns 502 when the model output does not match the schema", async () => {
    state.text = JSON.stringify({ title: "x" });
    const res = await post({ transcript: "hello there" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("The model did not return valid notes");
  });

  it("returns 502 when the model output is not JSON", async () => {
    state.text = "not json";
    const res = await post({ transcript: "hello there" });
    expect(res.status).toBe(502);
  });

  it("rejects an empty transcript", async () => {
    expect((await post({ transcript: "   " })).status).toBe(400);
    expect((await post({})).status).toBe(400);
  });

  it("rejects an oversized transcript", async () => {
    const res = await post({ transcript: "a".repeat(120_001) });
    expect(res.status).toBe(413);
  });
});
