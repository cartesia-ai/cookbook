import { describe, expect, it } from "vitest";
import { LANGUAGE_CODES } from "@/lib/languages";
import { MISSIONS } from "@/lib/missions";
import { MODES } from "@/lib/modes";
import { buildInstructions, completeMissionToolBody, COMPLETE_TOOL_NAME } from "@/lib/prompts";

const mission = MISSIONS.find((m) => m.title === "Order a coffee")!;

describe("buildInstructions", () => {
  it("bakes every input into the text, with no template placeholder left over", () => {
    for (const target of LANGUAGE_CODES) {
      for (const mode of MODES) {
        const native = target === "en" ? "es" : "en";
        const text = buildInstructions({ target, native, mission, mode });
        expect(text).not.toMatch(/\{\{|\}\}|undefined|\[object/);
        expect(text).toContain(mission.target_role);
        expect(text).toContain(mission.title);
        expect(text).toContain(COMPLETE_TOOL_NAME);
      }
    }
  });

  it("scores teacher sessions 0 and immersive sessions 1 to 3", () => {
    const base = { target: "fr", native: "en", mission } as const;
    expect(buildInstructions({ ...base, mode: "teacher" })).toContain("Set score to 0");
    const immersive = buildInstructions({ ...base, mode: "immersive" });
    expect(immersive).not.toContain("Set score to 0");
    expect(immersive).toContain("3 if they were fluent");
  });

  it("keeps the no free rides rule in immersive mode only", () => {
    const base = { target: "ja", native: "en", mission } as const;
    expect(buildInstructions({ ...base, mode: "immersive" })).toContain("No free rides");
    expect(buildInstructions({ ...base, mode: "teacher" })).not.toContain("No free rides");
  });

  it("asks for short spoken replies", () => {
    expect(buildInstructions({ target: "es", native: "en", mission, mode: "teacher" })).toMatch(/one or two short sentences/);
  });
});

describe("completeMissionToolBody", () => {
  it("is an async client tool that expects no response", () => {
    const t = completeMissionToolBody();
    expect(t).toMatchObject({ type: "client", name: "complete_mission", execution_mode: "async", expects_response: false });
    expect(t.parameters.required).toEqual(["score", "feedback_pointers"]);
  });
});

describe("missions", () => {
  it("has unique ids and no Paris-only wording", () => {
    expect(new Set(MISSIONS.map((m) => m.id)).size).toBe(MISSIONS.length);
    expect(JSON.stringify(MISSIONS)).not.toMatch(/Paris|Parisian/);
  });
});
