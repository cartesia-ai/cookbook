"use client";

import Cartesia from "@cartesia/cartesia-js";

let ctx: AudioContext | null = null;

export function audioContext(): AudioContext {
  if (!ctx || ctx.state === "closed") ctx = new AudioContext();
  return ctx;
}

export async function unlockAudio(): Promise<void> {
  const c = audioContext();
  if (c.state !== "running") await c.resume().catch(() => {});
}

export function audioUnlocked(): boolean {
  return ctx?.state === "running";
}

export async function cartesiaClient(): Promise<Cartesia> {
  let res: Response;
  try {
    res = await fetch("/api/token", { method: "POST" });
  } catch {
    throw new Error("Could not reach the server");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || typeof body.token !== "string") throw new Error(body.error ?? "Could not get a Cartesia token");
  return new Cartesia({ token: body.token });
}
