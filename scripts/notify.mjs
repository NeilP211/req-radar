#!/usr/bin/env node
// Sends a phone push for each newly opened student req, through ntfy.sh, on the same topic
// Recruiter Radar already uses so the phone needs no new subscription. The topic name is the only
// secret: anyone who knows it can read the pushes.
//
// MAX_SINGLE is 8 because Zoom opened six AI intern reqs on one day last cycle and each one
// deserves its own tappable link. Only a dump larger than a normal batch day collapses.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const MAX_SINGLE = 8;
const NTFY = 'https://ntfy.sh/';

export function buildMessages(jobs, topic) {
  if (!jobs.length) return [];
  if (jobs.length > MAX_SINGLE) {
    const lines = jobs.slice(0, 10).map((job) => `${job.company}: ${job.title}`);
    if (jobs.length > 10) lines.push(`and ${jobs.length - 10} more`);
    return [{
      topic,
      title: `${jobs.length} new intern reqs`,
      message: lines.join('\n'),
      click: jobs[0].url,
      tags: ['rotating_light'],
      priority: 5,
    }];
  }
  return jobs.map((job) => ({
    topic,
    title: `${job.company} posted: ${job.title}`.slice(0, 120),
    message: [job.location, job.reqId, 'Apply in the first two weeks, review is rolling.']
      .filter(Boolean).join('\n'),
    click: job.url,
    actions: [{ action: 'view', label: 'Open req', url: job.url }],
    tags: ['rotating_light'],
    priority: 5,
  }));
}

export const TEST_MESSAGE = {
  title: 'Req Radar alerts are on',
  message: 'A push like this arrives the hour a watched company opens an intern req. Tap to open it.',
  tags: ['white_check_mark'],
  priority: 3,
};

async function push(payload) {
  const res = await fetch(NTFY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  console.log(`push "${payload.title}": HTTP ${res.status}`);
  if (!res.ok) process.exitCode = 1;
}

async function main() {
  const topic = process.env.NTFY_TOPIC;
  if (process.argv.includes('--test')) {
    if (!topic) throw new Error('NTFY_TOPIC is not set');
    await push({ topic, ...TEST_MESSAGE });
    return;
  }
  const file = process.argv[2] ?? 'new.json';
  const jobs = JSON.parse(await readFile(file, 'utf8'));
  if (!jobs.length) {
    console.log('no new reqs');
    return;
  }
  if (!topic) {
    console.log(`${jobs.length} new req(s), but NTFY_TOPIC is not set; skipping push`);
    return;
  }
  for (const payload of buildMessages(jobs, topic)) {
    if (process.env.DRY_RUN) {
      console.log(JSON.stringify(payload, null, 2));
      continue;
    }
    await push(payload);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
