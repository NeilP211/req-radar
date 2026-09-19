import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWorkday, normalizeWorkday, workdayJobsUrl } from '../scripts/lib/boards.mjs';
import { fetchTarget } from '../scripts/lib/boards.mjs';

const ZOOM = {
  id: 'zoom',
  company: 'Zoom',
  board: 'workday',
  host: 'https://zoom.wd5.myworkdayjobs.com',
  site: 'zoom',
  tenant: 'zoom',
};

// The shape Zoom's board really returns, copied from a live response.
const POSTING = {
  title: 'Software Engineer - Intern',
  externalPath: '/job/San-Jose-CA/Software-Engineer---Intern_R18266-1',
  locationsText: 'San Jose (CA)',
  bulletFields: ['R18266'],
};

test('the search endpoint is built the way Workday expects', () => {
  assert.equal(workdayJobsUrl(ZOOM), 'https://zoom.wd5.myworkdayjobs.com/wday/cxs/zoom/zoom/jobs');
});

test('a posting normalizes to a record with a link that resolves', () => {
  assert.deepEqual(normalizeWorkday(ZOOM, POSTING), {
    id: 'zoom:R18266',
    reqId: 'R18266',
    company: 'Zoom',
    title: 'Software Engineer - Intern',
    location: 'San Jose (CA)',
    url: 'https://zoom.wd5.myworkdayjobs.com/zoom/job/San-Jose-CA/Software-Engineer---Intern_R18266-1',
  });
});

test('a posting with no req id falls back to its path, so it still dedupes', () => {
  const job = normalizeWorkday(ZOOM, { ...POSTING, bulletFields: [] });
  assert.equal(job.id, 'zoom:/job/San-Jose-CA/Software-Engineer---Intern_R18266-1');
  assert.equal(job.reqId, null);
});

function pager(pages, calls) {
  return async (url, body) => {
    calls.push(body.offset);
    return { total: pages.flat().length, jobPostings: pages[body.offset / 20] ?? [] };
  };
}

test('the whole board is paged through, 20 at a time', async () => {
  const filler = Array.from({ length: 20 }, (_, i) => ({ ...POSTING, title: `Account Executive ${i}`, bulletFields: [`R${i}`] }));
  const calls = [];
  const jobs = await fetchWorkday(ZOOM, { post: pager([filler, [POSTING]], calls) });
  assert.deepEqual(calls, [0, 20]);
  assert.deepEqual(jobs.map((j) => j.reqId), ['R18266']);
});

test('only student reqs survive the filter', async () => {
  const postings = [
    POSTING,
    { ...POSTING, title: 'Zoom International Employment Counsel', bulletFields: ['R19334'] },
    { ...POSTING, title: 'AI Infrastructure Intern', bulletFields: ['R18355'] },
  ];
  const jobs = await fetchWorkday(ZOOM, { post: async () => ({ total: 3, jobPostings: postings }) });
  assert.deepEqual(jobs.map((j) => j.reqId), ['R18266', 'R18355']);
});

test('a short page ends the walk instead of spinning', async () => {
  let calls = 0;
  const jobs = await fetchWorkday(ZOOM, {
    post: async () => {
      calls += 1;
      return { total: 900, jobPostings: [] };
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(jobs, []);
});

test('an unknown board type is a loud error, not a silent empty board', async () => {
  await assert.rejects(
    () => fetchTarget({ ...ZOOM, board: 'lever' }),
    /no adapter for board "lever"/,
  );
});

test('the shipped targets file is wired to a real adapter', async () => {
  const { default: targets } = await import('../data/targets.json', { with: { type: 'json' } });
  assert.ok(targets.length > 0);
  for (const target of targets) {
    assert.ok(['workday'].includes(target.board), target.board);
    for (const field of ['id', 'company', 'host', 'site', 'tenant']) {
      assert.ok(target[field], `${target.id} is missing ${field}`);
    }
  }
});
