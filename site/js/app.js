import { $, BATCH, PANEL_CONFIG, TYPES, adzuna, button, card, companyMark, corrected, corrections,
  count, debounce, freshness, h, isStale, keysOf, link, options, pagesRead, publicStrip, removalContact,
  report, result, rows, searcher, secureUrl, snapshot, taxonomy } from './common.js';

const fields = ['q', 'role', 'city', 'type', 'source', 'recent', 'remote'];
const checks = new Set(['recent', 'remote']);
const day = 86400000;
let jobs = [], meta = null, available = false, tax = taxonomy(null), shown = BATCH;
let client, userId;
const savedKeys = new Set();
const savingKeys = new Set();
let matches = [];
let ready = false, pendingSearch = false;

function urlState() {
  const params = new URLSearchParams(location.search);
  return Object.fromEntries(fields.map(key => [key, checks.has(key) ? params.get(key) === '1' : params.get(key) ?? '']));
}
let state = urlState();
function writeState() {
  const url = new URL(location.href);
  for (const key of fields) {
    if (state[key]) url.searchParams.set(key, checks.has(key) ? '1' : state[key]);
    else url.searchParams.delete(key);
  }
  history.replaceState(history.state, '', url);
}
const readControl = key => checks.has(key) ? $(key).checked : $(key).value;
const readControls = () => Object.fromEntries(fields.map(key => [key, readControl(key)]));
function syncControls(keys) {
  for (const key of keys) {
    if (checks.has(key)) $(key).checked = state[key];
    else if ($(key).value !== state[key]) $(key).value = state[key];
  }
}
function metroMatch(job, city) {
  const group = tax.metros.find(item => item.id === city);
  return group ? (job.cities ?? []).some(id => group.cities.includes(id)) : job.cities?.includes(city);
}
function updateFilters() {
  const roles = tax.roles;
  const cities = [...tax.metros, ...tax.cities];
  if (!roles.some(item => item.id === state.role)) state.role = '';
  if (!cities.some(item => item.id === state.city)) state.city = '';
  if (!Object.hasOwn(TYPES, state.type)) state.type = '';
  if (!['company', 'adzuna'].includes(state.source)) state.source = '';
  const search = searcher(state.q, tax);
  const now = Date.now();
  const base = jobs.filter(job => {
    const age = state.recent ? now - Date.parse(job.postedAt) : 0;
    return search(job) && (!state.type || state.type === job.jobType) &&
      (!state.source || (state.source === 'adzuna') === adzuna(job)) && (!state.remote || job.remote) &&
      (!state.recent || (age >= 0 && age <= 7 * day));
  });
  const forRole = base.filter(job => !state.city || metroMatch(job, state.city));
  const forCity = base.filter(job => !state.role || job.role === state.role);
  options($('role'), [['', 'All roles'], ...roles.map(item => [item.id,
    `${item.name} (${count(forRole.filter(job => job.role === item.id).length)})`])], state.role);
  options($('city'), [['', 'All cities'], ...cities.map(item => [item.id,
    `${item.name}${Array.isArray(item.cities) ? ' (metro)' : ''} (${count(forCity.filter(job => metroMatch(job, item.id)).length)})`])], state.city);
  syncControls(['q', 'type', 'source', 'remote', 'recent']);
  matches = forRole.filter(job => !state.role || job.role === state.role);
}

function saveButton(job) {
  if (!client || !userId) return null;
  const node = button('Save');
  const alreadySaved = () => keysOf(job).some(key => savedKeys.has(key));
  const paint = (target = node) => {
    const saved = alreadySaved();
    target.textContent = saved ? '★ Saved' : '☆ Save';
    target.disabled = saved || savingKeys.has(job.key);
    target.setAttribute('aria-label', `${saved ? 'Saved' : 'Save'}: ${job.title}`);
  };
  paint();
  node.addEventListener('click', async () => {
    if (alreadySaved() || savingKeys.has(job.key)) return;
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
      const replacement = Array.from($('jobs-list').querySelectorAll('button')).find(control => control.value === job.key);
      if (replacement && replacement !== node) paint(replacement);
    }
  });
  node.value = job.key;
  return node;
}

function listing(start = 0) {
  const next = matches.slice(start, shown).map(job => card(job, tax, saveButton(job)));
  if (start === 0) $('jobs-list').replaceChildren(...next);
  else $('jobs-list').append(...next);
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
function goToJobs() {
  $('browse-title').focus({ preventScroll: true });
  $('jobs').scrollIntoView({ block: 'start' });
}
function drawFreshness() {
  $('freshness').textContent = freshness(meta?.generatedAt);
  $('stale').hidden = !isStale(meta);
  $('stale').textContent = $('stale').hidden ? '' : "This list is older than expected. Confirm the opening on the company's page before applying.";
}
function drawDiscovery() {
  const boards = pagesRead(meta);
  publicStrip($('numbers'), available ? jobs : null, boards);
  const pages = boards == null ? 'company career pages' : `${count(boards)} company career ${boards === 1 ? 'page' : 'pages'}`;
  $('how-collect').replaceChildren(h('span', `Openings from ${pages} and the Adzuna API, every morning and evening.`));

  const roleCounts = new Map(), cityCounts = new Map();
  const bump = (map, id) => map.set(id, (map.get(id) ?? 0) + 1);
  for (const job of jobs) {
    if (job.role) bump(roleCounts, job.role);
    for (const city of new Set(job.cities ?? [])) if (city && city !== 'other_india') bump(cityCounts, city);
  }
  const top = (values, name, size) => [...values]
    .sort(([a, n], [b, m]) => m - n || name(a).localeCompare(name(b), 'en-IN') || a.localeCompare(b))
    .slice(0, size).map(([id]) => id);
  const chip = (key, id, name) => {
    const node = button(name);
    node.setAttribute('aria-label', `Filter by ${key}: ${name}`);
    node.addEventListener('click', () => {
      state = { ...readControls(), [key]: id };
      render();
      writeState();
      goToJobs();
    });
    return node;
  };
  const chips = [
    ...top(roleCounts, tax.roleName, 3).map(id => chip('role', id, tax.roleName(id))),
    ...top(cityCounts, tax.cityName, 2).map(id => chip('city', id, tax.cityName(id)))
  ];
  $('popular').replaceChildren(...(chips.length ? chips : [h('span', 'No suggestions available.', 'muted')]));

  const recent = jobs.map(job => ({ job, seen: Date.parse(job.firstSeen) }))
    .filter(({ job, seen }) => Number.isFinite(seen) && secureUrl(job.url))
    .sort((a, b) => b.seen - a.seen).slice(0, 3);
  $('just-list').replaceChildren(...(recent.length ? recent.map(({ job }) => {
    const cityId = job.cities?.[0];
    const location = cityId ? tax.cityName(cityId) : job.remote ? 'Remote' : '';
    const item = link([companyMark(job), h('span', [h('strong', job.title),
      h('small', location ? `${job.company} · ${location}` : job.company)], 'just-copy')], job.url, 'just-card');
    item.setAttribute('aria-label', `Apply for ${job.title} at ${job.company}${location ? ` · ${location}` : ''}`);
    return h('li', item);
  }) : [h('li', available ? 'No recent openings with an apply link.' : 'Recent openings are unavailable.', 'muted')]));
}

function setupMenu() {
  const menu = $('menu-toggle'), nav = $('site-nav');
  const open = () => menu.getAttribute('aria-expanded') === 'true';
  const set = expanded => menu.setAttribute('aria-expanded', String(expanded));
  menu.addEventListener('click', () => set(!open()));
  nav.addEventListener('click', event => { if (event.target.closest('a')) set(false); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open()) { set(false); menu.focus(); }
  });
  matchMedia('(max-width: 768px)').addEventListener('change', () => set(false));
}

async function start() {
  setupMenu();
  $('type').append(...Object.entries(TYPES).map(([value, text]) => {
    const option = h('option', text);
    option.value = value;
    return option;
  }));
  const immediate = ['q', 'type', 'source', 'recent', 'remote'];
  syncControls(immediate);
  const changed = key => {
    if (!ready) { state[key] = readControl(key); return; }
    state = readControls();
    render();
    writeState();
  };
  $('q').addEventListener('input', debounce(() => changed('q')));
  for (const key of fields.slice(1)) $(key).addEventListener('change', () => changed(key));
  $('search').addEventListener('submit', event => {
    event.preventDefault();
    if (!ready) { pendingSearch = true; return; }
    changed('q');
    goToJobs();
  });
  $('filters').addEventListener('submit', event => { event.preventDefault(); changed('q'); });
  $('clear').addEventListener('click', () => {
    state = Object.fromEntries(fields.map(key => [key, checks.has(key) ? false : '']));
    pendingSearch = false;
    if (ready) render();
    else syncControls(immediate);
    writeState();
    $('q').focus();
  });
  window.addEventListener('popstate', () => {
    state = urlState();
    pendingSearch = false;
    if (ready) render();
    else syncControls(immediate);
  });
  $('more').addEventListener('click', () => { const start = shown; shown += BATCH; listing(start); });

  const data = await snapshot(message => report($('data-errors'), message, true));
  meta = data.meta;
  available = data.jobs !== null;
  jobs = data.jobs ?? [];
  tax = taxonomy(meta, jobs);
  if (meta?.site?.name) {
    $('brand').textContent = meta.site.name;
    document.title = `${meta.site.name} — Fresher jobs in India`;
  }
  drawFreshness();
  setInterval(drawFreshness, 60000);
  drawDiscovery();
  $('contact').replaceChildren(removalContact(meta));
  state.q = $('q').value;
  ready = true;
  render();
  if (pendingSearch) { pendingSearch = false; writeState(); goToJobs(); }

  try {
    const auth = await import('./supa.js');
    if (!auth.supa) return;
    const live = await corrections(auth.supa);
    jobs = corrected(jobs, live);
    tax = taxonomy(meta, jobs);
    drawDiscovery();
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
    $('admin-link').hidden = false;
    $('how-account').hidden = false;
    $('account-cta').href = 'me.html';
    // A signed-in student already has an account: send them to it instead of offering a new one.
    $('account-cta').textContent = userId ? 'Open your panel' : 'Create a free account';
  } catch {
    // A failed connection never prevents browsing the local snapshot.
  }
}
start();
