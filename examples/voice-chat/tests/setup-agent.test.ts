import { createServer, type IncomingMessage, type Server } from "node:http";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildBody, run } from "../scripts/setup-agent.ts";
import { AGENTS_PATH } from "../scripts/paths.ts";

const FAKE_KEY = "test-key-not-real-0001";

interface Seen {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  body: unknown;
}

let server: Server | undefined;
afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())).then(() => (server = undefined)));

async function stub(handler: (seen: Seen) => { status: number; json: unknown }) {
  const seen: Seen[] = [];
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString();
      const s: Seen = { method: req.method!, url: req.url!, headers: req.headers, body: raw ? JSON.parse(raw) : undefined };
      seen.push(s);
      const out = handler(s);
      res.writeHead(out.status, { "content-type": "application/json" });
      res.end(JSON.stringify(out.json));
    });
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  return { seen, base };
}

const dir = () => mkdtempSync(join(tmpdir(), "vc-setup-"));

function happy(s: Seen) {
  if (s.method === "GET" && s.url.startsWith("/voices/")) return { status: 200, json: { id: "v" } };
  if (s.method === "GET" && s.url === `${AGENTS_PATH}/models`) return { status: 200, json: [{ id: "claude-haiku-4.5" }] };
  if (s.method === "POST" && s.url === AGENTS_PATH) return { status: 201, json: { id: "agent_new" } };
  return { status: 404, json: { message: "nope" } };
}

describe("setup-agent --dry-run", () => {
  it("prints the body without a key and without touching the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network used"));
    const lines: string[] = [];
    const code = await run({ argv: ["--dry-run"], cwd: dir(), env: {}, log: (l) => lines.push(l) });
    expect(code).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    const body = buildBody({});
    expect(lines.join("\n")).toContain(JSON.stringify(body, null, 2));
    const cfg = body.config as Record<string, any>;
    expect(cfg.model.id).toBe("claude-haiku-4.5");
    expect(cfg.audio.output.voice_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(cfg.language.primary).toBe("en");
    expect(JSON.stringify(body)).not.toMatch(/tts_model|sonic/);
  });
});

describe("setup-agent against a stub API", () => {
  it("creates the agent, sends version and auth headers, writes .env.local", async () => {
    const { seen, base } = await stub(happy);
    const cwd = dir();
    const lines: string[] = [];
    const code = await run({
      argv: [],
      cwd,
      env: { CARTESIA_API_KEY: FAKE_KEY, CARTESIA_BASE_URL: base },
      log: (l) => lines.push(l),
    });
    expect(code).toBe(0);
    const post = seen.find((s) => s.method === "POST")!;
    expect(post.url).toBe(AGENTS_PATH);
    expect(post.headers["cartesia-version"]).toBe("2026-08-14");
    expect(post.headers.authorization).toMatch(/^Bearer .+/);
    expect((post.body as any).config.instructions).toContain("Speaking rules");
    expect(readFileSync(join(cwd, ".env.local"), "utf8")).toBe("CARTESIA_AGENT_ID=agent_new\n");
    expect(lines.join("\n")).not.toContain(FAKE_KEY);
  });

  it("is idempotent when the saved agent still exists", async () => {
    const { seen, base } = await stub((s) =>
      s.method === "GET" && s.url === `${AGENTS_PATH}/agent_old` ? { status: 200, json: { id: "agent_old" } } : happy(s),
    );
    const cwd = dir();
    writeFileSync(join(cwd, ".env.local"), "CARTESIA_AGENT_ID=agent_old\n");
    const code = await run({ argv: [], cwd, env: { CARTESIA_API_KEY: FAKE_KEY, CARTESIA_BASE_URL: base }, log: () => {} });
    expect(code).toBe(0);
    expect(seen.some((s) => s.method === "POST")).toBe(false);
    expect(readFileSync(join(cwd, ".env.local"), "utf8")).toBe("CARTESIA_AGENT_ID=agent_old\n");
  });

  it("creates a new agent when the saved one is gone", async () => {
    const { seen, base } = await stub(happy);
    const cwd = dir();
    writeFileSync(join(cwd, ".env.local"), "CARTESIA_AGENT_ID=agent_gone\n");
    const code = await run({ argv: [], cwd, env: { CARTESIA_API_KEY: FAKE_KEY, CARTESIA_BASE_URL: base }, log: () => {} });
    expect(code).toBe(0);
    expect(seen.filter((s) => s.method === "POST")).toHaveLength(1);
    expect(readFileSync(join(cwd, ".env.local"), "utf8")).toBe("CARTESIA_AGENT_ID=agent_new\n");
  });

  it("stops with the list of ids when the model is not offered", async () => {
    const { seen, base } = await stub((s) =>
      s.url === `${AGENTS_PATH}/models` ? { status: 200, json: { data: [{ id: "other-1" }, { id: "other-2" }] } } : happy(s),
    );
    const cwd = dir();
    const lines: string[] = [];
    const code = await run({ argv: [], cwd, env: { CARTESIA_API_KEY: FAKE_KEY, CARTESIA_BASE_URL: base }, log: (l) => lines.push(l) });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("other-1, other-2");
    expect(seen.some((s) => s.method === "POST")).toBe(false);
    expect(existsSync(join(cwd, ".env.local"))).toBe(false);
  });

  it("exits 1 without a key and says so", async () => {
    const lines: string[] = [];
    expect(await run({ argv: [], cwd: dir(), env: {}, log: (l) => lines.push(l) })).toBe(1);
    expect(lines.join("\n")).toContain("CARTESIA_API_KEY is empty");
  });
});
