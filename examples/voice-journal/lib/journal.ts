import { MAX_RECAP_ENTRIES, MAX_RECAP_INPUT_CHARS, MAX_TRANSCRIPT_CHARS } from "./limits";
import type { Mood, RecapEntry } from "./schema";

export type Entry = {
  id: string;
  createdAt: string;
  durationSec: number | null;
  transcript: string;
  title: string | null;
  mood: Mood | null;
  reflection: string | null;
};

export type SavedRecap = {
  id: string;
  createdAt: string;
  from: string;
  to: string;
  entryCount: number;
  title: string;
  text: string;
  voiceId: string;
  voiceName: string;
};

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
const LONG_DAY = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });
const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const today = dayKey(now);
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (dayKey(d) === today) return "Today";
  if (dayKey(d) === dayKey(y)) return "Yesterday";
  return WEEKDAY.format(d);
}

export function longDay(iso: string): string {
  return LONG_DAY.format(new Date(iso));
}

export function timeLabel(iso: string): string {
  return TIME.format(new Date(iso));
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "";
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function groupByDay(entries: Entry[], now = new Date()): { key: string; label: string; entries: Entry[] }[] {
  const sorted = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const groups = new Map<string, { key: string; label: string; entries: Entry[] }>();
  for (const e of sorted) {
    const key = dayKey(new Date(e.createdAt));
    let g = groups.get(key);
    if (!g) {
      g = { key, label: dayLabel(e.createdAt, now), entries: [] };
      groups.set(key, g);
    }
    g.entries.push(e);
  }
  return [...groups.values()];
}

export function searchEntries(entries: Entry[], query: string): Entry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return entries;
  return entries.filter((e) => {
    const hay = [e.title, e.mood, e.reflection, e.transcript].filter(Boolean).join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export function lastSevenDays(now = new Date()): { from: Date; to: Date } {
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - 6);
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

export function entriesInRange(entries: Entry[], from: Date, to: Date): Entry[] {
  return entries
    .filter((e) => {
      const t = new Date(e.createdAt).getTime();
      return t >= from.getTime() && t <= to.getTime();
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function recapHeading(e: Pick<RecapEntry, "day" | "title" | "mood">): string {
  return `## ${e.day}: ${e.title} (mood: ${e.mood})`;
}

export function recapPrompt(entries: RecapEntry[]): string {
  return entries.map((e) => `${recapHeading(e)}\n${e.transcript.trim()}`).join("\n\n");
}

export function toRecapEntries(entries: Entry[], max = MAX_RECAP_ENTRIES, budget = MAX_RECAP_INPUT_CHARS): RecapEntry[] {
  const kept = entries
    .filter((e): e is Entry & { title: string; mood: Mood } => Boolean(e.title && e.mood && e.transcript.trim()))
    .slice(-max)
    .map((e) => ({ day: longDay(e.createdAt), title: e.title.slice(0, 120), mood: e.mood, transcript: e.transcript.trim() }));
  if (!kept.length) return [];
  const headings = kept.reduce((n, e) => n + recapHeading(e).length + 1, 0) + 2 * (kept.length - 1);
  const each = Math.min(MAX_TRANSCRIPT_CHARS, Math.max(0, Math.floor((budget - headings) / kept.length)));
  return kept.map((e) => ({ ...e, transcript: e.transcript.slice(0, each).trim() }));
}

const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
export function rangeLabel(from: string | Date, to: string | Date): string {
  return `${SHORT.format(new Date(from))} to ${SHORT.format(new Date(to))}`;
}

export function moodCounts(entries: Entry[]): { mood: Mood; count: number }[] {
  const m = new Map<Mood, number>();
  for (const e of entries) if (e.mood) m.set(e.mood, (m.get(e.mood) ?? 0) + 1);
  return [...m.entries()].map(([mood, count]) => ({ mood, count })).sort((a, b) => b.count - a.count);
}
