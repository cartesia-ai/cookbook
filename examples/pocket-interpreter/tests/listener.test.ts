import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ startMic: vi.fn() }));
vi.mock("@/lib/audio/mic", () => ({ startMic: mocks.startMic }));

import { listen } from "@/lib/audio/listener";

describe("listen", () => {
  it("closes the Ink 2 socket when the microphone fails to start", async () => {
    const ws = { on: vi.fn(), close: vi.fn(), sendRaw: vi.fn(), send: vi.fn() };
    const client = { stt: { autoFinalize: { websocket: () => ws } } };
    mocks.startMic.mockRejectedValue(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
    const handlers = {
      onTurnStart() {},
      onPartial() {},
      onEagerEnd() {},
      onResume() {},
      onTurnEnd() {},
      onClosed() {},
    };
    await expect(
      listen(client as never, { sampleRate: 48000 } as AudioContext, () => false, handlers),
    ).rejects.toThrow("denied");
    expect(ws.close).toHaveBeenCalledOnce();
  });
});
