import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSnippets, firstMissing } from './index.mjs';

const SOURCE = `import { a } from "./a";

export function run(x: number) {
  const y = a(x);
  if (y > 1) {
    return y;
  }
  return 0;
}
`;

function repo({ recipe, catalogRecipe = 'content/cookbook/01-s/01-r.mdx', source = SOURCE }) {
  const root = mkdtempSync(join(tmpdir(), 'cs-'));
  const files = {
    'examples/demo/lib/run.ts': source,
    'content/cookbook/01-s/01-r.mdx': recipe,
    'templates.json': JSON.stringify({ templates: [{ slug: 'demo', recipe: catalogRecipe }] }),
  };
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  return {
    contentDir: join(root, 'content/cookbook'),
    examplesDir: join(root, 'examples'),
    catalogPath: join(root, 'templates.json'),
  };
}

const recipe = (body, front = '') =>
  `---\ntitle: T\n${front}---\n\n# T\n\n\`\`\`ts filename="lib/run.ts"\n${body}\n\`\`\`\n`;

test('real tree passes', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const errors = checkSnippets({
    contentDir: join(root, 'content/cookbook'),
    examplesDir: join(root, 'examples'),
    catalogPath: join(root, 'templates.json'),
  });
  assert.deepEqual(errors, []);
});

test('an excerpt with skipped lines and different indentation passes', () => {
  const body = 'export function run(x: number) {\n\n    const y = a(x);\n  return 0;\n}';
  assert.deepEqual(checkSnippets(repo({ recipe: recipe(body) })), []);
});

test('a changed line fails with recipe line and file name', () => {
  const body = 'export function run(x: number) {\n  const y = b(x);\n}';
  const [err, ...rest] = checkSnippets(repo({ recipe: recipe(body) }));
  assert.equal(rest.length, 0);
  assert.match(err, /01-r\.mdx:9: lib\/run\.ts \(demo\) does not contain, in order: const y = b\(x\);/);
});

test('lines out of order fail', () => {
  const body = 'return 0;\nconst y = a(x);';
  assert.match(checkSnippets(repo({ recipe: recipe(body) })).join('\n'), /in order: const y = a\(x\);/);
});

test('a partial line fails', () => {
  assert.equal(checkSnippets(repo({ recipe: recipe('const y =') })).length, 1);
});

test('a filename that is not in the template fails', () => {
  const text = '---\ntitle: T\n---\n\n```ts filename="lib/sketch.ts"\nanything at all\n```\n';
  assert.match(checkSnippets(repo({ recipe: text })).join('\n'), /01-r\.mdx:5: lib\/sketch\.ts is not a file in demo/);
});

test('a standalone block is skipped even when the file is missing', () => {
  const text = '---\ntitle: T\n---\n\n```ts filename="lib/sketch.ts" standalone\nanything at all\n```\n';
  assert.deepEqual(checkSnippets(repo({ recipe: text })), []);
});

test('a standalone block is skipped even when the file exists', () => {
  const text = '---\ntitle: T\n---\n\n```ts standalone filename="lib/run.ts"\nanything at all\n```\n';
  assert.deepEqual(checkSnippets(repo({ recipe: text })), []);
});

test('blocks without a filename are skipped', () => {
  const text = '---\ntitle: T\n---\n\n```ts\nanything at all\n```\n';
  assert.deepEqual(checkSnippets(repo({ recipe: text })), []);
});

test('falls back to the template the recipe links to most', () => {
  const text = `${recipe('const y = b(x);')}\nSee [the app](../../../examples/demo) and [again](../../../examples/demo/README.md).\n`;
  assert.equal(checkSnippets(repo({ recipe: text, catalogRecipe: null })).length, 1);
});

test('accepts a GitHub link as the fallback', () => {
  const text = `${recipe('const y = b(x);')}\n[app](https://github.com/cartesia-ai/cookbook/tree/main/examples/demo)\n`;
  assert.equal(checkSnippets(repo({ recipe: text, catalogRecipe: null })).length, 1);
});

test('a recipe with no template is skipped', () => {
  assert.deepEqual(checkSnippets(repo({ recipe: recipe('const y = b(x);'), catalogRecipe: null })), []);
});

test('a template frontmatter field wins and must exist', () => {
  const errors = checkSnippets(repo({ recipe: recipe('x', 'template: missing\n') }));
  assert.match(errors.join('\n'), /template missing not found/);
});

test('firstMissing reports the snippet line', () => {
  const miss = firstMissing([{ text: 'a', line: 3 }, { text: '', line: 4 }, { text: 'z', line: 5 }], 'a\nb\n');
  assert.deepEqual(miss, { text: 'z', line: 5 });
});
