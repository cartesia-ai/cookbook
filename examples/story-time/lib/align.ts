export const LAUGH = "[laughter]";

export function displayTokens(text: string): string[] {
  return text
    .replace(/\[laughter\]/gi, ` ${LAUGH} `)
    .split(/\s+/)
    .filter(Boolean);
}

export function spokenText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const norm = (w: string) => w.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, "");

export function alignWords(tokens: string[], spoken: string[]): number[] {
  const keys = tokens.map(norm);
  const out: number[] = [];
  let at = 0;
  for (const word of spoken) {
    const w = norm(word);
    if (!w || w === "laughter") {
      out.push(Math.max(0, Math.min(at, tokens.length) - 1));
      continue;
    }
    let found = -1;
    for (let j = at; j < Math.min(tokens.length, at + 4); j++) {
      if (keys[j] === LAUGH_KEY) continue;
      if (keys[j] === w || (keys[j] && (keys[j]!.startsWith(w) || w.startsWith(keys[j]!)))) {
        found = j;
        break;
      }
    }
    if (found === -1) {
      while (at < tokens.length && keys[at] === LAUGH_KEY) at++;
      found = Math.min(at, tokens.length - 1);
    }
    out.push(found);
    at = found + 1;
  }
  return out;
}

const LAUGH_KEY = norm(LAUGH);

export function activeToken(starts: number[], tokenOf: number[], t: number): number {
  let idx = -1;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i]! <= t) idx = tokenOf[i] ?? idx;
    else break;
  }
  return idx;
}
