import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../lib/rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit, then blocks, then recovers after the window", () => {
    let t = 0;
    const allow = createRateLimiter(3, 1000, () => t);
    expect([allow("a"), allow("a"), allow("a"), allow("a")]).toEqual([true, true, true, false]);
    expect(allow("b")).toBe(true);
    t = 999;
    expect(allow("a")).toBe(false);
    t = 1000;
    expect(allow("a")).toBe(true);
  });
});
