/**
 * Thin HTTP client for the enka.network Zenless Zone Zero UID endpoint.
 *
 * Docs: https://github.com/EnkaNetwork/API-docs (see docs/zzz/api.md)
 * Endpoint pattern matches Enka's other games:
 *   Genshin -> https://enka.network/api/uid/{uid}
 *   HSR     -> https://enka.network/api/hsr/uid/{uid}
 *   ZZZ     -> https://enka.network/api/zzz/uid/{uid}
 *
 * Enka asks every consumer to set a distinguishing User-Agent header so they
 * can identify traffic sources. This can only be done server-side — browsers
 * refuse to let JS override User-Agent — which is the main reason this call
 * lives in the backend rather than directly in the Angular app.
 */

const ENKA_BASE_URL = 'https://enka.network/api/zzz/uid';
const USER_AGENT =
  process.env.ENKA_USER_AGENT || 'zzz-companion-app/1.0 (contact: set ENKA_USER_AGENT in .env)';

/**
 * Fetches the raw, unresolved profile for a given ZZZ UID directly from
 * enka.network. Throws an Error with a `.status` matching the HTTP outcome,
 * so it plays nicely with this project's centralized error handler
 * (controllers just `next(err)` and app.js turns it into { message }).
 */
async function fetchRawProfile(uid) {
  const res = await fetch(`${ENKA_BASE_URL}/${encodeURIComponent(uid)}`, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (res.status === 404) {
    const err = new Error(`No Zenless Zone Zero profile found for UID ${uid}.`);
    err.status = 404;
    throw err;
  }

  if (res.status === 429) {
    const err = new Error('enka.network rate-limited this request. Please try again shortly.');
    err.status = 429;
    throw err;
  }

  if (!res.ok) {
    const err = new Error(`enka.network returned an unexpected status: ${res.status}`);
    err.status = 502;
    throw err;
  }

  return res.json();
}

module.exports = { fetchRawProfile };
