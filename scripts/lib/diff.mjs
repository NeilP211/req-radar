// What counts as new.
//
// State is a map of target id to the req ids seen on the last successful check. A target with no
// entry at all is a first run: it seeds silently, because announcing every req already sitting on
// a board would bury the one posting that matters. A target whose fetch failed keeps its old ids
// untouched, so a single bad run cannot replay the whole board as new on the next one.

export function freshJobs(previousIds, jobs) {
  if (previousIds == null) return [];
  const seen = new Set(previousIds);
  return jobs.filter((job) => !seen.has(job.id));
}

export function nextState(previousState, results) {
  const state = { ...previousState };
  for (const result of results) {
    if (result.ok) state[result.target.id] = result.jobs.map((job) => job.id).sort();
  }
  return state;
}

export function collectFresh(previousState, results) {
  const fresh = [];
  for (const result of results) {
    if (!result.ok) continue;
    fresh.push(...freshJobs(previousState[result.target.id] ?? null, result.jobs));
  }
  return fresh;
}
