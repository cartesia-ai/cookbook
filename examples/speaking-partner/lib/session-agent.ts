import { languageName, type LanguageCode } from "./languages";
import { getMission } from "./missions";
import type { Mode } from "./modes";
import { buildInstructions, completeMissionToolBody, COMPLETE_TOOL_NAME } from "./prompts";
import { AGENTS_PATH, statusOf, TOOLS_PATH, type AgentsApi, type VoiceSummary } from "./agents-api";

export const AGENT_NAME_PREFIX = "speaking-partner-session-";
export const DEFAULT_AGENT_MODEL = "claude-haiku-4.5";
export const STALE_AFTER_MS = 30 * 60_000;
const AGENT_ID_RE = /^agent_[A-Za-z0-9]{10,64}$/;

export class SessionAgentError extends Error {
  constructor(
    message: string,
    readonly code: "bad_mission" | "no_voice" | "not_ours" | "bad_id" | "upstream",
  ) {
    super(message);
  }
}

export interface CreateInput {
  target: LanguageCode;
  native: LanguageCode;
  mode: Mode;
  missionId: number;
}

type Env = Record<string, string | undefined>;

let toolIdCache: Promise<string> | null = null;

interface ToolRow {
  id: string;
  name?: string;
  type?: string;
  parameters?: { required?: string[] };
}

function isOurTool(t: ToolRow): boolean {
  const required = t.parameters?.required ?? [];
  return t.name === COMPLETE_TOOL_NAME && t.type === "client" && required.includes("score") && required.includes("feedback_pointers");
}

export function ensureCompleteTool(api: AgentsApi, env: Env = process.env): Promise<string> {
  if (env.CARTESIA_TOOL_ID_COMPLETE) return Promise.resolve(env.CARTESIA_TOOL_ID_COMPLETE);
  toolIdCache ??= (async () => {
    const list = await api.get<{ data?: ToolRow[] }>(TOOLS_PATH, { limit: 100 });
    const found = (list.data ?? []).find(isOurTool);
    if (found) return found.id;
    const created = await api.post<{ id?: string }>(TOOLS_PATH, completeMissionToolBody());
    if (!created.id) throw new SessionAgentError("The API answered without a tool id.", "upstream");
    return created.id;
  })().catch((err) => {
    toolIdCache = null;
    throw err;
  });
  return toolIdCache;
}

export function resetToolCache() {
  toolIdCache = null;
}

const voiceCache = new Map<LanguageCode, { at: number; id: string }>();
const VOICE_TTL_MS = 60 * 60_000;
const WARM_WORDS = ["conversation", "friendly", "warm", "companion", "natural", "approachable", "guide"];

function isNative(v: VoiceSummary, code: LanguageCode): boolean {
  return (v.accents ?? []).some((a) => a.is_native && (a.locale.toLowerCase() === code || a.locale.toLowerCase().startsWith(code + "-")));
}

function warmth(v: VoiceSummary): number {
  const text = `${v.tagline ?? ""} ${v.description ?? ""}`.toLowerCase();
  return WARM_WORDS.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
}

export function chooseVoice(voices: VoiceSummary[], code: LanguageCode): VoiceSummary | undefined {
  return voices
    .filter((v) => isNative(v, code))
    .sort((a, b) => warmth(b) - warmth(a) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))[0];
}

export async function pickVoiceId(api: AgentsApi, code: LanguageCode, env: Env = process.env, now = Date.now()): Promise<string> {
  const pinned = env[`VOICE_ID_${code.toUpperCase()}`];
  if (pinned) return pinned;
  const hit = voiceCache.get(code);
  if (hit && now - hit.at < VOICE_TTL_MS) return hit.id;
  const seen: VoiceSummary[] = [];
  let n = 0;
  for await (const v of api.voices(100)) {
    seen.push(v);
    if (++n >= 600) break;
  }
  const voice = chooseVoice(seen, code);
  if (!voice) throw new SessionAgentError(`No ${languageName(code)} voice found. Set VOICE_ID_${code.toUpperCase()}.`, "no_voice");
  voiceCache.set(code, { at: now, id: voice.id });
  return voice.id;
}

export function resetVoiceCache() {
  voiceCache.clear();
}

export function buildAgentBody(input: CreateInput, voiceId: string, toolId: string, env: Env = process.env, now = Date.now()) {
  const mission = getMission(input.missionId);
  if (!mission) throw new SessionAgentError("Unknown mission.", "bad_mission");
  return {
    name: `${AGENT_NAME_PREFIX}${input.target}-${now.toString(36)}`,
    description: "Temporary agent from examples/speaking-partner. Deleted when the session ends.",
    config: {
      instructions: buildInstructions({ target: input.target, native: input.native, mission, mode: input.mode }),
      initial_message: null, // the learner speaks first
      model: { id: env.AGENT_MODEL_ID || DEFAULT_AGENT_MODEL },
      language: { primary: input.target },
      audio: { output: { voice_id: voiceId } },
      speculative_generation: true,
      turn: { inactivity_check_in_secs: 10, inactivity_end_call_secs: 60 },
      tools: [{ id: toolId }],
    },
  };
}

export async function createSessionAgent(api: AgentsApi, input: CreateInput, env: Env = process.env): Promise<string> {
  if (!getMission(input.missionId)) throw new SessionAgentError("Unknown mission.", "bad_mission");
  const [voiceId, toolId] = await Promise.all([pickVoiceId(api, input.target, env), ensureCompleteTool(api, env)]);
  const created = await api.post<{ id?: string }>(AGENTS_PATH, buildAgentBody(input, voiceId, toolId, env));
  if (!created.id) throw new SessionAgentError("The API answered without an agent id.", "upstream");
  return created.id;
}

export async function deleteSessionAgent(api: AgentsApi, agentId: string): Promise<"deleted" | "missing"> {
  if (!AGENT_ID_RE.test(agentId)) throw new SessionAgentError("Bad agent id.", "bad_id");
  let agent: { name?: string };
  try {
    agent = await api.get<{ name?: string }>(`${AGENTS_PATH}/${agentId}`);
  } catch (err) {
    if (statusOf(err) === 404) return "missing";
    throw err;
  }
  if (!agent.name?.startsWith(AGENT_NAME_PREFIX)) throw new SessionAgentError("Not a speaking-partner session agent.", "not_ours");
  try {
    await api.delete(`${AGENTS_PATH}/${agentId}`);
  } catch (err) {
    if (statusOf(err) === 404) return "missing";
    throw err;
  }
  return "deleted";
}

export async function sweepStaleAgents(api: AgentsApi, now = Date.now(), max = 20): Promise<number> {
  const list = await api.get<{ data?: { id: string; name?: string; created_at?: string }[] }>(AGENTS_PATH, { limit: 100 });
  const stale = (list.data ?? []).filter(
    (a) => a.name?.startsWith(AGENT_NAME_PREFIX) && a.created_at && now - Date.parse(a.created_at) > STALE_AFTER_MS,
  );
  let removed = 0;
  for (const a of stale.slice(0, max)) {
    try {
      await api.delete(`${AGENTS_PATH}/${a.id}`);
      removed++;
    } catch {
      // another sweep may have won the race
    }
  }
  return removed;
}
