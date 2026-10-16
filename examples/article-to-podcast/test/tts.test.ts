import { describe, expect, it } from "vitest";
import { OptionsSchema } from "../lib/config";
import { CONCURRENCY, RenderError, renderEpisode, type TtsClient } from "../lib/tts";
import type { ScriptLine } from "../lib/types";

const voices = { A: "voice-a", B: "voice-b" };
const o = OptionsSchema.parse({ outputLanguage: "Spanish" });

function lines(n: number): ScriptLine[] {
  return Array.from({ length: n }, (_, i) => ({ speaker: i % 2 ? "B" : "A", text: `Line ${i}.` }));
}

function fakeClient(opts: { delay?: (i: number) => number; fail?: number; onCall?: (body: Record<string, unknown>) => void } = {}) {
  let inFlight = 0;
  let maxInFlight = 0;
  let calls = 0;
  const bodies: Record<string, unknown>[] = [];
  const client: TtsClient = {
    tts: {
      async generate(body, options) {
        const index = Number(String(body.transcript).match(/\d+/)![0]);
        calls++;
        bodies.push(body);
        opts.onCall?.(body);
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, opts.delay?.(index) ?? 1));
        inFlight--;
        if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        if (opts.fail === index) throw Object.assign(new Error("secret sk-test-sentinel"), { status: 429 });
        return new Response(new Uint8Array((index + 1) * 2400).fill(index));
      },
    },
  };
  return { client, stats: () => ({ maxInFlight, calls, bodies }) };
}

describe("renderEpisode", () => {
  it("sends the model, voice per speaker, language and raw pcm format", async () => {
    const { client, stats } = fakeClient();
    await renderEpisode(lines(2), o, { client, voices });
    const [a, b] = stats().bodies;
    expect(a).toMatchObject({ model_id: "sonic-3.6", voice: { mode: "id", id: "voice-a" }, language: "es", transcript: "Line 0." });
    expect(b).toMatchObject({ voice: { mode: "id", id: "voice-b" } });
    expect(a).not.toHaveProperty("locale");
    expect(a.output_format).toEqual({ container: "raw", encoding: "pcm_s16le", sample_rate: 24000 });
  });

  it("keeps order when requests finish out of order", async () => {
    const { client } = fakeClient({ delay: (i) => (i === 0 ? 30 : 1) });
    const { wav, starts } = await renderEpisode(lines(3), o, { client, voices });
    expect(starts).toHaveLength(3);
    expect(wav[44]).toBe(0);
    expect(wav[44 + 2400 + 16800]).toBe(1);
    expect(starts[1]).toBeGreaterThan(starts[0]);
    expect(starts[2]).toBeGreaterThan(starts[1]);
  });

  it("never runs more than the pool size at once", async () => {
    const { client, stats } = fakeClient();
    await renderEpisode(lines(14), o, { client, voices });
    expect(stats().maxInFlight).toBe(CONCURRENCY);
    expect(stats().calls).toBe(14);
  });

  it("rejects with the line index when one line fails and hides the SDK message", async () => {
    const { client } = fakeClient({ fail: 5 });
    const err = await renderEpisode(lines(8), o, { client, voices }).catch((e) => e);
    expect(err).toBeInstanceOf(RenderError);
    expect(err.lineIndex).toBe(5);
    expect(err.message).toContain("line 6");
    expect(err.message).not.toContain("sentinel");
  });

  it("stops starting new calls after an abort", async () => {
    const ctrl = new AbortController();
    const { client, stats } = fakeClient({ delay: () => 20, onCall: () => { if (stats().calls >= 4) ctrl.abort(); } });
    await expect(renderEpisode(lines(40), o, { client, voices, signal: ctrl.signal })).rejects.toThrow();
    expect(stats().calls).toBeLessThan(40);
  });

  it("uses a longer gap on a speaker change than within a speaker", async () => {
    const { client } = fakeClient();
    const { starts } = await renderEpisode(
      [
        { speaker: "A", text: "Line 0." },
        { speaker: "A", text: "Line 0." },
        { speaker: "B", text: "Line 0." },
      ],
      o,
      { client, voices },
    );
    const len = 2400 / 2 / 24000;
    expect(starts[1] - starts[0] - len).toBeCloseTo(0.18, 3);
    expect(starts[2] - starts[1] - len).toBeCloseTo(0.35, 3);
  });
});
