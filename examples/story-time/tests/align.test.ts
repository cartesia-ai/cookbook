import { describe, expect, it } from "vitest";
import { activeToken, alignWords, displayTokens, LAUGH } from "@/lib/align";

describe("read-along alignment", () => {
  it("splits [laughter] into its own token", () => {
    expect(displayTokens("[laughter] Hello, Mia.")).toEqual([LAUGH, "Hello,", "Mia."]);
  });

  it("maps Sonic words onto display tokens, skipping laughter", () => {
    const tokens = displayTokens("[laughter] Hello, Mia. I am Dino Dot.");
    const spoken = ["[laughter]", "Hello,", "Mia.", "I", "am", "Dino", "Dot."];
    expect(alignWords(tokens, spoken)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("keeps going when a word does not match", () => {
    const tokens = displayTokens("It was 3 o'clock.");
    expect(alignWords(tokens, ["It", "was", "three", "o'clock."])).toEqual([0, 1, 2, 3]);
  });

  it("finds the active token for a time", () => {
    const starts = [0.1, 0.5, 0.9];
    const map = [0, 1, 2];
    expect(activeToken(starts, map, 0)).toBe(-1);
    expect(activeToken(starts, map, 0.6)).toBe(1);
    expect(activeToken(starts, map, 5)).toBe(2);
  });
});
