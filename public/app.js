/* global Chart */

const els = {
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('file-input'),
  browseBtn: document.getElementById('browse-btn'),
  fileName: document.getElementById('file-name'),
  analyzeBtn: document.getElementById('analyze-btn'),
  configWarning: document.getElementById('config-warning'),
  uploadSection: document.getElementById('upload-section'),
  progressSection: document.getElementById('progress-section'),
  progressText: document.getElementById('progress-text'),
  progressFill: document.getElementById('progress-fill'),
  errorSection: document.getElementById('error-section'),
  errorText: document.getElementById('error-text'),
  results: document.getElementById('results'),
  summary: document.getElementById('summary'),
  listsContainer: document.getElementById('lists-container'),
  unmatchedCard: document.getElementById('unmatched-card'),
  unmatchedList: document.getElementById('unmatched-list'),
};

let selectedFile = null;
const charts = {};

// ---- Config check ----------------------------------------------------------
fetch('/api/health')
  .then((r) => r.json())
  .then((cfg) => {
    if (!cfg.tmdbConfigured) {
      els.configWarning.hidden = false;
      els.configWarning.textContent =
        '⚠ No TMDb API key is configured on the server. Add TMDB_API_KEY to your .env file and restart, or country/language data will be unavailable.';
    }
  })
  .catch(() => {});

// ---- File selection --------------------------------------------------------
function setFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.csv')) {
    showError('Please choose a .csv file exported from Letterboxd.');
    return;
  }
  selectedFile = file;
  els.fileName.hidden = false;
  els.fileName.textContent = `Selected: ${file.name}`;
  els.analyzeBtn.disabled = false;
  hideError();
}

els.browseBtn.addEventListener('click', () => els.fileInput.click());
els.dropzone.addEventListener('click', (e) => {
  if (e.target === els.browseBtn) return;
  els.fileInput.click();
});
els.fileInput.addEventListener('change', (e) => setFile(e.target.files[0]));

['dragover', 'dragenter'].forEach((ev) =>
  els.dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    els.dropzone.classList.add('dragover');
  })
);
['dragleave', 'dragend', 'drop'].forEach((ev) =>
  els.dropzone.addEventListener(ev, () => els.dropzone.classList.remove('dragover'))
);
els.dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  setFile(e.dataTransfer.files[0]);
});

// ---- Analyze ---------------------------------------------------------------
els.analyzeBtn.addEventListener('click', analyze);

async function analyze() {
  if (!selectedFile) return;
  hideError();
  els.results.hidden = true;
  els.progressSection.hidden = false;
  els.analyzeBtn.disabled = true;
  setProgress(0, 0, 'Reading your file…');

  try {
    const csv = await selectedFile.text();
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: csv,
    });
    if (!res.ok && !res.body) throw new Error(`Server error (${res.status}).`);

    const result = await readNdjsonStream(res.body);
    if (!result) throw new Error('The server did not return a result.');

    els.progressSection.hidden = true;
    render(result);
  } catch (err) {
    els.progressSection.hidden = true;
    showError(err.message || String(err));
  } finally {
    els.analyzeBtn.disabled = false;
  }
}

// Read the newline-delimited JSON stream, updating progress as it arrives.
// Returns the final `result` payload, or throws on an `error` event.
async function readNdjsonStream(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult = null;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const evt = JSON.parse(line);
      if (evt.type === 'start') {
        setProgress(0, evt.total, `Looking up ${evt.total} films on TMDb…`);
      } else if (evt.type === 'progress') {
        setProgress(evt.done, evt.total, `Looking up films on TMDb… ${evt.done}/${evt.total}`);
      } else if (evt.type === 'error') {
        throw new Error(evt.message);
      } else if (evt.type === 'result') {
        finalResult = evt.result;
      }
    }
  }
  return finalResult;
}

function setProgress(done, total, text) {
  els.progressText.textContent = text;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  els.progressFill.style.width = `${pct}%`;
}

// ---- Rendering -------------------------------------------------------------
function render(r) {
  els.results.hidden = false;
  renderSummary(r);
  renderLists(r.lists);
  renderCharts(r);
  renderUnmatched(r.unmatched);
  els.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function tile(num, label) {
  return `<div class="tile"><div class="num">${num}</div><div class="label">${label}</div></div>`;
}

function renderSummary(r) {
  const topCountry = r.countries[0]?.name || '—';
  const topLanguage = r.languages[0]?.name || '—';
  els.summary.innerHTML = [
    tile(r.totalFilms, 'films in diary'),
    tile(r.matchedCount, 'matched on TMDb'),
    tile(r.countries.length, 'countries'),
    tile(r.languages.length, 'languages'),
    tile(escapeHtml(topCountry), 'top country'),
    tile(escapeHtml(topLanguage), 'top language'),
  ].join('');
}

function renderLists(lists) {
  els.listsContainer.innerHTML = lists
    .map((list, i) => {
      const pct = list.total ? Math.round((list.watchedCount / list.total) * 100) : 0;
      const watchedChips = list.watched
        .map((f) => `<span class="chip seen">✓ ${escapeHtml(f.title)}</span>`)
        .join('');
      const missingChips = list.missing
        .map((f) => `<span class="chip">${escapeHtml(f.title)}</span>`)
        .join('');
      return `
        <div class="list-row">
          <div class="list-head">
            <span class="list-name">${escapeHtml(list.name)}</span>
            <span class="list-score"><strong>${list.watchedCount}</strong> / ${list.total} (${pct}%)</span>
          </div>
          <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
          <button class="toggle-btn" data-target="list-detail-${i}">Show films</button>
          <div class="watched-list" id="list-detail-${i}" hidden>
            <div class="chips">${watchedChips}${missingChips}</div>
          </div>
        </div>`;
    })
    .join('');

  els.listsContainer.querySelectorAll('.toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const detail = document.getElementById(btn.dataset.target);
      detail.hidden = !detail.hidden;
      btn.textContent = detail.hidden ? 'Show films' : 'Hide films';
    });
  });
}

const PALETTE = ['#ff8000', '#00b020', '#40bcf4', '#e0679d', '#f5c518', '#9b7bff', '#4be0c0', '#ff6b6b'];

function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    delete charts[key];
  }
}

function renderCharts(r) {
  Chart.defaults.color = '#9aa4b2';
  Chart.defaults.borderColor = '#2a313c';
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;

  const topCountries = r.countries.slice(0, 12);
  destroyChart('countries');
  charts.countries = new Chart(document.getElementById('countries-chart'), {
    type: 'bar',
    data: {
      labels: topCountries.map((c) => c.name),
      datasets: [{ data: topCountries.map((c) => c.count), backgroundColor: '#40bcf4', borderRadius: 5 }],
    },
    options: horizontalBarOpts(),
  });

  const topLanguages = r.languages.slice(0, 10);
  destroyChart('languages');
  charts.languages = new Chart(document.getElementById('languages-chart'), {
    type: 'doughnut',
    data: {
      labels: topLanguages.map((l) => l.name),
      datasets: [{ data: topLanguages.map((l) => l.count), backgroundColor: PALETTE, borderWidth: 0 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { boxWidth: 12 } } },
    },
  });

  destroyChart('decades');
  charts.decades = new Chart(document.getElementById('decades-chart'), {
    type: 'bar',
    data: {
      labels: r.decades.map((d) => d.decade),
      datasets: [{ data: r.decades.map((d) => d.count), backgroundColor: '#ff8000', borderRadius: 5 }],
    },
    options: verticalBarOpts(),
  });

  destroyChart('years');
  charts.years = new Chart(document.getElementById('years-chart'), {
    type: 'line',
    data: {
      labels: r.years.map((y) => y.year),
      datasets: [
        {
          data: r.years.map((y) => y.count),
          borderColor: '#00b020',
          backgroundColor: 'rgba(0,176,32,0.15)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
        },
      ],
    },
    options: verticalBarOpts(),
  });
}

function horizontalBarOpts() {
  return {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
  };
}
function verticalBarOpts() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
  };
}

function renderUnmatched(unmatched) {
  if (!unmatched || unmatched.length === 0) {
    els.unmatchedCard.hidden = true;
    return;
  }
  els.unmatchedCard.hidden = false;
  els.unmatchedList.innerHTML = unmatched
    .map((f) => `<span class="chip">${escapeHtml(f.title)}${f.year ? ` (${f.year})` : ''}</span>`)
    .join('');
}

// ---- helpers ---------------------------------------------------------------
function showError(msg) {
  els.errorSection.hidden = false;
  els.errorText.textContent = msg;
}
function hideError() {
  els.errorSection.hidden = true;
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
