import { Platform } from "react-native";
import type { EntryAnalysis, Recap, RecapEntry } from "./schema";
import { bytesToPlayableUri } from "./audio-file";

export class ApiError extends Error {}

async function readError(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => null);
  throw new ApiError(typeof body?.error === "string" ? body.error : `${fallback} (${res.status})`);
}

async function postJson<T>(path: string, body: unknown, fallback: string): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) return readError(res, fallback);
  return (await res.json()) as T;
}

export async function health(): Promise<{ cartesia: boolean; llm: boolean }> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new ApiError("The API routes are not reachable");
  return res.json();
}

export async function transcribe(uri: string): Promise<{ text: string; duration: number | null }> {
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
    form.append("file", blob, `entry.${ext}`);
  } else {
    form.append("file", { uri, name: "entry.m4a", type: "audio/m4a" } as unknown as Blob);
  }
  const res = await fetch("/api/transcribe", { method: "POST", body: form });
  if (!res.ok) return readError(res, "Transcription failed");
  return res.json();
}

export function analyze(transcript: string): Promise<EntryAnalysis> {
  return postJson("/api/analyze", { transcript }, "Could not write a title and reflection");
}

export function writeRecap(entries: RecapEntry[]): Promise<Recap> {
  return postJson("/api/recap", { entries }, "Could not write the recap");
}

export type VoiceOption = { id: string; name: string; tagline: string };

export async function listVoices(): Promise<VoiceOption[]> {
  const res = await fetch("/api/voices");
  if (!res.ok) return readError(res, "Could not load voices");
  return ((await res.json()) as { voices: VoiceOption[] }).voices;
}

export async function speak(text: string, voiceId: string, name: string): Promise<string> {
  const res = await fetch("/api/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voiceId }) });
  if (!res.ok) return readError(res, "Could not record the voice");
  return bytesToPlayableUri(await res.arrayBuffer(), name);
}
