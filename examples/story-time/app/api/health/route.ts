import { llmConfigured } from "@/lib/llm";
import { moderationConfigured } from "@/lib/moderation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ cartesia: Boolean(process.env.CARTESIA_API_KEY), llm: llmConfigured(), moderation: moderationConfigured() });
}
