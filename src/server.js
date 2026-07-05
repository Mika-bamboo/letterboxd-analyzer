import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseDiaryCsv } from './csv.js';
import { analyzeDiary } from './analyze.js';
import { hasCredentials } from './tmdb.js';
import { loadLists } from './lists.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static(PUBLIC_DIR));

// Health / config check — the frontend uses this to warn if no API key is set.
app.get('/api/health', async (req, res) => {
  const lists = await loadLists();
  res.json({
    ok: true,
    tmdbConfigured: hasCredentials(),
    lists: lists.map((l) => ({ id: l.id, name: l.name, total: l.entries.length })),
  });
});

// Analyze an uploaded CSV. The request body is the raw CSV text. The response
// is a stream of newline-delimited JSON: progress events followed by a single
// result (or error) event, so the UI can show live progress on large diaries.
app.post('/api/analyze', express.text({ type: '*/*', limit: '15mb' }), async (req, res) => {
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');

  const send = (obj) => res.write(JSON.stringify(obj) + '\n');

  try {
    if (!hasCredentials()) {
      throw new Error('No TMDb API key configured on the server. Set TMDB_API_KEY in your .env file.');
    }

    const films = parseDiaryCsv(req.body || '');
    send({ type: 'start', total: films.length });

    let lastSent = 0;
    const result = await analyzeDiary(films, {
      onProgress: (done, total) => {
        // Throttle progress writes a little to avoid flooding the stream.
        if (done === total || done - lastSent >= 3) {
          lastSent = done;
          send({ type: 'progress', done, total });
        }
      },
    });

    send({ type: 'result', result });
  } catch (err) {
    send({ type: 'error', message: err.message || String(err) });
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Letterboxd Analyzer running at http://localhost:${PORT}`);
  if (!hasCredentials()) {
    console.warn('⚠  No TMDb credentials found. Copy .env.example to .env and set TMDB_API_KEY.');
  }
});
