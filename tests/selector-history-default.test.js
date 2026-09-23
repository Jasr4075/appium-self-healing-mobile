import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const { default: selectorHistory } = await import('../src/selector-history.js');

test('selectorHistory: usa caminho padrão quando HEALING_HISTORY_PATH não está definido', () => {
  assert.equal(process.env.HEALING_HISTORY_PATH, undefined);
  assert.equal(
    selectorHistory.historyFile,
    path.join(process.cwd(), 'output', 'logs', 'self-healing', 'selector-history.json'),
  );
});
