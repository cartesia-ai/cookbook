import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NEXT = ['article-to-podcast', 'meeting-notes', 'pocket-interpreter', 'speaking-partner', 'story-time', 'voice-chat'];
const NOTICES = [
  'packages/kit',
  ...['article-to-podcast', 'meeting-notes', 'pocket-interpreter', 'speaking-partner', 'voice-chat', 'voice-journal', 'docs-voice-widget', 'front-desk', 'audiobook', 'story-time'].map((s) => `examples/${s}`),
];
export const GROUPS = [
  NEXT.map((s) => `examples/${s}/proxy.ts`),
  [...NEXT.map((s) => `examples/${s}/lib/rate-limit.ts`), 'examples/voice-journal/lib/server/rate-limit.ts'],
  NEXT.map((s) => `examples/${s}/tests/proxy.test.ts`),
  [
    ...['meeting-notes', 'pocket-interpreter', 'story-time', 'article-to-podcast'].map((s) => `examples/${s}/lib/llm.ts`),
    'examples/voice-journal/lib/server/llm.ts',
  ],
  ['THIRD_PARTY_NOTICES.md', ...NOTICES.map((d) => `${d}/THIRD_PARTY_NOTICES.md`)],
];

function files(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path).map((f) => join(name, f)));
    else out.push(name);
  }
  return out.sort();
}

export function copyPairs(root) {
  const pairs = [];
  const examples = join(root, 'examples');
  const slugs = existsSync(examples)
    ? readdirSync(examples).filter((d) => !d.startsWith('_') && statSync(join(examples, d)).isDirectory())
    : [];
  for (const slug of slugs) {
    if (slug !== 'voice-journal') {
      for (const part of ['components/ui', 'components/blocks']) {
        for (const f of files(join(examples, slug, part)))
          pairs.push([join('examples', slug, part, f), join('packages/kit', part, f)]);
      }
    }
    for (const f of files(join(examples, slug, 'lib/agents-web')))
      pairs.push([join('examples', slug, 'lib/agents-web', f), join('packages/agents-web/src', f)]);
  }
  for (const [source, ...copies] of GROUPS) {
    for (const copy of copies) pairs.push([copy, source]);
  }
  const widget = 'examples/docs-voice-widget/widget/src/agents-web';
  for (const f of files(join(root, widget))) pairs.push([join(widget, f), join('packages/agents-web/src', f)]);
  return pairs;
}

export function checkCopies(root) {
  const errors = [];
  for (const [copy, source] of copyPairs(root)) {
    if (!existsSync(join(root, copy))) {
      errors.push(`${copy}: missing, it should be a copy of ${source}.`);
    } else if (!existsSync(join(root, source))) {
      errors.push(`${copy}: no ${source} to copy from. Give a template-only file a different name outside this folder.`);
    } else if (!readFileSync(join(root, copy)).equals(readFileSync(join(root, source)))) {
      errors.push(`${copy}: differs from ${source}. Copy the source file over it.`);
    }
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '../..'));
  const errors = checkCopies(root);
  if (errors.length) {
    console.error(errors.join('\n'));
    console.error(`\n${errors.length} problem(s).`);
    process.exit(1);
  }
  console.log(`copies ok (${copyPairs(root).length} files)`);
}
