import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { articleFromText, cleanText, parseArticle, UnreadablePageError } from "@/lib/extract";

const html = readFileSync(new URL("./fixtures/article.html", import.meta.url), "utf8");

describe("parseArticle", () => {
  it("returns the title and body and drops the page chrome", () => {
    const article = parseArticle(html, "https://harbor.example/tides");
    expect(article.title).toContain("tide table");
    expect(article.text).toContain("Wind is the biggest culprit");
    expect(article.text).not.toContain("Subscribe");
    expect(article.text).not.toContain("All rights reserved");
    expect(article.truncated).toBe(false);
  });

  it("throws the unreadable-page error for a near-empty page", () => {
    expect(() => parseArticle("<html><body><p>Hi</p></body></html>", "https://x.example/")).toThrow(UnreadablePageError);
  });

  it("does not run scripts in the page", () => {
    const evil = html.replace("</body>", "<script>globalThis.__ran = true</script></body>");
    parseArticle(evil, "https://harbor.example/tides");
    expect((globalThis as Record<string, unknown>).__ran).toBeUndefined();
  });
});

describe("cleanText", () => {
  it("collapses whitespace, shortens links and drops nav-like lines", () => {
    const out = cleanText("Home\n\nRead more at https://example.com/a/b?c=1 today please.\n\n\n\nShare   this   story now");
    expect(out).toBe("Read more at example.com today please.\n\nShare this story now");
  });
});

describe("articleFromText", () => {
  it("truncates long input and says so", () => {
    const long = "This is a sentence about tides. ".repeat(3000);
    const article = articleFromText(long);
    expect(article.truncated).toBe(true);
    expect(article.text.length).toBeLessThanOrEqual(60_000);
  });

  it("rejects text that is too short", () => {
    expect(() => articleFromText("too short")).toThrow(UnreadablePageError);
  });
});
