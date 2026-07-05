/* global Chart, ChartGeo */

const els = {
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('file-input'),
  browseBtn: document.getElementById('browse-btn'),
  fileName: document.getElementById('file-name'),
  analyzeBtn: document.getElementById('analyze-btn'),
  configWarning: document.getElementById('config-warning'),
  progressSection: document.getElementById('progress-section'),
  progressText: document.getElementById('progress-text'),
  progressFill: document.getElementById('progress-fill'),
  errorSection: document.getElementById('error-section'),
  errorText: document.getElementById('error-text'),
  actTabs: document.getElementById('act-tabs'),
  act1: document.getElementById('act-1'),
  act2: document.getElementById('act-2'),
  summary: document.getElementById('summary'),
  listsContainer: document.getElementById('lists-container'),
  unmatchedCard: document.getElementById('unmatched-card'),
  unmatchedList: document.getElementById('unmatched-list'),
  dietVerdict: document.getElementById('diet-verdict'),
  dietPlates: document.getElementById('diet-plates'),
  dietSuggestions: document.getElementById('diet-suggestions'),
};

let selectedFile = null;
const charts = {};
let worldGeoPromise = null;

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

// ---- Tabs ------------------------------------------------------------------
els.actTabs.querySelectorAll('.act-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    els.actTabs.querySelectorAll('.act-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    els.act1.hidden = tab.dataset.act !== 'act-1';
    els.act2.hidden = tab.dataset.act !== 'act-2';
  });
});

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
  els.actTabs.hidden = true;
  els.act1.hidden = true;
  els.act2.hidden = true;
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
  els.actTabs.hidden = false;
  els.act1.hidden = false;
  els.act2.hidden = true;
  els.actTabs.querySelectorAll('.act-tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.act === 'act-1')
  );

  renderSummary(r);
  renderCharts(r);
  renderLists(r.lists);
  renderUnmatched(r.unmatched);
  renderDiet(r);
  els.actTabs.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

// Generate n visually-distinct colors by stepping the hue with the golden
// angle — no two slices share a color no matter how many languages you watch.
function distinctColors(n) {
  const colors = [];
  for (let i = 0; i < n; i++) {
    const hue = Math.round((i * 137.508 + 24) % 360);
    const sat = 62 + (i % 3) * 8;       // 62 / 70 / 78%
    const light = 52 + ((i >> 1) % 3) * 6; // 52 / 58 / 64%
    colors.push(`hsl(${hue} ${sat}% ${light}%)`);
  }
  return colors;
}

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

  const topLanguages = r.languages.slice(0, 14);
  destroyChart('languages');
  charts.languages = new Chart(document.getElementById('languages-chart'), {
    type: 'doughnut',
    data: {
      labels: topLanguages.map((l) => l.name),
      datasets: [
        {
          data: topLanguages.map((l) => l.count),
          backgroundColor: distinctColors(topLanguages.length),
          borderWidth: 0,
        },
      ],
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

// ---- Famous lists (grouped by category) -------------------------------------
const MISSING_CHIP_CAP = 40;

function chipFor(entry, seen) {
  const medal = entry.won ? '<span class="medal">🏆</span>' : '';
  const note = entry.note ? ` title="${escapeHtml(entry.note)}"` : '';
  const mark = seen ? '✓ ' : '';
  return `<span class="chip${seen ? ' seen' : ''}"${note}>${mark}${medal}${escapeHtml(entry.title)} (${entry.year})</span>`;
}

function renderLists(lists) {
  // Group by category label, preserving server order.
  const groups = [];
  for (const list of lists) {
    let group = groups.find((g) => g.label === list.categoryLabel);
    if (!group) groups.push((group = { label: list.categoryLabel, lists: [] }));
    group.lists.push(list);
  }

  let i = 0;
  els.listsContainer.innerHTML = groups
    .map(
      (group) => `
      <div class="list-group-title">${escapeHtml(group.label)}</div>
      ${group.lists
        .map((list) => {
          const idx = i++;
          const pct = list.total ? Math.round((list.watchedCount / list.total) * 100) : 0;
          const watchedChips = list.watched.map((f) => chipFor(f, true)).join('');
          const shownMissing = list.missing.slice(0, MISSING_CHIP_CAP);
          const hiddenCount = list.missing.length - shownMissing.length;
          const missingChips =
            shownMissing.map((f) => chipFor(f, false)).join('') +
            (hiddenCount > 0 ? `<span class="more-note">…and ${hiddenCount} more unseen</span>` : '');
          return `
          <div class="list-row">
            <div class="list-head">
              <span class="list-name">${escapeHtml(list.name)}</span>
              <span class="list-score"><strong>${list.watchedCount}</strong> / ${list.total} (${pct}%)</span>
            </div>
            <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
            <button class="toggle-btn" data-target="list-detail-${idx}">Show films</button>
            <div class="watched-list" id="list-detail-${idx}" hidden>
              <div class="chips">${watchedChips}${missingChips}</div>
            </div>
          </div>`;
        })
        .join('')}`
    )
    .join('');

  els.listsContainer.querySelectorAll('.toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const detail = document.getElementById(btn.dataset.target);
      detail.hidden = !detail.hidden;
      btn.textContent = detail.hidden ? 'Show films' : 'Hide films';
    });
  });
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

// ---- Act II — World Cinema Diet ---------------------------------------------
// TMDb country names that differ from the world-atlas (Natural Earth) names.
const GEO_ALIASES = {
  'United States of America': 'United States of America',
  'United Kingdom': 'United Kingdom',
  'Czech Republic': 'Czechia',
  'Bosnia and Herzegovina': 'Bosnia and Herz.',
  'Dominican Republic': 'Dominican Rep.',
  'Central African Republic': 'Central African Rep.',
  'South Korea': 'South Korea',
  'North Korea': 'North Korea',
  'Democratic Republic of the Congo': 'Dem. Rep. Congo',
  'Republic of the Congo': 'Congo',
  'United Arab Emirates': 'United Arab Emirates',
  'Soviet Union': 'Russia',
  'Serbia and Montenegro': 'Serbia',
  Yugoslavia: 'Serbia',
  'East Germany': 'Germany',
  'West Germany': 'Germany',
};

function loadWorldGeo() {
  if (!worldGeoPromise) {
    worldGeoPromise = fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json')
      .then((r) => r.json())
      .then((topo) => ChartGeo.topojson.feature(topo, topo.objects.countries).features);
  }
  return worldGeoPromise;
}

function renderDiet(r) {
  const diet = r.diet;
  if (!diet || !diet.regions || diet.regions.length === 0) {
    els.dietVerdict.textContent = 'No canon data available yet.';
    return;
  }

  els.dietVerdict.textContent = diet.verdict || '';
  renderWorldMap(r.countries);
  renderPlates(diet.regions);
  renderSuggestions(diet.regions);
}

async function renderWorldMap(countries) {
  try {
    const features = await loadWorldGeo();
    const counts = new Map();
    for (const c of countries) {
      const name = GEO_ALIASES[c.name] || c.name;
      counts.set(name, (counts.get(name) || 0) + c.count);
    }

    destroyChart('map');
    charts.map = new Chart(document.getElementById('world-map'), {
      type: 'choropleth',
      data: {
        labels: features.map((f) => f.properties.name),
        datasets: [
          {
            label: 'Films',
            outline: features,
            data: features.map((f) => ({
              feature: f,
              value: counts.get(f.properties.name) || 0,
            })),
            borderColor: '#2a313c',
            borderWidth: 0.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        showOutline: false,
        showGraticule: false,
        plugins: { legend: { display: false } },
        scales: {
          projection: { axis: 'x', projection: 'equalEarth' },
          color: {
            axis: 'x',
            interpolate: (v) => {
              // Dark base -> Letterboxd green ramp.
              const t = Math.max(0, Math.min(1, v));
              if (t === 0) return '#1f242d';
              const g = Math.round(80 + t * 150);
              return `rgb(${Math.round(20 + t * 30)}, ${g}, ${Math.round(50 + t * 40)})`;
            },
            quantize: 6,
            legend: { position: 'bottom-right', align: 'bottom' },
          },
        },
      },
    });
  } catch (err) {
    document.querySelector('.map-wrap').innerHTML =
      '<p class="section-sub">Could not load the world map (offline?). The plates below still work.</p>';
  }
}

function renderPlates(regions) {
  els.dietPlates.innerHTML = regions
    .map(
      (reg, i) => `
      <div class="plate">
        <h3>${reg.emoji} ${escapeHtml(reg.name)}</h3>
        <p class="plate-sub">canon: ${reg.total} films</p>
        <div class="plate-chart"><canvas id="plate-${i}"></canvas></div>
        <p class="plate-score">${Math.round(reg.coverage * 100)}% <span style="color:var(--text-dim);font-weight:400">· ${reg.watchedCount}/${reg.total}</span></p>
      </div>`
    )
    .join('');

  regions.forEach((reg, i) => {
    destroyChart(`plate-${i}`);
    charts[`plate-${i}`] = new Chart(document.getElementById(`plate-${i}`), {
      type: 'doughnut',
      data: {
        labels: ['Seen', 'Not yet'],
        datasets: [
          {
            data: [reg.watchedCount, reg.total - reg.watchedCount],
            backgroundColor: ['#00b020', '#2a313c'],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: { legend: { display: false } },
      },
    });
  });
}

function renderSuggestions(regions) {
  // Serve the least-covered cuisines first.
  const starving = [...regions].sort((a, b) => a.coverage - b.coverage).slice(0, 4);
  els.dietSuggestions.innerHTML = starving
    .filter((reg) => reg.suggestions.length > 0)
    .map(
      (reg) => `
      <div class="suggestion-region">
        <h3>${reg.emoji} ${escapeHtml(reg.name)} — ${Math.round(reg.coverage * 100)}% covered</h3>
        <div class="chips">
          ${reg.suggestions.map((f) => chipFor(f, false)).join('')}
        </div>
      </div>`
    )
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
