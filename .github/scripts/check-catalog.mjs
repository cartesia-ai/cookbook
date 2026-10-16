import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '../..'));
const read = (p) => readFileSync(join(root, p), 'utf8');
const errors = [];
const warnings = [];

const facts = JSON.parse(read('facts.json'));
const catalog = JSON.parse(read('templates.json'));
const allowedModels = new Set([facts.tts.model, facts.stt.streaming, facts.stt.file]);
const readme = read('README.md');
const llms = read('llms.txt');
const rawBase = 'https://raw.githubusercontent.com/cartesia-ai/cookbook/main/';

const envKeys = (file) =>
  new Set(
    readFileSync(file, 'utf8')
      .split('\n')
      .map((l) => l.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
      .filter(Boolean),
  );

const dirs = readdirSync(join(root, 'examples')).filter(
  (d) => !d.startsWith('_') && statSync(join(root, 'examples', d)).isDirectory(),
);
const slugs = catalog.templates.map((t) => t.slug);
for (const d of dirs) if (!slugs.includes(d)) errors.push(`examples/${d} is missing from templates.json`);

for (const t of catalog.templates) {
  const at = `templates.json ${t.slug}`;
  if (!catalog.categories[t.category]) errors.push(`${at}: unknown category ${t.category}`);
  if (t.path !== `examples/${t.slug}`) errors.push(`${at}: path should be examples/${t.slug}`);
  for (const key of ['readme', 'agents', 'recipe']) {
    if (t[key] && !existsSync(join(root, t[key]))) errors.push(`${at}: ${key} ${t[key]} does not exist`);
  }
  if (!existsSync(join(root, t.path, 'CLAUDE.md'))) warnings.push(`${t.path}/CLAUDE.md is missing`);
  if (t.screenshot && !existsSync(join(root, t.screenshot))) warnings.push(`${at}: screenshot ${t.screenshot} does not exist yet`);
  for (const m of t.models) if (!allowedModels.has(m)) errors.push(`${at}: model ${m} is not in facts.json`);
  if (t.description.length > 160) errors.push(`${at}: description is over 160 characters`);

  const envFile = join(root, t.path, '.env.example');
  if (!existsSync(envFile)) {
    errors.push(`${at}: ${t.path}/.env.example does not exist`);
  } else {
    const inFile = envKeys(envFile);
    const listed = [...t.env.required, ...t.env.oneOf, ...t.env.optional];
    for (const k of listed) if (!inFile.has(k)) errors.push(`${at}: env ${k} is not in .env.example`);
    for (const k of inFile) if (!listed.includes(k)) errors.push(`${at}: .env.example has ${k}, templates.json does not`);
    if (!t.env.required.includes('CARTESIA_API_KEY')) errors.push(`${at}: CARTESIA_API_KEY must be required`);
  }

  if (t.deploy.vercel && !t.deploy.vercel.includes(encodeURIComponent(`examples/${t.slug}`)))
    errors.push(`${at}: deploy.vercel does not point at examples/${t.slug}`);

  if (!readme.includes(`](examples/${t.slug})`)) errors.push(`README.md does not link examples/${t.slug}`);
  if (!llms.includes(`${rawBase}${t.readme}`)) errors.push(`llms.txt does not link ${t.readme}`);
  if (!llms.includes(`${rawBase}${t.agents}`)) errors.push(`llms.txt does not link ${t.agents}`);
}

const factFiles = ['README.md', 'AGENTS.md', 'llms.txt', 'context7.json'];
for (const f of factFiles) {
  const text = read(f);
  for (const v of [facts.tts.model, facts.stt.streaming, facts.stt.file, facts.apiVersion])
    if (!text.includes(v)) errors.push(`${f} does not mention ${v} from facts.json`);
}

if (Buffer.byteLength(read('AGENTS.md')) > 8192) errors.push('AGENTS.md is over 8 KB');

for (const w of warnings) console.warn(`warning: ${w}`);
if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} problem(s).`);
  process.exit(1);
}
console.log(`catalog ok (${slugs.length} templates)`);
