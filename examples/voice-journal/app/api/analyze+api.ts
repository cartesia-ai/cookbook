import { generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output } from "ai";
import { getModel } from "@/lib/server/llm";
import { json, llmError, rateLimited } from "@/lib/server/errors";
import { ENTRY_INSTRUCTIONS } from "@/lib/server/prompts";
import { EntryAnalysisSchema } from "@/lib/schema";
import { MAX_TRANSCRIPT_CHARS, MAX_JSON_BYTES } from "@/lib/limits";
import { BodyTooLargeError, readJson } from "@/lib/server/body";
import { createRateLimiter } from "@/lib/server/rate-limit";

const allow = createRateLimiter(10, 60_000);

export async function POST(req: Request) {
  const limited = rateLimited(req, allow);
  if (limited) return limited;
  let body: { transcript?: unknown } | null;
  try {
    body = (await readJson(req, MAX_JSON_BYTES)) as { transcript?: unknown } | null;
  } catch (err) {
    if (err instanceof BodyTooLargeError) return json({ error: "The entry is too long" }, 413);
    body = null;
  }
  const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : "";
  if (!transcript) return json({ error: "The transcript is empty" }, 400);
  if (transcript.length > MAX_TRANSCRIPT_CHARS) return json({ error: "The entry is too long" }, 413);

  try {
    const { output } = await generateText({
      model: getModel(),
      instructions: ENTRY_INSTRUCTIONS,
      prompt: transcript,
      output: Output.object({ schema: EntryAnalysisSchema }),
      maxOutputTokens: 400,
      maxRetries: 2,
    });
    return json({
      title: cleanTitle(output.title),
      mood: output.mood,
      reflection: output.reflection.slice(0, 300),
    });
  } catch (err) {
    return llmError(err, NoObjectGeneratedError.isInstance(err) || NoOutputGeneratedError.isInstance(err));
  }
}

function cleanTitle(raw: string): string {
  const title = raw
    .trim()
    .replace(/^["'“”‘’]+/, "")
    .replace(/["'“”‘’.]+$/, "")
    .trim()
    .slice(0, 80)
    .trim();
  return title || "Untitled entry";
}
