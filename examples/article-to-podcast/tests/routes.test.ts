import { writeFileSync } from "node:fs";
import { APIError } from "@cartesia/cartesia-js";
import { APICallError } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigError } from "@/lib/env";
import { UnreadablePageError } from "@/lib/extract";
import { FetchBlockedError } from "@/lib/safe-fetch";
import { concatPcm, toWav } from "@/lib/wav";

const generateScript = vi.fn();
const fetchArticle = vi.fn();
const renderEpisode = vi.fn();

vi.mock("@/lib/script", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/script")>()),
  generateScript: (...args: unknown[]) => generateScript(...args),
}));
vi.mock("@/lib/extract", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/extract")>()),
  fetchArticle: (...args: unknown[]) => fetchArticle(...args),
}));
vi.mock("@/lib/tts", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/tts")>()),
  renderEpisode: (...args: unknown[]) => renderEpisode(...args),
}));

const { POST: postScript } = await import("@/app/api/script/route");
const { POST: postAudio } = await import("@/app/api/audio/route");

const SENTINEL = "sk-test-sentinel";
let ip = 0;
const json = (body: unknown, from = `10.0.0.${++ip}`) =>
  new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": from },
    body: JSON.stringify(body),
  });

const script = {
  title: "Tides",
  lines: [
    { speaker: "A", text: "Welcome to the show." },
    { speaker: "B", text: "Glad to be here." },
    { speaker: "A", text: "Today is about tides." },
    { speaker: "B", text: "Tell me more." },
  ],
};

const savedEnv = { ...process.env };
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = SENTINEL;
  process.env.LLM_MODEL = "anthropic/claude-x";
  delete process.env.AI_GATEWAY_API_KEY;
  delete process.env.VERCEL;
  process.env.CARTESIA_API_KEY = SENTINEL;
  process.env.TRUST_PROXY = "1";
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...savedEnv };
  vi.clearAllMocks();
});

describe("POST /api/script", () => {
  it("400 on a bad body", async () => {
    expect((await postScript(json({}))).status).toBe(400);
    expect((await postScript(json({ url: "https://a.example", text: "both" }))).status).toBe(400);
    expect((await postScript(new Request("http://localhost/api", { method: "POST", body: "not json" }))).status).toBe(400);
    expect((await postScript(json({ text: "x".repeat(200), options: { creativity: 9 } }))).status).toBe(400);
  });

  it("returns the script for pasted text", async () => {
    generateScript.mockResolvedValue(script);
    const res = await postScript(json({ text: "A paragraph about tides. ".repeat(10) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.script.lines).toHaveLength(4);
    expect(body.truncated).toBe(false);
  });

  it("422 for an unreadable page", async () => {
    fetchArticle.mockRejectedValue(new UnreadablePageError());
    const res = await postScript(json({ url: "https://example.com/app" }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/Paste the text/);
  });

  it("400 for a blocked address", async () => {
    fetchArticle.mockRejectedValue(new FetchBlockedError("That address is not allowed."));
    expect((await postScript(json({ url: "http://127.0.0.1/" }))).status).toBe(400);
  });

  it("names the missing variables and no values when no LLM key is set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await postScript(json({ text: "A paragraph about tides. ".repeat(10) }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("does not leak secrets from SDK errors", async () => {
    generateScript.mockRejectedValue(new Error(`boom ${SENTINEL}`));
    const plain = await postScript(json({ text: "A paragraph about tides. ".repeat(10) }));
    expect(await plain.text()).not.toContain(SENTINEL);

    generateScript.mockRejectedValue(
      new APICallError({
        message: `bad key ${SENTINEL}`,
        url: "https://api.example/v1",
        requestBodyValues: {},
        statusCode: 401,
        responseHeaders: { authorization: SENTINEL },
        responseBody: `{"key":"${SENTINEL}"}`,
      }),
    );
    const api = await postScript(json({ text: "A paragraph about tides. ".repeat(10) }));
    const text = await api.text();
    expect(api.status).toBe(502);
    expect(text).toContain("401");
    expect(text).not.toContain(SENTINEL);
  });
});

describe("POST /api/audio", () => {
  function fakeRender(lines: { text: string }[]) {
    const parts = lines.map((l) => new Uint8Array(l.text.length * 1200).fill(3));
    const { pcm, starts, duration } = concatPcm(parts, lines.map(() => 0));
    return { wav: toWav(pcm), starts, duration };
  }

  it("400 on a bad body", async () => {
    expect((await postAudio(json({}))).status).toBe(400);
    expect((await postAudio(json({ script: { title: "x", lines: [{ speaker: "C", text: "hi" }] } }))).status).toBe(400);
  });

  it("400 when the transcript is too long", async () => {
    const lines = Array.from({ length: 100 }, (_, i) => ({ speaker: i % 2 ? "B" : "A", text: "x".repeat(400) }));
    expect((await postAudio(json({ script: { title: "x", lines } }))).status).toBe(400);
  });

  it("returns a WAV with length and line start headers", async () => {
    renderEpisode.mockImplementation(fakeRender);
    const res = await postAudio(json({ script }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/wav");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Number(res.headers.get("Content-Length"))).toBe(bytes.byteLength);
    const starts = JSON.parse(res.headers.get("X-Line-Starts")!);
    expect(starts).toHaveLength(script.lines.length);
    expect(starts[0]).toBe(0);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe("RIFF");
    if (process.env.WAV_OUT) writeFileSync(process.env.WAV_OUT, bytes);
  });

  it("does not leak secrets from SDK errors", async () => {
    renderEpisode.mockRejectedValue(new APIError(401, undefined, `bad key ${SENTINEL}`, new Headers()));
    const res = await postAudio(json({ script }));
    const text = await res.text();
    expect(res.status).toBe(502);
    expect(text).toMatch(/Check CARTESIA_API_KEY/);
    expect(text).not.toContain(SENTINEL);
  });

  it("reports other Cartesia failures by status", async () => {
    renderEpisode.mockRejectedValue(new APIError(500, undefined, `upstream ${SENTINEL}`, new Headers()));
    const text = await (await postAudio(json({ script }))).text();
    expect(text).toMatch(/Cartesia request failed \(HTTP 500\)/);
    expect(text).not.toContain(SENTINEL);
  });

  it("names CARTESIA_API_KEY when it is missing", async () => {
    renderEpisode.mockRejectedValue(new ConfigError("CARTESIA_API_KEY is not set. Add it to .env.local and restart."));
    const res = await postAudio(json({ script }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/CARTESIA_API_KEY/);
  });
});

describe("rate limits", () => {
  it("returns 429 after too many requests from one address", async () => {
    const statuses: number[] = [];
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      last = await postAudio(json({}, "10.9.9.9"));
      statuses.push(last.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 400)).toBe(true);
    expect(statuses[5]).toBe(429);
    expect(await last?.json()).toEqual({ error: "Too many requests. Try again in a minute." });
  });
});
