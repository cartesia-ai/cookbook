import Cartesia from '@cartesia/cartesia-js';
import { join } from 'node:path';
import { readEnvFile, upsertEnv } from '../server/env-file';
import { SEARCH_TOOL, SOURCE_TOOL, agentBody } from './agent-config';

const argv = process.argv.slice(2);
const cwd = process.cwd();
const localPath = join(cwd, '.env.local');
const fileEnv = { ...readEnvFile(join(cwd, '.env')), ...readEnvFile(localPath) };
const env = { ...fileEnv, ...process.env };
const status = (err: unknown) => (err as { status?: number } | null)?.status;
const brief = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300);

if (argv.includes('--dry-run')) {
  console.log('POST /v1/agents/tools', JSON.stringify(SEARCH_TOOL, null, 2));
  console.log('POST /v1/agents/tools', JSON.stringify(SOURCE_TOOL, null, 2));
  console.log('POST /v1/agents', JSON.stringify(agentBody(env, ['<search tool id>', '<source tool id>']), null, 2));
  process.exit(0);
}
if (!env.CARTESIA_API_KEY) {
  console.error('CARTESIA_API_KEY is empty. Put it in .env.local (see .env.example) and run this again.');
  process.exit(1);
}
const client = new Cartesia({ apiKey: env.CARTESIA_API_KEY });

if (fileEnv.CARTESIA_AGENT_ID && !argv.includes('--force')) {
  try {
    await client.get(`/v1/agents/${fileEnv.CARTESIA_AGENT_ID}`);
    console.log(`Agent ${fileEnv.CARTESIA_AGENT_ID} already exists. Nothing to do. Use --force to create a new one.`);
    process.exit(0);
  } catch (err) {
    if (status(err) !== 404) {
      console.error(`Could not check the agent (${status(err) ?? 'network'}): ${brief(err)}`);
      process.exit(1);
    }
  }
}

const created: string[] = [];
try {
  for (const tool of [SEARCH_TOOL, SOURCE_TOOL]) {
    const t = await client.post<{ id: string }>('/v1/agents/tools', { body: tool });
    created.push(t.id);
    console.log(`Created tool ${tool.name} ${t.id}`);
  }
  const agent = await client.post<{ id: string }>('/v1/agents', { body: agentBody(env, created) });
  upsertEnv(localPath, 'CARTESIA_AGENT_ID', agent.id);
  upsertEnv(localPath, 'CARTESIA_TOOL_IDS', created.join(','));
  console.log(`Created agent ${agent.id} and saved it to .env.local.`);
  console.log('Next: pnpm ingest, then pnpm dev.');
} catch (err) {
  console.error(`Setup failed (${status(err) ?? 'network'}): ${brief(err)}`);
  for (const id of created) await client.delete(`/v1/agents/tools/${id}`).catch(() => {});
  process.exit(1);
}
