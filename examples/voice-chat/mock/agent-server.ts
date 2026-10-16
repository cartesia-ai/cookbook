import { WebSocketServer, type WebSocket } from "ws";
import type { AddressInfo } from "node:net";

export interface MockOptions {
  idleMs?: number;
  firstEventMs?: number;
}

export interface MockAgentServer {
  url: string;
  received: { type: string; bytes?: number; body: Record<string, unknown> }[];
  requestUrls: string[];
  closes: { code: number; reason: string }[];
  send(event: Record<string, unknown>): void;
  playScript(): void;
  close(): Promise<void>;
}

const b64 = (n: number) => Buffer.alloc(n).toString("base64");

export async function startMockAgent(opts: MockOptions = {}): Promise<MockAgentServer> {
  const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await new Promise<void>((r) => wss.once("listening", () => r()));
  const port = (wss.address() as AddressInfo).port;
  let client: WebSocket | undefined;
  const received: MockAgentServer["received"] = [];
  const requestUrls: string[] = [];
  const closes: MockAgentServer["closes"] = [];

  wss.on("connection", (ws, req) => {
    client = ws;
    requestUrls.push(req.url ?? "");
    let ready = false;
    let idle: ReturnType<typeof setTimeout>;
    const arm = (ms: number, reason: string) => {
      clearTimeout(idle);
      idle = setTimeout(() => ws.close(1008, reason), ms);
    };
    arm(opts.firstEventMs ?? 10_000, "no session_create");
    ws.on("close", (code, reason) => {
      clearTimeout(idle);
      closes.push({ code, reason: reason.toString() });
    });
    ws.on("message", (data) => {
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(data.toString());
      } catch {
        ws.close(1008, "invalid json");
        return;
      }
      const type = String(body.type);
      if (!ready) {
        if (type !== "session_create") {
          ws.close(1008, "first event must be session_create");
          return;
        }
        const audio = body.audio as { input_format?: string } | undefined;
        if (!audio?.input_format) {
          ws.close(1008, "input_format is required");
          return;
        }
        received.push({ type, body });
        ready = true;
        ws.send(JSON.stringify({ type: "session_ready", call_id: "call_mock", agent_id: "agent_mock", agent_version_id: "v1", audio: { input_format: audio.input_format } }));
        arm(opts.idleMs ?? 120_000, "idle timeout");
        return;
      }
      if (type === "audio_input") {
        received.push({ type, bytes: Buffer.from(String(body.audio), "base64").length, body: {} });
      } else {
        received.push({ type, body });
      }
      arm(opts.idleMs ?? 120_000, "idle timeout");
    });
  });

  const send = (event: Record<string, unknown>) => client?.send(JSON.stringify(event));
  return {
    url: `ws://127.0.0.1:${port}`,
    received,
    requestUrls,
    closes,
    send,
    playScript() {
      send({ type: "turn_started", turn: 1, role: "user", start_time: 0 });
      send({ type: "turn_ended", turn: 1, role: "user", text: "Tell me about volcanoes.", interrupted: false, start_time: 0, end_time: 1.2, tool_calls: [] });
      send({ type: "turn_started", turn: 2, role: "assistant", start_time: 1.3 });
      for (const word of ["Volcanoes ", "form ", "where ", "plates ", "meet, "]) {
        send({ type: "turn_output_text_delta", turn: 2, role: "assistant", text: word });
        send({ type: "audio_output", audio: b64(3200) });
      }
      send({ type: "audio_output_clear" });
      send({ type: "turn_ended", turn: 2, role: "assistant", text: "Volcanoes form where", interrupted: true, start_time: 1.3, end_time: 2.4, tool_calls: [] });
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const c of wss.clients) c.terminate();
        wss.close(() => resolve());
      }),
  };
}
