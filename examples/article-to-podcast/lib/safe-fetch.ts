import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;

export class FetchBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchBlockedError";
  }
}

type Resolved = { address: string; family: number };
export type Resolver = (hostname: string) => Promise<Resolved[]>;

export type RequestFn = (
  url: URL,
  opts: { lookup: http.RequestOptions["lookup"]; signal: AbortSignal },
) => Promise<{
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array>;
}>;

const defaultResolver: Resolver = (hostname) =>
  dns.promises.lookup(hostname, { all: true }) as Promise<Resolved[]>;

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((n, part) => n * 256 + Number(part), 0);
}

const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function blockedV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return BLOCKED_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return ((n & mask) >>> 0) === ((ipv4ToInt(base) & mask) >>> 0);
  });
}

function expandV6(ip: string): number[] | null {
  let addr = ip.split("%")[0];
  const tail = addr.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const n = ipv4ToInt(tail[1]);
    addr = addr.slice(0, -tail[1].length) + ((n >>> 16) & 0xffff).toString(16) + ":" + (n & 0xffff).toString(16);
  }
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : fill < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? fill : 0).fill("0"), ...rest];
  const out = groups.map((g) => parseInt(g, 16));
  return out.length === 8 && out.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? out : null;
}

export function isBlockedAddress(raw: string): boolean {
  const ip = raw.replace(/^\[|\]$/g, "");
  if (net.isIPv4(ip)) return blockedV4(ip);
  if (!net.isIPv6(ip)) return true;
  const g = expandV6(ip);
  if (!g) return true;
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    const v4 = `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
    if (g[5] === 0xffff || g.slice(6).some((x) => x !== 0)) return blockedV4(v4);
  }
  if (g.every((x) => x === 0)) return true;
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true;
  if ((g[0] & 0xfe00) === 0xfc00) return true;
  if ((g[0] & 0xffc0) === 0xfe80) return true;
  if ((g[0] & 0xff00) === 0xff00) return true;
  return false;
}

export function assertAllowedUrl(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchBlockedError("Only http and https links are supported.");
  }
  if (url.username || url.password) throw new FetchBlockedError("Links with credentials are not supported.");
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  if (port !== "80" && port !== "443") throw new FetchBlockedError("Only ports 80 and 443 are supported.");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost")) throw new FetchBlockedError("That address is not allowed.");
  const bare = host.replace(/^\[|\]$/g, "");
  if ((net.isIP(bare) !== 0) && isBlockedAddress(bare)) throw new FetchBlockedError("That address is not allowed.");
}

export function guardedLookup(resolve: Resolver): NonNullable<http.RequestOptions["lookup"]> {
  return ((hostname: string, options: { all?: boolean }, cb: (...args: unknown[]) => void) => {
    resolve(hostname).then(
      (addrs) => {
        if (addrs.length === 0 || addrs.some((a) => isBlockedAddress(a.address))) {
          cb(new FetchBlockedError("That address is not allowed."));
          return;
        }
        if (options?.all) cb(null, addrs);
        else cb(null, addrs[0].address, addrs[0].family);
      },
      (err) => cb(err),
    );
  }) as NonNullable<http.RequestOptions["lookup"]>;
}

const nodeRequest: RequestFn = (url, { lookup, signal }) =>
  new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        lookup,
        signal,
        headers: { "user-agent": "cartesia-cookbook-article-to-podcast/0.1", accept: "text/html,text/plain;q=0.9" },
      },
      (res) => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: res }),
    );
    req.on("error", reject);
    req.end();
  });

export type SafeFetchOptions = { resolve?: Resolver; request?: RequestFn; signal?: AbortSignal };

export type FetchedPage = { url: string; contentType: string; body: string };

async function readCapped(body: AsyncIterable<Uint8Array>): Promise<string> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body) {
    total += chunk.byteLength;
    if (total > MAX_BYTES) throw new FetchBlockedError("That page is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function safeFetch(input: string, opts: SafeFetchOptions = {}): Promise<FetchedPage> {
  const resolve = opts.resolve ?? defaultResolver;
  const request = opts.request ?? nodeRequest;
  const lookup = guardedLookup(resolve);
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([timeout, opts.signal]) : timeout;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new FetchBlockedError("That is not a valid link.");
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    assertAllowedUrl(url);
    const res = await request(url, { lookup, signal });
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      for await (const _ of res.body) break;
      const location = Array.isArray(res.headers.location) ? res.headers.location[0] : res.headers.location;
      try {
        url = new URL(location, url);
      } catch {
        throw new FetchBlockedError("That page redirected somewhere invalid.");
      }
      continue;
    }
    if (res.status < 200 || res.status >= 300) throw new FetchBlockedError(`The page answered with HTTP ${res.status}.`);
    const raw = res.headers["content-type"];
    const contentType = String(Array.isArray(raw) ? raw[0] : raw ?? "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new FetchBlockedError("That link is not an HTML or text page.");
    }
    return { url: url.toString(), contentType, body: await readCapped(res.body) };
  }
  throw new FetchBlockedError("That page redirected too many times.");
}
