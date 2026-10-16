import { describe, expect, it } from "vitest";
import { entriesInRange, formatDuration, groupByDay, lastSevenDays, searchEntries, toRecapEntries, type Entry } from "@/lib/journal";

const now = new Date(2026, 9, 16, 21, 0);
function entry(id: string, daysAgo: number, hour: number, patch: Partial<Entry> = {}): Entry {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return { id, createdAt: d.toISOString(), durationSec: 30, transcript: `transcript ${id}`, title: `Title ${id}`, mood: "calm", reflection: "r", ...patch };
}

describe("groupByDay", () => {
  it("puts newest days and entries first and labels today and yesterday", () => {
    const groups = groupByDay([entry("a", 2, 9), entry("b", 0, 8), entry("c", 0, 20), entry("d", 1, 12)], now);
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday", "Wed, Oct 14"]);
    expect(groups[0].entries.map((e) => e.id)).toEqual(["c", "b"]);
  });
});

describe("searchEntries", () => {
  const list = [entry("a", 0, 9, { transcript: "Went running in the park" }), entry("b", 0, 10, { mood: "anxious", transcript: "Deadline" })];
  it("matches every word across fields, case-insensitive", () => {
    expect(searchEntries(list, "RUNNING park").map((e) => e.id)).toEqual(["a"]);
    expect(searchEntries(list, "anxious").map((e) => e.id)).toEqual(["b"]);
    expect(searchEntries(list, "running deadline")).toEqual([]);
  });
  it("returns everything for an empty query", () => {
    expect(searchEntries(list, "  ")).toHaveLength(2);
  });
});

describe("week window", () => {
  it("covers six days back through the end of today", () => {
    const { from, to } = lastSevenDays(now);
    const inside = entriesInRange([entry("old", 7, 12), entry("first", 6, 0), entry("late", 0, 23)], from, to);
    expect(inside.map((e) => e.id)).toEqual(["first", "late"]);
  });

  it("sends only analyzed entries, oldest first, with a spoken day label", () => {
    const out = toRecapEntries([entry("a", 3, 9), entry("b", 1, 9, { title: null, mood: null }), entry("c", 0, 9)]);
    expect(out.map((e) => e.title)).toEqual(["Title a", "Title c"]);
    expect(out[1].day).toBe("Friday, October 16");
  });
});

it("formats durations", () => {
  expect(formatDuration(74)).toBe("1:14");
  expect(formatDuration(null)).toBe("");
});
