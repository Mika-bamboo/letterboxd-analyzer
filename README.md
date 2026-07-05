# 🎬 Letterboxd Analyzer

A small web app that turns a **Letterboxd diary export** into a picture of your
film-watching taste:

**Act I — Your Diary**

- 🌍 **Countries** your films come from
- 🗣️ **Languages** you watch in
- 📅 **Decades & years** your taste lives in
- 🏆 **Coverage of famous lists** — how many you've seen from:
  - _Critics & canon:_ Sight & Sound (2022), NYT 100 Best of the 21st Century (2025), IndieWire Best of 2025
  - _Festivals:_ Cannes, Berlinale, and Venice major award winners (with award records)
  - _National & regional awards:_ Oscars Best Picture (winners + nominees), BAFTA Best Film,
    European Film Awards, Golden Horse Awards (Chinese-language cinema), Blue Dragon / Grand Bell /
    Baeksang (South Korea), and the Kinema Junpo Best Ten (Japan)

**Act II — Your World Cinema Diet**

- 🗺️ A **world map** shaded by where your watched films were produced
- 🥧 **Same-size regional plates**: every region's canon is normalized to 100%, so Hollywood's
  plate is exactly as big as Taiwan's. Coverage = how much of _that region's own canon_ you've seen
- 🧑‍🍳 A verdict on what your cinematic diet is rich in, what you've been skipping,
  and award-winning suggestions from the cuisines you're missing

Country and language metadata comes from the [TMDb API](https://www.themoviedb.org/).

## How it works

You upload a CSV, the Node/Express server parses it, looks up each film on TMDb
(results are cached and requests are concurrency-limited), matches your diary
against the curated lists, and streams the aggregated results back to the
browser, which renders them with [Chart.js](https://www.chartjs.org/).

```
public/            Static frontend (HTML + CSS + vanilla JS + Chart.js via CDN)
src/
  server.js        Express app, static hosting, streaming /api/analyze endpoint
  csv.js           Letterboxd CSV -> [{ title, year }] parser
  tmdb.js          TMDb client: search + details, caching, language-name lookup
  analyze.js       Enrich films + aggregate countries/languages/decades/years
  lists.js         Load + fuzzy-match the famous lists
  diet.js          "World cinema diet": per-region canon coverage (Act II)
data/lists/        The lists/awards as JSON ({ id, name, category, entries })
sample/            A sample diary CSV you can try immediately
```

## Getting started

### 1. Install

```bash
npm install
```

### 2. Add your TMDb API key

Get a free API key at <https://www.themoviedb.org/settings/api>, then:

```bash
cp .env.example .env
# edit .env and set TMDB_API_KEY=your_key_here
```

Both a **v3 API key** (`TMDB_API_KEY`) and a **v4 access token**
(`TMDB_ACCESS_TOKEN`, used as a Bearer token) are supported.

### 3. Run

```bash
npm start        # or: npm run dev  (auto-restarts on changes)
```

Open <http://localhost:3000> and upload your CSV. No key yet? Try
`sample/sample-diary.csv` once your key is set.

## Getting your Letterboxd export

Letterboxd → **Settings → Data → Export Your Data**. The ZIP contains several
CSVs. This app works with any of them that have `Name` and `Year` columns —
`diary.csv`, `watched.csv`, or `films.csv`.

## Notes & limitations

- **Matching isn't perfect.** Films are matched to TMDb by title + year; the
  occasional title won't resolve (shown under _"Not found on TMDb"_) and rare
  ambiguous titles may match the wrong film.
- **List/award data is curated** and stored in `data/lists/*.json`
  (`{ id, name, category, entries: [{ title, year, note, won }] }`). Award rolls
  were compiled from Wikipedia and may contain the occasional title/year quirk —
  treat coverage as approximate. Drop a new JSON file in that folder to add your
  own list; it's picked up automatically.
- **The diet model is opinionated.** Each region is scored against its own canon
  (e.g. Japan = Kinema Junpo Best Ten, Chinese-language = Golden Horse), so every
  region's "plate" is the same size regardless of industry output. What counts as
  a canon is defined in `src/diet.js` — tweak it to taste.
- **The TMDb key stays on the server** and is never exposed to the browser.

## License

MIT. This product uses the TMDb API but is not endorsed or certified by TMDb.
