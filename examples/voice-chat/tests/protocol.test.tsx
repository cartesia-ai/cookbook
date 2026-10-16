// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { useCartesiaAgent } from "@/lib/agents-web/react";
import { startMockAgent, type MockAgentServer } from "../mock/agent-server";

let mock: MockAgentServer;
beforeEach(async () => {
  mock = await startMockAgent({ idleMs: 400 });
});
afterEach(() => mock.close());

function harness() {
  let push!: (pcm: Int16Array) => void;
  const played: Int16Array[] = [];
  let clears = 0;
  const options = {
    agentId: "agent_mock",
    getToken: async () => "tok_test",
    baseUrl: `${mock.url}/v1/agents/websocket`,
    webSocketFactory: (url: string) => new WebSocket(url) as never,
    audioContextFactory: () => ({ state: "running", resume: async () => {}, close: async () => {}, addEventListener() {} }) as never,
    captureFactory: async (o: { onChunk: (p: Int16Array) => void }) => {
      push = o.onChunk;
      return { stop() {}, setMuted() {} };
    },
    playbackFactory: () => ({
      enqueue: (p: Int16Array) => void played.push(p),
      clear: () => void (clears += 1, played.length = 0),
      dispose() {},
      playing: false,
      bufferedMs: 0,
    }),
  };
  return { options, pushAudio: (p: Int16Array) => push(p), played, clears: () => clears };
}

describe("voice chat against the mock agent", () => {
  it("sends session_create first, streams mic audio in 20 to 100 ms chunks, and builds the transcript", async () => {
    const h = harness();
    const { result } = renderHook(() => useCartesiaAgent(h.options as never));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.callId).toBe("call_mock");
    expect(mock.received[0]!.type).toBe("session_create");
    expect(mock.received[0]!.body.audio).toMatchObject({ input_format: "pcm_16000" });
    expect(mock.requestUrls[0]).toContain("/v1/agents/websocket/agent_mock");
    expect(mock.requestUrls[0]).toContain("cartesia_version=2026-08-14");

    act(() => h.pushAudio(new Int16Array(640)));
    await waitFor(() => expect(mock.received.some((e) => e.type === "audio_input")).toBe(true));
    for (const e of mock.received.filter((x) => x.type === "audio_input")) {
      const ms = (e.bytes! / 2 / 16000) * 1000;
      expect(ms).toBeGreaterThanOrEqual(20);
      expect(ms).toBeLessThanOrEqual(100);
    }

    mock.playScript();
    await waitFor(() => expect(result.current.messages.find((m) => m.turn === 2)?.final).toBe(true));

    expect(result.current.messages).toEqual([
      { turn: 1, role: "user", text: "Tell me about volcanoes.", final: true, interrupted: false },
      { turn: 2, role: "assistant", text: "Volcanoes form where", final: true, interrupted: true },
    ]);
    expect(h.clears()).toBeGreaterThanOrEqual(1);
    expect(h.played).toHaveLength(0);

    await act(async () => {
      await result.current.stop();
    });
    expect(result.current.status).toBe("closed");
  });

  it("streams assistant text word by word before the turn ends", async () => {
    const h = harness();
    const { result } = renderHook(() => useCartesiaAgent(h.options as never));
    await act(async () => {
      await result.current.start();
    });
    mock.send({ type: "turn_started", turn: 1, role: "assistant", start_time: 0 });
    mock.send({ type: "turn_output_text_delta", turn: 1, role: "assistant", text: "Hello " });
    mock.send({ type: "turn_output_text_delta", turn: 1, role: "assistant", text: "there" });
    await waitFor(() => expect(result.current.messages[0]?.text).toBe("Hello there"));
    expect(result.current.messages[0]).toMatchObject({ final: false });
    await act(async () => {
      await result.current.stop();
    });
  });

  it("surfaces a fatal error event", async () => {
    const h = harness();
    const { result } = renderHook(() => useCartesiaAgent(h.options as never));
    await act(async () => {
      await result.current.start();
    });
    mock.send({ type: "error", code: "internal_error", message: "agent failed", fatal: true });
    await waitFor(() => expect(result.current.error?.code).toBe("internal_error"));
    await act(async () => {
      await result.current.stop();
    });
  });

  it("ends the call when the server closes an idle session", async () => {
    const h = harness();
    const { result } = renderHook(() => useCartesiaAgent(h.options as never));
    await act(async () => {
      await result.current.start();
    });
    await waitFor(() => expect(["closed", "error"]).toContain(result.current.status), { timeout: 3000 });
    expect(mock.closes[0]?.reason).toBe("idle timeout");
  });
});

describe("the mock enforces the protocol", () => {
  const open = (url: string) =>
    new Promise<WebSocket>((resolve) => {
      const ws = new WebSocket(url);
      ws.on("open", () => resolve(ws));
    });
  const closed = (ws: WebSocket) => new Promise<{ code: number; reason: string }>((r) => ws.on("close", (code, reason) => r({ code, reason: reason.toString() })));

  it("closes with 1008 when audio comes in before session_create", async () => {
    const ws = await open(`${mock.url}/v1/agents/websocket/a?access_token=t`);
    const done = closed(ws);
    ws.send(JSON.stringify({ type: "audio_input", audio: "AAAA" }));
    expect((await done).code).toBe(1008);
  });

  it("closes with 1008 when session_create has no input_format", async () => {
    const ws = await open(`${mock.url}/v1/agents/websocket/a?access_token=t`);
    const done = closed(ws);
    ws.send(JSON.stringify({ type: "session_create", audio: {} }));
    expect((await done).code).toBe(1008);
  });
});
