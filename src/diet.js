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
    definition:
      'Every Academy Award Best Picture winner and nominee since the first ceremony in 1929 — Hollywood’s own official record of its finest.',
  },
  {
    id: 'uk',
    name: 'United Kingdom',
    emoji: '🇬🇧',
    listIds: ['bafta-best-film'],
    countries: ['United Kingdom'],
    definition:
      'Every BAFTA Best Film winner and nominee since 1948, including the early “Best Film from Any Source” era — British cinema’s top honor.',
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
    definition:
      'European Film Award Best Film winners and nominees since 1988 — the best of continental European cinema as chosen by the European Film Academy itself.',
  },
  {
    id: 'chinese',
    name: 'Chinese-language (TW · CN · HK)',
    emoji: '🇹🇼',
    listIds: ['golden-horse'],
    countries: ['Taiwan', 'China', 'Hong Kong'],
    definition:
      'Golden Horse Award Best Feature Film winners and nominees since 1962 — Taiwan’s prize, and the most prestigious honor across all Chinese-language cinema (Taiwan, China, Hong Kong).',
  },
  {
    id: 'japan',
    name: 'Japan',
    emoji: '🇯🇵',
    listIds: ['kinema-junpo'],
    countries: ['Japan'],
    definition:
      'The Kinema Junpo Best Ten — the annual critics’ top 10 of Japanese films chosen by Japan’s oldest film magazine, every year since 1926. The most respected verdict in Japanese cinema.',
  },
  {
    id: 'korea',
    name: 'South Korea',
    emoji: '🇰🇷',
    listIds: ['blue-dragon', 'grand-bell', 'baeksang-film'],
    countries: ['South Korea'],
    definition:
      'The union of South Korea’s three major honors: Blue Dragon Best Film, Grand Bell (Daejong) Best Film, and the Baeksang Arts Awards’ film Grand Prize & Best Film.',
  },
  {
    id: 'festival-circuit',
    name: 'Global festival circuit',
    emoji: '🌐',
    listIds: ['cannes', 'berlin', 'venice'],
    countries: [],
    definition:
      'Every film that won a major award at one of the Big Three festivals — Cannes, Berlinale, or Venice. World cinema’s shared canon, regardless of origin.',
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

    const watched = [];
    const missing = [];
    const unseenWinners = [];
    for (const entry of canon.values()) {
      const candidates = diaryIndex.get(normalizeTitle(entry.title)) || [];
      const seen = candidates.some((f) => f.year == null || Math.abs(f.year - entry.year) <= 1);
      if (seen) {
        watched.push(entry);
      } else {
        missing.push(entry);
        if (entry.won) unseenWinners.push(entry);
      }
    }
    watched.sort((a, b) => a.year - b.year);
    missing.sort((a, b) => a.year - b.year);

    // Suggest unseen winners spread across the canon's whole timespan, so the
    // "starting menu" isn't just the oldest films.
    unseenWinners.sort((a, b) => a.year - b.year);
    const suggestions = spreadSample(unseenWinners, 5);

    regions.push({
      id: region.id,
      name: region.name,
      emoji: region.emoji,
      countries: region.countries,
      definition: region.definition,
      total: canon.size,
      watchedCount: watched.length,
      coverage: canon.size ? watched.length / canon.size : 0,
      watched,
      missing,
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
