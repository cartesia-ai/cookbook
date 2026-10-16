import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSpeaker: vi.fn(),
  listen: vi.fn(),
  speakerClose: vi.fn(),
}));

vi.mock("@cartesia/cartesia-js", () => ({ default: class {} }));
vi.mock("@/lib/audio/speaker", () => ({ createSpeaker: mocks.createSpeaker }));
vi.mock("@/lib/audio/listener", () => ({ listen: mocks.listen }));

import { StartError, startInterpreter } from "@/lib/interpreter";

const contexts: { closed: boolean }[] = [];
class FakeAudioContext {
  closed = false;
  constructor() {
    contexts.push(this);
  }
  async close() {
    this.closed = true;
  }
}

const events = { onTurns: vi.fn(), onCaption: vi.fn(), onPhase: vi.fn(), onError: vi.fn() };
const tokenOk = () => Response.json({ token: "tok" });

beforeEach(() => {
  contexts.length = 0;
  vi.stubGlobal("AudioContext", FakeAudioContext);
  mocks.createSpeaker.mockReset();
  mocks.listen.mockReset();
  mocks.speakerClose.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

describe("startInterpreter cleanup", () => {
  it("closes the AudioContext when the token request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "no key" }, { status: 503 })));
    await expect(startInterpreter(["en", "es"], events)).rejects.toBeInstanceOf(StartError);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]!.closed).toBe(true);
  });

  it("closes the AudioContext when the server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    await expect(startInterpreter(["en", "es"], events)).rejects.toBeInstanceOf(StartError);
    expect(contexts[0]!.closed).toBe(true);
  });

  it("closes the AudioContext when the Sonic socket fails to open", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => tokenOk()));
    mocks.createSpeaker.mockRejectedValue(new Error("socket failed"));
    await expect(startInterpreter(["en", "es"], events)).rejects.toThrow("socket failed");
    expect(contexts[0]!.closed).toBe(true);
  });

  it("closes the speaker and the AudioContext when the microphone is blocked", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => tokenOk()));
    mocks.createSpeaker.mockResolvedValue({ close: mocks.speakerClose, busy: () => false, open: () => true });
    mocks.listen.mockRejectedValue(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
    await expect(startInterpreter(["en", "es"], events)).rejects.toBeInstanceOf(StartError);
    expect(mocks.speakerClose).toHaveBeenCalled();
    expect(contexts[0]!.closed).toBe(true);
  });
});
