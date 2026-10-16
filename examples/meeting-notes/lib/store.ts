"use client";

import { createStore, del, entries, get, set, type UseStore } from "idb-keyval";
import { useEffect, useState } from "react";
import type { Meeting } from "@/lib/schema";

const PREFIX = "meeting:";

const memory = new Map<string, Meeting>();
const listeners = new Set<() => void>();

let idb: UseStore | null | undefined;
let idbFailed = false;

function store(): UseStore | null {
  if (idbFailed) return null;
  if (idb === undefined) {
    try {
      idb = createStore("cartesia-meeting-notes", "meetings");
    } catch {
      idb = null;
      idbFailed = true;
    }
  }
  return idb;
}

function notify() {
  for (const fn of [...listeners]) fn();
}

export function newMeetingId(): string {
  return crypto.randomUUID();
}

export async function listMeetings(): Promise<Meeting[]> {
  const s = store();
  if (s) {
    try {
      const rows = await entries<string, Meeting>(s);
      const found = rows.filter(([k]) => typeof k === "string" && k.startsWith(PREFIX)).map(([, v]) => v);
      for (const m of found) memory.set(m.id, m);
      return found.sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      idbFailed = true;
    }
  }
  return [...memory.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export async function getMeeting(id: string): Promise<Meeting | undefined> {
  const s = store();
  if (s) {
    try {
      return await get<Meeting>(PREFIX + id, s);
    } catch {
      idbFailed = true;
    }
  }
  return memory.get(id);
}

export async function saveMeeting(m: Meeting): Promise<void> {
  memory.set(m.id, m);
  const s = store();
  if (s) {
    try {
      await set(PREFIX + m.id, m, s);
    } catch {
      idbFailed = true;
    }
  }
  notify();
}

export async function deleteMeeting(id: string): Promise<void> {
  memory.delete(id);
  const s = store();
  if (s) {
    try {
      await del(PREFIX + id, s);
    } catch {
      idbFailed = true;
    }
  }
  notify();
}

export async function updateMeeting(id: string, patch: (m: Meeting) => Meeting): Promise<Meeting | undefined> {
  const current = await getMeeting(id);
  if (!current) return undefined;
  const next = patch(current);
  await saveMeeting(next);
  return next;
}

function useLoaded<T>(load: () => Promise<T>, deps: unknown[]): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const run = () => {
      load().then((v) => {
        if (live) setValue(v);
      });
    };
    run();
    listeners.add(run);
    return () => {
      live = false;
      listeners.delete(run);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

export function useMeetings(): Meeting[] | undefined {
  return useLoaded(listMeetings, []);
}

export function useMeeting(id: string): Meeting | null | undefined {
  return useLoaded(async () => (await getMeeting(id)) ?? null, [id]);
}
