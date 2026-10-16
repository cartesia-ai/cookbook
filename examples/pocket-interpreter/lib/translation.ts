import { isLang, type Lang } from "./languages";

export function createReplyParser(pair: readonly [Lang, Lang]) {
  let head = "";
  let lang: Lang | null = null;
  let started = false;

  return {
    get lang() {
      return lang;
    },
    push(chunk: string): string {
      if (started) return chunk;
      head += chunk;
      const nl = head.indexOf("\n");
      if (nl === -1) {
        if (head.length < 12) return "";
        started = true;
        return head;
      }
      started = true;
      const code = head.slice(0, nl).trim().toLowerCase().replace(/[^a-z]/g, "");
      lang = isLang(code) && pair.includes(code) ? code : null;
      return lang ? head.slice(nl + 1).replace(/^\s+/, "") : head;
    },
    end(): string {
      if (started) return "";
      started = true;
      return head;
    },
  };
}

export function takeSentences(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let rest = buffer;
  for (;;) {
    const m = rest.match(/^([\s\S]*?(?:[.!?](?=\s)|[。！？।]))\s*/);
    if (!m || !m[1]!.trim()) break;
    sentences.push(m[1]!.trim());
    rest = rest.slice(m[0].length);
  }
  return { sentences, rest };
}

export function guessByScript(text: string, pair: readonly [Lang, Lang]): Lang | null {
  if (pair.includes("ja") && /[぀-ヿ一-鿿]/.test(text)) return "ja";
  if (pair.includes("hi") && /[ऀ-ॿ]/.test(text)) return "hi";
  return null;
}
