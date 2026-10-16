import Cartesia from '@cartesia/cartesia-js';
import { join } from 'node:path';
import { readEnvFile, upsertEnv } from '../server/env-file';

const localPath = join(process.cwd(), '.env.local');
const fileEnv = readEnvFile(localPath);
const apiKey = process.env.CARTESIA_API_KEY || fileEnv.CARTESIA_API_KEY;
if (!apiKey) {
  console.error('CARTESIA_API_KEY is empty.');
  process.exit(1);
}
const client = new Cartesia({ apiKey });
const status = (err: unknown) => (err as { status?: number } | null)?.status;
let failed = false;

async function del(path: string) {
  try {
    await client.delete(path);
    console.log(`Deleted ${path}`);
  } catch (err) {
    if (status(err) === 404) return console.log(`Already gone: ${path}`);
    failed = true;
    console.error(`Could not delete ${path} (${status(err) ?? 'network'})`);
  }
}

if (fileEnv.CARTESIA_AGENT_ID) await del(`/v1/agents/${fileEnv.CARTESIA_AGENT_ID}`);
for (const id of (fileEnv.CARTESIA_TOOL_IDS || '').split(',').filter(Boolean)) await del(`/v1/agents/tools/${id}`);
if (!failed) {
  upsertEnv(localPath, 'CARTESIA_AGENT_ID', '');
  upsertEnv(localPath, 'CARTESIA_TOOL_IDS', '');
}
process.exit(failed ? 1 : 0);
