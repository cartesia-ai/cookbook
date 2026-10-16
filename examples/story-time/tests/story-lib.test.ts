import { describe, expect, it } from "vitest";
import { castVoices, voiceFor } from "@/lib/cast";
import { cleanHeroName, cleanThemes, looksUnsafe } from "@/lib/safety";
import { VOICES } from "@/lib/story";

describe("cleanHeroName", () => {
  it("keeps short names with letters", () => {
    expect(cleanHeroName("  Mia ")).toBe("Mia");
    expect(cleanHeroName("Anne-Marie")).toBe("Anne-Marie");
    expect(cleanHeroName("Zoë")).toBe("Zoë");
    expect(cleanHeroName("Mary Jane")).toBe("Mary Jane");
  });
  it("rejects anything else", () => {
    for (const bad of ["", "1337", "Mia!", "<b>Mia</b>", "a b c d", "x".repeat(30), 42]) expect(cleanHeroName(bad)).toBeNull();
  });
});

describe("cleanThemes", () => {
  it("accepts one or two presets", () => {
    expect(cleanThemes(["space"])).toEqual(["space"]);
    expect(cleanThemes(["space", "ocean"])).toEqual(["space", "ocean"]);
  });
  it("rejects free text and too many", () => {
    expect(cleanThemes(["space", "zombies"])).toBeNull();
    expect(cleanThemes(["space", "ocean", "farm"])).toBeNull();
    expect(cleanThemes([])).toBeNull();
  });
});

describe("looksUnsafe", () => {
  it("flags blocked words but not their innocent neighbours", () => {
    expect(looksUnsafe("The dragon had a sword and a knife")).toBe(true);
    expect(looksUnsafe("Mia skipped to the hilltop and said hello")).toBe(false);
  });
});

describe("castVoices", () => {
  const lines = (...speakers: string[]) => speakers.map((speaker) => ({ speaker, emotion: "calm" as const, text: "Hi." }));
  it("gives each character a voice and keeps it", () => {
    const cast = castVoices({}, "marian", lines("Narrator", "Mia", "Pip", "mia"));
    expect(Object.keys(cast)).toEqual(["mia", "pip"]);
    expect(cast.mia).not.toBe(cast.pip);
    expect(castVoices(cast, "marian", lines("Pip", "Olly")).pip).toBe(cast.pip);
  });
  it("never gives a character the narrator's voice", () => {
    const cast = castVoices({}, "leo", lines("A", "B", "C", "D", "E", "F", "G"));
    expect(Object.values(cast)).not.toContain("leo");
    expect(voiceFor("narrator", cast, "leo")).toBe(VOICES.leo.id);
  });
});
