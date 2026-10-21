import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { LANGUAGE_CODES, languageName, type LanguageCode } from "./languages";

export const CATEGORIES = ["grammar", "vocabulary", "word-choice", "pronunciation-guess", "register", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CorrectionSchema = z.object({
  hasIssue: z.boolean().describe("true only if the learner made a real mistake"),
  corrected: z.string().describe("The line corrected, in the target language. Equal to the input when there is no issue."),
  explanation: z.string().describe("One or two short sentences in the learner's native language. Empty when there is no issue."),
  category: z.enum(CATEGORIES),
});
export type Correction = z.infer<typeof CorrectionSchema>;

export const MAX_TEXT = 500;

export const CorrectRequestSchema = z.object({
  text: z.string().trim().min(1).max(MAX_TEXT),
  target: z.enum(LANGUAGE_CODES),
  native: z.enum(LANGUAGE_CODES),
  mission: z.string().max(120).optional(),
  recent: z.array(z.string().max(MAX_TEXT)).max(3).optional(),
});
export type CorrectRequest = z.infer<typeof CorrectRequestSchema>;

export function systemPrompt(target: LanguageCode, native: LanguageCode): string {
  const T = languageName(target);
  const N = languageName(native);
  return `You check one line spoken by a ${N}-speaking learner of ${T}.
The line comes from speech recognition, not from a keyboard. Ignore punctuation, capital letters, filler words and anything that looks like a recognition error. If you are unsure whether something is a real mistake, return hasIssue false.
Flag grammar, vocabulary, word choice or register that a native ${T} speaker would notice. Keep the learner's meaning, and change as little as you can.
corrected is written in ${T}${target === "hi" ? " (Devanagari)" : target === "ja" ? " (do not flag kanji versus kana unless it is wrong)" : ""}. explanation is written in ${N}, one or two short sentences, and says what was wrong. If the line is fine, return the input as corrected and an empty explanation, with category "other".`;
}

export function clampCorrection(c: Correction, input: string): Correction {
  if (!c.hasIssue) return { hasIssue: false, corrected: input, explanation: "", category: "other" };
  const corrected = c.corrected.trim().slice(0, MAX_TEXT * 2);
  if (!corrected || corrected === input.trim()) return { hasIssue: false, corrected: input, explanation: "", category: "other" };
  return { hasIssue: true, corrected, explanation: c.explanation.trim().slice(0, 400), category: c.category };
}

export async function correctLine(model: LanguageModel, req: CorrectRequest, signal?: AbortSignal): Promise<Correction> {
  const context = [
    req.mission ? `Scene: ${req.mission}` : "",
    req.recent?.length ? `Earlier lines from the learner:\n${req.recent.map((r) => `- ${r}`).join("\n")}` : "",
    `Line to check:\n${req.text}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const { output } = await generateText({
    model,
    instructions: systemPrompt(req.target, req.native),
    prompt: context,
    output: Output.object({ schema: CorrectionSchema }),
    maxOutputTokens: 2000,
    providerOptions: { openai: { reasoningEffort: "low" } },
    abortSignal: signal,
  });
  return clampCorrection(output, req.text);
}
