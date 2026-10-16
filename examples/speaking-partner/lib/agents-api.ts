import Cartesia from "@cartesia/cartesia-js";

export const AGENTS_PATH = "/v1/agents";
export const TOOLS_PATH = "/v1/agents/tools";

export interface VoiceSummary {
  id: string;
  name: string;
  gender?: string | null;
  tagline?: string | null;
  description?: string | null;
  accents?: { locale: string; is_native: boolean }[] | null;
}

export interface AgentsApi {
  get<T>(path: string, query?: Record<string, string | number>): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  delete(path: string): Promise<void>;
  voices(limit: number): AsyncIterable<VoiceSummary>;
}

export function createAgentsApi(apiKey: string): AgentsApi {
  const client = new Cartesia({ apiKey });
  return {
    get: (path, query) => client.get(path, query ? { query } : undefined),
    post: (path, body) => client.post(path, { body: body as object }),
    delete: async (path) => {
      await client.delete(path);
    },
    voices: (limit) => client.voices.list({ limit }) as unknown as AsyncIterable<VoiceSummary>,
  };
}

export function statusOf(err: unknown): number | undefined {
  const s = (err as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : undefined;
}
