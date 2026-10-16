// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { useCartesiaAgent } from "@/lib/agents-web/react";
import { startMockAgent, type MockAgentServer } from "../mock/agent-server";

let mock: MockAgentServer;
beforeEach(async () => {
  mock = await startMockAgent({ idleMs: 5000 });
});
afterEach(() => mock.close());

function options(extra: Record<string, unknown> = {}) {
  return {
    agentId: "agent_session12345",
    getToken: async () => "tok_test",
    baseUrl: `${mock.url}/v1/agents/websocket`,
    webSocketFactory: (url: string) => new WebSocket(url) as never,
    audioContextFactory: () => ({ state: "running", resume: async () => {}, close: async () => {}, addEventListener() {} }) as never,
    captureFactory: async () => ({ stop() {}, setMuted() {} }),
    playbackFactory: () => ({ enqueue() {}, clear() {}, dispose() {}, playing: false, bufferedMs: 0 }),
    ...extra,
  };
}

describe("speaking partner against the mock agent", () => {
  it("connects to the per-session agent and hands complete_mission to the tool handler without replying", async () => {
    const handler = vi.fn();
    const { result } = renderHook(() => useCartesiaAgent(options({ tools: { complete_mission: handler } }) as never));
    await act(async () => {
      await result.current.start();
    });
    expect(mock.requestUrls[0]).toContain("/v1/agents/websocket/agent_session12345");
    expect(JSON.stringify(mock.received[0]!.body)).not.toContain("dynamic_variables");

    mock.playCompletion({ score: 3, feedback_pointers: ["a", "b", "c"] });
    await waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    expect(handler).toHaveBeenCalledWith({ score: 3, feedback_pointers: ["a", "b", "c"] });

    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages[0]).toMatchObject({ role: "user", final: true, text: "Un café, s'il vous plaît." });
    expect(result.current.messages[1]).toMatchObject({ role: "assistant", final: true });

    await new Promise((r) => setTimeout(r, 100));
    expect(mock.received.some((e) => e.type === "client_tool_result")).toBe(false);

    await act(async () => {
      await result.current.stop();
    });
  });
});
