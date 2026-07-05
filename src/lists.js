// Load the famous-film lists and match a user's diary against them.
// Each list lives in /data/lists/<id>.json:
//   { id, name, category: "critics"|"festival"|"award", entries: [{title, year, note?, won?}] }

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LISTS_DIR = join(__dirname, '..', 'data', 'lists');

// Display order within the coverage section (also groups them by category).
const CATEGORY_ORDER = { critics: 0, festival: 1, award: 2 };
const CATEGORY_LABELS = {
  critics: 'Critics & canon lists',
  festival: 'Festival awards',
  award: 'National & regional awards',
};

let listsPromise = null;

// Normalize a title for fuzzy matching: lowercase, drop leading articles,
// strip diacritics/punctuation, collapse whitespace.
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

async function readList(file) {
  const raw = await readFile(join(LISTS_DIR, file), 'utf8');
  const list = JSON.parse(raw);

  // Dedupe entries by normalized title+year (agents' data may contain repeats).
  const seen = new Map();
  for (const entry of list.entries) {
    const key = `${normalizeTitle(entry.title)}|${entry.year}`;
    const prior = seen.get(key);
    if (!prior) {
      seen.set(key, { ...entry });
    } else {
      // Merge: keep "won" if either won; join distinct notes.
      prior.won = Boolean(prior.won || entry.won);
      if (entry.note && prior.note && !prior.note.includes(entry.note)) {
        prior.note = `${prior.note}; ${entry.note}`;
      } else if (entry.note && !prior.note) {
        prior.note = entry.note;
      }
    }
  }
  return { ...list, entries: [...seen.values()] };
}

export async function loadLists() {
  if (!listsPromise) {
    listsPromise = (async () => {
      const files = (await readdir(LISTS_DIR)).filter((f) => f.endsWith('.json'));
      const lists = await Promise.all(files.map(readList));
      lists.sort(
        (a, b) =>
          (CATEGORY_ORDER[a.category] ?? 9) - (CATEGORY_ORDER[b.category] ?? 9) ||
          a.name.localeCompare(b.name)
      );
      return lists;
    })();
  }
  return listsPromise;
}

export function categoryLabel(category) {
  return CATEGORY_LABELS[category] || 'Other lists';
}

// Match the diary films against every list. A film counts as watched from a
// list if its normalized title matches and its year is within +/-1 (to absorb
// release-year discrepancies between Letterboxd and the list source).
export async function matchLists(films) {
  const lists = await loadLists();

  // Index the diary by normalized title for O(1) lookups (lists are big now).
  const diaryIndex = new Map();
  for (const f of films) {
    const key = normalizeTitle(f.title);
    if (!diaryIndex.has(key)) diaryIndex.set(key, []);
    diaryIndex.get(key).push(f);
  }

  return lists.map((list) => {
    const watched = [];
    const missing = [];

    for (const entry of list.entries) {
      const candidates = diaryIndex.get(normalizeTitle(entry.title)) || [];
      const match = candidates.find((f) => f.year == null || Math.abs(f.year - entry.year) <= 1);
      if (match) watched.push(entry);
      else missing.push(entry);
    }

    return {
      id: list.id,
      name: list.name,
      category: list.category,
      categoryLabel: categoryLabel(list.category),
      total: list.entries.length,
      watchedCount: watched.length,
      watched,
      missing,
    };
  });
}
