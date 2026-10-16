import type { Correction } from "./corrections";
import type { LanguageCode } from "./languages";
import type { Mode } from "./modes";

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `Request failed (${res.status})`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function createSession(p: { native: LanguageCode; target: LanguageCode; mode: Mode; missionId: number }): Promise<string> {
  const res = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  const body = (await res.json()) as { agentId?: string };
  if (!body.agentId) throw new ApiError("The server answered without an agent.", 502);
  return body.agentId;
}

export async function fetchToken(): Promise<string> {
  const res = await fetch("/api/token", { method: "POST" });
  const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!res.ok || !body.token) throw new ApiError(body.error ?? `Token request failed (${res.status})`, res.status);
  return body.token;
}

export function endSession(agentId: string): void {
  try {
    void fetch("/api/session/end", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ agentId }),
    }).catch(() => undefined);
  } catch {
    // nothing to do; the server sweeps old session agents
  }
}

export async function requestCorrection(
  p: { text: string; target: LanguageCode; native: LanguageCode; mission?: string; recent?: string[] },
  signal?: AbortSignal,
): Promise<Correction> {
  const res = await fetch("/api/correct", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
    signal,
  });
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  return (await res.json()) as Correction;
}
