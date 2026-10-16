export type Speaker = "A" | "B";

export type ScriptLine = { speaker: Speaker; text: string };

export type PodcastScript = { title: string; lines: ScriptLine[] };
