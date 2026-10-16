import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const recipePath = join(root, "../../content/cookbook/01-next/20-transcribe-and-summarize-meetings.mdx");
const inMonorepo = existsSync(recipePath);
const recipe = inMonorepo ? readFileSync(recipePath, "utf8") : "";

const blocks = [...recipe.matchAll(/```\w+ filename="([^"]+)"\n([\s\S]*?)\n```/g)];

describe.skipIf(!inMonorepo)("recipe code", () => {
  it("has the three blocks", () => {
    expect(blocks.map((b) => b[1])).toEqual(["app/api/transcribe/route.ts", "app/api/summarize/route.ts", "app/page.tsx"]);
  });

  for (const [, name, body] of blocks) {
    it(`${name} matches recipe-snippets`, () => {
      const file = readFileSync(join(root, "recipe-snippets", name), "utf8").trimEnd();
      expect(body).toBe(file);
    });
  }
});
