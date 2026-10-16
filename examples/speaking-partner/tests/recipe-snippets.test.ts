import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RECIPE = new URL("../../../content/cookbook/15-agents/03-speaking-partner.mdx", import.meta.url);

function blocks(text: string): [string, string][] {
  const out: [string, string][] = [];
  for (const m of text.matchAll(/^```\w+ filename="([^"]+)"\n([\s\S]*?)\n```$/gm)) out.push([m[1]!, m[2]!]);
  return out;
}

describe.skipIf(!existsSync(RECIPE))("recipe snippets", () => {
  const found = existsSync(RECIPE) ? blocks(readFileSync(RECIPE, "utf8")) : [];

  it("has code blocks to check", () => {
    expect(found.length).toBeGreaterThanOrEqual(8);
  });

  for (const [name, code] of found) {
    it(`${name} is a slice of the real file`, () => {
      const source = readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
      expect(source).toContain(code);
    });
  }
});
