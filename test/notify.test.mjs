import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessages } from '../scripts/notify.mjs';

const job = (n) => ({
  id: `zoom:R${n}`,
  reqId: `R${n}`,
  company: 'Zoom',
  title: `AI Infrastructure Intern ${n}`,
  location: 'Seattle (WA)',
  url: `https://zoom.wd5.myworkdayjobs.com/zoom/job/Seattle-WA/ai_R${n}`,
});

test('nothing new sends nothing', () => {
  assert.deepEqual(buildMessages([], 'topic'), []);
});

test('one req becomes one tappable push on the given topic', () => {
  const [msg] = buildMessages([job(1)], 'rr-topic');
  assert.equal(msg.topic, 'rr-topic');
  assert.match(msg.title, /^Zoom posted: AI Infrastructure Intern 1$/);
  assert.match(msg.message, /Seattle \(WA\)/);
  assert.match(msg.message, /R1/);
  assert.equal(msg.click, job(1).url);
  assert.equal(msg.priority, 5);
});

test('a six req batch day still sends six separate links', () => {
  const msgs = buildMessages([1, 2, 3, 4, 5, 6].map(job), 'topic');
  assert.equal(msgs.length, 6);
  assert.equal(new Set(msgs.map((m) => m.click)).size, 6);
});

test('a dump larger than a batch day collapses into one summary', () => {
  const msgs = buildMessages(Array.from({ length: 14 }, (_, i) => job(i)), 'topic');
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].title, '14 new intern reqs');
  assert.match(msgs[0].message, /and 4 more/);
});

test('a long title is trimmed to what a phone will show', () => {
  const [msg] = buildMessages([{ ...job(1), title: 'x'.repeat(300) }], 'topic');
  assert.ok(msg.title.length <= 120);
});
