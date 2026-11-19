#!/usr/bin/env node
// Sends a phone push for each newly opened student req, through ntfy.sh, on the same topic
// Recruiter Radar already uses so the phone needs no new subscription. The topic name is the only
// secret: anyone who knows it can read the pushes.
//
// MAX_SINGLE is 8 because Zoom opened six AI intern reqs on one day last cycle and each one
// deserves its own tappable link. Only a dump larger than a normal batch day collapses.
//
// Reqs from a target marked "todoist": true also become a priority 1 Todoist task due today
// (TODOIST_TOKEN), so the req stays in front of you until you act on it instead of scrolling
// away with the push.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const MAX_SINGLE = 8;
const NTFY = 'https://ntfy.sh/';
const TODOIST = 'https://api.todoist.com/api/v1';

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

export function buildTasks(jobs) {
  return jobs.filter((job) => job.todoist).map((job) => ({
    content: `${job.company} posted: ${job.title}`.slice(0, 200),
    description: [
      job.url,
      [job.location, job.reqId].filter(Boolean).join(', '),
      'If someone offered to refer you, send them this link before you apply.',
    ].filter(Boolean).join('\n'),
    priority: 4,
    due_string: 'today',
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

function todoistHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function addTask(task, token) {
  const res = await fetch(`${TODOIST}/tasks`, {
    method: 'POST',
    headers: todoistHeaders(token),
    body: JSON.stringify(task),
  });
  console.log(`todoist task "${task.content}": HTTP ${res.status}`);
  if (!res.ok) process.exitCode = 1;
}

// Read only: proves the token works without leaving a task behind.
async function checkTodoist(token) {
  const res = await fetch(`${TODOIST}/projects?limit=1`, { headers: todoistHeaders(token) });
  console.log(`todoist token check: HTTP ${res.status}`);
  if (!res.ok) process.exitCode = 1;
}

async function main() {
  const topic = process.env.NTFY_TOPIC;
  const todoistToken = process.env.TODOIST_TOKEN;
  if (process.argv.includes('--test')) {
    if (!topic) throw new Error('NTFY_TOPIC is not set');
    await push({ topic, ...TEST_MESSAGE });
    if (todoistToken) await checkTodoist(todoistToken);
    else console.log('TODOIST_TOKEN is not set; Todoist tasks are off');
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
  } else {
    for (const payload of buildMessages(jobs, topic)) {
      if (process.env.DRY_RUN) {
        console.log(JSON.stringify(payload, null, 2));
        continue;
      }
      await push(payload);
    }
  }
  const tasks = buildTasks(jobs);
  if (tasks.length && !todoistToken) {
    console.log(`${tasks.length} Todoist task(s) due, but TODOIST_TOKEN is not set; skipping`);
    return;
  }
  for (const task of tasks) {
    if (process.env.DRY_RUN) {
      console.log(JSON.stringify(task, null, 2));
      continue;
    }
    await addTask(task, todoistToken);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
