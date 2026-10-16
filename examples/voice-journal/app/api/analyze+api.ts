import { generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output } from "ai";
import { getModel } from "@/lib/server/llm";
import { json, llmError, rateLimited } from "@/lib/server/errors";
import { ENTRY_INSTRUCTIONS } from "@/lib/server/prompts";
import { EntryAnalysisSchema } from "@/lib/schema";
import { MAX_TRANSCRIPT_CHARS } from "@/lib/limits";
import { createRateLimiter } from "@/lib/server/rate-limit";

const allow = createRateLimiter(10, 60_000);

export async function POST(req: Request) {
  const limited = rateLimited(req, allow);
  if (limited) return limited;
  const body = await req.json().catch(() => null);
  const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : "";
  if (!transcript) return json({ error: "The transcript is empty" }, 400);
  if (transcript.length > MAX_TRANSCRIPT_CHARS) return json({ error: "The entry is too long" }, 413);

  try {
    const { output } = await generateText({
      model: getModel(),
      instructions: ENTRY_INSTRUCTIONS,
      prompt: transcript,
      output: Output.object({ schema: EntryAnalysisSchema }),
      temperature: 0.4,
      maxOutputTokens: 400,
      maxRetries: 2,
    });
    return json({
      title: output.title.replace(/["“”.]+$/g, "").slice(0, 80),
      mood: output.mood,
      reflection: output.reflection.slice(0, 300),
    });
  } catch (err) {
    return llmError(err, NoObjectGeneratedError.isInstance(err) || NoOutputGeneratedError.isInstance(err));
  }
}
