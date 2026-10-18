import { describe, expect, it, vi } from "vitest";
import { createSessionGate } from "@/lib/session-gate";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createSessionGate", () => {
  it("stops a session that finishes starting after stop() was called", async () => {
    const gate = createSessionGate<{ stop: () => void }>();
    const d = deferred<{ stop: () => void }>();
    const started = gate.start(() => d.promise);
    expect(gate.busy).toBe(true);
    await gate.stop();
    const session = { stop: vi.fn() };
    d.resolve(session);
    expect(await started).toBeNull();
    expect(session.stop).toHaveBeenCalledOnce();
    expect(gate.busy).toBe(false);
  });

  it("lets a new start run after a cancelled one", async () => {
    const gate = createSessionGate<{ stop: () => void }>();
    const first = deferred<{ stop: () => void }>();
    const a = gate.start(() => first.promise);
    await gate.stop();
    const second = { stop: vi.fn() };
    const b = gate.start(async () => second);
    const old = { stop: vi.fn() };
    first.resolve(old);
    expect(await a).toBeNull();
    expect(await b).toBe(second);
    expect(old.stop).toHaveBeenCalledOnce();
    expect(second.stop).not.toHaveBeenCalled();
    await gate.stop();
    expect(second.stop).toHaveBeenCalledOnce();
  });

  it("ignores a second start while one is pending", async () => {
    const gate = createSessionGate<{ stop: () => void }>();
    const d = deferred<{ stop: () => void }>();
    const open = vi.fn(() => d.promise);
    void gate.start(open);
    expect(await gate.start(open)).toBeNull();
    expect(open).toHaveBeenCalledOnce();
  });

  it("rethrows a start failure unless it was cancelled", async () => {
    const gate = createSessionGate<{ stop: () => void }>();
    await expect(gate.start(async () => Promise.reject(new Error("denied")))).rejects.toThrow("denied");
    expect(gate.busy).toBe(false);
    const d = deferred<{ stop: () => void }>();
    const cancelled = gate.start(() => d.promise);
    await gate.stop();
    d.reject(new Error("late"));
    expect(await cancelled).toBeNull();
  });
});
