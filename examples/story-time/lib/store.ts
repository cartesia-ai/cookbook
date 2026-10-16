"use client";

import { createStore, del, entries, get, set, type UseStore } from "idb-keyval";
import { useEffect, useState } from "react";
import type { Story } from "@/lib/story";

const memory = new Map<string, Story>();
const listeners = new Set<() => void>();
let idb: UseStore | null | undefined;

function store(): UseStore | null {
  if (idb === undefined) {
    try {
      idb = typeof indexedDB === "undefined" ? null : createStore("cartesia-story-time", "stories");
    } catch {
      idb = null;
    }
  }
  return idb;
}

function notify() {
  for (const fn of [...listeners]) fn();
}

async function tryIdb<T>(fn: (s: UseStore) => Promise<T>): Promise<T | undefined> {
  const s = store();
  if (!s) return undefined;
  try {
    return await fn(s);
  } catch {
    idb = null;
    return undefined;
  }
}

export async function listStories(): Promise<Story[]> {
  const rows = await tryIdb((s) => entries<string, Story>(s));
  if (rows) for (const [, v] of rows) memory.set(v.id, v);
  return [...memory.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export async function getStory(id: string): Promise<Story | undefined> {
  return memory.get(id) ?? (await tryIdb((s) => get<Story>(id, s)));
}

export async function saveStory(story: Story): Promise<void> {
  memory.set(story.id, story);
  await tryIdb((s) => set(story.id, story, s));
  notify();
}

export async function deleteStory(id: string): Promise<void> {
  memory.delete(id);
  await tryIdb((s) => del(id, s));
  notify();
}

function useLoaded<T>(load: () => Promise<T>, deps: unknown[]): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const run = () => void load().then((v) => live && setValue(v));
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

export function useStories(): Story[] | undefined {
  return useLoaded(listStories, []);
}
