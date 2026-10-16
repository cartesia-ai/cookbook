import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FACTS = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../facts.json'), 'utf8'));
const BANNED = [...FACTS.retired.filter((id) => id !== 'sonic'), ...FACTS.deprecatedAliases];
const bannedRe = new RegExp(`(?<![\\w.-])(${BANNED.join('|')})(?![\\w.-])`);
const ALLOW = '<!-- allow-model-id -->';
const EM_DASH = '\u2014';

export function checkContent(root) {
  const errors = [];
  const err = (file, line, msg) => errors.push(`${file}${line ? ':' + line : ''}: ${msg}`);

  if (!existsSync(root)) return [`${root}: content directory not found`];

  for (const section of readdirSync(root).sort()) {
    const dir = join(root, section);
    if (!statSync(dir).isDirectory()) continue;
    if (!/^\d{2}-[a-z0-9-]+$/.test(section)) err(dir, 0, 'section name must match NN-name');
    if (!existsSync(join(dir, 'index.mdx'))) err(dir, 0, 'section has no index.mdx');

    for (const name of readdirSync(dir).sort()) {
      if (name === 'index.mdx') checkFile(join(dir, name), true);
      else if (/^\d{2}-[a-z0-9-]+\.mdx$/.test(name)) checkFile(join(dir, name), false);
      else err(join(dir, name), 0, 'file name must match NN-name.mdx');
    }
  }
  return errors;

  function checkFile(file, isIndex) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');

    const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
    if (!fm) {
      err(file, 1, 'missing frontmatter');
    } else {
      const field = (k) => (fm[1].match(new RegExp(`^${k}:\\s*(.*)$`, 'm')) || [])[1]?.trim();
      if (!field('title')) err(file, 1, 'frontmatter needs a title');
      if (!field('description')) err(file, 1, 'frontmatter needs a description');
      if (!isIndex && !/^\[.+\]$/.test(field('tags') ?? '')) err(file, 1, "frontmatter needs tags: ['a', 'b']");
    }

    let fence = null;
    lines.forEach((line, i) => {
      const n = i + 1;
      if (line.includes(EM_DASH)) err(file, n, 'em dash');
      if (bannedRe.test(line) && !line.includes(ALLOW)) err(file, n, `banned model id: ${line.match(bannedRe)[1]}`);
      if (/^```/.test(line)) fence = fence === null ? n : null;
      if (fence === null || /^```/.test(line)) return;
    });
    if (fence !== null) err(file, fence, 'code fence is never closed');

    let inFence = false;
    lines.forEach((line, i) => {
      if (/^```/.test(line)) inFence = !inFence;
      if (inFence) return;
      for (const m of line.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = m[1].split('#')[0];
        if (!target || /^[a-z]+:/i.test(target) || target.startsWith('mailto:')) continue;
        if (!existsSync(resolve(dirname(file), target))) err(file, i + 1, `broken link: ${m[1]}`);
      }
    });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '../../content/cookbook'));
  const errors = checkContent(root);
  if (errors.length) {
    console.error(errors.join('\n'));
    console.error(`\n${errors.length} problem(s)`);
    process.exit(1);
  }
  console.log('content ok');
}
