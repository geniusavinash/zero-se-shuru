import { $, BATCH, PANEL_CONFIG, TYPES, adzuna, card, corrected, corrections, count, debounce,
  evidence, isStale, keysOf, options, report, result, rows, searcher, snapshot, strip, taxonomy } from './common.js';

const fields = ['q', 'role', 'city', 'type', 'source', 'recent', 'remote'];
const check = new Set(['recent', 'remote']);
const day = 86400000;
let jobs = [], meta = null, available = false, tax = taxonomy(null), shown = BATCH;
let client, userId;
const savedKeys = new Set();
const savingKeys = new Set();
let matches = [];

function urlState() {
  const params = new URLSearchParams(location.search);
  return Object.fromEntries(fields.map(key => [key, check.has(key) ? params.get(key) === '1' : params.get(key) ?? '']));
}
let state = urlState();
function writeState() {
  const url = new URL(location.href);
  for (const key of fields) {
    if (state[key]) url.searchParams.set(key, check.has(key) ? '1' : state[key]);
    else url.searchParams.delete(key);
  }
  history.replaceState(history.state, '', url);
}
function readControls() {
  return Object.fromEntries(fields.map(key => [key, check.has(key) ? $(key).checked : $(key).value]));
}
function metroMatch(job, city) {
  const group = tax.metros.find(item => item.id === city);
  return group ? (job.cities ?? []).some(id => group.cities.includes(id)) : job.cities?.includes(city);
}
function updateFilters() {
  const search = searcher(state.q, tax);
  const now = Date.now();
  const base = jobs.filter(job => search(job) && (!state.type || state.type === job.jobType) &&
    (!state.source || (state.source === 'adzuna') === adzuna(job)) && (!state.remote || job.remote) &&
    (!state.recent || (job.postedAt && Date.parse(job.postedAt) <= now && now - Date.parse(job.postedAt) <= 7 * day)));
  const roles = tax.roles;
  const cities = [...tax.metros, ...tax.cities];
  if (!roles.some(item => item.id === state.role)) state.role = '';
  if (!cities.some(item => item.id === state.city)) state.city = '';
  if (!Object.hasOwn(TYPES, state.type)) state.type = '';
  if (!['company', 'adzuna'].includes(state.source)) state.source = '';
  const forRole = base.filter(job => !state.city || metroMatch(job, state.city));
  const forCity = base.filter(job => !state.role || job.role === state.role);
  options($('role'), [['', 'All roles'], ...roles.map(item => [item.id,
    `${item.name} (${count(forRole.filter(job => job.role === item.id).length)})`])], state.role);
  options($('city'), [['', 'All cities'], ...cities.map(item => [item.id,
    `${item.name}${Array.isArray(item.cities) ? ' (metro)' : ''} (${count(forCity.filter(job => metroMatch(job, item.id)).length)})`])], state.city);
  $('type').value = state.type;
  $('source').value = state.source;
  $('q').value = state.q;
  $('remote').checked = state.remote;
  $('recent').checked = state.recent;
  matches = forRole.filter(job => !state.role || job.role === state.role);
}

function saveButton(job) {
  if (!client || !userId) return null;
  const node = document.createElement('button');
  node.type = 'button';
  const paint = () => {
    const saved = keysOf(job).some(key => savedKeys.has(key));
    node.textContent = saved ? '★ Saved' : '☆ Save';
    node.disabled = saved || savingKeys.has(job.key);
    node.setAttribute('aria-label', `${saved ? 'Saved' : 'Save'}: ${job.title}`);
  };
  paint();
  node.addEventListener('click', async () => {
    if (savedKeys.has(job.key) || savingKeys.has(job.key)) return;
    savingKeys.add(job.key);
    paint();
    try {
      await result(client.from('saved_jobs').upsert({ user_id: userId, job_key: job.key, status: 'saved' },
        { onConflict: 'user_id,job_key', ignoreDuplicates: true }));
      savedKeys.add(job.key);
      report($('save-status'), `Saved: ${job.title}`);
    } catch {
      report($('save-status'), 'Could not save this job. Please try again.', true);
    } finally {
      savingKeys.delete(job.key);
      paint();
      const replacement = Array.from($('jobs').querySelectorAll('button')).find(button => button.value === job.key);
      if (replacement && replacement !== node) {
        replacement.textContent = node.textContent;
        replacement.disabled = node.disabled;
        replacement.setAttribute('aria-label', node.getAttribute('aria-label'));
      }
    }
  });
  node.value = job.key;
  return node;
}

function listing(start = 0) {
  const next = matches.slice(start, shown).map(job => card(job, tax, saveButton(job)));
  if (start === 0) $('jobs').replaceChildren(...next);
  else $('jobs').append(...next);
  $('more').hidden = matches.length <= shown;
  $('result-count').textContent = !available ? 'Jobs are unavailable.' : !matches.length ? 'No openings match these filters.'
    : `${count(matches.length)} ${matches.length === 1 ? 'opening' : 'openings'} · Showing ${count(Math.min(shown, matches.length))}`;
  if (start && next[0]) { next[0].tabIndex = -1; next[0].focus(); }
}
function render(reset = true) {
  if (reset) shown = BATCH;
  updateFilters();
  listing();
}
async function start() {
  $('type').append(...Object.entries(TYPES).map(([value, text]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    return option;
  }));
  const data = await snapshot(message => report($('data-errors'), message, true));
  meta = data.meta;
  available = data.jobs !== null;
  jobs = data.jobs ?? [];
  tax = taxonomy(meta, jobs);
  if (meta?.site?.name) {
    $('brand').textContent = meta.site.name;
    document.title = `${meta.site.name} — Fresher jobs in India`;
  }
  if (meta?.site?.tagline) $('tagline').textContent = meta.site.tagline;
  const drawStrip = () => {
    strip($('strip'), meta, available ? jobs.length : null);
    $('stale').hidden = !isStale(meta);
    $('stale').textContent = $('stale').hidden ? '' : 'This list is older than expected. Check the run history and confirm availability before applying.';
  };
  drawStrip();
  setInterval(drawStrip, 60000);
  evidence($('evidence'), meta, tax);
  render();

  const changed = () => {
    state = readControls();
    render();
    writeState();
  };
  $('q').addEventListener('input', debounce(changed));
  for (const key of fields.slice(1)) $(key).addEventListener('change', changed);
  $('filters').addEventListener('submit', event => { event.preventDefault(); changed(); });
  $('clear').addEventListener('click', () => {
    state = Object.fromEntries(fields.map(key => [key, check.has(key) ? false : '']));
    render();
    writeState();
    $('q').focus();
  });
  window.addEventListener('popstate', () => { state = urlState(); render(); });
  $('more').addEventListener('click', () => { const start = shown; shown += BATCH; listing(start); });

  try {
    const auth = await import('./supa.js');
    if (!auth.supa) return;
    const live = await corrections(auth.supa);
    jobs = corrected(jobs, live);
    tax = taxonomy(meta, jobs);
    drawStrip();
    // Preserve a partially typed query if the background request finishes first.
    state.q = $('q').value;
    render(false);
    if (!PANEL_CONFIG || meta?.site?.panels !== true) return;
    const session = await auth.getSession();
    if (session) {
      const id = session.user.id;
      const saved = await rows((a, b) => auth.supa.from('saved_jobs').select('job_key').eq('user_id', id).order('job_key').range(a, b));
      for (const item of saved) savedKeys.add(item.job_key);
      client = auth.supa;
      userId = id;
      $('panel-links').querySelector('a').textContent = 'Your panel';
      state.q = $('q').value;
      render(false);
    }
    $('panel-links').hidden = false;
  } catch {
    // A failed connection never prevents browsing the local snapshot.
  }
}
start();
