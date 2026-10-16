import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkContent } from './index.mjs';

const good = (extra = '') =>
  `---\ntitle: T\ndescription: D\ntags: ['a']\n---\n\n# T\n\n${extra}\n`;
const idx = '---\ntitle: T\ndescription: D\n---\n\n# T\n';

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'cc-'));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  return root;
}

test('real tree passes', () => {
  const real = join(dirname(fileURLToPath(import.meta.url)), '../../content/cookbook');
  assert.deepEqual(checkContent(real), []);
});

test('valid tree passes and sonic-3.6 is allowed', () => {
  const root = tree({ '00-a/index.mdx': idx, '00-a/01-x.mdx': good('model sonic-3.6 and ink-2') });
  assert.deepEqual(checkContent(root), []);
});

test('missing index', () => {
  const root = tree({ '00-a/01-x.mdx': good() });
  assert.match(checkContent(root).join('\n'), /no index\.mdx/);
});

test('bad frontmatter', () => {
  const root = tree({ '00-a/index.mdx': idx, '00-a/01-x.mdx': '# no frontmatter\n' });
  assert.match(checkContent(root).join('\n'), /missing frontmatter/);
});

test('banned model id, and the allow marker', () => {
  const bad = tree({ '00-a/index.mdx': idx, '00-a/01-x.mdx': good('use sonic-turbo') });
  assert.match(checkContent(bad).join('\n'), /banned model id: sonic-turbo/);
  const ok = tree({ '00-a/index.mdx': idx, '00-a/01-x.mdx': good('never sonic-turbo <!-- allow-model-id -->') });
  assert.deepEqual(checkContent(ok), []);
});

test('broken link, unclosed fence, em dash', () => {
  const root = tree({
    '00-a/index.mdx': idx,
    '00-a/01-x.mdx': good('[x](./nope.mdx)\n\nbad \u2014 dash\n\n```ts\nconst a = 1;'),
  });
  const out = checkContent(root).join('\n');
  assert.match(out, /broken link/);
  assert.match(out, /em dash/);
  assert.match(out, /never closed/);
});
