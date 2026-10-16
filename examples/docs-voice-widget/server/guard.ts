export interface WindowRule {
  limit: number;
  windowMs: number;
}

export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }[]>();

  constructor(
    private readonly rules: WindowRule[],
    private readonly now: () => number = Date.now,
  ) {}

  take(key: string): number {
    const t = this.now();
    let windows = this.hits.get(key);
    if (!windows) {
      windows = this.rules.map((r) => ({ count: 0, resetAt: t + r.windowMs }));
      this.hits.set(key, windows);
    }
    let retry = 0;
    this.rules.forEach((rule, i) => {
      const w = windows![i]!;
      if (t >= w.resetAt) {
        w.count = 0;
        w.resetAt = t + rule.windowMs;
      }
      if (w.count >= rule.limit) retry = Math.max(retry, Math.ceil((w.resetAt - t) / 1000));
    });
    if (retry > 0) return retry;
    for (const w of windows) w.count++;
    if (this.hits.size > 10_000) this.sweep(t);
    return 0;
  }

  private sweep(t: number): void {
    for (const [key, windows] of this.hits) {
      if (windows.every((w) => t >= w.resetAt)) this.hits.delete(key);
    }
  }
}

export function parseOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, '').toLowerCase())
    .filter(Boolean);
}

export function originAllowed(origin: string | undefined | null, allowed: string[], selfOrigin: string): boolean {
  if (!origin) return false;
  const o = origin.replace(/\/+$/, '').toLowerCase();
  if (o === selfOrigin.toLowerCase()) return true;
  return allowed.includes(o);
}

export function lastForwardedFor(header: string | undefined): string | undefined {
  const last = header?.split(',').at(-1)?.trim();
  return last || undefined;
}
