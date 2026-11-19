// Every board here is a public endpoint with no key, so the only failure worth handling is a
// flaky network. Three tries with 1s, 2s, 4s backoff, the same policy Recruiter Radar settled on
// after a source dropped a single CI run and emptied the page.

const RETRIES = 3;
const USER_AGENT = 'req-radar (+https://github.com/NeilP211/req-radar)';

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(url, init, { retries = RETRIES, wait = sleep } = {}) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    if (attempt > 0) await wait(1000 * 2 ** (attempt - 1));
    try {
      const res = await fetch(url, {
        ...init,
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...init.headers },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`${url}: ${lastError.message}`);
}

export function postJson(url, body, options) {
  return requestJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, options);
}

export function getJson(url, options) {
  return requestJson(url, { method: 'GET', headers: {} }, options);
}
