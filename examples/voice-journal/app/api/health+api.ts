import { llmConfigured } from "@/lib/server/llm";

export function GET() {
  return Response.json({
    cartesia: Boolean(process.env.CARTESIA_API_KEY),
    llm: llmConfigured(),
  });
}
