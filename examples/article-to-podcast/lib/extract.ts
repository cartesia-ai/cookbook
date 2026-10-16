import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";
import { MAX_TEXT_CHARS } from "./config";
import { safeFetch, type SafeFetchOptions } from "./safe-fetch";

export const MIN_ARTICLE_CHARS = 400;

export class UnreadablePageError extends Error {
  constructor(message = "Could not find an article on that page. Paste the text instead.") {
    super(message);
    this.name = "UnreadablePageError";
  }
}

export type Article = {
  title: string;
  source: string;
  text: string;
  truncated: boolean;
};

export function cleanText(input: string): string {
  const lines = input
    .replace(/\r\n?/g, "\n")
    .replace(/https?:\/\/([^\s/)]+)[^\s)]*/g, "$1")
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim());
  const kept = lines.filter((line) => line === "" || line.split(" ").length >= 3);
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function limit(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_TEXT_CHARS) return { text, truncated: false };
  const cut = text.slice(0, MAX_TEXT_CHARS);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("\n"));
  return { text: end > MAX_TEXT_CHARS / 2 ? cut.slice(0, end + 1) : cut, truncated: true };
}

export function parseArticle(html: string, url: string): Article {
  const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
  const parsed = new Readability(dom.window.document).parse();
  dom.window.close();
  const text = cleanText(parsed?.textContent ?? "");
  if (!parsed || text.length < MIN_ARTICLE_CHARS) throw new UnreadablePageError();
  const { text: body, truncated } = limit(text);
  const host = new URL(url).hostname;
  return { title: parsed.title?.trim() || host, source: parsed.siteName?.trim() || host, text: body, truncated };
}

export async function fetchArticle(url: string, opts?: SafeFetchOptions): Promise<Article> {
  const page = await safeFetch(url, opts);
  if (page.contentType.includes("text/plain")) return articleFromText(page.body, new URL(page.url).hostname);
  return parseArticle(page.body, page.url);
}

export function articleFromText(raw: string, source = "Pasted text"): Article {
  const text = cleanText(raw);
  if (text.length < 100) throw new UnreadablePageError("That text is too short to make an episode.");
  const { text: body, truncated } = limit(text);
  const firstLine = body.split("\n")[0].slice(0, 80).trim();
  return { title: firstLine, source, text: body, truncated };
}
