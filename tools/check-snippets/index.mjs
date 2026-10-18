import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SLUG_LINK = /(?:\.\.\/)+examples\/([a-z0-9-]+)|github\.com\/cartesia-ai\/cookbook\/(?:tree|blob)\/[^/\s)]+\/examples\/([a-z0-9-]+)/g;

function recipeFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...recipeFiles(p));
    else if (name.endsWith('.mdx') || name.endsWith('.md')) out.push(p);
  }
  return out;
}

function frontmatterField(text, key) {
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) return undefined;
  const m = fm[1].match(new RegExp(`^${key}:\\s*['"]?([^'"\\n]*?)['"]?\\s*$`, 'm'));
  return m?.[1] || undefined;
}

function linkedSlug(text, examplesDir) {
  const counts = new Map();
  for (const m of text.matchAll(SLUG_LINK)) {
    const slug = m[1] ?? m[2];
    if (existsSync(join(examplesDir, slug))) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  let best;
  for (const [slug, n] of counts) if (!best || n > counts.get(best)) best = slug;
  return best;
}

export function findBlocks(text) {
  const blocks = [];
  const lines = text.split('\n');
  let open = null;
  lines.forEach((line, i) => {
    if (open === null) {
      const m = line.match(/^(`{3,}|~{3,})(\S*)(.*)$/);
      if (!m) return;
      const filename = m[3].match(/filename="([^"]+)"/)?.[1];
      open = { fence: m[1], lang: m[2], filename, line: i + 1, body: [] };
    } else if (line.trim().startsWith(open.fence) && line.trim().replace(/[`~]/g, '') === '') {
      blocks.push(open);
      open = null;
    } else {
      open.body.push({ text: line, line: i + 1 });
    }
  });
  return blocks;
}

export function firstMissing(snippet, source) {
  const src = source.split('\n').map((l) => l.trim());
  let at = 0;
  for (const { text, line } of snippet) {
    const want = text.trim();
    if (!want) continue;
    while (at < src.length && src[at] !== want) at++;
    if (at === src.length) return { text: want, line };
    at++;
  }
  return null;
}

export function checkSnippets({ contentDir, examplesDir, catalogPath }) {
  const errors = [];
  const byRecipe = new Map();
  if (catalogPath && existsSync(catalogPath)) {
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
    const repoRoot = dirname(catalogPath);
    for (const t of catalog.templates ?? []) {
      if (t.recipe) byRecipe.set(resolve(repoRoot, t.recipe), t.slug);
    }
  }

  for (const file of recipeFiles(contentDir)) {
    const text = readFileSync(file, 'utf8');
    const slug = frontmatterField(text, 'template') ?? byRecipe.get(resolve(file)) ?? linkedSlug(text, examplesDir);
    if (!slug) continue;
    const templateDir = join(examplesDir, slug);
    if (!existsSync(templateDir)) {
      errors.push(`${file}:1: template ${slug} not found in ${examplesDir}`);
      continue;
    }
    for (const block of findBlocks(text)) {
      if (!block.filename) continue;
      const source = join(templateDir, block.filename);
      if (!existsSync(source) || !statSync(source).isFile()) continue;
      const miss = firstMissing(block.body, readFileSync(source, 'utf8'));
      if (miss) {
        errors.push(
          `${file}:${miss.line}: ${block.filename} (${slug}) does not contain, in order: ${miss.text}`,
        );
      }
    }
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(HERE, '../..');
  const errors = checkSnippets({
    contentDir: resolve(process.argv[2] ?? join(root, 'content/cookbook')),
    examplesDir: join(root, 'examples'),
    catalogPath: join(root, 'templates.json'),
  });
  if (errors.length) {
    console.error(errors.map((e) => relative(process.cwd(), e.split(':')[0]) + e.slice(e.indexOf(':'))).join('\n'));
    console.error(`\n${errors.length} snippet(s) out of sync with their template`);
    process.exit(1);
  }
  console.log('snippets ok');
}
