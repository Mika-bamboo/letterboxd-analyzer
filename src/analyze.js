// Orchestrate a full analysis of a parsed diary: enrich each film with TMDb
// metadata (concurrency-limited), aggregate the results, and match famous lists.

import { getFilmMetadata, getLanguageMap } from './tmdb.js';
import { matchLists } from './lists.js';

const CONCURRENCY = 8;

// Run an async worker over `items` with a bounded number of in-flight tasks.
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function tally(pairs) {
  // pairs: array of arrays of string labels. Returns [{ name, count }] desc.
  const counts = new Map();
  for (const labels of pairs) {
    for (const label of labels) {
      counts.set(label, (counts.get(label) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export async function analyzeDiary(films, { onProgress } = {}) {
  const languageMap = await getLanguageMap();

  let done = 0;
  const enriched = await mapWithConcurrency(films, CONCURRENCY, async (film) => {
    const meta = await getFilmMetadata(film.title, film.year);
    done += 1;
    onProgress?.(done, films.length);
    return { film, meta };
  });

  const matched = enriched.filter((e) => e.meta);
  const unmatched = enriched.filter((e) => !e.meta).map((e) => e.film);

  // Countries: one film can count toward multiple production countries.
  const countries = tally(matched.map((e) => e.meta.countries || []));

  // Languages: original language of each film, resolved to an English name.
  const languages = tally(
    matched.map((e) => {
      const code = e.meta.originalLanguage;
      if (!code) return [];
      return [languageMap.get(code) || code.toUpperCase()];
    })
  );

  // Decades & years use the diary year, falling back to the matched TMDb year.
  const yearCounts = new Map();
  const decadeCounts = new Map();
  for (const e of enriched) {
    const y = e.film.year || (e.meta ? Number(e.meta.releaseYear) : null);
    if (!y || Number.isNaN(y)) continue;
    yearCounts.set(y, (yearCounts.get(y) || 0) + 1);
    const decade = Math.floor(y / 10) * 10;
    decadeCounts.set(decade, (decadeCounts.get(decade) || 0) + 1);
  }

  const years = [...yearCounts.entries()]
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => a.year - b.year);

  const decades = [...decadeCounts.entries()]
    .map(([decade, count]) => ({ decade: `${decade}s`, decadeStart: decade, count }))
    .sort((a, b) => a.decadeStart - b.decadeStart);

  const lists = await matchLists(films);

  return {
    totalFilms: films.length,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    unmatched,
    countries,
    languages,
    decades,
    years,
    lists,
  };
}
