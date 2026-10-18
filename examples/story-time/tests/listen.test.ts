import { afterEach, describe, expect, it, vi } from "vitest";
import { listenForChoice } from "@/lib/listen";

function fakeSocket() {
  return { on: vi.fn(), close: vi.fn(), send: vi.fn(), sendRaw: vi.fn(), stream: async function* () {} };
}

const handlers = { onPartial() {}, onAnswer: () => false };

afterEach(() => vi.unstubAllGlobals());

describe("listenForChoice", () => {
  it("closes the Ink 2 socket when the microphone is denied", async () => {
    const ws = fakeSocket();
    const client = { stt: { autoFinalize: { websocket: () => ws } } };
    const ctx = { sampleRate: 48000, audioWorklet: { addModule: async () => {} } };
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: async () => Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" })),
      },
    });
    await expect(listenForChoice(client as never, ctx as never, handlers)).rejects.toThrow("denied");
    expect(ws.close).toHaveBeenCalledOnce();
  });

  it("stops the mic tracks when the audio graph cannot be built", async () => {
    const ws = fakeSocket();
    const client = { stt: { autoFinalize: { websocket: () => ws } } };
    const track = { stop: vi.fn() };
    const ctx = {
      sampleRate: 48000,
      audioWorklet: { addModule: async () => {} },
      createMediaStreamSource: () => {
        throw new Error("NotSupportedError");
      },
    };
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track] }) } });
    await expect(listenForChoice(client as never, ctx as never, handlers)).rejects.toThrow("NotSupportedError");
    expect(track.stop).toHaveBeenCalledOnce();
    expect(ws.close).toHaveBeenCalledOnce();
  });
});
