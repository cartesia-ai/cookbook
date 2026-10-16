import { THEMES, type ThemeValue } from "./story";

const NAME = /^[\p{L}][\p{L}' -]{0,23}$/u;

export function cleanHeroName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!NAME.test(name)) return null;
  if (name.split(" ").length > 3) return null;
  return name;
}

export function cleanThemes(input: unknown): ThemeValue[] | null {
  if (!Array.isArray(input) || input.length < 1 || input.length > 2) return null;
  const allowed = new Set<string>(THEMES.map((t) => t.value));
  const out = [...new Set(input)].filter((t): t is ThemeValue => typeof t === "string" && allowed.has(t));
  return out.length === input.length ? out : null;
}

const BLOCKED = [
  "kill", "killed", "killing", "murder", "blood", "bloody", "gun", "guns", "knife", "stab", "weapon",
  "dead", "death", "corpse", "suicide", "drug", "drugs", "beer", "wine", "drunk", "sexy", "kiss",
  "hate", "stupid", "idiot", "shut up", "demon", "devil", "hell", "monster ate",
  "fuck", "fucking", "shit", "bitch", "ass", "dick", "cunt", "piss",
  "hitler", "nazi", "nazis", "kkk", "swastika",
];
const BLOCKED_RE = new RegExp(`\\b(${BLOCKED.map((w) => w.replace(/ /g, "\\s+")).join("|")})\\b`, "i");

export function looksUnsafe(text: string): boolean {
  return BLOCKED_RE.test(text);
}
