import { describe, expect, it } from "vitest";
import { FetchBlockedError, isBlockedAddress, safeFetch, type RequestFn, type Resolver } from "@/lib/safe-fetch";

const publicResolver: Resolver = async () => [{ address: "93.184.216.34", family: 4 }];

type Reply = { status?: number; headers?: Record<string, string>; chunks?: Uint8Array[] };

function fakeRequest(replies: Reply[]): { request: RequestFn; urls: string[] } {
  const urls: string[] = [];
  const request: RequestFn = async (url, { lookup }) => {
    urls.push(url.toString());
    await new Promise<void>((resolve, reject) => {
      (lookup as unknown as (h: string, o: object, cb: (err: Error | null) => void) => void)(url.hostname, {}, (err) =>
        err ? reject(err) : resolve(),
      );
    });
    const reply = replies.shift() ?? { status: 200 };
    return {
      status: reply.status ?? 200,
      headers: { "content-type": "text/html; charset=utf-8", ...reply.headers },
      body: (async function* () {
        for (const c of reply.chunks ?? [new TextEncoder().encode("<html></html>")]) yield c;
      })(),
    };
  };
  return { request, urls };
}

describe("safeFetch blocks", () => {
  const blocked = [
    "file:///etc/passwd",
    "http://localhost/",
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://0.0.0.0/",
    "http://100.64.0.1/",
    "http://user:pw@example.com/",
    "http://example.com:8080/",
    "http://2130706433/",
    "http://[fe80::1]/",
    "http://[fd00::1]/",
    "http://[64:ff9b::a9fe:a9fe]/",
    "http://[64:ff9b::127.0.0.1]/",
    "http://[2002:a00:1::]/",
  ];
  for (const url of blocked) {
    it(url, async () => {
      const { request, urls } = fakeRequest([]);
      await expect(safeFetch(url, { resolve: publicResolver, request })).rejects.toBeInstanceOf(FetchBlockedError);
      expect(urls).toEqual([]);
    });
  }

  it("allows NAT64 and 6to4 forms of a public address", () => {
    expect(isBlockedAddress("64:ff9b::5db8:d822")).toBe(false);
    expect(isBlockedAddress("2002:5db8:d822::1")).toBe(false);
  });

  it("a hostname that resolves to a private address", async () => {
    const { request } = fakeRequest([]);
    const resolve: Resolver = async () => [{ address: "10.0.0.5", family: 4 }];
    await expect(safeFetch("http://rebind.example/", { resolve, request })).rejects.toBeInstanceOf(FetchBlockedError);
  });

  it("a hostname with one public and one private answer", async () => {
    const { request } = fakeRequest([]);
    const resolve: Resolver = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "192.168.1.9", family: 4 },
    ];
    await expect(safeFetch("http://mixed.example/", { resolve, request })).rejects.toBeInstanceOf(FetchBlockedError);
  });

  it("a redirect to a private address", async () => {
    const { request, urls } = fakeRequest([{ status: 302, headers: { location: "http://10.0.0.1/admin" } }]);
    await expect(safeFetch("http://example.com/", { resolve: publicResolver, request })).rejects.toBeInstanceOf(FetchBlockedError);
    expect(urls).toEqual(["http://example.com/"]);
  });

  it("too many redirects", async () => {
    const hop = { status: 302, headers: { location: "http://example.com/next" } };
    const { request } = fakeRequest([hop, hop, hop, hop, hop]);
    await expect(safeFetch("http://example.com/", { resolve: publicResolver, request })).rejects.toBeInstanceOf(FetchBlockedError);
  });

  it("a body over 2 MB", async () => {
    const mb = new Uint8Array(1024 * 1024);
    const { request } = fakeRequest([{ chunks: [mb, mb, mb] }]);
    await expect(safeFetch("http://example.com/", { resolve: publicResolver, request })).rejects.toThrow(/too large/);
  });

  it("a non-text content type", async () => {
    const { request } = fakeRequest([{ headers: { "content-type": "application/pdf" } }]);
    await expect(safeFetch("http://example.com/a.pdf", { resolve: publicResolver, request })).rejects.toBeInstanceOf(FetchBlockedError);
  });
});

describe("safeFetch accepts", () => {
  it("a public page", async () => {
    const html = "<html><body>hello</body></html>";
    const { request } = fakeRequest([{ chunks: [new TextEncoder().encode(html)] }]);
    const page = await safeFetch("https://example.com/post", { resolve: publicResolver, request });
    expect(page.body).toBe(html);
    expect(page.url).toBe("https://example.com/post");
  });

  it("a redirect to another public page", async () => {
    const { request, urls } = fakeRequest([{ status: 301, headers: { location: "/final" } }, {}]);
    const page = await safeFetch("https://example.com/old", { resolve: publicResolver, request });
    expect(urls).toEqual(["https://example.com/old", "https://example.com/final"]);
    expect(page.url).toBe("https://example.com/final");
  });
});
