import { cartesiaConfigured } from "@/lib/env";
import { llmConfigured } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    cartesia: cartesiaConfigured(),
    llm: llmConfigured(),
  });
}
