# Req Radar

Watches company job boards for internship and new grad reqs, and pushes a phone alert the hour one
opens. Companion to [Recruiter Radar](https://github.com/NeilP211/recruiter-radar), which watches
career *events*. This one watches the *reqs*.

Currently watching: **Zoom** (Workday) and **Reddit** (Greenhouse).

## Why this exists

Zoom's intern pipeline is reviewed on a rolling basis against roughly 50,000 applications a year,
so the whole game is being early. Their summer 2026 batch went up like this:

| Posted | Req |
| --- | --- |
| 2026-01-23 | Software Engineer Intern, San Jose |
| 2026-02-03 | Six AI and ML intern reqs in one day, Seattle |
| 2026-02-04 to 02-26 | Speech, agentic AI, AI incubation, AI PM, SDE |

Six reqs landed on a single Tuesday. Checking a careers page by hand does not catch that, and the
job boards that aggregate it are a day or more behind. The summer 2027 batch is expected in the
same window, late January into February 2027.

## How it works

`scripts/check.mjs` pulls every opening from each board in `data/targets.json`, keeps the titles
that read like a student req, and compares them against `state/seen.json`, which the GitHub Action
commits back to the repo after each run. Anything not seen before goes to `scripts/notify.mjs`,
which pushes it to [ntfy](https://ntfy.sh). It runs every two hours.

If one board fails (Zoom's Workday answers HTTP 429 a few times a day), that board keeps its old
state and is retried next run, and the other boards still alert. The run only fails when every
board failed.

Three decisions worth knowing:

- **The whole board is fetched, not a keyword search.** Workday's relevance search answers "Intern"
  with 45 jobs at Zoom, most of which are not intern jobs, and it is no promise that a differently
  worded req would surface at all. Zoom carries about 90 openings total, which is five requests.
- **Title matching is anchored on word boundaries.** Zoom has a job called "Zoom International
  Employment Counsel". A substring test on `intern` alerts you about it at 3am.
- **A first run seeds silently.** Announcing every req already sitting on a board would bury the
  one posting that matters. A failed fetch keeps its old state, so one bad run cannot replay a
  whole board as new on the next one.

## Alerts

Pushes go to the same ntfy topic Recruiter Radar uses, so a phone already subscribed there needs no
new setup. The topic name is the only secret: anyone who knows it can read the pushes. It lives in
the `NTFY_TOPIC` repo secret and in `.env.local` locally, which is gitignored.

A target marked `"todoist": true` also turns each new req into a priority 1 Todoist task due
today, with the link, so a req you care most about stays in front of you until you act on it
instead of scrolling away with the push. The token lives in the
`TODOIST_TOKEN` repo secret; without it the tasks are skipped and the pushes still go out.

To confirm the path end to end, run the Check boards workflow manually with **test_push** ticked.
It sends a test push and, if `TODOIST_TOKEN` is set, makes a read only call to prove the token
works without leaving a task behind.

## Adding a company

Add an entry to `data/targets.json`:

```json
{
  "id": "acme",
  "company": "Acme",
  "board": "workday",
  "host": "https://acme.wd1.myworkdayjobs.com",
  "site": "acme_careers",
  "tenant": "acme"
}
```

`host`, `tenant` and `site` come straight out of a board URL:
`https://{host}/{site}` for the page, and the API it calls is
`https://{host}/wday/cxs/{tenant}/{site}/jobs`. Open the board, watch the network tab, copy the
path. A target may also carry its own `include` and `exclude` arrays of regex strings to override
the default title patterns.

A Greenhouse board needs only its board token, the last part of
`https://job-boards.greenhouse.io/{token}`:

```json
{ "id": "reddit", "company": "Reddit", "board": "greenhouse", "token": "reddit", "todoist": true }
```

Workday and Greenhouse have adapters. Another board type is a function in
`scripts/lib/boards.mjs` that returns `{ id, title, location, url, company }` plus a line in
`ADAPTERS`. Add a new target's id to `state/seen.json` with an empty list when you already know the
board has no student reqs, so the first run alerts instead of seeding quietly.

## Local use

```bash
npm test                       # 38 tests, no network
npm run check                  # hits the real boards, rewrites state/seen.json and new.json
NTFY_TOPIC=... npm run notify  # pushes whatever is in new.json
NTFY_TOPIC=... node scripts/notify.mjs --test
DRY_RUN=1 npm run notify       # print the pushes instead of sending them
```

No dependencies. Node 22.
