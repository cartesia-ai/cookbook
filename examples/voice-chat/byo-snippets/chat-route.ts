import { streamText, type LanguageModel } from "ai";

const model: LanguageModel = process.env.LLM_MODEL as string;

const SYSTEM = "You are a voice assistant. Reply in one or two short sentences. No markdown, no lists.";

export async function POST(req: Request): Promise<Response> {
  const { messages } = (await req.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
  };
  const result = streamText({
    model,
    system: SYSTEM,
    messages,
    abortSignal: req.signal,
  });
  return result.toTextStreamResponse();
}
