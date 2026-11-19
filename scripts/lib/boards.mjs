// Board adapters. Each one takes a target from data/targets.json and returns every job on that
// board as { id, title, location, url, company }, already filtered down to student reqs.
//
// Workday's public search caps a page at 20 and reports the true total, so the whole board comes
// back in a handful of calls. Zoom carries about 90 openings, which is five requests per check.
// Fetching the whole board and filtering here beats passing searchText to Workday: its relevance
// search answered "Intern" with 45 jobs, most of which had nothing to do with interns, and it is
// not a promise that a differently worded student req would surface at all.
//
// Greenhouse is simpler: one public GET returns the whole board (Reddit carries about 145 jobs).
//
// Shazamme is the jobs feed behind Zoom's own careers site (careers.zoom.us). Zoom's Workday API
// started answering every script with a Cloudflare challenge (HTTP 429, cf-mitigated: challenge) on
// 2026-11-17, while this feed is a plain public GET carrying the same reqs and the same Workday req
// ids, usually within hours of posting.

import { getJson, postJson } from './fetch.mjs';
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

export function greenhouseJobsUrl(target) {
  return `https://boards-api.greenhouse.io/v1/boards/${target.token}/jobs`;
}

export function normalizeGreenhouse(target, posting) {
  return {
    id: `${target.id}:${posting.id}`,
    reqId: posting.requisition_id ?? null,
    company: target.company,
    title: posting.title,
    location: posting.location?.name ?? '',
    url: posting.absolute_url,
  };
}

export async function fetchGreenhouse(target, { get = getJson } = {}) {
  const body = await get(greenhouseJobsUrl(target));
  if (!Array.isArray(body?.jobs)) throw new Error(`${target.id}: Greenhouse answered without a jobs list`);
  return body.jobs
    .map((posting) => normalizeGreenhouse(target, posting))
    .filter((job) => isStudentReq(job.title, target));
}

export function shazammeJobsUrl(target) {
  return `https://shazamme.io/job-results/${target.siteId}`;
}

export function normalizeShazamme(target, posting) {
  const job = posting.data ?? {};
  return {
    id: `${target.id}:${job.referenceNumber || job.jobID}`,
    reqId: job.referenceNumber || null,
    company: target.company,
    title: job.jobName,
    location: job.fullAddress ?? '',
    url: job.jobURL,
  };
}

export async function fetchShazamme(target, { get = getJson } = {}) {
  const body = await get(shazammeJobsUrl(target));
  if (!Array.isArray(body)) throw new Error(`${target.id}: Shazamme answered without a job list`);
  return body
    .filter((posting) => posting?.data?.activeStatus !== false)
    .map((posting) => normalizeShazamme(target, posting))
    .filter((job) => isStudentReq(job.title, target));
}

export const ADAPTERS = { workday: fetchWorkday, greenhouse: fetchGreenhouse, shazamme: fetchShazamme };

// A target with "todoist": true also gets a Todoist task per new req (see notify.mjs).
export async function fetchTarget(target, options) {
  const adapter = ADAPTERS[target.board];
  if (!adapter) throw new Error(`${target.id}: no adapter for board "${target.board}"`);
  const jobs = await adapter(target, options);
  return target.todoist ? jobs.map((job) => ({ ...job, todoist: true })) : jobs;
}
