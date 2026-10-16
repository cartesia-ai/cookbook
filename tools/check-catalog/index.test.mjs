import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { checkCatalog, frontmatterTitle } from './index.mjs';

const raw = 'https://raw.githubusercontent.com/cartesia-ai/cookbook/main/';
const facts = { apiVersion: '2026-08-14', tts: { model: 'sonic-3.6' }, stt: { streaming: 'ink-2', file: 'ink-whisper' } };
const mention = 'sonic-3.6 ink-2 ink-whisper 2026-08-14';
const template = (over = {}) => ({
  slug: 'demo',
  title: 'Demo',
  description: 'A demo.',
  category: 'voice-agents',
  models: ['sonic-3.6'],
  features: ['barge-in'],
  env: { required: ['CARTESIA_API_KEY'], oneOf: [], optional: ['APP_PASSWORD'] },
  path: 'examples/demo',
  readme: 'examples/demo/README.md',
  agents: 'examples/demo/AGENTS.md',
  deploy: {},
  ...over,
});
const pkg = {
  name: 'demo',
  description: 'A demo.',
  keywords: ['cartesia'],
  repository: { type: 'git', url: 'https://github.com/cartesia-ai/cookbook.git', directory: 'examples/demo' },
};
const recipe = '---\ntitle: Say hello\ndescription: D\ntags: [a]\n---\n\n# Say hello\n';
const llmsOk = `${mention}\n[Demo](${raw}examples/demo/README.md) ${raw}examples/demo/AGENTS.md\n- [Say hello](${raw}content/cookbook/00-a/01-hello.mdx): D\n`;

function tree(over = {}) {
  const files = {
    'facts.json': JSON.stringify(facts),
    'templates.json': JSON.stringify({ categories: { 'voice-agents': 'Voice agents' }, templates: [template()] }),
    'README.md': `${mention} [demo](examples/demo)`,
    'AGENTS.md': mention,
    'context7.json': mention,
    'llms.txt': llmsOk,
    'examples/demo/README.md': '# Demo',
    'examples/demo/AGENTS.md': '# Demo',
    'examples/demo/CLAUDE.md': '@AGENTS.md',
    'examples/demo/.env.example': 'CARTESIA_API_KEY=\nAPP_PASSWORD=\n',
    'examples/demo/package.json': JSON.stringify(pkg),
    'content/cookbook/00-a/index.mdx': '---\ntitle: A\n---\n',
    'content/cookbook/00-a/01-hello.mdx': recipe,
    ...over,
  };
  const root = mkdtempSync(join(tmpdir(), 'cat-'));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  return root;
}

test('a consistent repo passes', () => {
  assert.deepEqual(checkCatalog(tree()).errors, []);
});

test('a recipe missing from llms.txt fails', () => {
  const { errors } = checkCatalog(tree({ 'content/cookbook/00-a/02-bye.mdx': recipe.replaceAll('Say hello', 'Say bye') }));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /llms.txt does not list content\/cookbook\/00-a\/02-bye.mdx/);
});

test('a recipe listed under an old title fails', () => {
  const { errors } = checkCatalog(tree({ 'llms.txt': llmsOk.replace('[Say hello]', '[Hello]') }));
  assert.match(errors[0], /\[Say hello\]/);
});

test('env drift and unknown features fail', () => {
  const t = template({ features: ['telepathy'] });
  const { errors } = checkCatalog(
    tree({
      'templates.json': JSON.stringify({ categories: { 'voice-agents': 'V' }, templates: [t] }),
      'examples/demo/.env.example': 'CARTESIA_API_KEY=\nEXTRA=\n',
    }),
  );
  assert.ok(errors.some((e) => /unknown feature telepathy/.test(e)));
  assert.ok(errors.some((e) => /env APP_PASSWORD is not in .env.example/.test(e)));
  assert.ok(errors.some((e) => /.env.example has EXTRA/.test(e)));
});

test('frontmatter titles may be quoted', () => {
  assert.equal(frontmatterTitle("---\ntitle: 'Quoted, title'\n---\n"), 'Quoted, title');
});

test('a package.json without keywords or repository fails', () => {
  const { errors } = checkCatalog(
    tree({ 'examples/demo/package.json': JSON.stringify({ name: 'demo', description: 'A demo.' }) }),
  );
  assert.deepEqual(errors, [
    'examples/demo/package.json: no keywords',
    'examples/demo/package.json: repository.directory should be examples/demo',
  ]);
});

test('a Python template needs description and keywords in pyproject.toml', () => {
  const ok = '[project]\nname = "demo"\ndescription = "A demo."\nkeywords = ["cartesia", "tts"]\n';
  const withPy = (toml) => {
    const root = tree({ 'examples/demo/pyproject.toml': toml });
    rmSync(join(root, 'examples/demo/package.json'));
    return checkCatalog(root).errors;
  };
  assert.deepEqual(withPy(ok), []);
  assert.deepEqual(withPy('[project]\nname = "demo"\ndescription = "A demo."\n'), [
    'examples/demo/pyproject.toml: no keywords',
  ]);
});

test('a template with no manifest fails', () => {
  const root = tree();
  rmSync(join(root, 'examples/demo/package.json'));
  assert.deepEqual(checkCatalog(root).errors, ['examples/demo has no package.json or pyproject.toml']);
});

test('a missing CLAUDE.md is an error', () => {
  const root = tree();
  rmSync(join(root, 'examples/demo/CLAUDE.md'));
  assert.deepEqual(checkCatalog(root).errors, ['examples/demo/CLAUDE.md is missing']);
});
