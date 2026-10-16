import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Meeting } from "@/lib/schema";

const make = (id: string, createdAt: number): Meeting => ({
  id,
  createdAt,
  title: `Meeting ${id}`,
  language: "en",
  status: "ready",
  decisions: [],
  actionItems: [],
});

beforeEach(() => {
  vi.resetModules();
});

describe("store with IndexedDB", () => {
  it("saves, lists newest first, gets, updates and deletes", async () => {
    const s = await import("@/lib/store");
    await s.saveMeeting(make("a", 1));
    await s.saveMeeting(make("b", 2));
    expect((await s.listMeetings()).map((m) => m.id)).toEqual(["b", "a"]);
    expect((await s.getMeeting("a"))?.title).toBe("Meeting a");

    await s.updateMeeting("a", (m) => ({ ...m, title: "Renamed" }));
    expect((await s.getMeeting("a"))?.title).toBe("Renamed");

    await s.deleteMeeting("a");
    expect(await s.getMeeting("a")).toBeUndefined();
    expect((await s.listMeetings()).map((m) => m.id)).toEqual(["b"]);
  });
});

describe("store without IndexedDB", () => {
  it("falls back to memory for the session", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const s = await import("@/lib/store");
    await s.saveMeeting(make("x", 1));
    expect((await s.listMeetings()).map((m) => m.id)).toEqual(["x"]);
    expect((await s.getMeeting("x"))?.id).toBe("x");
    await s.deleteMeeting("x");
    expect(await s.listMeetings()).toEqual([]);
    vi.unstubAllGlobals();
  });
});
