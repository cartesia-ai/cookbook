// @vitest-environment jsdom
import "./setup-dom";
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/voice-chat", () => ({ VoiceChat: ({ agentId }: { agentId: string }) => <div>chat for {agentId}</div> }));

afterEach(() => {
  cleanup();
  delete process.env.CARTESIA_AGENT_ID;
});

describe("page", () => {
  it("shows the setup notice when the agent id is not set", async () => {
    delete process.env.CARTESIA_AGENT_ID;
    const { default: Page } = await import("../app/page");
    render(<Page />);
    expect(screen.getByText(/create the agent first/i)).toBeTruthy();
    expect(screen.getByText("npm run setup:agent")).toBeTruthy();
  });

  it("renders the chat with the agent id from the environment", async () => {
    process.env.CARTESIA_AGENT_ID = "agent_demo";
    const { default: Page } = await import("../app/page");
    render(<Page />);
    expect(screen.getByText("chat for agent_demo")).toBeTruthy();
  });

  it("does not read env at module top level", () => {
    for (const f of ["../app/page.tsx", "../lib/env.ts", "../lib/token-handler.ts", "../app/api/token/route.ts"]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      const topLevel = src.split("\n").filter((l) => /^(const|let|var|export const)\b/.test(l) && l.includes("process.env"));
      expect(topLevel, f).toEqual([]);
    }
  });
});
