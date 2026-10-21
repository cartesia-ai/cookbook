import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const transcribe = vi.fn();
const generate = vi.fn();
vi.mock("@/lib/server/cartesia", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/cartesia")>("@/lib/server/cartesia");
  return { ...actual, getCartesia: () => ({ stt: { transcribe }, tts: { generate } }) };
});

const generateText = vi.fn();
vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return { ...actual, generateText: (...a: unknown[]) => generateText(...a) };
});
vi.mock("@/lib/server/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/llm")>("@/lib/server/llm");
  return { ...actual, getModel: () => "openai/test" };
});

const { POST: transcribeRoute } = await import("@/app/api/transcribe+api");
const { POST: analyzeRoute } = await import("@/app/api/analyze+api");
const { POST: recapRoute } = await import("@/app/api/recap+api");
const { POST: speakRoute } = await import("@/app/api/speak+api");

const post = (body: unknown) => new Request("http://x/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe("/api/transcribe", () => {
  it("sends the file to ink-whisper and trims the text", async () => {
    transcribe.mockResolvedValue({ text: "  hello there ", duration: 2.5 });
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(100)], { type: "audio/webm" }), "entry.webm");
    const res = await transcribeRoute(new Request("http://x/api/transcribe", { method: "POST", body: form }));
    expect(await res.json()).toEqual({ text: "hello there", duration: 2.5 });
    expect(transcribe.mock.calls[0][0]).toMatchObject({ model: "ink-whisper", language: "en" });
  });

  it("rejects a missing file", async () => {
    const res = await transcribeRoute(new Request("http://x/api/transcribe", { method: "POST", body: new FormData() }));
    expect(res.status).toBe(400);
  });
});

describe("/api/analyze", () => {
  it("returns title, mood and reflection", async () => {
    generateText.mockResolvedValue({ output: { title: "A good day.", mood: "joyful", reflection: "You had fun." } });
    const res = await analyzeRoute(post({ transcript: "I had fun today" }));
    expect(await res.json()).toEqual({ title: "A good day", mood: "joyful", reflection: "You had fun." });
  });

  it("rejects an empty transcript without calling the model", async () => {
    const res = await analyzeRoute(post({ transcript: " " }));
    expect(res.status).toBe(400);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("strips wrapping quotes and trailing periods from the title", async () => {
    generateText.mockResolvedValue({ output: { title: " “Quiet morning.” ", mood: "calm", reflection: "r" } });
    expect((await (await analyzeRoute(post({ transcript: "x" }))).json()).title).toBe("Quiet morning");
    generateText.mockResolvedValue({ output: { title: "'\"...\"'", mood: "calm", reflection: "r" } });
    expect((await (await analyzeRoute(post({ transcript: "x" }))).json()).title).toBe("Untitled entry");
  });

  it("hides provider error details", async () => {
    generateText.mockRejectedValue(new Error("secret upstream body"));
    const res = await analyzeRoute(post({ transcript: "x" }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });
});

describe("/api/recap", () => {
  it("validates entries and passes them in order", async () => {
    generateText.mockResolvedValue({ output: { title: "Week", text: "You did well." } });
    const entries = [
      { day: "Monday, October 12", title: "One", mood: "calm", transcript: "first" },
      { day: "Tuesday, October 13", title: "Two", mood: "tired", transcript: "second" },
    ];
    const res = await recapRoute(post({ entries }));
    expect(await res.json()).toEqual({ title: "Week", text: "You did well." });
    const prompt = generateText.mock.calls[0][0].prompt as string;
    expect(prompt.indexOf("first")).toBeLessThan(prompt.indexOf("second"));
  });

  it("rejects an empty week and unknown moods", async () => {
    const empty = await recapRoute(post({ entries: [] }));
    expect(empty.status).toBe(400);
    expect((await empty.json()).error).toBe("Send between 1 and 30 entries");
    const bad = await recapRoute(post({ entries: [{ day: "d", title: "t", mood: "elated", transcript: "x" }] }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("The entries are not valid.");
  });
});

describe("/api/speak", () => {
  it("asks for sonic-3.6 MP3 and returns audio", async () => {
    generate.mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    const res = await speakRoute(post({ text: "Hello", voiceId: "6ccbfb76-1fc6-48f7-b71d-91ac6298247b" }));
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(generate.mock.calls[0][0]).toMatchObject({ model_id: "sonic-3.6", output_format: { container: "mp3" } });
  });

  it("rejects a bad voice id", async () => {
    expect((await speakRoute(post({ text: "Hello", voiceId: "../x" }))).status).toBe(400);
  });
});

describe("limits", () => {
  it("rejects audio over the 4 MB hosted body limit", async () => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], { type: "audio/webm" }), "entry.webm");
    const res = await transcribeRoute(new Request("http://x/api/transcribe", { method: "POST", body: form }));
    expect(res.status).toBe(413);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("refuses a declared oversize upload before reading the form", async () => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(10)], { type: "audio/webm" }), "entry.webm");
    const req = new Request("http://x/api/transcribe", { method: "POST", body: form });
    req.headers.set("content-length", String(4 * 1024 * 1024 + 64 * 1024 + 1));
    const formData = vi.spyOn(req, "formData");
    expect((await transcribeRoute(req)).status).toBe(413);
    expect(formData).not.toHaveBeenCalled();
  });

  it("caps analyze and recap JSON bodies at 64 KB, with or without Content-Length", async () => {
    const declared = new Request("http://x/api/analyze", { method: "POST", body: JSON.stringify({ transcript: "hi" }) });
    declared.headers.set("content-length", String(70 * 1024));
    expect((await analyzeRoute(declared)).status).toBe(413);
    const bytes = new TextEncoder().encode(JSON.stringify({ entries: [{ day: "d", title: "t", mood: "calm", transcript: "y".repeat(70 * 1024) }] }));
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 8192) c.enqueue(bytes.slice(i, i + 8192));
        c.close();
      },
    });
    const chunked = new Request("http://x/api/recap", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    expect(chunked.headers.get("content-length")).toBeNull();
    const res = await recapRoute(chunked);
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe("This week has too much text to recap in one pass");
    expect(generateText).not.toHaveBeenCalled();
  });

  it("rate limits each client before calling the model", async () => {
    vi.stubEnv("TRUST_PROXY", "1");
    const from = (ip: string) =>
      new Request("http://x/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ transcript: " " }),
      });
    for (let i = 0; i < 10; i++) expect((await analyzeRoute(from("9.9.9.9"))).status).toBe(400);
    const res = await analyzeRoute(from("9.9.9.9"));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("Too many requests. Try again in a minute.");
    expect((await analyzeRoute(from("9.9.9.8"))).status).toBe(400);
    expect(generateText).not.toHaveBeenCalled();
  });
});

describe("missing configuration", () => {
  it("answers 503 when the Cartesia key or the LLM is not set", async () => {
    const { cartesiaError, llmError } = await import("@/lib/server/errors");
    const { MissingKeyError } = await import("@/lib/server/cartesia");
    const { LlmConfigError } = await import("@/lib/server/llm");
    const key = cartesiaError(new MissingKeyError(), "Transcription");
    expect(key.status).toBe(503);
    expect(await key.json()).toEqual({ error: "CARTESIA_API_KEY is not set. Add it to .env.local and restart." });
    expect(llmError(new LlmConfigError("LLM_MODEL is not set."), false).status).toBe(503);
  });
});
