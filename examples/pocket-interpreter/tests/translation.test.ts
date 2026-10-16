import { describe, expect, it } from "vitest";
import { createReplyParser, guessByScript, takeSentences } from "@/lib/translation";

function run(chunks: string[], pair: ["en", "es"] | ["en", "ja"] = ["en", "es"]) {
  const p = createReplyParser(pair);
  const text = chunks.map((c) => p.push(c)).join("") + p.end();
  return { lang: p.lang, text };
}

describe("createReplyParser", () => {
  it("reads the language line and passes the translation through", () => {
    expect(run(["es\n¿Dónde está la estación?"])).toEqual({ lang: "es", text: "¿Dónde está la estación?" });
  });

  it("handles a header split across chunks", () => {
    expect(run(["e", "n", "\n", "Where is", " the station?"])).toEqual({ lang: "en", text: "Where is the station?" });
  });

  it("tolerates case, punctuation and CRLF in the header", () => {
    expect(run(["ES:\r\n", "Hola"])).toEqual({ lang: "es", text: "Hola" });
  });

  it("ignores a code outside the pair and keeps the text", () => {
    const r = run(["fr\nBonjour"]);
    expect(r.lang).toBeNull();
    expect(r.text).toBe("fr\nBonjour");
  });

  it("gives up on a header when the model skips the newline", () => {
    expect(run(["Hello there, how are you?"])).toEqual({ lang: null, text: "Hello there, how are you?" });
  });

  it("returns a short reply with no newline at the end", () => {
    expect(run(["Hola"])).toEqual({ lang: null, text: "Hola" });
  });
});

describe("takeSentences", () => {
  it("splits Latin text on stops followed by a space", () => {
    expect(takeSentences("Hola. ¿Qué tal? Bien")).toEqual({ sentences: ["Hola.", "¿Qué tal?"], rest: "Bien" });
  });

  it("does not split a stop that may be a decimal point", () => {
    expect(takeSentences("It costs 3.50 euros")).toEqual({ sentences: [], rest: "It costs 3.50 euros" });
  });

  it("splits Japanese and Hindi without spaces", () => {
    expect(takeSentences("駅はどこですか？近いです")).toEqual({ sentences: ["駅はどこですか？"], rest: "近いです" });
    expect(takeSentences("स्टेशन कहाँ है।पास है")).toEqual({ sentences: ["स्टेशन कहाँ है।"], rest: "पास है" });
  });
});

describe("guessByScript", () => {
  it("spots Japanese and Hindi script", () => {
    expect(guessByScript("駅はどこですか", ["en", "ja"])).toBe("ja");
    expect(guessByScript("नमस्ते", ["hi", "fr"])).toBe("hi");
  });

  it("returns null for Latin script", () => {
    expect(guessByScript("hola", ["en", "es"])).toBeNull();
  });
});
