import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OptionsSchema } from "@/lib/config";
import type { ScriptLine } from "@/lib/types";

const generate = vi.fn();
vi.mock("@cartesia/cartesia-js", async (importActual) => ({
  ...(await importActual<typeof import("@cartesia/cartesia-js")>()),
  default: class {
    tts = { generate };
  },
}));

const { LINES_AT_ONCE, renderEpisode } = await import("@/lib/tts");

const o = OptionsSchema.parse({ outputLanguage: "Spanish" });

function lines(n: number): ScriptLine[] {
  return Array.from({ length: n }, (_, i) => ({ speaker: i % 2 ? "B" : "A", text: `Line ${i}.` }));
}

let inFlight = 0;
let maxInFlight = 0;
function respond(delay: (i: number) => number = () => 1) {
  generate.mockImplementation(async (body: { transcript: string }, options?: { signal?: AbortSignal }) => {
    const index = Number(body.transcript.match(/\d+/)![0]);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, delay(index)));
    inFlight--;
    if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return new Response(new Uint8Array((index + 1) * 2400).fill(index));
  });
}

beforeEach(() => {
  vi.stubEnv("CARTESIA_API_KEY", "test-key");
  vi.stubEnv("CARTESIA_VOICE_HOST_A", "voice-a");
  vi.stubEnv("CARTESIA_VOICE_HOST_B", "voice-b");
  inFlight = 0;
  maxInFlight = 0;
});
afterEach(() => {
  vi.unstubAllEnvs();
  generate.mockReset();
});

describe("renderEpisode", () => {
  it("sends the model, voice per speaker, language and raw pcm format", async () => {
    respond();
    await renderEpisode(lines(2), o);
    const [a, b] = generate.mock.calls.map((c) => c[0]);
    expect(a).toMatchObject({ model_id: "sonic-3.6", voice: { mode: "id", id: "voice-a" }, language: "es", transcript: "Line 0." });
    expect(b).toMatchObject({ voice: { mode: "id", id: "voice-b" } });
    expect(a.output_format).toEqual({ container: "raw", encoding: "pcm_s16le", sample_rate: 24000 });
  });

  it("keeps order when requests finish out of order", async () => {
    respond((i) => (i === 0 ? 30 : 1));
    const { wav, starts } = await renderEpisode(lines(3), o);
    expect(wav[44]).toBe(0);
    expect(wav[44 + 2400 + 16800]).toBe(1);
    expect(starts[1]).toBeGreaterThan(starts[0]);
    expect(starts[2]).toBeGreaterThan(starts[1]);
  });

  it("never sends more than a few lines at once", async () => {
    respond();
    await renderEpisode(lines(14), o);
    expect(maxInFlight).toBe(LINES_AT_ONCE);
    expect(generate).toHaveBeenCalledTimes(14);
  });

  it("stops after an abort", async () => {
    const ctrl = new AbortController();
    respond(() => 10);
    setTimeout(() => ctrl.abort(), 5);
    await expect(renderEpisode(lines(40), o, ctrl.signal)).rejects.toThrow();
    expect(generate.mock.calls.length).toBeLessThan(40);
  });

  it("uses a longer gap on a speaker change than within a speaker", async () => {
    respond();
    const { starts } = await renderEpisode(
      [
        { speaker: "A", text: "Line 0." },
        { speaker: "A", text: "Line 0." },
        { speaker: "B", text: "Line 0." },
      ],
      o,
    );
    const len = 2400 / 2 / 24000;
    expect(starts[1] - starts[0] - len).toBeCloseTo(0.18, 3);
    expect(starts[2] - starts[1] - len).toBeCloseTo(0.35, 3);
  });
});
