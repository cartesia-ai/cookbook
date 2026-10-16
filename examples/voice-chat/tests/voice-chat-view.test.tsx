// @vitest-environment jsdom
import "./setup-dom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceChatView, type VoiceChatViewProps } from "../components/voice-chat-view";

afterEach(cleanup);

function props(over: Partial<VoiceChatViewProps> = {}): VoiceChatViewProps {
  return {
    status: "idle",
    messages: [],
    userSpeaking: false,
    agentSpeaking: false,
    muted: false,
    error: null,
    onStart: vi.fn(),
    onStop: vi.fn(),
    onToggleMute: vi.fn(),
    ...over,
  };
}

describe("VoiceChatView", () => {
  it("shows the welcome view with a start button and a headphones hint", () => {
    const p = props();
    render(<VoiceChatView {...p} />);
    fireEvent.click(screen.getByRole("button", { name: /start call/i }));
    expect(p.onStart).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/headphones/i)).toBeTruthy();
  });

  it("announces connecting, listening and speaking through a polite status region", () => {
    const { rerender } = render(<VoiceChatView {...props({ status: "connecting" })} />);
    const status = () => screen.getByText(/^(Connecting|Listening|Speaking|Hearing you)/).closest("[role=status]")!;
    expect(status().getAttribute("aria-live")).toBe("polite");
    expect(status().textContent).toContain("Connecting");
    rerender(<VoiceChatView {...props({ status: "ready" })} />);
    expect(status().textContent).toContain("Listening");
    rerender(<VoiceChatView {...props({ status: "ready", agentSpeaking: true })} />);
    expect(status().textContent).toContain("Speaking");
  });

  it("renders a streaming assistant bubble with a caret and an interrupted marker", () => {
    render(
      <VoiceChatView
        {...props({
          status: "ready",
          messages: [
            { turn: 1, role: "assistant", text: "Sure, the first", final: false },
            { turn: 2, role: "assistant", text: "I was saying", final: true, interrupted: true },
          ],
        })}
      />,
    );
    const log = screen.getByRole("log");
    expect(log.textContent).toContain("Sure, the first");
    expect(log.textContent).toContain("I was saying");
    expect(screen.getAllByText("interrupted")).toHaveLength(1);
  });

  it("shows a placeholder bubble while the user is speaking", () => {
    render(<VoiceChatView {...props({ status: "ready", userSpeaking: true })} />);
    expect(screen.getByLabelText("Listening to you")).toBeTruthy();
  });

  it("shows no placeholder when the user is not speaking", () => {
    render(<VoiceChatView {...props({ status: "ready" })} />);
    expect(screen.queryByLabelText("Listening to you")).toBeNull();
  });

  it("offers Try again on a fatal error and calls onStart", () => {
    const p = props({ status: "error", messages: [{ turn: 1, role: "user", text: "hi", final: true }], error: { code: "1008", message: "bad token" } });
    render(<VoiceChatView {...p} />);
    expect(screen.getByRole("alert").textContent).toContain("bad token");
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(p.onStart).toHaveBeenCalledTimes(1);
  });

  it("explains how to fix a blocked microphone", () => {
    render(<VoiceChatView {...props({ status: "error", error: { code: "mic_denied", message: "denied" } })} />);
    expect(screen.getByRole("alert").textContent).toMatch(/microphone is blocked/i);
  });

  it("has labelled mute and end-call controls during a call", () => {
    const p = props({ status: "ready", muted: true });
    render(<VoiceChatView {...p} />);
    const mute = screen.getByRole("button", { name: /unmute microphone/i });
    expect(mute.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(mute);
    fireEvent.click(screen.getByRole("button", { name: /end call/i }));
    expect(p.onToggleMute).toHaveBeenCalled();
    expect(p.onStop).toHaveBeenCalled();
  });
});
