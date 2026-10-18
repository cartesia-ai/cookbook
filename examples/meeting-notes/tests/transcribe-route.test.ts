import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const transcribe = vi.fn();

vi.mock("@cartesia/cartesia-js", () => {
  class APIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  class Cartesia {
    static APIError = APIError;
    stt = { transcribe };
  }
  return { default: Cartesia };
});

import Cartesia from "@cartesia/cartesia-js";
import { POST } from "@/app/api/transcribe/route";

const SECRET = "sk-test-secret-value";

beforeAll(() => vi.stubEnv("TRUST_PROXY", "1"));
afterAll(() => vi.unstubAllEnvs());

let ip = 0;
function request(fields: Record<string, string | File>, from = `10.0.0.${++ip}`) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new Request("http://localhost/api/transcribe", { method: "POST", body: form, headers: { "x-forwarded-for": from } });
}

const audio = (bytes = 10) => new File([new Uint8Array(bytes)], "a.webm", { type: "audio/webm" });

beforeEach(() => {
  transcribe.mockReset();
  transcribe.mockResolvedValue({ text: "hello", duration: 3.2, language: "en" });
  process.env.CARTESIA_API_KEY = SECRET;
});

describe("POST /api/transcribe", () => {
  it("calls ink-whisper with the language and returns the transcript", async () => {
    const res = await POST(request({ file: audio(), language: "es" }));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ transcript: "hello", duration: 3.2, language: "en" });
    expect(text).not.toContain(SECRET);
    expect(transcribe).toHaveBeenCalledWith(expect.objectContaining({ model: "ink-whisper", language: "es" }));
  });

  it("falls back to en for an unknown language", async () => {
    await POST(request({ file: audio(), language: "xx" }));
    expect(transcribe).toHaveBeenCalledWith(expect.objectContaining({ language: "en" }));
  });

  it("rejects a missing file", async () => {
    const res = await POST(request({ language: "en" }));
    expect(res.status).toBe(400);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("rejects an empty file", async () => {
    const res = await POST(request({ file: audio(0) }));
    expect(res.status).toBe(400);
  });

  it("rejects a file over 4 MB", async () => {
    const res = await POST(request({ file: audio(4 * 1024 * 1024 + 1) }));
    expect(res.status).toBe(413);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("returns 503 without leaking the key when CARTESIA_API_KEY is missing", async () => {
    delete process.env.CARTESIA_API_KEY;
    const res = await POST(request({ file: audio() }));
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body.error).toBe("CARTESIA_API_KEY is not set. Add it to .env.local and restart.");
  });

  it("maps an upstream API error to 502 with a fixed message", async () => {
    transcribe.mockRejectedValue(new (Cartesia.APIError as unknown as new (status: number, message: string) => Error)(429, "rate limited"));
    const res = await POST(request({ file: audio() }));
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("rate limited");
    expect(JSON.parse(text).error).toBe("Cartesia is rate limiting this account. Try again in a minute.");
  });

  it("maps other failures to a generic 500", async () => {
    transcribe.mockRejectedValue(new Error("boom"));
    const res = await POST(request({ file: audio() }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Transcription failed");
  });

  it("returns 429 after too many requests from one address", async () => {
    const statuses: number[] = [];
    let last: Response | undefined;
    for (let i = 0; i < 11; i++) {
      last = await POST(request({ file: audio() }, "10.9.9.9"));
      statuses.push(last.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
    expect(await last?.json()).toEqual({ error: "Too many requests. Try again in a minute." });
  });
});
