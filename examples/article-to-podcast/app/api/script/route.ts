import { z } from "zod";
import { defaultOptions, MAX_TEXT_CHARS, OptionsSchema } from "../../../lib/config";
import { articleFromText, fetchArticle } from "../../../lib/extract";
import { badRequest, errorResponse } from "../../../lib/http";
import { getModel } from "../../../lib/model";
import { generateScript } from "../../../lib/script";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z
  .object({
    url: z.string().trim().min(1).max(2048).optional(),
    text: z.string().max(MAX_TEXT_CHARS * 2).optional(),
    options: OptionsSchema.optional(),
  })
  .refine((b) => Boolean(b.url) !== Boolean(b.text?.trim()), { message: "Send either a url or text." });

export async function POST(req: Request): Promise<Response> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Send a link or some text, and valid options.");
  const { url, text, options = defaultOptions() } = parsed.data;
  try {
    const model = getModel();
    const article = url ? await fetchArticle(url, { signal: req.signal }) : articleFromText(text ?? "");
    const script = await generateScript(model, article.text, options, { signal: req.signal, fallbackTitle: article.title });
    return Response.json({
      title: script.title,
      source: article.source,
      truncated: article.truncated,
      script,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
