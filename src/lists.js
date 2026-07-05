// Load the curated famous-film lists and match a user's diary against them.
// List data lives in /data/*.json as arrays of { title, year }.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

const LIST_DEFS = [
  { id: 'sight-and-sound', name: "Sight & Sound Greatest Films of All Time (2022)", file: 'sight-and-sound.json' },
  { id: 'nyt-21st-century', name: 'NYT 100 Best Movies of the 21st Century (2025)', file: 'nyt-21st-century.json' },
  { id: 'indiewire-2025', name: 'IndieWire Best Films of 2025', file: 'indiewire-2025.json' },
];

let listsPromise = null;

// Normalize a title for fuzzy matching: lowercase, drop leading articles,
// strip punctuation, collapse whitespace.
export function normalizeTitle(title) {
  return String(title ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/^(the|a|an)\s+/, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function loadList(def) {
  const raw = await readFile(join(DATA_DIR, def.file), 'utf8');
  const entries = JSON.parse(raw);
  return { ...def, entries };
}

export async function loadLists() {
  if (!listsPromise) {
    listsPromise = Promise.all(LIST_DEFS.map(loadList));
  }
  return listsPromise;
}

// Match the diary films against every list. A film counts as watched from a
// list if its normalized title matches and its year is within +/-1 (to absorb
// release-year discrepancies between Letterboxd and the list source).
export async function matchLists(films) {
  const lists = await loadLists();

  // Pre-normalize the diary once.
  const diary = films.map((f) => ({ ...f, norm: normalizeTitle(f.title) }));

  return lists.map((list) => {
    const watched = [];
    const missing = [];

    for (const entry of list.entries) {
      const key = normalizeTitle(entry.title);
      const match = diary.find(
        (f) => f.norm === key && (f.year == null || Math.abs(f.year - entry.year) <= 1)
      );
      if (match) watched.push(entry);
      else missing.push(entry);
    }

    return {
      id: list.id,
      name: list.name,
      total: list.entries.length,
      watchedCount: watched.length,
      watched,
      missing,
    };
  });
}
