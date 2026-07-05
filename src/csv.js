// Parse a Letterboxd CSV export into a list of { title, year } records.
//
// Letterboxd exports (diary.csv, watched.csv, films.csv, ratings.csv) all use a
// header row with a "Name" column for the film title and a "Year" column for the
// release year. We match those columns case-insensitively and also accept
// "Title" as an alias for "Name".

import { parse } from 'csv-parse/sync';

const TITLE_KEYS = ['name', 'title', 'film'];
const YEAR_KEYS = ['year'];

function pick(record, keys) {
  for (const key of Object.keys(record)) {
    if (keys.includes(key.trim().toLowerCase())) return record[key];
  }
  return undefined;
}

export function parseDiaryCsv(text) {
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  });

  if (records.length === 0) {
    throw new Error('CSV appears to be empty.');
  }

  // Validate that the expected columns exist.
  const sample = records[0];
  if (pick(sample, TITLE_KEYS) === undefined) {
    throw new Error(
      'Could not find a film-title column. Expected a "Name" (or "Title") column, as in a Letterboxd export.'
    );
  }

  const films = [];
  const seen = new Set();
  for (const rec of records) {
    const title = String(pick(rec, TITLE_KEYS) ?? '').trim();
    if (!title) continue;

    const rawYear = String(pick(rec, YEAR_KEYS) ?? '').trim();
    const year = /^\d{4}$/.test(rawYear) ? Number(rawYear) : null;

    // De-duplicate rewatches / repeated diary entries by title+year.
    const key = `${title.toLowerCase()}|${year ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    films.push({ title, year });
  }

  if (films.length === 0) {
    throw new Error('No films with titles were found in the CSV.');
  }

  return films;
}
