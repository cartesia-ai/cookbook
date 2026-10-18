import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("GET /api/health", () => {
  it("reports which keys are missing and never their values", async () => {
    for (const k of ["CARTESIA_API_KEY", "LLM_MODEL", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "AI_GATEWAY_API_KEY", "VERCEL"]) {
      delete process.env[k];
    }
    expect(await GET().json()).toEqual({ cartesia: false, llm: false });

    process.env.CARTESIA_API_KEY = "sk-test-sentinel";
    process.env.LLM_MODEL = "openai/gpt-x";
    process.env.OPENAI_API_KEY = "sk-test-sentinel";
    const res = GET();
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ cartesia: true, llm: true });
    expect(text).not.toContain("sentinel");
  });
});
