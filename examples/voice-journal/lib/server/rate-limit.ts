export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return function allow(key: string): boolean {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((at) => t - at < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(t);
    hits.set(key, recent);
    if (hits.size > 1000) {
      for (const [k, v] of hits) if (v.every((at) => t - at >= windowMs)) hits.delete(k);
    }
    return true;
  };
}

export function clientIp(request: Request): string {
  const forwarded = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (process.env.VERCEL) return forwarded[0] ?? "global";
  if (process.env.TRUST_PROXY === "1") return forwarded[forwarded.length - 1] ?? "global";
  return "global";
}

export function tooManyRequests(headers?: HeadersInit): Response {
  return Response.json({ error: "Too many requests. Try again in a minute." }, { status: 429, headers });
}
