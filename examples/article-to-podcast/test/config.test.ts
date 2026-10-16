import { describe, expect, it } from "vitest";
import { chunkCap, defaultOptions, languageCode, OptionsSchema } from "../lib/config";

describe("OptionsSchema", () => {
  it("has the documented defaults", () => {
    const o = defaultOptions();
    expect(o.conversationStyle).toEqual(["engaging", "analytical"]);
    expect(o.hostARole).toBe("host who explains the article");
    expect(o.hostBRole).toBe("host who asks the questions");
    expect(o.dialogueStructure).toEqual(["Opening", "Key points", "Wrap-up"]);
    expect(o.podcastName).toBe("Sonic Briefing");
    expect(o.podcastTagline).toBe("Any article, two voices");
    expect(o.outputLanguage).toBe("English");
    expect(o.engagementTechniques).toEqual(["questions", "examples", "analogies"]);
    expect(o.creativity).toBe(0.7);
    expect(o.userInstructions).toBe("");
    expect(o.minChunkSize).toBe(600);
    expect(chunkCap(o)).toBe(4);
    expect(chunkCap(OptionsSchema.parse({ maxNumChunks: 8 }))).toBe(8);
    expect(languageCode(o)).toBe("en");
  });
  it("rejects an unknown language", () => {
    expect(OptionsSchema.safeParse({ outputLanguage: "Klingon" }).success).toBe(false);
  });
  it("rejects creativity outside 0..1", () => {
    expect(OptionsSchema.safeParse({ creativity: 1.5 }).success).toBe(false);
    expect(OptionsSchema.safeParse({ creativity: -0.1 }).success).toBe(false);
  });
  it("rejects empty host names", () => {
    expect(OptionsSchema.safeParse({ hostAName: "  " }).success).toBe(false);
    expect(OptionsSchema.safeParse({ hostBName: "" }).success).toBe(false);
  });
});
