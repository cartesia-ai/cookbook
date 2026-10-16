import { describe, expect, it } from "vitest";
import { COPY, hintFor, LANGS, nativeName, otherOf, VOICES } from "@/lib/languages";
import { translatePrompt } from "@/lib/prompt";

describe("languages", () => {
  it("has copy, names and a voice for every Ink 2 language", () => {
    for (const l of LANGS) {
      expect(VOICES[l].id).toMatch(/^[0-9a-f-]{36}$/);
      for (const m of LANGS) expect(COPY[l].names[m]).toBeTruthy();
    }
  });

  it("writes each side's hint in that side's language", () => {
    expect(hintFor("es", "en")).toBe("Habla en español. La otra persona te escucha en inglés.");
    expect(hintFor("en", "ja")).toBe("Speak English. The other person hears you in Japanese.");
    expect(nativeName("fr")).toBe("Français");
  });

  it("finds the other language of a pair", () => {
    expect(otherOf(["en", "hi"], "hi")).toBe("en");
    expect(otherOf(["en", "hi"], "en")).toBe("hi");
  });

  it("asks the model for the code line first", () => {
    const p = translatePrompt(["en", "es"]);
    expect(p).toContain("English (en) or Spanish (es)");
    expect(p).toContain("alone on the first line");
  });
});
