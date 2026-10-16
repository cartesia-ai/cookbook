import { streamText, type LanguageModel } from "ai";
import { z } from "zod";
import { LANGS } from "./languages";
import { getModel } from "./llm";
import { translatePrompt } from "./prompt";

export const MAX_TURN_CHARS = 2000;

const Body = z.object({
  text: z.string().trim().min(1).max(MAX_TURN_CHARS),
  pair: z.tuple([z.enum(LANGS), z.enum(LANGS)]).refine(([a, b]) => a !== b),
});

export function createTranslateRoute(model: () => LanguageModel = () => getModel()) {
  return async function POST(req: Request): Promise<Response> {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: "Send one turn of text and two different languages." }, { status: 400 });
    }
    let resolved: LanguageModel;
    try {
      resolved = model();
    } catch {
      return Response.json({ error: "Translation is not set up. Set LLM_MODEL and its key." }, { status: 503 });
    }
    const { text, pair } = parsed.data;
    const result = streamText({
      model: resolved,
      system: translatePrompt(pair),
      prompt: text,
      maxOutputTokens: 600,
      abortSignal: req.signal,
      onError: ({ error }) => console.error("translate failed", (error as Error)?.message ?? error),
    });
    return result.toTextStreamResponse({ headers: { "Cache-Control": "no-store" } });
  };
}
