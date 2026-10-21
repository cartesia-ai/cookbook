import { generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output } from "ai";
import { getModel } from "@/lib/server/llm";
import { json, llmError, rateLimited } from "@/lib/server/errors";
import { recapPrompt } from "@/lib/journal";
import { RECAP_INSTRUCTIONS } from "@/lib/server/prompts";
import { RecapRequestSchema, RecapSchema } from "@/lib/schema";
import { MAX_JSON_BYTES, MAX_RECAP_ENTRIES, MAX_RECAP_INPUT_CHARS } from "@/lib/limits";
import { BodyTooLargeError, readJson } from "@/lib/server/body";
import { createRateLimiter } from "@/lib/server/rate-limit";

const allow = createRateLimiter(10, 60_000);

export async function POST(req: Request) {
  const limited = rateLimited(req, allow);
  if (limited) return limited;
  let body: { entries?: unknown } | null;
  try {
    body = (await readJson(req, MAX_JSON_BYTES)) as { entries?: unknown } | null;
  } catch (err) {
    if (err instanceof BodyTooLargeError) return json({ error: "This week has too much text to recap in one pass" }, 413);
    body = null;
  }
  const parsed = RecapRequestSchema.safeParse(body);
  if (!parsed.success) {
    const entries = body?.entries;
    const badCount = Array.isArray(entries) && (entries.length < 1 || entries.length > MAX_RECAP_ENTRIES);
    return json({ error: badCount ? `Send between 1 and ${MAX_RECAP_ENTRIES} entries` : "The entries are not valid." }, 400);
  }
  const prompt = recapPrompt(parsed.data.entries);
  if (prompt.length > MAX_RECAP_INPUT_CHARS) return json({ error: "This week has too much text to recap in one pass" }, 413);

  try {
    const { output } = await generateText({
      model: getModel(),
      instructions: RECAP_INSTRUCTIONS,
      prompt,
      output: Output.object({ schema: RecapSchema }),
      maxOutputTokens: 900,
      maxRetries: 2,
    });
    return json({ title: output.title.slice(0, 80), text: output.text.trim().slice(0, 2000) });
  } catch (err) {
    return llmError(err, NoObjectGeneratedError.isInstance(err) || NoOutputGeneratedError.isInstance(err));
  }
}
