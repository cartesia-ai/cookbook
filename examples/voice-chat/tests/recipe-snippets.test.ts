import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RECIPE = new URL("../../../content/cookbook/15-agents/02-voice-chat.mdx", import.meta.url);
const MAP: Record<string, string> = {
  "byo-snippets/token-route.ts": "token-route.ts",
  "byo-snippets/chat-route.ts": "chat-route.ts",
  "byo-snippets/mic.ts": "mic.ts",
  "byo-snippets/listen.ts": "listen.ts",
  "byo-snippets/speak.ts": "speak.ts",
  "byo-snippets/session.ts": "session.ts",
};

function blocks(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /^```\w+ filename="([^"]+)"\n([\s\S]*?)\n```$/gm;
  for (const m of text.matchAll(re)) out.set(m[1]!, m[2]!);
  return out;
}

describe.skipIf(!existsSync(RECIPE))("recipe snippets", () => {
  const found = existsSync(RECIPE) ? blocks(readFileSync(RECIPE, "utf8")) : new Map<string, string>();
  for (const [name, file] of Object.entries(MAP)) {
    it(`${name} matches byo-snippets/${file}`, () => {
      const source = readFileSync(new URL(`../byo-snippets/${file}`, import.meta.url), "utf8").trimEnd();
      expect(found.get(name)).toBe(source);
    });
  }
});
