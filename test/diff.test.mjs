import test from 'node:test';
import assert from 'node:assert/strict';
import { collectFresh, freshJobs, nextState } from '../scripts/lib/diff.mjs';

const job = (id) => ({ id, title: id, company: 'Zoom', url: `https://example.test/${id}` });
const ok = (jobs) => ({ target: { id: 'zoom' }, ok: true, jobs });
const failed = { target: { id: 'zoom' }, ok: false, jobs: [], error: 'HTTP 503' };

test('a first run announces nothing and seeds the state', () => {
  const results = [ok([job('zoom:R1'), job('zoom:R2')])];
  assert.deepEqual(collectFresh({}, results), []);
  assert.deepEqual(nextState({}, results), { zoom: ['zoom:R1', 'zoom:R2'] });
});

test('an empty first run still seeds, so the next req pushes', () => {
  const seeded = nextState({}, [ok([])]);
  assert.deepEqual(seeded, { zoom: [] });
  assert.deepEqual(collectFresh(seeded, [ok([job('zoom:R18266')])]).map((j) => j.id), ['zoom:R18266']);
});

test('only unseen ids come back', () => {
  const previous = { zoom: ['zoom:R1'] };
  const results = [ok([job('zoom:R1'), job('zoom:R2')])];
  assert.deepEqual(collectFresh(previous, results).map((j) => j.id), ['zoom:R2']);
});

test('a req that is still open on the next run does not push twice', () => {
  const previous = { zoom: ['zoom:R1', 'zoom:R2'] };
  assert.deepEqual(collectFresh(previous, [ok([job('zoom:R1'), job('zoom:R2')])]), []);
});

test('a closed req is pruned, and pushes again only if it truly reopens', () => {
  const previous = { zoom: ['zoom:R1', 'zoom:R2'] };
  const after = nextState(previous, [ok([job('zoom:R1')])]);
  assert.deepEqual(after, { zoom: ['zoom:R1'] });
  assert.deepEqual(collectFresh(after, [ok([job('zoom:R1'), job('zoom:R2')])]).map((j) => j.id), ['zoom:R2']);
});

test('a failed fetch keeps the old state and announces nothing', () => {
  const previous = { zoom: ['zoom:R1'] };
  assert.deepEqual(collectFresh(previous, [failed]), []);
  assert.deepEqual(nextState(previous, [failed]), previous);
});

test('a failed fetch cannot replay the whole board on the next run', () => {
  const previous = { zoom: ['zoom:R1'] };
  const afterFailure = nextState(previous, [failed]);
  assert.deepEqual(collectFresh(afterFailure, [ok([job('zoom:R1')])]), []);
});

test('freshJobs treats a missing entry as a first run', () => {
  assert.deepEqual(freshJobs(null, [job('zoom:R1')]), []);
  assert.deepEqual(freshJobs([], [job('zoom:R1')]).map((j) => j.id), ['zoom:R1']);
});

test('one broken target does not block another', () => {
  const previous = { zoom: ['zoom:R1'], other: ['other:R9'] };
  const results = [failed, { target: { id: 'other' }, ok: true, jobs: [job('other:R9'), job('other:R10')] }];
  assert.deepEqual(collectFresh(previous, results).map((j) => j.id), ['other:R10']);
  assert.deepEqual(nextState(previous, results), { zoom: ['zoom:R1'], other: ['other:R10', 'other:R9'] });
});
