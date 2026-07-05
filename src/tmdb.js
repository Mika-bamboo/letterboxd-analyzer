// Thin TMDb API client with in-memory caching and language-name resolution.

const BASE = 'https://api.themoviedb.org/3';

const apiKey = process.env.TMDB_API_KEY?.trim();
const accessToken = process.env.TMDB_ACCESS_TOKEN?.trim();

// A v4 access token is a long JWT with dots; a v3 key is a 32-char hex string.
// Prefer the bearer token if it's provided.
const useBearer = Boolean(accessToken);

export function hasCredentials() {
  return Boolean(apiKey || accessToken);
}

// Cache movie metadata across a process lifetime so repeated films (and repeat
// uploads) don't re-hit the API. Keyed by normalized "title|year".
const metaCache = new Map();

let languageMapPromise = null;

function authHeaders() {
  return useBearer ? { Authorization: `Bearer ${accessToken}` } : {};
}

function withKey(url) {
  if (useBearer) return url;
  const u = new URL(url);
  u.searchParams.set('api_key', apiKey);
  return u.toString();
}

async function tmdbFetch(path, params = {}) {
  const u = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
  }
  const res = await fetch(withKey(u.toString()), { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`TMDb ${res.status} on ${path}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Fetch TMDb's ISO-639-1 -> English language name map once and memoize it.
export async function getLanguageMap() {
  if (!languageMapPromise) {
    languageMapPromise = tmdbFetch('/configuration/languages')
      .then((langs) => {
        const map = new Map();
        for (const l of langs) map.set(l.iso_639_1, l.english_name);
        return map;
      })
      .catch(() => new Map()); // Fall back to raw codes if this fails.
  }
  return languageMapPromise;
}

const norm = (s) => String(s ?? '').trim().toLowerCase();

// Resolve one film's metadata: search by title+year, then pull details for the
// production countries. Returns null if nothing matches on TMDb.
export async function getFilmMetadata(title, year) {
  const cacheKey = `${norm(title)}|${year ?? ''}`;
  if (metaCache.has(cacheKey)) return metaCache.get(cacheKey);

  const result = await resolveFilm(title, year).catch((e) => {
    // Surface auth errors loudly; treat other per-film failures as "unmatched".
    if (e.status === 401) throw e;
    return null;
  });

  metaCache.set(cacheKey, result);
  return result;
}

async function resolveFilm(title, year) {
  // Try an exact-year search first, then fall back to a yearless search.
  let hit = await searchOne(title, year);
  if (!hit && year) hit = await searchOne(title, undefined);
  if (!hit) return null;

  const details = await tmdbFetch(`/movie/${hit.id}`);
  const countries = (details.production_countries || []).map((c) => c.name);
  // Origin country is a good fallback when production_countries is empty.
  if (countries.length === 0 && Array.isArray(details.origin_country)) {
    countries.push(...details.origin_country);
  }

  return {
    tmdbId: hit.id,
    matchedTitle: details.title || hit.title,
    releaseYear: (details.release_date || '').slice(0, 4) || String(year ?? ''),
    originalLanguage: details.original_language || hit.original_language || null,
    countries,
  };
}

async function searchOne(title, year) {
  const data = await tmdbFetch('/search/movie', {
    query: title,
    year: year || undefined,
    include_adult: 'false',
  });
  const results = data.results || [];
  if (results.length === 0) return null;

  // Prefer an exact (normalized) title match; otherwise take the top result,
  // which TMDb orders by popularity/relevance.
  const exact = results.find((r) => norm(r.title) === norm(title) || norm(r.original_title) === norm(title));
  return exact || results[0];
}
