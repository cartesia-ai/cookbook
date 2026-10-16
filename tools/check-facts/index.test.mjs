import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLine } from './index.mjs';

const facts = {
  apiVersion: '2026-08-14',
  tts: { model: 'sonic-3.6', snapshot: 'sonic-3.6-2026-08-27' },
  retired: ['sonic-2', 'sonic-turbo', 'sonic-3-2025-10-27', 'sonic', 'sonic-english', 'sonic-multilingual'],
  deprecatedAliases: ['sonic-latest', 'sonic-3-latest'],
};

test('current model, snapshot and version pass', () => {
  assert.deepEqual(checkLine(`model_id: "sonic-3.6", "Cartesia-Version": "2026-08-14"`, facts), []);
  assert.deepEqual(checkLine('pin sonic-3.6-2026-08-27 in production.', facts), []);
});

test('retired ids, aliases and other versions fail', () => {
  assert.match(checkLine(`model_id: "sonic-2"`, facts)[0], /retired/);
  assert.match(checkLine(`model: 'sonic-latest'`, facts)[0], /deprecated alias/);
  assert.match(checkLine(`model_id="sonic-3.5"`, facts)[0], /not the current one/);
  assert.match(checkLine(`-H "Cartesia-Version: 2026-03-01"`, facts)[0], /2026-08-14/);
});

test('the brand word Sonic in prose passes, the bare model id does not', () => {
  assert.deepEqual(checkLine('Sonic reads the reply out loud.', facts), []);
  assert.match(checkLine(`model_id: "sonic"`, facts)[0], /retired/);
});

test('the allow marker skips a line', () => {
  assert.deepEqual(checkLine('sonic-2 retires on 2026-10-20 <!-- allow-model-id -->', facts), []);
});
