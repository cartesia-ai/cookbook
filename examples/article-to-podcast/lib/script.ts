import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { chunkCap, MAX_LAUGHTER, MAX_LINE_CHARS, type Options } from "./config";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import type { PodcastScript, ScriptLine } from "./types";

export const LineSchema = z.object({ speaker: z.enum(["A", "B"]), text: z.string().min(1).max(600) });
export const ScriptSchema = z.object({ title: z.string(), lines: z.array(LineSchema).min(4).max(120) });

export function calculateChunkSize(length: number, maxNumChunks: number, minChunkSize: number): number {
  if (length <= minChunkSize) return length;
  const max = Math.floor(length / maxNumChunks);
  if (max >= minChunkSize) return max;
  return Math.floor(length / Math.floor(length / minChunkSize));
}

function splitSentences(text: string): string[] {
  return text.match(/[^.!?\n]+[.!?]+["')\]]*\s*|[^.!?\n]+$|\n+/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
}

export function chunkText(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let len = 0;
  for (const sentence of splitSentences(text)) {
    if (len + sentence.length > chunkSize && current.length) {
      chunks.push(current.join(" "));
      current = [];
      len = 0;
    }
    current.push(sentence);
    len += sentence.length;
  }
  if (current.length) chunks.push(current.join(" "));
  return chunks;
}

export function planChunks(text: string, o: Options): string[] {
  const cap = chunkCap(o);
  if (o.length === "short" || text.length <= o.minChunkSize * 3 || cap === 1) return [text];
  const size = calculateChunkSize(text.length, cap, o.minChunkSize);
  const chunks = chunkText(text, size);
  if (chunks.length <= cap) return chunks;
  return [...chunks.slice(0, cap - 1), chunks.slice(cap - 1).join(" ")];
}

function splitLongLine(text: string): string[] {
  if (text.length <= MAX_LINE_CHARS) return [text];
  const out: string[] = [];
  let cur = "";
  for (const s of splitSentences(text)) {
    if (cur && cur.length + 1 + s.length > MAX_LINE_CHARS) {
      out.push(cur);
      cur = s;
    } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) out.push(cur);
  return out.flatMap((piece) => {
    const parts: string[] = [];
    let rest = piece;
    while (rest.length > MAX_LINE_CHARS) {
      const at = rest.lastIndexOf(" ", MAX_LINE_CHARS);
      const cut = at > 0 ? at : MAX_LINE_CHARS;
      parts.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) parts.push(rest);
    return parts;
  });
}

export function normalizeLines(lines: ScriptLine[]): ScriptLine[] {
  const cleaned: ScriptLine[] = [];
  for (const line of lines) {
    const text = line.text.replace(/[*_#`]/g, "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const last = cleaned[cleaned.length - 1];
    if (last && last.speaker === line.speaker) last.text = `${last.text} ${text}`;
    else cleaned.push({ speaker: line.speaker, text });
  }
  const out = cleaned.flatMap((line) => splitLongLine(line.text).map((text) => ({ speaker: line.speaker, text })));
  let laughs = 0;
  return out.map((l) => ({
    speaker: l.speaker,
    text: l.text
      .replace(/\[laughter\]/gi, () => (++laughs <= MAX_LAUGHTER ? "[laughter]" : ""))
      .replace(/\s{2,}/g, " ")
      .trim(),
  })).filter((l) => l.text.length > 0);
}

async function generatePart(model: LanguageModel, o: Options, material: string, index: number, total: number, previous: ScriptLine[], signal?: AbortSignal) {
  const request = () =>
    generateText({
      model,
      temperature: o.creativity,
      instructions: buildSystemPrompt(o),
      prompt: buildUserPrompt(o, material, { index, total, previous }),
      output: Output.object({ schema: ScriptSchema }),
      maxRetries: 2,
      abortSignal: signal,
    });
  try {
    return (await request()).output;
  } catch (err) {
    if (!NoObjectGeneratedError.isInstance(err)) throw err;
    return (await request()).output;
  }
}

export async function generateScript(
  model: LanguageModel,
  text: string,
  o: Options,
  opts: { signal?: AbortSignal; fallbackTitle?: string } = {},
): Promise<PodcastScript> {
  const chunks = planChunks(text, o);
  const lines: ScriptLine[] = [];
  let title = "";
  for (let i = 0; i < chunks.length; i++) {
    const part = await generatePart(model, o, chunks[i], i, chunks.length, lines.slice(-6), opts.signal);
    if (i === 0) title = part.title;
    lines.push(...part.lines);
  }
  const normalized = normalizeLines(lines);
  if (normalized.length < 2) throw new Error("The model returned an empty script.");
  return { title: title.trim() || opts.fallbackTitle || "Untitled episode", lines: normalized };
}
