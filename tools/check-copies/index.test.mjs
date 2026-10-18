import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { GROUPS, checkCopies, copyPairs } from './index.mjs';

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'cp-'));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  return root;
}

const base = {
  'packages/kit/components/ui/button.tsx': 'button',
  'packages/kit/components/blocks/field.tsx': 'field',
  'packages/agents-web/src/client.ts': 'client',
  'packages/agents-web/src/audio/pcm.ts': 'pcm',
  ...Object.fromEntries(GROUPS.flatMap((g, i) => g.map((p) => [p, `group ${i}`]))),
};
const groupPairs = GROUPS.reduce((n, g) => n + g.length - 1, 0);

test('identical copies pass', () => {
  const root = tree({
    ...base,
    'examples/a/components/ui/button.tsx': 'button',
    'examples/a/components/blocks/field.tsx': 'field',
    'examples/a/components/other.tsx': 'anything',
    'examples/a/lib/agents-web/audio/pcm.ts': 'pcm',
    'examples/docs-voice-widget/widget/src/agents-web/client.ts': 'client',
  });
  assert.deepEqual(checkCopies(root), []);
  assert.equal(copyPairs(root).length, 4 + groupPairs);
});

test('an edited copy fails', () => {
  const root = tree({ ...base, 'examples/a/components/blocks/field.tsx': 'field changed' });
  assert.match(checkCopies(root)[0], /examples\/a\/components\/blocks\/field.tsx: differs/);
});

test('a drifted agents-web copy fails in both places', () => {
  const root = tree({
    ...base,
    'examples/a/lib/agents-web/client.ts': 'old',
    'examples/docs-voice-widget/widget/src/agents-web/audio/pcm.ts': 'old',
  });
  assert.equal(checkCopies(root).length, 2);
});

test('a file with no package source fails', () => {
  const root = tree({ ...base, 'examples/a/components/ui/fancy.tsx': 'x' });
  assert.match(checkCopies(root)[0], /no packages\/kit\/components\/ui\/fancy.tsx/);
});

test('voice-journal is skipped', () => {
  const root = tree({ ...base, 'examples/voice-journal/components/ui/button.tsx': 'react native' });
  assert.deepEqual(checkCopies(root).filter((e) => e.includes('components/')), []);
});

test('shared proxy, rate limit and proxy test copies must match article-to-podcast', () => {
  const root = tree({ ...base, 'examples/meeting-notes/proxy.ts': 'proxy edited' });
  assert.deepEqual(checkCopies(root), [
    'examples/meeting-notes/proxy.ts: differs from examples/article-to-podcast/proxy.ts. Copy the source file over it.',
  ]);
});

test('a template missing a shared copy fails', () => {
  const { 'examples/story-time/proxy.ts': _, ...rest } = base;
  assert.deepEqual(checkCopies(tree(rest)), [
    'examples/story-time/proxy.ts: missing, it should be a copy of examples/article-to-podcast/proxy.ts.',
  ]);
});

test('third-party notices copies must match the root file', () => {
  const root = tree({ ...base, 'examples/front-desk/THIRD_PARTY_NOTICES.md': 'edited' });
  assert.deepEqual(checkCopies(root), [
    'examples/front-desk/THIRD_PARTY_NOTICES.md: differs from THIRD_PARTY_NOTICES.md. Copy the source file over it.',
  ]);
  const { 'packages/kit/THIRD_PARTY_NOTICES.md': _, ...rest } = base;
  assert.deepEqual(checkCopies(tree(rest)), [
    'packages/kit/THIRD_PARTY_NOTICES.md: missing, it should be a copy of THIRD_PARTY_NOTICES.md.',
  ]);
});
