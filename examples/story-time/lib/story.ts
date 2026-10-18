import { z } from "zod";

export const TOTAL_SCENES = 3;

export const THEMES = [
  { value: "space", label: "Space" },
  { value: "forest", label: "Enchanted forest" },
  { value: "ocean", label: "Under the sea" },
  { value: "dragons", label: "Dragons" },
  { value: "dinosaurs", label: "Dinosaurs" },
  { value: "robots", label: "Robots" },
  { value: "castle", label: "Castles" },
  { value: "city", label: "Big city" },
] as const;

export type ThemeValue = (typeof THEMES)[number]["value"];

export const TONES = [
  { value: "cozy", label: "Cozy", prompt: "warm and gentle, with small stakes" },
  { value: "funny", label: "Funny", prompt: "playful and silly, with jokes and comic timing" },
  { value: "adventure", label: "Adventure", prompt: "brisk and exciting, with a clear goal and mild peril" },
  { value: "mystery", label: "Mystery", prompt: "curious and a little eerie, with clues that pay off" },
] as const;
export type Tone = (typeof TONES)[number]["value"];

export const VOICES = {
  marian: { id: "26403c37-80c1-4a1a-8692-540551ca2ae5", name: "Marian", hint: "Calm storyteller" },
  dana: { id: "cc00e582-ed66-4004-8336-0175b85c85f6", name: "Dana", hint: "Clear and gentle" },
  leo: { id: "0834f3df-e650-4766-a20c-5a93a43aa6e3", name: "Leo", hint: "Warm and friendly" },
  maya: { id: "cbaf8084-f009-4838-a096-07ee2e6612b1", name: "Maya", hint: "Bright and friendly" },
  kyle: { id: "c961b81c-a935-4c17-bfb3-ba2239de8c2f", name: "Kyle", hint: "Warm" },
  tessa: { id: "6ccbfb76-1fc6-48f7-b71d-91ac6298247b", name: "Tessa", hint: "Cheerful" },
  jace: { id: "6776173b-fd72-460d-89b3-d85812ee518d", name: "Jace", hint: "Easygoing" },
} as const;

export type VoiceKey = keyof typeof VOICES;
export const NARRATORS: VoiceKey[] = ["marian", "dana", "leo"];
export const CHARACTER_POOL: VoiceKey[] = ["maya", "leo", "tessa", "kyle", "jace", "dana", "marian"];

export const EMOTIONS = [
  "neutral",
  "calm",
  "content",
  "peaceful",
  "happy",
  "excited",
  "curious",
  "surprised",
  "affectionate",
  "mysterious",
  "sad",
  "scared",
] as const;
export type Emotion = (typeof EMOTIONS)[number];

export const NARRATOR = "Narrator";

export const SceneSchema = z.object({
  title: z.string().describe("Story title, 2 to 6 words. Repeat the same title in every scene."),
  lines: z
    .array(
      z.object({
        speaker: z.string().describe('"Narrator" or the name of the character who speaks the line'),
        emotion: z.enum(EMOTIONS).describe("How the line should sound. Must match the words."),
        text: z.string().describe("One or two short sentences"),
      }),
    )
    .describe("4 to 7 lines"),
  choices: z
    .array(z.string().describe("What the hero could do next, 3 to 8 words"))
    .describe("Exactly 2 choices, or an empty array in the last scene"),
});

export type Scene = z.infer<typeof SceneSchema>;
export type Line = Scene["lines"][number];

export type WordTiming = { word: string; start: number; end: number };

export type SceneAudio = {
  sampleRate: number;
  pcm: ArrayBuffer;
  lines: { offset: number; words: WordTiming[] }[];
};

export type SceneRecord = {
  lines: Line[];
  choices: string[];
  chosen?: number;
  audio?: SceneAudio;
};

export type Story = {
  id: string;
  createdAt: number;
  hero: string;
  themes: ThemeValue[];
  tone: Tone;
  narrator: VoiceKey;
  title: string;
  cast: Record<string, VoiceKey>;
  scenes: SceneRecord[];
};

export function isFinished(story: Story): boolean {
  return story.scenes.length >= TOTAL_SCENES && story.scenes[story.scenes.length - 1]!.choices.length === 0;
}

export function themeLabel(themes: ThemeValue[]): string {
  const text = themes.map((t) => THEMES.find((x) => x.value === t)?.label ?? t).join(" and ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
