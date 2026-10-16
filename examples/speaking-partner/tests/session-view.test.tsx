// @vitest-environment jsdom
import "./setup-dom";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  state: {
    status: "idle" as string,
    messages: [] as { turn: number; role: string; text: string; final: boolean }[],
    isSpeaking: { user: false, agent: false },
    error: null as null | { code: string; message: string },
    muted: false,
    callId: null,
  },
  start: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
  setMuted: vi.fn(),
  opts: null as null | { agentId: string; tools: Record<string, (p: Record<string, unknown>) => unknown> },
}));

vi.mock("@/lib/agents-web/react", () => ({
  useCartesiaAgent: (o: never) => {
    h.opts = o;
    return { ...h.state, start: h.start, stop: h.stop, setMuted: h.setMuted, sendToolResult: vi.fn() };
  },
}));
vi.mock("../lib/chime", () => ({ playChime: vi.fn() }));
vi.mock("../lib/client-api", async (orig) => ({
  ...(await orig<typeof import("../lib/client-api")>()),
  fetchToken: vi.fn(async () => "tok"),
  requestCorrection: vi.fn(async (p: { text: string }) => ({
    hasIssue: true,
    corrected: `fixed: ${p.text}`,
    explanation: "Because.",
    category: "grammar",
  })),
}));

import { SessionView } from "../components/session-view";
import { requestCorrection } from "../lib/client-api";
import { MISSIONS } from "../lib/missions";

const mission = MISSIONS.find((m) => m.title === "Order a coffee")!;

function view(over: Partial<Parameters<typeof SessionView>[0]> = {}) {
  const props = { agentId: "agent_session12345", mission, mode: "teacher" as const, target: "fr" as const, native: "en" as const, correctionsEnabled: true, onFinish: vi.fn(), onCancel: vi.fn(), ...over };
  return { props, ...render(<SessionView {...props} />) };
}

beforeEach(() => {
  h.state = { status: "idle", messages: [], isSpeaking: { user: false, agent: false }, error: null, muted: false, callId: null };
  h.start.mockClear();
  h.stop.mockClear();
  vi.mocked(requestCorrection).mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SessionView", () => {
  it("starts the call from the button, not on its own", () => {
    view();
    expect(h.start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /start speaking/i }));
    expect(h.start).toHaveBeenCalledTimes(1);
    expect(h.opts?.agentId).toBe("agent_session12345");
    expect(screen.getByText(/headphones/i)).toBeTruthy();
  });

  it("checks each finished learner line once and shows the correction", async () => {
    h.state.status = "ready";
    h.state.messages = [
      { turn: 1, role: "user", text: "Je voudrais un cafe", final: true },
      { turn: 2, role: "assistant", text: "Bien sûr.", final: true },
      { turn: 3, role: "user", text: "en cours", final: false },
    ];
    const { rerender, props } = view();
    await waitFor(() => expect(screen.getByText("fixed: Je voudrais un cafe")).toBeTruthy());
    rerender(<SessionView {...props} />);
    expect(requestCorrection).toHaveBeenCalledTimes(1);
    expect(vi.mocked(requestCorrection).mock.calls[0]![0]).toMatchObject({ text: "Je voudrais un cafe", target: "fr", native: "en", mission: "Order a coffee" });
  });

  it("does not call the correction route when no key is configured", () => {
    h.state.status = "ready";
    h.state.messages = [{ turn: 1, role: "user", text: "Bonjour", final: true }];
    view({ correctionsEnabled: false });
    expect(requestCorrection).not.toHaveBeenCalled();
    expect(screen.getByText(/ANTHROPIC_API_KEY/)).toBeTruthy();
  });

  it("keeps the panel closed in immersive mode until asked", () => {
    h.state.status = "ready";
    view({ mode: "immersive" });
    const toggle = screen.getByRole("button", { name: "Show" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide" })).toBeTruthy();
  });

  it("waits for the goodbye audio to finish before it closes, then reports the score and pointers", () => {
    vi.useFakeTimers();
    h.state.status = "ready";
    h.state.isSpeaking = { user: false, agent: true };
    const { props, rerender } = view();
    act(() => {
      h.opts!.tools.complete_mission!({ score: 2, feedback_pointers: ["one", "two", 3] });
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(props.onFinish).not.toHaveBeenCalled();
    h.state.isSpeaking = { user: false, agent: false };
    rerender(<SessionView {...props} />);
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(props.onFinish).toHaveBeenCalledTimes(1);
    expect(props.onFinish).toHaveBeenCalledWith(expect.objectContaining({ reason: "completed", score: 2, pointers: ["one", "two"] }));
    expect(h.stop).toHaveBeenCalled();
    act(() => {
      h.opts!.tools.complete_mission!({ score: 1, feedback_pointers: [] });
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(props.onFinish).toHaveBeenCalledTimes(1);
  });

  it("gives up waiting for the goodbye after 20 seconds", () => {
    vi.useFakeTimers();
    h.state.status = "ready";
    h.state.isSpeaking = { user: false, agent: true };
    const { props } = view();
    act(() => {
      h.opts!.tools.complete_mission!({ score: 3, feedback_pointers: [] });
    });
    act(() => {
      vi.advanceTimersByTime(19_000);
    });
    expect(props.onFinish).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(props.onFinish).toHaveBeenCalledWith(expect.objectContaining({ reason: "completed", score: 3 }));
  });

  it("clamps a wild score", () => {
    vi.useFakeTimers();
    h.state.status = "ready";
    const { props } = view();
    act(() => {
      h.opts!.tools.complete_mission!({ score: 99, feedback_pointers: "nope" });
    });
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(props.onFinish).toHaveBeenCalledWith(expect.objectContaining({ score: 3, pointers: [] }));
  });

  it("ends early from the End button and from Escape", () => {
    h.state.status = "ready";
    const { props } = view();
    fireEvent.click(screen.getByRole("button", { name: /end session/i }));
    expect(props.onFinish).toHaveBeenCalledWith(expect.objectContaining({ reason: "ended" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onFinish).toHaveBeenCalledTimes(1);
  });

  it("ends with a timeout after 3 minutes", () => {
    vi.useFakeTimers();
    h.state.status = "ready";
    const { props } = view();
    act(() => {
      vi.advanceTimersByTime(181_000);
    });
    expect(props.onFinish).toHaveBeenCalledWith(expect.objectContaining({ reason: "timeout" }));
  });

  it("explains a blocked microphone and lets the learner try again", () => {
    h.state.error = { code: "mic_denied", message: "denied" };
    view();
    expect(screen.getByText("The microphone is blocked")).toBeTruthy();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
  });
});
