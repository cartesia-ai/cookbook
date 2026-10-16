import { describe, expect, it } from "vitest";
import { matchChoice } from "@/lib/match-choice";

const choices = ["Peek at the rocket garden", "Wave to the star dino"];

describe("matchChoice", () => {
  it("matches words from a choice", () => {
    expect(matchChoice("the rocket!", choices)).toBe(0);
    expect(matchChoice("wave to the dino", choices)).toBe(1);
    expect(matchChoice("Waving at dinos", choices)).toBe(1);
  });

  it("matches ordinals, with first and second beating a bare one", () => {
    expect(matchChoice("The second one, please.", choices)).toBe(1);
    expect(matchChoice("the first one", choices)).toBe(0);
    expect(matchChoice("two!", choices)).toBe(1);
    expect(matchChoice("number one", choices)).toBe(0);
  });

  it("returns null when unclear", () => {
    expect(matchChoice("", choices)).toBeNull();
    expect(matchChoice("um I don't know", choices)).toBeNull();
    expect(matchChoice("one or two", choices)).toBeNull();
    expect(matchChoice("the rocket and the dino", choices)).toBeNull();
  });

  it("ignores words both choices share", () => {
    expect(matchChoice("the big tree", ["Climb the big tree", "Sit under the big tree"])).toBeNull();
    expect(matchChoice("climb", ["Climb the big tree", "Sit under the big tree"])).toBe(0);
  });
});
