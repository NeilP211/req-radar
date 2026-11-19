import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWorkday, normalizeWorkday, workdayJobsUrl } from '../scripts/lib/boards.mjs';
import { fetchTarget, fetchGreenhouse, normalizeGreenhouse } from '../scripts/lib/boards.mjs';
import { isStudentReq } from '../scripts/lib/match.mjs';

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
  const required = {
    workday: ['id', 'company', 'host', 'site', 'tenant'],
    greenhouse: ['id', 'company', 'token'],
  };
  for (const target of targets) {
    assert.ok(target.board in required, target.board);
    for (const field of required[target.board]) {
      assert.ok(target[field], `${target.id} is missing ${field}`);
    }
  }
});

// Greenhouse: the shape Reddit's board really returns, trimmed to the fields that matter.
const REDDIT = { id: 'reddit', company: 'Reddit', board: 'greenhouse', token: 'reddit' };
const GH_POSTING = {
  id: 8153017,
  title: 'Software Engineer Intern, Summer 2027',
  absolute_url: 'https://job-boards.greenhouse.io/reddit/jobs/8153017',
  location: { name: 'San Francisco, CA' },
  requisition_id: 'R-105817',
};

test('a Greenhouse board is one GET on the public jobs endpoint', async () => {
  const calls = [];
  const get = async (url) => { calls.push(url); return { jobs: [] }; };
  await fetchTarget(REDDIT, { get });
  assert.deepEqual(calls, ['https://boards-api.greenhouse.io/v1/boards/reddit/jobs']);
});

test('a Greenhouse posting normalizes with its req id and a link that resolves', () => {
  assert.deepEqual(normalizeGreenhouse(REDDIT, GH_POSTING), {
    id: 'reddit:8153017',
    reqId: 'R-105817',
    company: 'Reddit',
    title: 'Software Engineer Intern, Summer 2027',
    location: 'San Francisco, CA',
    url: 'https://job-boards.greenhouse.io/reddit/jobs/8153017',
  });
});

test('Greenhouse keeps only student reqs', async () => {
  const get = async () => ({ jobs: [
    GH_POSTING,
    { ...GH_POSTING, id: 2, title: 'Account Executive, Mid-Market (DACH)' },
  ] });
  const jobs = await fetchGreenhouse(REDDIT, { get });
  assert.deepEqual(jobs.map((job) => job.id), ['reddit:8153017']);
});

test('a Greenhouse answer with no jobs list is an error, not an empty board', async () => {
  await assert.rejects(fetchGreenhouse(REDDIT, { get: async () => ({ error: 'nope' }) }), /jobs list/);
});

test('a todoist target marks its reqs, other targets do not', async () => {
  const get = async () => ({ jobs: [GH_POSTING] });
  const [marked] = await fetchTarget({ ...REDDIT, todoist: true }, { get });
  const [plain] = await fetchTarget(REDDIT, { get });
  assert.equal(marked.todoist, true);
  assert.equal('todoist' in plain, false);
});

test("Reddit's own title rules: engineering interns in, new grad and business interns out", async () => {
  const { readFile } = await import('node:fs/promises');
  const targets = JSON.parse(await readFile(new URL('../data/targets.json', import.meta.url), 'utf8'));
  const reddit = targets.find((t) => t.id === 'reddit');
  const keep = (title) => isStudentReq(title, reddit);
  assert.equal(keep('Software Engineer Intern, Summer 2027'), true);
  assert.equal(keep('Machine Learning Engineer Internship'), true);
  assert.equal(keep('Data Science Intern - Ads'), true);
  assert.equal(keep('Marketing Intern'), false);
  assert.equal(keep('Software Engineer, New Grad'), false);
  assert.equal(keep('Senior Software Engineer, Internal Tools'), false);
});

test("HubSpot's own title rules: engineering interns in, its sales intern and BDR grad reqs out", async () => {
  const { readFile } = await import('node:fs/promises');
  const targets = JSON.parse(await readFile(new URL('../data/targets.json', import.meta.url), 'utf8'));
  const hubspot = targets.find((t) => t.id === 'hubspot');
  const keep = (title) => isStudentReq(title, hubspot);
  assert.equal(keep('Software Engineer Intern - Summer 2027'), true);
  assert.equal(keep('Software Engineering Co-op'), true);
  assert.equal(keep('LATAM Sales Intern - January 2027'), false);
  assert.equal(keep('BDR - Canada & University Graduates (AH-P) (P)'), false);
});
