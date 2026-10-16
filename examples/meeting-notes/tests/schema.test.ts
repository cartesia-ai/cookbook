import { describe, expect, it } from "vitest";
import { MeetingNotesSchema } from "@/lib/schema";

const valid = {
  title: "Launch sync",
  summary: "The team agreed on a Friday launch.",
  decisions: ["Ship on Friday."],
  actionItems: [{ task: "Update the docs", owner: "Priya" }],
};

describe("MeetingNotesSchema", () => {
  it("accepts valid notes", () => {
    expect(MeetingNotesSchema.safeParse(valid).success).toBe(true);
  });

  it("allows an empty decisions array", () => {
    expect(MeetingNotesSchema.safeParse({ ...valid, decisions: [] }).success).toBe(true);
  });

  it("requires the decisions key", () => {
    const { decisions: _decisions, ...rest } = valid;
    expect(MeetingNotesSchema.safeParse(rest).success).toBe(false);
  });

  it("allows a null owner", () => {
    const notes = { ...valid, actionItems: [{ task: "Book a room", owner: null }] };
    expect(MeetingNotesSchema.safeParse(notes).success).toBe(true);
  });

  it("requires the owner key, for strict structured outputs", () => {
    const notes = { ...valid, actionItems: [{ task: "Book a room" }] };
    expect(MeetingNotesSchema.safeParse(notes).success).toBe(false);
  });
});
