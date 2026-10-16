import { analyze, transcribe } from "./api";
import { newId, type Entry } from "./journal";
import { saveEntry, updateEntry } from "./store";

export const ENTRY_STEPS = ["Uploading the recording", "Transcribing with Ink", "Writing a title and reflection"];

export class NothingHeardError extends Error {
  constructor() {
    super("No speech was heard in that recording. Try again a little closer to the mic.");
  }
}

export async function createEntry(
  uri: string,
  durationSec: number,
  onStep: (i: number) => void,
): Promise<{ entry: Entry; analysisError?: string }> {
  onStep(0);
  const pending = transcribe(uri);
  onStep(1);
  const { text, duration } = await pending;
  if (!text) throw new NothingHeardError();

  const entry: Entry = {
    id: newId(),
    createdAt: new Date().toISOString(),
    durationSec: duration ?? durationSec,
    transcript: text,
    title: null,
    mood: null,
    reflection: null,
  };
  await saveEntry(entry);

  onStep(2);
  try {
    const a = await analyze(text);
    await updateEntry(entry.id, { title: a.title, mood: a.mood, reflection: a.reflection });
    onStep(3);
    return { entry: { ...entry, title: a.title, mood: a.mood, reflection: a.reflection } };
  } catch (err) {
    return { entry, analysisError: err instanceof Error ? err.message : "Could not write a title and reflection" };
  }
}

export async function retryAnalysis(entry: Entry): Promise<void> {
  const a = await analyze(entry.transcript);
  await updateEntry(entry.id, { title: a.title, mood: a.mood, reflection: a.reflection });
}
