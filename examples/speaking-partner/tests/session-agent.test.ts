import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentsApi, VoiceSummary } from "../lib/agents-api";
import {
  AGENT_NAME_PREFIX,
  buildAgentBody,
  chooseVoice,
  createSessionAgent,
  deleteSessionAgent,
  ensureCompleteTool,
  pickVoiceId,
  resetToolCache,
  resetVoiceCache,
  STALE_AFTER_MS,
  sweepStaleAgents,
} from "../lib/session-agent";

const v = (id: string, name: string, locale: string, extra: Partial<VoiceSummary> = {}): VoiceSummary => ({
  id,
  name,
  accents: [{ locale, is_native: true }],
  ...extra,
});

function fakeApi({ voices, ...over }: Partial<Omit<AgentsApi, "voices">> & { voices?: VoiceSummary[] } = {}) {
  const calls = { post: [] as [string, unknown][], get: [] as string[], delete: [] as string[], voiceListings: 0 };
  const api: AgentsApi = {
    get: vi.fn(async (path: string) => {
      calls.get.push(path);
      return { data: [] } as never;
    }),
    post: vi.fn(async (path: string, body: unknown) => {
      calls.post.push([path, body]);
      return { id: path.endsWith("/tools") ? "agent_tool_x" : "agent_new1234567890" } as never;
    }),
    delete: vi.fn(async (path: string) => void calls.delete.push(path)),
    voices: (async function* () {
      calls.voiceListings++;
      yield* voices ?? [v("v-en", "Ann", "en-US"), v("v-fr", "Zoé", "fr-FR"), v("v-ja", "Aiko", "ja-JP"), v("v-hi", "Siya", "hi-IN"), v("v-es", "Ximena", "es-MX")];
    }) as AgentsApi["voices"],
    ...over,
  };
  return { api, calls };
}

beforeEach(() => {
  resetToolCache();
  resetVoiceCache();
});

describe("voice choice", () => {
  it("only takes native speakers of the language", () => {
    const voices = [v("a", "Foreign", "en-US", { accents: [{ locale: "fr-FR", is_native: false }] }), v("b", "Local", "fr-CA")];
    expect(chooseVoice(voices, "fr")?.id).toBe("b");
    expect(chooseVoice(voices, "ja")).toBeUndefined();
  });

  it("is stable: friendlier descriptions first, then name", () => {
    const voices = [v("1", "Zed", "en-US"), v("2", "Amy", "en-US"), v("3", "Mia", "en-US", { tagline: "Friendly Guide" })];
    expect(chooseVoice(voices, "en")?.id).toBe("3");
    expect(chooseVoice(voices.slice(0, 2), "en")?.id).toBe("2");
  });

  it("honours VOICE_ID_<LANG> without listing voices, and caches the listing otherwise", async () => {
    const { api, calls } = fakeApi();
    expect(await pickVoiceId(api, "fr", { VOICE_ID_FR: "pinned" })).toBe("pinned");
    expect(calls.voiceListings).toBe(0);
    expect(await pickVoiceId(api, "fr", {})).toBe("v-fr");
    expect(await pickVoiceId(api, "fr", {})).toBe("v-fr");
    expect(calls.voiceListings).toBe(1);
  });

  it("says which variable to set when a language has no voice", async () => {
    const { api } = fakeApi({ voices: [v("x", "X", "en-US")] });
    await expect(pickVoiceId(api, "hi", {})).rejects.toThrow(/VOICE_ID_HI/);
  });
});

describe("the shared complete_mission tool", () => {
  it("reuses a matching tool and creates none", async () => {
    const { api, calls } = fakeApi({
      get: (async () => ({ data: [{ id: "agent_tool_old", name: "complete_mission", type: "client", parameters: { required: ["score", "feedback_pointers"] } }] })) as never,
    });
    expect(await ensureCompleteTool(api, {})).toBe("agent_tool_old");
    expect(calls.post).toHaveLength(0);
  });

  it("ignores a same-named tool with other parameters, creates ours once and caches it", async () => {
    const { api, calls } = fakeApi({
      get: (async () => ({ data: [{ id: "agent_tool_other", name: "complete_mission", type: "client", parameters: { required: ["x"] } }] })) as never,
    });
    expect(await ensureCompleteTool(api, {})).toBe("agent_tool_x");
    expect(await ensureCompleteTool(api, {})).toBe("agent_tool_x");
    expect(calls.post).toHaveLength(1);
  });

  it("takes CARTESIA_TOOL_ID_COMPLETE without any request", async () => {
    const { api, calls } = fakeApi();
    expect(await ensureCompleteTool(api, { CARTESIA_TOOL_ID_COMPLETE: "agent_tool_env" })).toBe("agent_tool_env");
    expect(calls.get).toHaveLength(0);
  });
});

describe("createSessionAgent", () => {
  it("writes the session into the instructions, not into dynamic variables", async () => {
    const { api, calls } = fakeApi();
    const id = await createSessionAgent(api, { target: "fr", native: "en", mode: "teacher", missionId: 5 }, {});
    expect(id).toBe("agent_new1234567890");
    const [path, body] = calls.post.find(([p]) => p === "/v1/agents")! as [string, ReturnType<typeof buildAgentBody>];
    expect(path).toBe("/v1/agents");
    expect(body.name.startsWith(AGENT_NAME_PREFIX)).toBe(true);
    expect(body.config.language).toEqual({ primary: "fr" });
    expect(body.config.audio.output.voice_id).toBe("v-fr");
    expect(body.config.tools).toEqual([{ id: "agent_tool_x" }]);
    expect(body.config.initial_message).toBeNull();
    expect(body.config.instructions).toContain("Barista");
    expect(JSON.stringify(body)).not.toContain("dynamic_variable");
  });

  it("rejects an unknown mission before any request", async () => {
    const { api, calls } = fakeApi();
    await expect(createSessionAgent(api, { target: "fr", native: "en", mode: "teacher", missionId: 999 }, {})).rejects.toThrow(/mission/i);
    expect(calls.post).toHaveLength(0);
  });

  it("uses AGENT_MODEL_ID when set", () => {
    const body = buildAgentBody({ target: "es", native: "en", mode: "immersive", missionId: 0 }, "v", "t", { AGENT_MODEL_ID: "claude-sonnet-5" });
    expect(body.config.model.id).toBe("claude-sonnet-5");
  });
});

describe("deleteSessionAgent", () => {
  it("deletes our agents", async () => {
    const { api, calls } = fakeApi({ get: (async () => ({ name: `${AGENT_NAME_PREFIX}fr-abc` })) as never });
    expect(await deleteSessionAgent(api, "agent_abcdefghij1234")).toBe("deleted");
    expect(calls.delete).toEqual(["/v1/agents/agent_abcdefghij1234"]);
  });

  it("refuses an agent it did not create", async () => {
    const { api, calls } = fakeApi({ get: (async () => ({ name: "Customer support" })) as never });
    await expect(deleteSessionAgent(api, "agent_abcdefghij1234")).rejects.toMatchObject({ code: "not_ours" });
    expect(calls.delete).toHaveLength(0);
  });

  it("rejects ids that are not agent ids, and path tricks", async () => {
    const { api } = fakeApi();
    for (const bad of ["", "tool_123", "agent_../tools", "agent_abc/def", "../agents"]) {
      await expect(deleteSessionAgent(api, bad)).rejects.toMatchObject({ code: "bad_id" });
    }
  });

  it("treats a 404 as already gone", async () => {
    const { api } = fakeApi({
      get: (async () => {
        throw Object.assign(new Error("nope"), { status: 404 });
      }) as never,
    });
    expect(await deleteSessionAgent(api, "agent_abcdefghij1234")).toBe("missing");
  });
});

describe("sweepStaleAgents", () => {
  it("removes only old agents with our prefix", async () => {
    const now = Date.parse("2026-10-14T12:00:00Z");
    const old = new Date(now - STALE_AFTER_MS - 1000).toISOString();
    const fresh = new Date(now - 60_000).toISOString();
    const { api, calls } = fakeApi({
      get: (async () => ({
        data: [
          { id: "agent_old", name: `${AGENT_NAME_PREFIX}fr-1`, created_at: old },
          { id: "agent_fresh", name: `${AGENT_NAME_PREFIX}fr-2`, created_at: fresh },
          { id: "agent_other", name: "Someone else's agent", created_at: old },
        ],
      })) as never,
    });
    expect(await sweepStaleAgents(api, now)).toBe(1);
    expect(calls.delete).toEqual(["/v1/agents/agent_old"]);
  });
});
