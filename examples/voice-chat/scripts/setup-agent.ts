import Cartesia from "@cartesia/cartesia-js";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readEnvFile, upsertEnv } from "./lib/env-file.ts";
import { INITIAL_MESSAGE, INSTRUCTIONS } from "./prompt.ts";
import { AGENTS_PATH, DEFAULT_MODEL_ID, DEFAULT_VOICE_ID } from "./paths.ts";

interface CreatedAgent {
  id: string;
  name?: string;
}

interface Env {
  [key: string]: string | undefined;
}

export interface SetupOptions {
  argv: string[];
  cwd: string;
  env: Env;
  log?: (line: string) => void;
}

export function buildBody(env: Env) {
  const config = {
    instructions: INSTRUCTIONS,
    initial_message: INITIAL_MESSAGE,
    model: { id: env.AGENT_MODEL_ID || DEFAULT_MODEL_ID },
    language: { primary: "en" },
    audio: { output: { voice_id: env.CARTESIA_VOICE_ID || DEFAULT_VOICE_ID } },
    speculative_generation: true,
    turn: { inactivity_check_in_secs: 10, inactivity_end_call_secs: 120 },
  };
  return {
    name: "Cookbook voice chat",
    description: "Created by examples/voice-chat in the Cartesia cookbook",
    config,
  };
}

function statusOf(err: unknown): number | undefined {
  const s = (err as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : undefined;
}

function brief(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.length > 400 ? msg.slice(0, 400) + "..." : msg;
}

function modelIds(payload: unknown): string[] | null {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown })?.data)
      ? (payload as { data: unknown[] }).data
      : Array.isArray((payload as { models?: unknown })?.models)
        ? (payload as { models: unknown[] }).models
        : null;
  if (!list) return null;
  return list
    .map((m) => (typeof m === "string" ? m : (m as { id?: unknown })?.id))
    .filter((id): id is string => typeof id === "string");
}

export async function run(opts: SetupOptions): Promise<number> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const dryRun = opts.argv.includes("--dry-run");
  const force = opts.argv.includes("--force");
  const localPath = join(opts.cwd, ".env.local");
  const fileEnv = { ...readEnvFile(join(opts.cwd, ".env")), ...readEnvFile(localPath) };
  const env: Env = { ...fileEnv, ...opts.env };

  if (dryRun) {
    log(`POST ${AGENTS_PATH}`);
    log(JSON.stringify(buildBody(env), null, 2));
    return 0;
  }

  const apiKey = env.CARTESIA_API_KEY;
  if (!apiKey) {
    log("CARTESIA_API_KEY is empty. Put it in .env.local (see .env.example) and run this again.");
    return 1;
  }
  const client = new Cartesia({ apiKey, baseURL: env.CARTESIA_BASE_URL || undefined });

  const existing = fileEnv.CARTESIA_AGENT_ID;
  if (existing && !force) {
    try {
      await client.get(`${AGENTS_PATH}/${existing}`);
      log(`Agent ${existing} already exists. Nothing to do. Use --force to create a new one.`);
      return 0;
    } catch (err) {
      if (statusOf(err) !== 404) {
        log(`Could not check agent ${existing} (${statusOf(err) ?? "network"}): ${brief(err)}`);
        return 1;
      }
      log(`Agent ${existing} no longer exists. Creating a new one.`);
    }
  }

  const voiceId = env.CARTESIA_VOICE_ID || DEFAULT_VOICE_ID;
  try {
    await client.voices.get(voiceId);
  } catch (err) {
    if (statusOf(err) === 404) {
      log(`Voice ${voiceId} was not found on this account. Set CARTESIA_VOICE_ID to a voice id you can use.`);
      return 1;
    }
    log(`Could not check voice ${voiceId} (${statusOf(err) ?? "network"}): ${brief(err)}`);
    return 1;
  }

  const modelId = env.AGENT_MODEL_ID || DEFAULT_MODEL_ID;
  try {
    const ids = modelIds(await client.get(`${AGENTS_PATH}/models`));
    if (ids && ids.length > 0 && !ids.includes(modelId)) {
      log(`Model ${modelId} is not available. Set AGENT_MODEL_ID to one of: ${ids.join(", ")}`);
      return 1;
    }
  } catch (err) {
    log(`Skipping the model check (${statusOf(err) ?? "network"}).`);
  }

  let agent: CreatedAgent;
  try {
    agent = await client.post<CreatedAgent>(AGENTS_PATH, { body: buildBody(env) });
  } catch (err) {
    log(`Create failed (${statusOf(err) ?? "network"}): ${brief(err)}`);
    return 1;
  }
  if (!agent?.id) {
    log("The API answered without an agent id.");
    return 1;
  }

  upsertEnv(localPath, "CARTESIA_AGENT_ID", agent.id);
  log(`Created agent ${agent.id} and saved it to .env.local.`);
  log("Next: add CARTESIA_API_KEY to .env.local if it is not there yet, then run `npm run dev`.");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run({ argv: process.argv.slice(2), cwd: process.cwd(), env: process.env }).then(
    (code) => process.exit(code),
    (err) => {
      console.error(brief(err));
      process.exit(1);
    },
  );
}
