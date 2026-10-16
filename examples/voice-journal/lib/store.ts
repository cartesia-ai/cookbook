import AsyncStorage from "@react-native-async-storage/async-storage";
import * as React from "react";
import type { Entry, SavedRecap } from "./journal";

const ENTRIES = "voice-journal:entries";
const RECAPS = "voice-journal:recaps";
const SETTINGS = "voice-journal:settings";

export type Settings = { voiceId: string | null; voiceName: string | null };

type State = { loaded: boolean; entries: Entry[]; recaps: SavedRecap[]; settings: Settings };

let state: State = { loaded: false, entries: [], recaps: [], settings: { voiceId: null, voiceName: null } };
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

function emit() {
  for (const l of listeners) l();
}

function parse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function load(): Promise<void> {
  if (!loading) {
    loading = AsyncStorage.multiGet([ENTRIES, RECAPS, SETTINGS]).then((pairs) => {
      const map = Object.fromEntries(pairs);
      state = {
        loaded: true,
        entries: parse<Entry[]>(map[ENTRIES] ?? null, []),
        recaps: parse<SavedRecap[]>(map[RECAPS] ?? null, []),
        settings: { voiceId: null, voiceName: null, ...parse<Partial<Settings>>(map[SETTINGS] ?? null, {}) },
      };
      emit();
    });
  }
  return loading;
}

async function persist(key: string, value: unknown) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function saveEntry(entry: Entry): Promise<void> {
  await load();
  const rest = state.entries.filter((e) => e.id !== entry.id);
  state = { ...state, entries: [entry, ...rest] };
  emit();
  await persist(ENTRIES, state.entries);
}

export async function updateEntry(id: string, patch: Partial<Entry>): Promise<void> {
  await load();
  state = { ...state, entries: state.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
  emit();
  await persist(ENTRIES, state.entries);
}

export async function deleteEntry(id: string): Promise<void> {
  await load();
  state = { ...state, entries: state.entries.filter((e) => e.id !== id) };
  emit();
  await persist(ENTRIES, state.entries);
}

export async function saveRecap(recap: SavedRecap): Promise<void> {
  await load();
  state = { ...state, recaps: [recap, ...state.recaps.filter((r) => r.id !== recap.id)].slice(0, 20) };
  emit();
  await persist(RECAPS, state.recaps);
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await load();
  state = { ...state, settings: { ...state.settings, ...patch } };
  emit();
  await persist(SETTINGS, state.settings);
}

export function getState(): State {
  return state;
}

function subscribe(l: () => void) {
  listeners.add(l);
  void load();
  return () => listeners.delete(l);
}

export function useJournal(): State {
  return React.useSyncExternalStore(subscribe, getState, getState);
}

export function _reset() {
  state = { loaded: false, entries: [], recaps: [], settings: { voiceId: null, voiceName: null } };
  loading = null;
}
