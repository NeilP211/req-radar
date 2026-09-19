// Board adapters. Each one takes a target from data/targets.json and returns every job on that
// board as { id, title, location, url, company }, already filtered down to student reqs.
//
// Workday's public search caps a page at 20 and reports the true total, so the whole board comes
// back in a handful of calls. Zoom carries about 90 openings, which is five requests per check.
// Fetching the whole board and filtering here beats passing searchText to Workday: its relevance
// search answered "Intern" with 45 jobs, most of which had nothing to do with interns, and it is
// not a promise that a differently worded student req would surface at all.

import { postJson } from './fetch.mjs';
import { isStudentReq } from './match.mjs';

const PAGE = 20;
const MAX_PAGES = 100;

export function workdayJobsUrl(target) {
  return `${target.host}/wday/cxs/${target.tenant}/${target.site}/jobs`;
}

export function normalizeWorkday(target, posting) {
  const id = posting.bulletFields?.[0] || posting.externalPath;
  return {
    id: `${target.id}:${id}`,
    reqId: posting.bulletFields?.[0] ?? null,
    company: target.company,
    title: posting.title,
    location: posting.locationsText ?? '',
    url: `${target.host}/${target.site}${posting.externalPath}`,
  };
}

export async function fetchWorkday(target, { post = postJson } = {}) {
  const url = workdayJobsUrl(target);
  const jobs = [];
  let offset = 0;
  let total = Infinity;
  for (let page = 0; page < MAX_PAGES && offset < total; page += 1) {
    const body = await post(url, { appliedFacets: {}, limit: PAGE, offset, searchText: '' });
    total = Number.isFinite(body.total) ? body.total : jobs.length;
    const postings = body.jobPostings ?? [];
    if (!postings.length) break;
    jobs.push(...postings.map((posting) => normalizeWorkday(target, posting)));
    offset += PAGE;
  }
  return jobs.filter((job) => isStudentReq(job.title, target));
}

export const ADAPTERS = { workday: fetchWorkday };

export async function fetchTarget(target, options) {
  const adapter = ADAPTERS[target.board];
  if (!adapter) throw new Error(`${target.id}: no adapter for board "${target.board}"`);
  return adapter(target, options);
}
