import { beforeEach, describe, expect, it, vi } from "vitest";

const mem = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    multiGet: async (keys: string[]) => keys.map((k) => [k, mem.get(k) ?? null]),
    setItem: async (k: string, v: string) => void mem.set(k, v),
    getItem: async (k: string) => mem.get(k) ?? null,
  },
}));

const store = await import("@/lib/store");

const base = { createdAt: "2026-10-16T10:00:00.000Z", durationSec: 10, transcript: "hi", title: null, mood: null, reflection: null };

describe("store", () => {
  beforeEach(() => {
    mem.clear();
    store._reset();
  });

  it("saves, updates and deletes entries and persists them", async () => {
    await store.saveEntry({ id: "1", ...base });
    await store.updateEntry("1", { title: "Hello", mood: "calm" });
    expect(JSON.parse(mem.get("voice-journal:entries")!)[0]).toMatchObject({ id: "1", title: "Hello", mood: "calm" });

    store._reset();
    await store.load();
    expect(store.getState().entries).toHaveLength(1);

    await store.deleteEntry("1");
    expect(store.getState().entries).toHaveLength(0);
  });

  it("survives corrupt storage", async () => {
    mem.set("voice-journal:entries", "{not json");
    await store.load();
    expect(store.getState().entries).toEqual([]);
  });
});
