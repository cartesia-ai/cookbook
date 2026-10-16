import { z } from "zod";

export const TTS_MODEL = "sonic-3.6";
export const SAMPLE_RATE = 24000;

export const DEFAULT_VOICES = {
  A: "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4",
  B: "47c38ca4-5f35-497b-b1a3-415245fb35e1",
} as const;

export const LANGUAGES = {
  English: "en",
  Spanish: "es",
  French: "fr",
  German: "de",
  Portuguese: "pt",
  Japanese: "ja",
  Hindi: "hi",
  Korean: "ko",
} as const;
export type LanguageName = keyof typeof LANGUAGES;
export type LanguageCode = (typeof LANGUAGES)[LanguageName];

export const LENGTHS = {
  short: { label: "Short", targetTurns: 12, maxChunks: 1 },
  medium: { label: "Medium", targetTurns: 24, maxChunks: 4 },
  long: { label: "Long", targetTurns: 40, maxChunks: 8 },
} as const;
export type LengthName = keyof typeof LENGTHS;

export const STYLE_PRESETS = [
  "engaging",
  "fast-paced",
  "enthusiastic",
  "calm",
  "humorous",
  "analytical",
] as const;

const languageNames = Object.keys(LANGUAGES) as [LanguageName, ...LanguageName[]];

export const OptionsSchema = z.object({
  hostAName: z.string().trim().min(1).max(40).default("Sam"),
  hostBName: z.string().trim().min(1).max(40).default("Alex"),
  hostARole: z.string().trim().min(1).max(80).default("host who explains the article"),
  hostBRole: z.string().trim().min(1).max(80).default("host who asks the questions"),
  conversationStyle: z
    .array(z.string().trim().min(1).max(40))
    .max(8)
    .default(["engaging", "analytical"]),
  dialogueStructure: z
    .array(z.string().trim().min(1).max(60))
    .max(8)
    .default(["Opening", "Key points", "Wrap-up"]),
  podcastName: z.string().trim().min(1).max(60).default("Sonic Briefing"),
  podcastTagline: z.string().trim().min(1).max(120).default("Any article, two voices"),
  outputLanguage: z.enum(languageNames).default("English"),
  engagementTechniques: z
    .array(z.string().trim().min(1).max(40))
    .max(8)
    .default(["questions", "examples", "analogies"]),
  creativity: z.number().min(0).max(1).default(0.7),
  userInstructions: z.string().max(1000).default(""),
  length: z.enum(["short", "medium", "long"]).default("medium"),
  maxNumChunks: z.number().int().min(1).max(8).optional(),
  minChunkSize: z.number().int().min(100).max(5000).default(600),
});

export type Options = z.infer<typeof OptionsSchema>;

export function defaultOptions(): Options {
  return OptionsSchema.parse({});
}

export function chunkCap(o: Options): number {
  return o.maxNumChunks ?? LENGTHS[o.length].maxChunks;
}

export function languageCode(o: Pick<Options, "outputLanguage">): LanguageCode {
  return LANGUAGES[o.outputLanguage];
}

export const MAX_TEXT_CHARS = 60_000;
export const MAX_TRANSCRIPT_CHARS = 30_000;
export const MAX_LINE_CHARS = 400;
export const MAX_LAUGHTER = 2;
