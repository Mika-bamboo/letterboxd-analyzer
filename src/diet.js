// "World Cinema Diet" — Act II of the analysis.
//
// Each region gets a canon built from the award/festival lists tied to it.
// Coverage = distinct canon films the user has watched / canon size, so every
// region's "pie" is the same size no matter how big its film industry is.

import { loadLists, normalizeTitle } from './lists.js';

export const REGIONS = [
  {
    id: 'usa',
    name: 'United States',
    emoji: '🇺🇸',
    listIds: ['oscars-best-picture'],
    countries: ['United States of America'],
  },
  {
    id: 'uk',
    name: 'United Kingdom',
    emoji: '🇬🇧',
    listIds: ['bafta-best-film'],
    countries: ['United Kingdom'],
  },
  {
    id: 'europe',
    name: 'Europe (continental)',
    emoji: '🇪🇺',
    listIds: ['efa-best-film'],
    countries: [
      'France', 'Germany', 'Italy', 'Spain', 'Sweden', 'Denmark', 'Norway', 'Finland',
      'Poland', 'Austria', 'Belgium', 'Netherlands', 'Portugal', 'Greece', 'Hungary',
      'Czech Republic', 'Romania', 'Ireland', 'Switzerland',
    ],
  },
  {
    id: 'chinese',
    name: 'Chinese-language (TW · CN · HK)',
    emoji: '🇹🇼',
    listIds: ['golden-horse'],
    countries: ['Taiwan', 'China', 'Hong Kong'],
  },
  {
    id: 'japan',
    name: 'Japan',
    emoji: '🇯🇵',
    listIds: ['kinema-junpo'],
    countries: ['Japan'],
  },
  {
    id: 'korea',
    name: 'South Korea',
    emoji: '🇰🇷',
    listIds: ['blue-dragon', 'grand-bell', 'baeksang-film'],
    countries: ['South Korea'],
  },
  {
    id: 'festival-circuit',
    name: 'Global festival circuit',
    emoji: '🌐',
    listIds: ['cannes', 'berlin', 'venice'],
    countries: [],
  },
];

// Build each region's canon (deduped union of its lists) and score coverage.
export async function computeDiet(films) {
  const lists = await loadLists();
  const byId = new Map(lists.map((l) => [l.id, l]));

  const diaryIndex = new Map();
  for (const f of films) {
    const key = normalizeTitle(f.title);
    if (!diaryIndex.has(key)) diaryIndex.set(key, []);
    diaryIndex.get(key).push(f);
  }

  const regions = [];
  for (const region of REGIONS) {
    const canon = new Map(); // norm title|year -> entry
    for (const listId of region.listIds) {
      const list = byId.get(listId);
      if (!list) continue; // list data not compiled yet — skip gracefully
      for (const entry of list.entries) {
        const key = `${normalizeTitle(entry.title)}|${entry.year}`;
        if (!canon.has(key)) canon.set(key, entry);
      }
    }
    if (canon.size === 0) continue;

    let watchedCount = 0;
    const unseenWinners = [];
    for (const entry of canon.values()) {
      const candidates = diaryIndex.get(normalizeTitle(entry.title)) || [];
      const seen = candidates.some((f) => f.year == null || Math.abs(f.year - entry.year) <= 1);
      if (seen) watchedCount += 1;
      else if (entry.won) unseenWinners.push(entry);
    }

    // Suggest unseen winners spread across the canon's whole timespan, so the
    // "starting menu" isn't just the oldest films.
    unseenWinners.sort((a, b) => a.year - b.year);
    const suggestions = spreadSample(unseenWinners, 5);

    regions.push({
      id: region.id,
      name: region.name,
      emoji: region.emoji,
      countries: region.countries,
      total: canon.size,
      watchedCount,
      coverage: canon.size ? watchedCount / canon.size : 0,
      suggestions,
    });
  }

  regions.sort((a, b) => b.coverage - a.coverage);

  return { regions, verdict: buildVerdict(regions) };
}

// Pick up to n items evenly spaced across a sorted array (newest included).
function spreadSample(items, n) {
  if (items.length <= n) return [...items];
  const picked = [];
  for (let i = 0; i < n; i++) {
    picked.push(items[Math.round((i * (items.length - 1)) / (n - 1))]);
  }
  return picked;
}

function pct(x) {
  return `${Math.round(x * 100)}%`;
}

// A "nutritionist's note": what the user feasts on and what they're skipping.
function buildVerdict(regions) {
  if (regions.length === 0) return null;
  const nonEmpty = regions.filter((r) => r.total > 0);
  const rich = nonEmpty.filter((r) => r.coverage > 0).slice(0, 2);
  const poor = [...nonEmpty].reverse().slice(0, 2).reverse();

  const parts = [];
  if (rich.length > 0) {
    parts.push(
      `Your diet is richest in ${rich.map((r) => `${r.name} (${pct(r.coverage)} of its canon)`).join(' and ')}.`
    );
  }
  const ignored = poor.filter((r) => !rich.includes(r));
  if (ignored.length > 0) {
    parts.push(
      `You've barely touched ${ignored.map((r) => `${r.name} (${pct(r.coverage)})`).join(' and ')} — that's the cuisine missing from your plate.`
    );
  }
  return parts.join(' ');
}
