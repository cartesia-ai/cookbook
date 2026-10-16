import { generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output } from "ai";
import { getModel } from "@/lib/server/llm";
import { json, llmError } from "@/lib/server/errors";
import { RECAP_INSTRUCTIONS, recapPrompt } from "@/lib/server/prompts";
import { RecapRequestSchema, RecapSchema } from "@/lib/schema";
import { MAX_RECAP_INPUT_CHARS } from "@/lib/limits";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = RecapRequestSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Send between 1 and 30 entries" }, 400);
  const prompt = recapPrompt(parsed.data.entries);
  if (prompt.length > MAX_RECAP_INPUT_CHARS) return json({ error: "This week has too much text to recap in one pass" }, 413);

  try {
    const { output } = await generateText({
      model: getModel(),
      instructions: RECAP_INSTRUCTIONS,
      prompt,
      output: Output.object({ schema: RecapSchema }),
      temperature: 0.6,
      maxOutputTokens: 900,
      maxRetries: 2,
    });
    return json({ title: output.title.slice(0, 80), text: output.text.trim().slice(0, 2000) });
  } catch (err) {
    return llmError(err, NoObjectGeneratedError.isInstance(err) || NoOutputGeneratedError.isInstance(err));
  }
}
