const STRONG: [RegExp, number][] = [
  [/\b(first|1st|number one|number 1)\b/, 0],
  [/\b(second|2nd|number two|number 2)\b/, 1],
];
const BARE: [RegExp, number][] = [
  [/\b(one|1)\b/, 0],
  [/\b(two|2)\b/, 1],
];

const STOP = new Set(
  "a an the to of and or in on at for with go goes going let lets us we i want should she he they them it its is be do does the hero choose pick this that one two first second number please yes".split(" "),
);

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "");

export function matchChoice(transcript: string, choices: string[]): number | null {
  if (choices.length !== 2) return null;
  const said = words(transcript);
  if (!said.length) return null;
  const text = said.join(" ");

  const content = (c: string) => new Set(words(c).filter((w) => !STOP.has(w)).map(stem));
  const a = content(choices[0]!);
  const b = content(choices[1]!);
  const heard = new Set(said.filter((w) => !STOP.has(w)).map(stem));
  const score = (set: Set<string>) => [...heard].filter((w) => set.has(w) && !(set === a ? b : a).has(w)).length;
  const sa = score(a);
  const sb = score(b);
  if (sa > sb) return 0;
  if (sb > sa) return 1;

  if (sa === 0) {
    for (const list of [STRONG, BARE]) {
      const hits = list.filter(([re]) => re.test(text)).map(([, i]) => i);
      if (hits.length === 1) return hits[0]!;
      if (hits.length > 1) return null;
    }
  }
  return null;
}
