import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readdir, stat } from 'node:fs/promises';

const root = join(import.meta.dirname, '..');
const SKIP = new Set(['node_modules', 'data', 'dist', '.git']);
async function files(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const name of await readdir(dir)) {
    if (SKIP.has(name) || name.startsWith('.env')) continue;
    const p = join(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...(await files(p)));
    else if (/\.(ts|md|json|html|css|example)$/.test(name) || name === '.env.example') out.push(p);
  }
  return out;
}

const EM_DASH = String.fromCharCode(0x2014);
const problems: string[] = [];
for (const file of await files(root)) {
  const rel = relative(root, file);
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    const at = `${rel}:${i + 1}`;
    if (line.includes(EM_DASH)) problems.push(`${at}: em dash`);
    if (/\bsonic-(2|turbo|english|latest)\b/.test(line) && !line.includes('allow-model-id')) problems.push(`${at}: banned model id`);
    if (rel.startsWith('widget/') && /CARTESIA_API_KEY|OPENAI_API_KEY/.test(line)) problems.push(`${at}: the widget must not mention API keys`);
    if (rel.startsWith('widget/src/') && !rel.includes('agents-web') && /console\.(log|debug)/.test(line)) problems.push(`${at}: console logging in the widget`);
  });
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('lint ok');
