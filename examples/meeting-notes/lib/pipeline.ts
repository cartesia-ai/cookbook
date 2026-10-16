"use client";

import { getMeeting, newMeetingId, saveMeeting, updateMeeting } from "@/lib/store";
import type { Meeting, MeetingNotes } from "@/lib/schema";

const active = new Set<string>();

export function isProcessing(id: string): boolean {
  return active.has(id);
}

export function effectiveMeeting(m: Meeting): Meeting {
  if ((m.status === "transcribing" || m.status === "summarizing") && !active.has(m.id)) {
    return { ...m, status: "error", error: m.error ?? "Processing was interrupted. The page was reloaded." };
  }
  return m;
}

async function postJson<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error("Could not reach the server");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : `Request failed (${res.status})`);
  return body as T;
}

function defaultTitle(at: number): string {
  return `Meeting, ${new Date(at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

export async function startMeeting(
  audio: Blob,
  filename: string,
  language: string,
  durationHint?: number,
): Promise<string> {
  const id = newMeetingId();
  const createdAt = Date.now();
  await saveMeeting({
    id,
    createdAt,
    title: defaultTitle(createdAt),
    language,
    durationSec: durationHint,
    status: "transcribing",
    decisions: [],
    actionItems: [],
  });
  active.add(id);
  void run(id, audio, filename, language);
  return id;
}

async function run(id: string, audio: Blob, filename: string, language: string) {
  try {
    const form = new FormData();
    form.append("file", audio, filename);
    form.append("language", language);
    const t = await postJson<{ transcript: string; duration: number | null }>("/api/transcribe", {
      method: "POST",
      body: form,
    });
    await updateMeeting(id, (m) => ({
      ...m,
      transcript: t.transcript,
      durationSec: t.duration ?? m.durationSec,
      status: "summarizing",
    }));
    await summarize(id, t.transcript, language);
  } catch (err) {
    await fail(id, err);
  } finally {
    active.delete(id);
  }
}

async function summarize(id: string, transcript: string, language: string) {
  if (!transcript.trim()) {
    await updateMeeting(id, (m) => ({
      ...m,
      status: "error",
      error: "No speech was detected in the audio.",
    }));
    return;
  }
  const notes = await postJson<MeetingNotes>("/api/summarize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transcript, language }),
  });
  await updateMeeting(id, (m) => ({
    ...m,
    title: notes.title || m.title,
    summary: notes.summary,
    decisions: notes.decisions,
    actionItems: notes.actionItems.map((a) => ({
      id: crypto.randomUUID(),
      task: a.task,
      owner: a.owner,
      done: false,
    })),
    status: "ready",
    error: undefined,
  }));
}

async function fail(id: string, err: unknown) {
  const message = err instanceof Error ? err.message : "Something went wrong";
  await updateMeeting(id, (m) => ({ ...m, status: "error", error: message }));
}

export async function retrySummary(id: string): Promise<void> {
  const m = await getMeeting(id);
  if (!m?.transcript) return;
  active.add(id);
  try {
    await updateMeeting(id, (cur) => ({ ...cur, status: "summarizing", error: undefined }));
    await summarize(id, m.transcript, m.language);
  } catch (err) {
    await fail(id, err);
  } finally {
    active.delete(id);
  }
}
