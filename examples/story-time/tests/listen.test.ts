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

  it("turns the mic off and reports onClosed when the socket closes on its own", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const ws = {
      ...fakeSocket(),
      stream: async function* () {
        yield { type: "message", message: { type: "turn.update", transcript: "the cave" } };
        await gate;
        yield { type: "close", code: 1006 };
      },
    };
    const client = { stt: { autoFinalize: { websocket: () => ws } } };
    const track = { stop: vi.fn() };
    const node = { port: { onmessage: null as unknown }, disconnect: vi.fn() };
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const ctx = {
      sampleRate: 48000,
      audioWorklet: { addModule: async () => {} },
      createMediaStreamSource: () => source,
    };
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track] }) } });
    vi.stubGlobal("AudioWorkletNode", function () {
      return node;
    });
    const onClosed = vi.fn();
    const onPartial = vi.fn();
    await listenForChoice(client as never, ctx as never, { onPartial, onAnswer: () => false, onClosed });
    await vi.waitFor(() => expect(onPartial).toHaveBeenCalledWith("the cave"));
    expect(onClosed).not.toHaveBeenCalled();
    release();
    await vi.waitFor(() => expect(onClosed).toHaveBeenCalledOnce());
    expect(track.stop).toHaveBeenCalledOnce();
    expect(source.disconnect).toHaveBeenCalledOnce();
    (node.port.onmessage as (e: { data: Float32Array }) => void)({ data: new Float32Array(4800) });
    expect(ws.sendRaw).not.toHaveBeenCalled();
  });

  it("does not report onClosed after the caller stops listening", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const ws = {
      ...fakeSocket(),
      stream: async function* () {
        await gate;
        yield { type: "close", code: 1000 };
      },
    };
    const client = { stt: { autoFinalize: { websocket: () => ws } } };
    const ctx = {
      sampleRate: 48000,
      audioWorklet: { addModule: async () => {} },
      createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
    };
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } });
    vi.stubGlobal("AudioWorkletNode", function () {
      return { port: {}, disconnect() {} };
    });
    const onClosed = vi.fn();
    const started = await listenForChoice(client as never, ctx as never, { ...handlers, onClosed });
    started.stop();
    release();
    await new Promise((r) => setTimeout(r, 10));
    expect(onClosed).not.toHaveBeenCalled();
    expect(ws.send).toHaveBeenCalledWith({ type: "close" });
  });
});
