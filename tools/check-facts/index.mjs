import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOW = 'allow-model-id';
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', 'out', '.git', '.turbo', '.venv', '__pycache__', '.pytest_cache', '.ruff_cache', 'logs', 'coverage']);
const SKIP_FILES = new Set(['pnpm-lock.yaml', 'uv.lock', 'package-lock.json', 'facts.json', 'CHANGELOG.md', 'LICENSE', 'NOTICE']);
const SKIP_PATHS = ['tools/check-facts', 'tools/check-content'];
const TEXT = new Set(['.md', '.mdx', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.py', '.json', '.yaml', '.yml', '.toml', '.html', '.txt', '.example', '.sh', '']);

export function loadFacts(root) {
  return JSON.parse(readFileSync(join(root, 'facts.json'), 'utf8'));
}

export function checkLine(line, facts) {
  if (line.includes(ALLOW)) return [];
  const problems = [];
  const ok = new Set([facts.tts.model, facts.tts.snapshot]);
  for (const m of line.matchAll(/(?<![\w./-])sonic(?:-(?:\d[a-z0-9.]*|turbo|english|multilingual|latest|preview|lite))*(?![\w-])/gi)) {
    const id = m[0].replace(/\.+$/, '').toLowerCase();
    if (ok.has(id)) continue;
    if (id === 'sonic' && !(/["'`]sonic["'`]|\/sonic\b/.test(line) && /model/i.test(line))) continue;
    if (facts.retired.includes(id)) problems.push(`retired model id ${id}, use ${facts.tts.model}`);
    else if (facts.deprecatedAliases.includes(id)) problems.push(`deprecated alias ${id}, use ${facts.tts.model}`);
    else problems.push(`model id ${id} is not the current one, use ${facts.tts.model}`);
  }
  for (const m of line.matchAll(/(?:cartesia[-_ ]?version|cartesiaVersion|CARTESIA_VERSION)\W{0,6}(\d{4}-\d{2}-\d{2})/gi)) {
    if (m[1] !== facts.apiVersion) problems.push(`Cartesia-Version ${m[1]}, use ${facts.apiVersion}`);
  }
  return problems;
}

export function checkFacts(root) {
  const facts = loadFacts(root);
  const errors = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const st = statSync(path);
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(name) && !SKIP_PATHS.includes(relative(root, path))) walk(path);
        continue;
      }
      if (SKIP_FILES.has(name) || !TEXT.has(extname(name)) || st.size > 2_000_000) continue;
      readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
        for (const p of checkLine(line, facts)) errors.push(`${relative(root, path)}:${i + 1}: ${p}`);
      });
    }
  })(root);
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '../..'));
  const errors = checkFacts(root);
  if (errors.length) {
    console.error(errors.join('\n'));
    console.error(`\n${errors.length} problem(s). Facts live in facts.json.`);
    process.exit(1);
  }
  console.log('facts ok');
}
