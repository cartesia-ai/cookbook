// @vitest-environment jsdom
import "./setup-dom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CorrectionsPanel } from "@/components/corrections-panel";
import { MissionPicker } from "@/components/mission-picker";
import { Splash } from "@/components/splash";
import { Summary } from "@/components/summary";
import { MISSIONS } from "@/lib/missions";
import type { CorrectionItem } from "@/lib/use-corrections";

afterEach(cleanup);

const done = (turn: number, text: string, hasIssue: boolean): CorrectionItem => ({
  turn,
  text,
  status: "done",
  correction: hasIssue
    ? { hasIssue: true, corrected: "Tengo hambre", explanation: "Use tener.", category: "grammar" }
    : { hasIssue: false, corrected: text, explanation: "", category: "other" },
});

describe("CorrectionsPanel", () => {
  it("says what to add when no LLM key is set", () => {
    render(<CorrectionsPanel items={[]} target="es" native="en" enabled={false} onRetry={vi.fn()} />);
    expect(screen.getByText(/ANTHROPIC_API_KEY/)).toBeTruthy();
  });

  it("shows pending, flagged, clean and failed lines, newest first, and retries", () => {
    const onRetry = vi.fn();
    const items: CorrectionItem[] = [
      done(1, "Yo soy tiene hambre", true),
      done(2, "Hola", false),
      { turn: 3, text: "tres", status: "error", reason: "failed" },
      { turn: 4, text: "cuatro", status: "pending" },
    ];
    render(<CorrectionsPanel items={items} target="es" native="en" enabled onRetry={onRetry} />);
    const list = screen.getByRole("list", { name: "Corrections" });
    expect(list.firstElementChild?.textContent).toContain("cuatro");
    expect(screen.getByText("Tengo hambre")).toBeTruthy();
    expect(screen.getByText("Use tener.")).toBeTruthy();
    expect(screen.getByText("No issues found.")).toBeTruthy();
    expect(screen.getByLabelText("Checking this line")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledWith(3);
  });

  it("marks target-language text with a lang attribute", () => {
    render(<CorrectionsPanel items={[done(1, "Yo soy tiene hambre", true)]} target="es" native="en" enabled onRetry={vi.fn()} />);
    expect(screen.getByText("Tengo hambre").getAttribute("lang")).toBe("es");
    expect(screen.getByText("Use tener.").getAttribute("lang")).toBe("en");
  });
});

describe("Splash", () => {
  it("offers a swap instead of an equal pair", () => {
    const onNative = vi.fn();
    const onTarget = vi.fn();
    render(<Splash native="en" target="en" onNative={onNative} onTarget={onTarget} onContinue={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Choose a mission" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("continues when the pair differs", () => {
    const onContinue = vi.fn();
    render(<Splash native="en" target="ja" onNative={vi.fn()} onTarget={vi.fn()} onContinue={onContinue} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose a mission" }));
    expect(onContinue).toHaveBeenCalled();
  });
});

describe("MissionPicker", () => {
  it("lists every mission grouped by difficulty and reports the pick", () => {
    const onPick = vi.fn();
    render(<MissionPicker target="fr" native="en" mode="teacher" onMode={vi.fn()} onPick={onPick} onBack={vi.fn()} error={null} />);
    for (const m of MISSIONS) expect(screen.getByText(m.title)).toBeTruthy();
    fireEvent.click(screen.getByText("Order a coffee"));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ title: "Order a coffee" }));
    expect(screen.getByText(/stays in character/)).toBeTruthy();
  });

  it("shows a server error as an alert", () => {
    render(<MissionPicker target="fr" native="en" mode="immersive" onMode={vi.fn()} onPick={vi.fn()} onBack={vi.fn()} error="Too many sessions" />);
    expect(screen.getByRole("alert").textContent).toContain("Too many sessions");
    expect(screen.getByText(/have to say the phrase/)).toBeTruthy();
  });
});

describe("Summary", () => {
  const mission = MISSIONS[0]!;
  const base = { mission, target: "es", native: "en", onRetry: vi.fn(), onNew: vi.fn() } as const;

  it("shows the level, the pointers and the corrections grouped by category", () => {
    render(
      <Summary
        {...base}
        mode="immersive"
        result={{ reason: "completed", score: 2, pointers: ["Practise the past tense"], corrections: [done(1, "Yo soy tiene hambre", true), done(2, "Hola", false)] }}
      />,
    );
    expect(screen.getByText("Mission complete")).toBeTruthy();
    expect(screen.getByText("Proficiens").closest("li")?.getAttribute("aria-current")).toBe("true");
    expect(screen.getByText("Practise the past tense")).toBeTruthy();
    expect(screen.getByText("Grammar")).toBeTruthy();
    expect(screen.queryByText("No issues found.")).toBeNull();
  });

  it("shows no rating in teacher mode or when the session ended early", () => {
    render(<Summary {...base} mode="teacher" result={{ reason: "ended", corrections: [] }} />);
    expect(screen.getByText("Session ended early")).toBeTruthy();
    expect(screen.queryByText("Tiro")).toBeNull();
    expect(screen.getByText("No lines were checked in this session.")).toBeTruthy();
  });

  it("offers try again and another mission", () => {
    const onRetry = vi.fn();
    const onNew = vi.fn();
    render(<Summary {...base} onRetry={onRetry} onNew={onNew} mode="teacher" result={{ reason: "timeout", corrections: [] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(screen.getByRole("button", { name: "Another mission" }));
    expect(onRetry).toHaveBeenCalled();
    expect(onNew).toHaveBeenCalled();
  });
});
