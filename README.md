# 🎬 Letterboxd Analyzer

A small web app that turns a **Letterboxd diary export** into a picture of your
film-watching taste:

- 🌍 **Countries** your films come from
- 🗣️ **Languages** you watch in
- 📅 **Decades & years** your taste lives in
- 🏆 **Coverage of famous lists** — how many you've seen from:
  - Sight & Sound _Greatest Films of All Time_ (2022 critics' poll)
  - The New York Times _100 Best Movies of the 21st Century_ (2025)
  - IndieWire _Best Films of 2025_

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
data/              The famous lists as JSON ({ title, year })
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
- **List data is curated** and stored in `data/*.json`. Lists change and ties
  make exact counts fuzzy — treat coverage as approximate. Edit those files to
  update or add your own lists.
- **The TMDb key stays on the server** and is never exposed to the browser.

## License

MIT. This product uses the TMDb API but is not endorsed or certified by TMDb.
