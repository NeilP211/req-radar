#!/usr/bin/env node
// Polls every board in data/targets.json, writes the student reqs that were not there last time
// to new.json, and rewrites state/seen.json. The push itself is notify.mjs, run as a separate step
// so a failed push never silently marks a req as already announced.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchTarget } from './lib/boards.mjs';
import { collectFresh, nextState } from './lib/diff.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = join(ROOT, 'data/targets.json');
const STATE = join(ROOT, 'state/seen.json');
const OUT = join(ROOT, 'new.json');

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

export async function checkAll(targets, options) {
  return Promise.all(targets.map(async (target) => {
    try {
      const jobs = await fetchTarget(target, options);
      return { target, ok: true, jobs };
    } catch (err) {
      return { target, ok: false, jobs: [], error: err.message };
    }
  }));
}

async function main() {
  const targets = await readJson(TARGETS, []);
  const previous = await readJson(STATE, {});
  const results = await checkAll(targets);

  for (const result of results) {
    if (!result.ok) {
      console.error(`${result.target.id}: FAILED, keeping previous state (${result.error})`);
      process.exitCode = 1;
      continue;
    }
    const first = previous[result.target.id] == null;
    console.log(`${result.target.id}: ${result.jobs.length} student req(s)${first ? ', first run, seeding quietly' : ''}`);
    for (const job of result.jobs) console.log(`   ${job.reqId ?? ''} ${job.title} (${job.location})`);
  }

  const fresh = collectFresh(previous, results);
  await writeFile(OUT, `${JSON.stringify(fresh, null, 2)}\n`);
  await writeFile(STATE, `${JSON.stringify(nextState(previous, results), null, 2)}\n`);
  console.log(`${fresh.length} new req(s) written to new.json`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
