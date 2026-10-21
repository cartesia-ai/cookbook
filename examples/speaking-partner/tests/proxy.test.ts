import { tryToParsePath } from "next/dist/lib/try-to-parse-path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "../proxy";

const req = (password?: string) =>
  new NextRequest("http://localhost/", {
    headers: password === undefined ? {} : { authorization: `Basic ${Buffer.from(`any:${password}`).toString("base64")}` },
  });
const passes = (res: Response) => res.headers.get("x-middleware-next") === "1";

afterEach(() => vi.unstubAllEnvs());

describe("proxy", () => {
  it("lets everything through locally when APP_PASSWORD is unset", () => {
    vi.stubEnv("APP_PASSWORD", "");
    vi.stubEnv("VERCEL_ENV", "");
    expect(passes(proxy(req()))).toBe(true);
  });

  it("allows the right password and asks again for a wrong or missing one", () => {
    vi.stubEnv("APP_PASSWORD", "hunter2");
    expect(passes(proxy(req("hunter2")))).toBe(true);
    for (const r of [req("wrong"), req()]) {
      const res = proxy(r);
      expect(res.status).toBe(401);
      expect(res.headers.get("WWW-Authenticate")).toBe('Basic realm="app"');
    }
  });

  it.each(["production", "preview"])("refuses to serve on Vercel %s without APP_PASSWORD", async (env) => {
    vi.stubEnv("APP_PASSWORD", "");
    vi.stubEnv("VERCEL_ENV", env);
    const res = proxy(req());
    expect(res.status).toBe(503);
    expect(await res.text()).toMatch(/Set APP_PASSWORD/);
  });

  it.each(["production", "preview"])("makes the app public on Vercel %s when APP_PASSWORD is none", (env) => {
    vi.stubEnv("APP_PASSWORD", "none");
    vi.stubEnv("VERCEL_ENV", env);
    expect(passes(proxy(req()))).toBe(true);
  });

  const matchers = config.matcher.map((source) => new RegExp(tryToParsePath(source).regexStr!));
  const runsOn = (path: string) => matchers.some((re) => re.test(path));

  it.each(["/", "/api/token", "/story/abc"])("runs on %s", (path) => {
    expect(runsOn(path)).toBe(true);
  });

  it.each(["/_next/static/x.js", "/_next/image", "/favicon.ico"])("skips %s", (path) => {
    expect(runsOn(path)).toBe(false);
  });
});
