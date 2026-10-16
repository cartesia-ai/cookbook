import { generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output } from "ai";
import { getModel, LlmConfigError } from "@/lib/llm";
import { MAX_TRANSCRIPT_CHARS } from "@/lib/limits";
import { NOTES_INSTRUCTIONS } from "@/lib/prompt";
import { clientIp, createRateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { MeetingNotesSchema } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

const allow = createRateLimiter(10, 60_000);

export async function POST(req: Request) {
  if (!allow(clientIp(req))) return tooManyRequests();
  const body = await req.json().catch(() => null);
  const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : "";
  if (!transcript) {
    return Response.json({ error: "The transcript is empty" }, { status: 400 });
  }
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    return Response.json(
      { error: "The transcript is too long to summarize in one pass (about 120,000 characters)" },
      { status: 413 },
    );
  }

  try {
    const result = await generateText({
      model: getModel(),
      instructions: NOTES_INSTRUCTIONS,
      prompt: transcript,
      output: Output.object({ schema: MeetingNotesSchema }),
      temperature: 0.2,
      maxOutputTokens: 1500,
      maxRetries: 2,
    });
    const notes = result.output;
    return Response.json({ ...notes, title: notes.title.slice(0, 80), summary: notes.summary.slice(0, 1200) });
  } catch (err) {
    if (err instanceof LlmConfigError) {
      return Response.json({ error: err.message }, { status: 500 });
    }
    if (NoObjectGeneratedError.isInstance(err) || NoOutputGeneratedError.isInstance(err)) {
      return Response.json({ error: "The model did not return valid notes" }, { status: 502 });
    }
    return Response.json({ error: "Could not generate notes. Check the LLM key and model id." }, { status: 500 });
  }
}
