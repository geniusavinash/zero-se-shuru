export const $ = id => document.getElementById(id);
export const PANEL_CONFIG = window.ZSS_CONFIG?.panels === true;
export const BATCH = 50;
export const TYPES = {
  internship: 'Internship', apprenticeship: 'Apprenticeship', full_time: 'Full-time',
  part_time: 'Part-time', contract: 'Contract', other: 'Other'
};
export const STATUSES = ['saved', 'applied', 'interview', 'offer', 'rejected'];
export const pretty = value => String(value ?? '').replaceAll('_', ' ').replace(/^./, x => x.toUpperCase());
export const number = new Intl.NumberFormat('en-IN');
export const count = value => Number.isFinite(value) ? number.format(value) : '—';
export const dollars = value => Number.isFinite(value)
  ? `$${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}` : '—';

export function h(tag, contents = [], className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (!Array.isArray(contents)) contents = [contents];
  for (const part of contents) {
    if (part instanceof Node) node.append(part);
    else if (part != null) {
      const text = document.createTextNode('');
      text.textContent = String(part);
      node.append(text);
    }
  }
  return node;
}
export function button(text, type = 'button', className = '') {
  const node = h('button', text, className);
  node.type = type;
  return node;
}
export function secureUrl(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('https://')) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export function link(text, url, className = '') {
  const safe = secureUrl(url);
  if (!safe) return h('span', text);
  const node = h('a', text, className);
  node.href = safe;
  return node;
}
export function label(text, control, className = '') {
  return h('label', [text, control], className);
}
export function input(type, value = '') {
  const node = h('input');
  node.type = type;
  node.value = value;
  return node;
}
export function options(select, entries, selected = '') {
  select.replaceChildren(...entries.map(([id, name]) => {
    const option = h('option', name);
    option.value = id;
    option.selected = Array.isArray(selected) ? selected.includes(id) : id === selected;
    return option;
  }));
  return select;
}
export function debounce(fn, ms = 150) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export async function json(name) {
  const response = await fetch(`data/${name}.json`, { cache: 'no-cache', signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error(`${name}.json could not be loaded.`);
  const value = await response.json();
  if (name === 'meta' ? (!value || typeof value !== 'object' || Array.isArray(value)) : !Array.isArray(value)) {
    throw new Error(`${name}.json has an invalid format.`);
  }
  return value;
}
export async function snapshot(report = () => {}) {
  const errors = [];
  const read = async (name, fallback) => {
    try { return await json(name); }
    catch {
      errors.push(`Could not load data/${name}.json. ${name === 'jobs' ? 'Openings are unavailable.' : 'Refresh figures and filter labels may be unavailable.'}`);
      report(errors.join(' '));
      return fallback;
    }
  };
  const [jobs, meta] = await Promise.all([read('jobs', null), read('meta', null)]);
  return { jobs, meta };
}

const dateFormat = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
export function ist(value, withTime = false) {
  if (!value) return 'Unknown';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+05:30` : value);
  if (!Number.isFinite(+date)) return 'Unknown';
  return withTime ? `${timeFormat.format(date)} IST` : dateFormat.format(date);
}
export function relative(value) {
  const age = Date.now() - Date.parse(value);
  if (!Number.isFinite(age)) return '';
  if (age < 0) return 'clock ahead';
  if (age < 60000) return 'just now';
  if (age < 3600000) return `${Math.floor(age / 60000)} min ago`;
  if (age < 86400000) return `${Math.floor(age / 3600000)} h ago`;
  return `${Math.floor(age / 86400000)} d ago`;
}
export const isStale = meta => Date.now() - Date.parse(meta?.generatedAt) > (meta?.site?.staleAfterHours ?? 30) * 3600000;

export function taxonomy(meta, jobs = []) {
  const roles = new Map((meta?.roles ?? []).map(row => [row.id, row]));
  const cities = new Map((meta?.cities ?? []).map(row => [row.id, row]));
  for (const job of jobs) {
    if (job.role && !roles.has(job.role)) roles.set(job.role, { id: job.role, name: pretty(job.role) });
    for (const id of job.cities ?? []) if (!cities.has(id)) cities.set(id, { id, name: pretty(id) });
  }
  return {
    roles: [...roles.values()], cities: [...cities.values()], metros: meta?.metroGroups ?? [],
    roleName: id => roles.get(id)?.name ?? pretty(id),
    cityName: id => cities.get(id)?.name ?? pretty(id),
    aliases: id => cities.get(id)?.aliases ?? [],
    sourceName: id => meta?.sources?.find(source => source.name === id)?.display ??
      ({ greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', adzuna: 'Adzuna' }[id] ?? pretty(id))
  };
}
const words = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('en-IN').match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
export function searcher(query, tax) {
  const terms = words(query);
  if (!terms.length) return () => true;
  return job => {
    const haystack = words([job.title, job.company, job.locationText, tax.roleName(job.role),
      ...(job.cities ?? []).flatMap(id => [tax.cityName(id), ...tax.aliases(id)])].join(' '));
    return terms.every(term => haystack.some(word => word.startsWith(term)));
  };
}
export const adzuna = job => job.aggregator === true || job.source === 'adzuna';
export const keysOf = job => [job.key, ...(job.memberKeys ?? [])];

export function card(job, tax, save = null) {
  const title = h('h3', job.title);
  const badges = [job.isNew ? h('span', 'New', 'badge') : null,
    job.overridden ? h('span', 'Tags corrected', 'badge quiet') : null];
  const locations = (job.cities ?? []).map(id => {
    const name = tax.cityName(id);
    const url = job.cityLinks?.find(item => item.city === id)?.url;
    const chip = secureUrl(url) ? link(name, url, 'chip') : h('span', name, 'chip');
    if (chip.tagName === 'A') chip.setAttribute('aria-label', `Apply for ${job.title} in ${name}`);
    return chip;
  });
  if (job.remote) locations.push(h('span', 'Remote', 'chip'));
  const apply = secureUrl(job.url) ? link('Apply', job.url, 'primary') : h('span', 'Apply link unavailable', 'muted');
  if (apply.tagName === 'A') apply.setAttribute('aria-label', `Apply for ${job.title} at ${job.company}`);
  return h('article', [
    h('div', [title, ...badges], 'card-title'), h('p', job.company, 'company'),
    locations.length ? h('div', locations, 'chips') : null,
    job.locationText ? h('p', job.locationText, 'muted') : null,
    h('p', [h('span', tax.roleName(job.role)), ' ', h('span', TYPES[job.jobType] ?? pretty(job.jobType))], 'card-meta'),
    h('p', [h('strong', "Why it's here: "), job.why], 'why'),
    h('div', [
      h('p', `${job.postedAt ? 'Posted' : 'First seen'} ${ist(job.postedAt ?? job.firstSeen)}`, 'muted'),
      h('p', `Source: ${tax.sourceName(job.source)}`, 'muted')
    ], 'listing-meta'),
    h('div', [h('div', [apply, adzuna(job) ? link('Jobs by Adzuna', 'https://www.adzuna.in', 'adzuna') : null], 'apply-links'), save], 'card-actions')
  ], 'card');
}

export function pager(container, more, className = 'cards') {
  const list = h('div', [], className);
  container.append(list, more);
  more.classList.add('more');
  let items = [], renderer, cursor = 0;
  function append(focus = false) {
    const next = items.slice(cursor, cursor + BATCH).map(renderer);
    cursor += next.length;
    list.append(...next);
    more.hidden = cursor >= items.length;
    if (focus && next[0]) {
      next[0].tabIndex = -1;
      next[0].focus();
    }
  }
  more.addEventListener('click', () => append(true));
  return (rows, render) => {
    items = rows;
    renderer = render;
    cursor = 0;
    list.replaceChildren();
    append();
  };
}

export async function result(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
export async function rows(queryAtPage) {
  const size = 200;
  const all = [];
  for (let start = 0; ; start += size) {
    const page = await result(queryAtPage(start, start + size - 1));
    if (!Array.isArray(page)) throw new Error('Invalid account service response.');
    all.push(...page);
    if (page.length < size) return all;
  }
}
export const corrections = client => Promise.all([
  rows((a, b) => client.from('hidden_posts').select('job_key,reason,at').order('job_key').range(a, b)),
  rows((a, b) => client.from('blocked_companies').select('company_key,reason,at').order('company_key').range(a, b)),
  rows((a, b) => client.from('tag_fixes').select('job_key,role,cities,reason,at').order('job_key').range(a, b))
]);
export function corrected(jobs, [hidden, blocked, fixes]) {
  const hiddenKeys = new Set(hidden.map(row => row.job_key));
  const blockedKeys = new Set(blocked.map(row => row.company_key));
  const byKey = new Map(fixes.map(row => [row.job_key, row]));
  return jobs.filter(job => !blockedKeys.has(job.companyKey) && !keysOf(job).some(key => hiddenKeys.has(key)))
    .map(job => {
      const fix = keysOf(job).map(key => byKey.get(key)).find(Boolean);
      return fix ? { ...job, role: fix.role ?? job.role, cities: Array.isArray(fix.cities) ? fix.cities : job.cities, overridden: true } : job;
    });
}

export function table(caption, heads, records, rowClass = () => '') {
  const head = h('tr', heads.map(text => {
    const cell = h('th', text);
    cell.scope = 'col';
    return cell;
  }));
  const body = records.map((record, i) => h('tr', record.map((value, index) => {
    const cell = h(index === 0 ? 'th' : 'td', value);
    if (index === 0) cell.scope = 'row';
    return cell;
  }), rowClass(i)));
  if (!body.length) {
    const empty = h('td', 'No data available.');
    empty.colSpan = heads.length;
    body.push(h('tr', empty));
  }
  const scroll = h('div', h('table', [h('caption', caption), h('thead', head), h('tbody', body)]), 'table-scroll');
  scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-label', caption);
  return scroll;
}
export function strip(host, meta, shown) {
  const both = meta?.metrics?.accuracy?.both;
  const stats = [
    ['funnel', 'Posts available', count(shown)],
    ['runs', 'Last refresh', [ist(meta?.generatedAt, true), relative(meta?.generatedAt) ? h('small', relative(meta.generatedAt)) : null]],
    ['accuracy', 'Tagging accuracy', both?.total > 0 ? `Role+city both right: ${both.correct}/${both.total}` : 'Not measured yet'],
    ['accuracy', 'Cost per 1,000 posts shown', dollars(meta?.metrics?.costPer1000Shown)]
  ];
  host.replaceChildren(...stats.map(([id, title, value]) => {
    const node = h('a', [h('span', title, 'eyebrow'), h('strong', value)], 'stat');
    node.setAttribute('href', `#${id}`);
    return node;
  }));
}

function section(id, title, children) {
  const node = h('section', [h('h3', title), ...children], 'evidence-section');
  node.id = id;
  return node;
}
function interval(sample) {
  if (!sample?.total) return 'Not measured';
  const pct = value => Math.round(value * 100);
  return `${sample.correct}/${sample.total} · ${pct(sample.correct / sample.total)}% (${pct(sample.low)}–${pct(sample.high)}%)`;
}
export function evidence(host, meta, tax, admin = false) {
  const stages = ['read', 'india', 'candidates', 'tagged', 'eligible', 'afterDedupe', 'shown'];
  const funnel = meta?.funnel;
  const pipeline = funnel ? [['Total', funnel.total], ...Object.entries(funnel.bySource ?? {}).map(([id, values]) => [tax.sourceName(id), values])] : [];
  const blocks = [section('funnel', 'Refresh funnel', [
    h('p', `Duplicates removed: ${count(meta?.counts?.duplicatesRemoved)} · City disagreements: ${count(meta?.counts?.cityMismatch)}. These figures describe the published refresh, before live corrections.`),
    table('Posts by stage', ['Source', 'Read', 'In India', 'Candidates', 'Tagged', 'Eligible', 'After dedupe', 'Shown'],
      pipeline.map(([name, data]) => [name, ...stages.map(key => count(data?.[key]))]))
  ])];
  blocks.push(section('sources', 'Sources', [table('Source policies and attribution',
    ['Source', 'Docs', 'Terms', 'Why allowed', 'Attribution', 'Status', ...(admin ? ['Boards OK', 'Boards failed'] : [])],
    (meta?.sources ?? []).map(row => [row.display ?? row.name, secureUrl(row.docs) ? link('Docs', row.docs) : '—',
      secureUrl(row.terms) ? link('Terms', row.terms) : '—', row.whyAllowed, row.attribution,
      row.on ? 'On' : 'Off', ...(admin ? [count(row.boardsOk), count(row.boardsFailed)] : [])]))]));
  const metrics = meta?.metrics;
  const metricContent = metrics ? [
    h('p', `As of run ${metrics.asOfRun} · Model: ${metrics.model} · Prompt: ${metrics.promptVersion}`),
    table('Hand-check results (95% intervals)', ['Measure', 'Result'], [
      ['Role and city both right', interval(metrics.accuracy?.both)], ['Role', interval(metrics.accuracy?.role)],
      ['City', interval(metrics.accuracy?.city)], ...Object.entries(metrics.fresherShareBySource ?? {})
        .map(([id, value]) => [`Fresher and in India: ${tax.sourceName(id)}`, interval(value)])
    ]),
    h('p', `Cost per 1,000 tagged: ${dollars(metrics.costPer1000Tagged)} · Per 1,000 shown: ${dollars(metrics.costPer1000Shown)} · Provider console spend: ${Number.isFinite(metrics.consoleSpendUsd) ? dollars(metrics.consoleSpendUsd) : 'not available'}.`)
  ] : [h('p', 'Not measured yet.')];
  blocks.push(section('accuracy', 'Accuracy and cost', metricContent));
  const runs = (meta?.runs ?? []).slice(0, 14);
  const triggers = { schedule: 'Scheduled', manual: 'Manual', local: 'Local' };
  blocks.push(section('runs', 'Recent runs', [table('Last 14 runs',
    ['Run', 'Started (IST)', 'Trigger', 'Status', 'Shown', 'New', 'LLM calls', 'Cost (USD)'],
    runs.map(run => [run.id, ist(run.startedAt, true), triggers[run.trigger] ?? pretty(run.trigger),
      run.ok ? 'Succeeded' : h('strong', `Failed${run.blockedReason ? `: ${run.blockedReason}` : ''}`, 'error'),
      count(run.shown), count(run.newPosts), count(run.llmCalls), dollars(run.costUsd)]), i => runs[i].ok ? '' : 'failed')]));
  const repoUrl = meta?.site?.repoUrl ? String(meta.site.repoUrl).replace(/\/+$/, '') : '';
  if (!admin) blocks.push(section('contact', 'Request a removal', [h('p', meta?.site?.contact
    ? ['Email ', h('strong', meta.site.contact), ' with the listing title, company and reason.']
    : repoUrl ? [link('Open an issue', `${repoUrl}/issues/new`), ' with the listing title, company and reason.']
      : 'The removal contact is unavailable.') ]));
  host.replaceChildren(...blocks);
}

export function actionStatus() {
  const node = h('p', [], 'feedback');
  node.setAttribute('role', 'status');
  return node;
}
export function report(node, text, error = false) {
  node.textContent = text;
  node.classList.toggle('error', error);
}
export function authForm(auth, signup = false) {
  const email = input('email');
  email.required = true;
  email.autocomplete = 'email';
  const password = input('password');
  password.required = true;
  password.autocomplete = 'current-password';
  const signIn = button('Sign in', 'submit', 'primary');
  const signUp = signup ? button('Sign up', 'submit') : null;
  const status = actionStatus();
  const form = h('form', [h('h2', signup ? 'Sign in or create an account' : 'Admin sign-in'),
    label('Email', email), label('Password', password), h('div', [signIn, signUp], 'toolbar'), status], 'surface stack narrow');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const creating = signup && event.submitter === signUp;
    signIn.disabled = true;
    if (signUp) signUp.disabled = true;
    report(status, creating ? 'Creating your account…' : 'Signing in…');
    try {
      const data = await (creating ? auth.signUp : auth.signIn)(email.value.trim(), password.value);
      if (data?.session) location.reload();
      else report(status, 'No session was returned. Check your email or try signing in.');
    } catch (error) {
      report(status, error?.message || 'Could not sign in. Try again.', true);
    } finally {
      signIn.disabled = false;
      if (signUp) signUp.disabled = false;
    }
  });
  return form;
}
export function signOutBar(auth) {
  const out = button('Sign out');
  const status = actionStatus();
  out.addEventListener('click', async () => {
    out.disabled = true;
    try { await auth.signOut(); location.reload(); }
    catch { report(status, 'Could not sign out. Please try again.', true); out.disabled = false; }
  });
  return h('div', [out, status], 'toolbar');
}
export function tabs(host, names, onChange) {
  const nav = h('nav', [], 'toolbar tabs');
  nav.setAttribute('aria-label', 'Panel views');
  const panels = names.map(name => {
    const section = h('section', h('h2', name));
    section.hidden = true;
    return section;
  });
  const buttons = names.map((name, i) => {
    const toggle = button(name);
    panels[i].id = `view-${i}`;
    toggle.setAttribute('aria-controls', panels[i].id);
    toggle.addEventListener('click', () => activate(i));
    return toggle;
  });
  function activate(i) {
    panels.forEach((panel, j) => {
      panel.hidden = i !== j;
      buttons[j].setAttribute('aria-pressed', String(i === j));
    });
    onChange?.(i);
  }
  nav.append(...buttons);
  host.append(nav, ...panels);
  return { panels, activate };
}
