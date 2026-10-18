import { generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output } from "ai";
import { getModel, LlmConfigError } from "@/lib/llm";
import { scenePrompt, storyInstructions } from "@/lib/prompt";
import { isFlagged, moderate, ModerationError } from "@/lib/moderation";
import { clientIp, createRateLimiter, tooManyRequests } from "@/lib/rate-limit";
import { cleanHeroName, cleanThemes, looksUnsafe } from "@/lib/safety";
import { SceneSchema, TONES, TOTAL_SCENES, type Scene, type SceneRecord, type Tone } from "@/lib/story";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_HISTORY_CHARS = 6000;
const allow = createRateLimiter(10, 60_000);

export const NAME_NOT_OK = "Let's pick a different name for our hero and try again.";
export const SCENE_NOT_OK = "This story wandered somewhere it shouldn't. Let's start a new one.";
export const CHECKER_DOWN = "The story checker isn't answering right now. Try again in a minute.";

type History = Pick<SceneRecord, "lines" | "choices" | "chosen">[];

function cleanHistory(input: unknown): History | null {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length >= TOTAL_SCENES) return null;
  const out: History = [];
  for (const raw of input) {
    const parsed = SceneSchema.pick({ lines: true, choices: true }).safeParse(raw);
    const chosen = (raw as { chosen?: unknown })?.chosen;
    if (!parsed.success || parsed.data.choices.length !== 2 || (chosen !== 0 && chosen !== 1)) return null;
    out.push({ ...parsed.data, chosen });
  }
  return JSON.stringify(out).length > MAX_HISTORY_CHARS ? null : out;
}

function sceneText(scene: Scene): string {
  return [scene.title, ...scene.lines.map((l) => `${l.speaker}: ${l.text}`), ...scene.choices].join("\n");
}

function checkScene(scene: Scene, last: boolean): "format" | "unsafe" | null {
  if (scene.lines.length < 2 || scene.lines.length > 10) return "format";
  if (last ? scene.choices.length !== 0 : scene.choices.length !== 2) return "format";
  if (looksUnsafe(sceneText(scene))) return "unsafe";
  return null;
}

export async function POST(req: Request) {
  if (!allow(clientIp(req))) return tooManyRequests();
  const body = await req.json().catch(() => null);
  const rawHero = body?.hero ?? "";
  const hero = rawHero === "" ? "" : cleanHeroName(rawHero);
  const themes = cleanThemes(body?.themes);
  const tone = TONES.some((t) => t.value === body?.tone) ? (body.tone as Tone) : null;
  const history = cleanHistory(body?.history);
  const title = typeof body?.title === "string" ? body.title.slice(0, 80) : "";
  if (hero === null) return Response.json({ error: "Use a name with letters only, up to 24 characters" }, { status: 400 });
  if (looksUnsafe(hero)) return Response.json({ error: NAME_NOT_OK }, { status: 400 });
  if (!themes || !tone || !history) return Response.json({ error: "The story settings are not valid" }, { status: 400 });

  const last = history.length === TOTAL_SCENES - 1;
  let safeTitle = looksUnsafe(title) ? "" : title;
  try {
    const flags = await moderate([`Hero name: ${hero || "none"}\nThemes: ${themes.join(", ")}`, safeTitle || "Untitled"]);
    if (flags?.[0]) return Response.json({ error: NAME_NOT_OK }, { status: 400 });
    if (flags?.[1]) safeTitle = "";
    let unsafe = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await generateText({
        model: getModel(),
        instructions: storyInstructions(tone),
        prompt: scenePrompt({ hero, themes, tone, title: safeTitle, history }),
        output: Output.object({ schema: SceneSchema }),
        maxOutputTokens: 1200,
        maxRetries: 1,
      });
      const scene = result.output;
      let problem = checkScene(scene, last);
      if (!problem && (await isFlagged([sceneText(scene)]))) problem = "unsafe";
      if (!problem) {
        return Response.json({ ...scene, title: (safeTitle || scene.title).slice(0, 80) });
      }
      if (problem === "unsafe") unsafe = true;
    }
    if (unsafe) return Response.json({ error: SCENE_NOT_OK }, { status: 422 });
    return Response.json({ error: "The model did not write a usable scene. Try again." }, { status: 502 });
  } catch (err) {
    if (err instanceof ModerationError) return Response.json({ error: CHECKER_DOWN }, { status: 503 });
    if (err instanceof LlmConfigError) return Response.json({ error: err.message }, { status: 503 });
    if (NoObjectGeneratedError.isInstance(err) || NoOutputGeneratedError.isInstance(err)) {
      return Response.json({ error: "The model did not write a usable scene. Try again." }, { status: 502 });
    }
    return Response.json({ error: "Could not write the scene. Check the LLM key and model id." }, { status: 500 });
  }
}
