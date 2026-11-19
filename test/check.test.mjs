import test from 'node:test';
import assert from 'node:assert/strict';
import { exitCodeFor } from '../scripts/check.mjs';

const ok = { ok: true };
const failed = { ok: false };

test('one board failing does not fail the run, so the others still alert', () => {
  assert.equal(exitCodeFor([failed, ok]), 0);
});

test('every board failing fails the run', () => {
  assert.equal(exitCodeFor([failed, failed]), 1);
});

test('a clean run passes', () => {
  assert.equal(exitCodeFor([ok, ok]), 0);
});
