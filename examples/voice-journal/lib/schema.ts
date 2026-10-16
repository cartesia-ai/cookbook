import { z } from "zod";

export const MOODS = [
  "joyful",
  "grateful",
  "calm",
  "hopeful",
  "neutral",
  "tired",
  "stressed",
  "anxious",
  "sad",
  "frustrated",
] as const;

export type Mood = (typeof MOODS)[number];

export const EntryAnalysisSchema = z.object({
  title: z.string().describe("A short title for the entry, 2 to 6 words, sentence case, no quotes, no trailing period"),
  mood: z.enum(MOODS).describe("The single mood that fits the entry best"),
  reflection: z
    .string()
    .describe("One sentence, at most 30 words, that reflects back something the writer said. Second person."),
});

export type EntryAnalysis = z.infer<typeof EntryAnalysisSchema>;

export const RecapSchema = z.object({
  title: z.string().describe("A title for the week, 2 to 6 words, sentence case"),
  text: z.string().describe("The recap, 120 to 200 words, plain prose meant to be read aloud"),
});

export type Recap = z.infer<typeof RecapSchema>;

export const RecapEntrySchema = z.object({
  day: z.string().max(40),
  title: z.string().max(120),
  mood: z.enum(MOODS),
  transcript: z.string().max(12_000),
});

export const RecapRequestSchema = z.object({
  entries: z.array(RecapEntrySchema).min(1).max(30),
});

export type RecapEntry = z.infer<typeof RecapEntrySchema>;

export const MOOD_LABELS: Record<Mood, string> = {
  joyful: "Joyful",
  grateful: "Grateful",
  calm: "Calm",
  hopeful: "Hopeful",
  neutral: "Neutral",
  tired: "Tired",
  stressed: "Stressed",
  anxious: "Anxious",
  sad: "Sad",
  frustrated: "Frustrated",
};
