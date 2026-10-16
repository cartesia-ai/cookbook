import { describe, expect, it } from "vitest";
import { meetingToMarkdown } from "@/lib/markdown";
import type { Meeting } from "@/lib/schema";

const base: Meeting = {
  id: "m1",
  createdAt: Date.UTC(2026, 9, 14, 12),
  title: "Launch sync",
  language: "en",
  status: "ready",
  summary: "The team agreed on a Friday launch.",
  transcript: "We decided to ship on Friday.",
  decisions: ["Ship on Friday."],
  actionItems: [
    { id: "a1", task: "Update the docs", owner: "Priya", done: false },
    { id: "a2", task: "Book the room", owner: null, done: true },
  ],
};

describe("meetingToMarkdown", () => {
  it("renders every section", () => {
    expect(meetingToMarkdown(base)).toMatchInlineSnapshot(`
      "# Launch sync

      _2026-10-14_

      ## Summary

      The team agreed on a Friday launch.

      ## Decisions

      - Ship on Friday.

      ## Action items

      - [ ] Update the docs (Priya)
      - [x] Book the room

      ## Transcript

      We decided to ship on Friday.
      "
    `);
  });

  it("omits the decisions heading when there are none", () => {
    expect(meetingToMarkdown({ ...base, decisions: [] })).not.toContain("## Decisions");
  });
});
