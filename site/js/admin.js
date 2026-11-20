import { $, PANEL_CONFIG, actionStatus, authForm, button, card, corrections, count, debounce, evidence, h,
  input, isStale, ist, json, keysOf, label, link, options, pager, pretty, report, result, rows, searcher, secureUrl,
  signOutBar, snapshot, strip, table, tabs, taxonomy } from './common.js';

const host = $('panel');
const status = $('panel-status');
const boardKey = (ats, token) => JSON.stringify([ats, token]);
const asMap = (list, key) => new Map(list.map(row => [key(row), row]));
const textReason = () => {
  const field = input('text');
  field.required = true;
  field.maxLength = 240;
  return field;
};

function editAction({ title, current, extra = [], enabled = true, write, erase }) {
  const summary = h('summary', title);
  const active = h('p', [], 'muted');
  const reason = textReason();
  const save = button(title, 'submit', 'primary');
  const undo = button('Undo');
  const feedback = actionStatus();
  const details = h('details', [summary, h('form', [active, ...extra, label('Short reason', reason),
    h('div', [save, undo], 'toolbar'), feedback], 'stack')], 'action');
  const form = details.querySelector('form');
  const refresh = () => {
    const row = current();
    active.textContent = row ? `Active override: ${row.reason || 'no reason recorded'}` : 'No override for this key.';
    undo.hidden = !row;
    save.disabled = !enabled;
  };
  details.addEventListener('toggle', refresh);
  refresh();
  async function change(operation, success) {
    save.disabled = true;
    undo.disabled = true;
    report(feedback, 'Working…');
    try {
      await operation();
      reason.value = '';
      report(feedback, success);
    } catch (error) {
      report(feedback, error?.message ? `Change failed: ${error.message}` : 'Change failed. Please try again.', true);
    } finally { undo.disabled = false; refresh(); }
  }
  reason.addEventListener('input', () => reason.setCustomValidity(''));
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!reason.value.trim()) {
      reason.setCustomValidity('Enter a short reason.');
      reason.reportValidity();
      return;
    }
    if (enabled) change(() => write(reason.value.trim()), 'Override saved.');
  });
  undo.addEventListener('click', () => change(erase, 'Override removed.'));
  return details;
}

function singleOverride(client, tableName, keyColumn, key, map, config) {
  return editAction({
    ...config,
    current: () => map.get(key),
    async write(reason) {
      const row = { [keyColumn]: key, ...config.values?.(), reason };
      const saved = await result(client.from(tableName).upsert(row, { onConflict: keyColumn }).select(`${keyColumn},reason,at`).single());
      map.set(key, { ...row, ...saved });
    },
    async erase() {
      await result(client.from(tableName).delete().eq(keyColumn, key).select(keyColumn).single());
      map.delete(key);
    }
  });
}

const employerName = name => String(name ?? '').normalize('NFKC').toLowerCase().trim();
const inferredCompanyKey = name => employerName(name)
  .replace(/(?:[\s,.]+(?:private|pvt|limited|ltd|llp|inc|llc|corporation|corp)\.?)+$/i, '')
  .replace(/[^\p{L}\p{N}]+/gu, '');

// The overrides as maps, shared by the moderation forms and the Overrides tab so both always agree.
const overrideMaps = ([hidden, blocked, fixes]) => ({
  hidden: asMap(hidden, row => row.job_key),
  blocked: asMap(blocked, row => row.company_key),
  fixes: asMap(fixes, row => row.job_key)
});

function moderator(client, jobs, tax, meta, maps) {
  const { hidden: hideMap, blocked: blockMap, fixes: fixMap } = maps;
  const companyKeys = new Map();
  for (const job of jobs) {
    if (!job.companyKey) continue;
    const name = employerName(job.company);
    if (!companyKeys.has(name)) companyKeys.set(name, new Set());
    companyKeys.get(name).add(job.companyKey);
  }
  return item => {
    const known = companyKeys.get(employerName(item.company));
    const companyKey = item.companyKey || (known?.size === 1 ? [...known][0] : !known ? inferredCompanyKey(item.company) : '');
    const derived = !item.companyKey && !known && !!companyKey;
    const fix = fixMap.get(item.key);
    const role = options(h('select'), [['', 'Choose a role'], ...(meta?.roles ?? []).map(row => [row.id, row.name])], fix?.role ?? item.role ?? '');
    role.required = true;
    const cities = h('select');
    cities.multiple = true;
    cities.size = 6;
    options(cities, (meta?.cities ?? []).map(row => [row.id, row.name]), fix?.cities ?? item.cities ?? item.llmCities ?? []);
    const hideEdit = singleOverride(client, 'hidden_posts', 'job_key', item.key, hideMap, { title: 'Hide post' });
    const blockEdit = singleOverride(client, 'blocked_companies', 'company_key', companyKey, blockMap, {
      title: 'Block company', enabled: !!companyKey,
      extra: [h('p', companyKey ? `${derived ? 'Inferred company key' : 'Company key'}: ${companyKey}. ${derived ? 'Verify it before blocking.' : 'This affects all posts with this key.'}`
        : 'No unambiguous company key is available.', 'muted')]
    });
    const fixEdit = singleOverride(client, 'tag_fixes', 'job_key', item.key, fixMap, {
      title: 'Fix tags', enabled: !!meta?.roles?.length && Array.isArray(meta?.cities),
      extra: [label('Role', role), label('Cities (select any, or none)', cities),
        h('p', 'On a keyboard, hold Ctrl or Command to select more than one city.', 'muted')],
      values: () => ({ role: role.value, cities: Array.from(cities.selectedOptions, option => option.value) })
    });
    return h('div', [hideEdit, blockEdit, fixEdit], 'moderation');
  };
}

// Every active override with an Undo. A hidden post or blocked company leaves the published list at the
// next refresh, so this tab is the only place to find it again (review fix #10).
function overrideList(client, jobs, tax, maps) {
  const byKey = new Map();
  for (const job of jobs) for (const key of keysOf(job)) byKey.set(key, job);
  const post = key => {
    const job = byKey.get(key);
    return h('div', [h('strong', job ? job.title : key),
      h('p', job ? `${job.company} · ${key}` : 'Not in the published list', 'muted')]);
  };
  const company = key => {
    const job = jobs.find(item => item.companyKey === key);
    return h('div', [h('strong', job?.company ?? key), h('p', key, 'muted')]);
  };
  const since = row => row.at ? ist(row.at, true) : 'Unknown';
  const cityList = cities => !Array.isArray(cities) ? 'Unchanged' : cities.length ? cities.map(tax.cityName).join(', ') : 'No city';
  const undo = (tableName, column, key, map) => {
    const control = button('Undo');
    const feedback = actionStatus();
    control.addEventListener('click', async () => {
      control.disabled = true;
      report(feedback, 'Working…');
      try {
        await result(client.from(tableName).delete().eq(column, key).select(column).single());
        map.delete(key);
        report(feedback, 'Removed. Fully applied after the next refresh.');
      } catch (error) {
        control.disabled = false;
        report(feedback, error?.message ? `Change failed: ${error.message}` : 'Change failed. Please try again.', true);
      }
    });
    return h('div', [control, feedback]);
  };
  return [
    table(`Hidden posts (${count(maps.hidden.size)})`, ['Post', 'Reason', 'Since (IST)', 'Action'],
      [...maps.hidden.values()].map(row => [post(row.job_key), row.reason || 'No reason', since(row),
        undo('hidden_posts', 'job_key', row.job_key, maps.hidden)])),
    table(`Blocked companies (${count(maps.blocked.size)})`, ['Company', 'Reason', 'Since (IST)', 'Action'],
      [...maps.blocked.values()].map(row => [company(row.company_key), row.reason || 'No reason', since(row),
        undo('blocked_companies', 'company_key', row.company_key, maps.blocked)])),
    table(`Tag fixes (${count(maps.fixes.size)})`, ['Post', 'Role', 'Cities', 'Reason', 'Action'],
      [...maps.fixes.values()].map(row => [post(row.job_key), row.role ? tax.roleName(row.role) : 'Unchanged',
        cityList(row.cities), row.reason || 'No reason', undo('tag_fixes', 'job_key', row.job_key, maps.fixes)]))
  ];
}

function renderBoards(view, meta, client, switches) {
  view.append(h('p', 'Board switches take effect at the next refresh. Health and counts are from the last published run.'));
  if (!switches) {
    view.append(h('p', 'Could not load board switches. Changes are unavailable until you reload.', 'error'));
  }
  const map = asMap(switches ?? [], row => boardKey(row.ats, row.token));
  const records = (meta?.boards ?? []).map(board => {
    const key = boardKey(board.ats, board.token);
    const override = map.get(key);
    const select = options(h('select'), [['on', 'On'], ['off', 'Off']], (override?.is_on ?? board.on) ? 'on' : 'off');
    const activity = h('p', '', 'muted');
    const paint = () => {
      const row = map.get(key);
      const on = row?.is_on ?? board.on;
      activity.textContent = `${on ? 'On' : 'Off'}${row ? ' (override)' : ' (published setting)'}`;
      select.value = on ? 'on' : 'off';
    };
    paint();
    const editor = switches ? editAction({ title: 'Set board switch', current: () => map.get(key),
      extra: [label('Next refresh', select)],
      async write(reason) {
        const row = { ats: board.ats, token: board.token, is_on: select.value === 'on', reason };
        const saved = await result(client.from('board_switches').upsert(row, { onConflict: 'ats,token' }).select('ats,token,is_on,reason').single());
        map.set(key, saved);
        paint();
      },
      async erase() {
        await result(client.from('board_switches').delete().eq('ats', board.ats).eq('token', board.token).select('token').single());
        map.delete(key);
        paint();
      }
    }) : null;
    const health = board.on ? (board.ok ? 'OK' : h('span', `Failed${board.reason ? `: ${board.reason}` : ''}`, 'error')) : 'Off';
    return [h('div', [h('strong', board.company), h('p', `${board.ats}: ${board.token}`, 'muted')]), health,
      count(board.india), count(board.candidates), count(board.shown), h('div', [activity, editor], 'board-control')];
  });
  view.append(table('Company boards', ['Board', 'Last status', 'India', 'Candidates', 'Shown', 'Switch'], records));
}

async function start() {
  if (!PANEL_CONFIG) { report(status, 'The admin panel is unavailable.'); return; }
  try {
    const auth = await import('./supa.js');
    if (!auth.supa) throw new Error('No account service');
    const client = auth.supa;
    const session = await auth.getSession();
    if (!session) { report(status, ''); host.append(authForm(auth)); return; }
    if (await result(client.rpc('is_admin')) !== true) {
      report(status, 'This account is not an admin');
      return;
    }
    report(status, 'Loading dashboard…');
    host.append(signOutBar(auth));
    const [{ jobs, meta }, review, overrides, switches, stats] = await Promise.all([
      snapshot(message => report($('data-errors'), message, true)),
      json('review').catch(() => null), corrections(client).catch(() => null),
      rows((a, b) => client.from('board_switches').select('ats,token,is_on,reason').order('ats').order('token').range(a, b)).catch(() => null),
      result(client.rpc('admin_stats')).catch(() => null)
    ]);
    if (meta?.site?.panels === false) { report(status, 'The admin panel is disabled.'); return; }
    report(status, '');
    const tax = taxonomy(meta, jobs ?? []);
    const maps = overrides ? overrideMaps(overrides) : null;
    const overrideBox = h('div');
    // Painted each time the tab opens, so overrides saved in the other tabs show up.
    const paintOverrides = () => overrideBox.replaceChildren(...(maps ? overrideList(client, jobs ?? [], tax, maps)
      : [h('p', 'Could not load overrides. Reload to try again.', 'error')]));
    const views = tabs(host, ['Dashboard', 'Quality & runs', 'Review queue', 'Posts', 'Overrides', 'Boards'],
      i => { if (i === 4) paintOverrides(); });
    const [dash, quality, queue, posts, overridesView, boards] = views.panels;
    overridesView.append(h('p', 'Every active override. Hidden posts and blocked companies leave the published list at the next refresh, so undo them here.'), overrideBox);
    const summary = h('div', [], 'strip');
    strip(summary, meta, jobs?.length ?? meta?.counts?.shown);
    const repo = secureUrl(meta?.site?.repoUrl);
    const workflow = repo ? new URL(`${new URL(repo).pathname.replace(/\/+$/, '')}/actions/workflows/refresh.yml`, new URL(repo).origin) : null;
    const counts = stats ? table('Account counts', ['Measure', 'Count'], [
      ['Users', count(stats.users)], ['Profiles', count(stats.profiles)],
      ...Object.entries(stats.saves_by_status ?? {}).map(([key, value]) => [`Saves: ${pretty(key)}`, count(value)])
    ]) : h('p', 'Account counts could not be loaded.', 'error');
    dash.append(summary, isStale(meta) ? h('p', 'The published snapshot is older than expected.', 'notice') : nullNode(),
      workflow ? link('Run now', workflow.href, 'primary') : h('p', 'The refresh workflow URL is unavailable.', 'muted'), counts);

    const details = h('div');
    evidence(details, meta, tax, true);
    quality.append(h('p', 'How the published list is made, how well it is tagged, what it costs, and every recent run.'),
      h('div', h('ol', [
        'Read published openings from permitted APIs.',
        'Screen for India, freshness and obvious exclusions.',
        'Ask the model to tag roles and cities and report eligibility facts.',
        'Apply fresher eligibility rules and flag disagreements for review.',
        'Merge duplicate listings while keeping city-specific apply links.',
        'Publish the list and its evidence after a successful refresh.'
      ].map(line => h('li', line))), 'evidence'), details);
    for (const tile of summary.querySelectorAll('a')) {
      tile.addEventListener('click', event => {
        event.preventDefault();
        views.activate(1);
        const section = $(tile.hash.slice(1));
        if (section) {
          const heading = section.querySelector('h3');
          if (heading) {
            heading.tabIndex = -1;
            heading.focus({ preventScroll: true });
          }
          section.scrollIntoView({ block: 'start' });
        }
      });
    }

    const actions = maps ? moderator(client, jobs ?? [], tax, meta, maps) : () =>
      h('p', 'Could not load existing overrides. Reload to enable moderation.', 'error');
    if (!review) queue.append(h('p', 'Could not load data/review.json.', 'error'));
    else if (!review.length) queue.append(h('p', 'The review queue is empty.'));
    else pager(queue, button('Show more'))(review, item => {
      const list = cities => cities?.length ? cities.map(tax.cityName).join(', ') : 'None';
      return h('article', [h('h3', item.title), h('p', `${item.company} · ${tax.sourceName(item.source)}`),
        h('p', `Review reason: ${pretty(item.reason)}`, 'muted'),
        h('dl', [h('div', [h('dt', 'LLM cities'), h('dd', list(item.llmCities))]),
          h('div', [h('dt', 'Rule cities'), h('dd', list(item.ruleCities))])], 'compare'),
        secureUrl(item.url) ? link('Open source listing', item.url) : null,
        actions(item)], 'card');
    });
    const search = input('search');
    search.placeholder = 'Search today’s published posts';
    const postCount = actionStatus();
    posts.append(label('Search posts', search), postCount);
    const render = pager(posts, button('Show more'));
    const filter = () => {
      const found = (jobs ?? []).filter(searcher(search.value, tax));
      report(postCount, jobs ? `${count(found.length)} published ${found.length === 1 ? 'post' : 'posts'}` : 'Posts could not be loaded.');
      render(found, job => h('div', [card(job, tax), actions(job)], 'saved-item'));
    };
    search.addEventListener('input', debounce(filter));
    filter();
    renderBoards(boards, meta, client, switches);
    views.activate(0);
  } catch {
    report(status, 'The admin service is unavailable or access could not be verified. Please try again.', true);
  }
}
function nullNode() { return document.createDocumentFragment(); }
start();
