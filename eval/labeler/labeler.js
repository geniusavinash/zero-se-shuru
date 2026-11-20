const $ = (id) => document.getElementById(id);
const form = $('form');
const radios = [...form.querySelectorAll('input[name="fresher"]')];
const drafts = new Map();
let rows = [];
let main = [];
let spares = [];
let current = null;
let busy = false;
let selected = new Set();
let cityOptions = [];
const cityNames = new Map();
const cityAliases = new Map();

function node(tag, text) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  return el;
}

const fold = (text) => text.trim().toLowerCase();
const dead = (row) => /\bdead\b/i.test(row.label_note); // Same marker as eval:labels.
const filled = (row) => Boolean(row.label_role) && ['yes', 'no', 'unsure'].includes(fold(row.label_fresher_india));
const done = (row) => dead(row) || filled(row);
const postLabel = (row) => `${row.n}. ${row.title || '(Untitled post)'}`;

async function request(url, options) {
  let response;
  let data;
  try {
    response = await fetch(url, options);
    data = await response.json();
  } catch {
    throw new Error('Could not reach the labeller. Check that the server is running and try again.');
  }
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status}).`);
  return data;
}

// A dead spare uses up a draw but does not fill a vacancy. Only the prefix
// of the spare draw that eval:labels would actually consume can finish it.
function replacement() {
  let remaining = main.filter(dead).length;
  for (const row of spares) {
    if (!remaining) break;
    if (dead(row)) continue;
    if (!filled(row)) return { next: row, remaining };
    remaining--;
  }
  return { next: null, remaining };
}

function renderProgress() {
  const labelled = main.filter(done).length;
  const deadCount = rows.filter(dead).length;
  const { next, remaining } = replacement();
  $('progress').textContent = `${labelled} of 50 labelled · ${deadCount} dead ${deadCount === 1 ? 'link' : 'links'} · ${remaining} ${remaining === 1 ? 'spare' : 'spares'} needed`;
  const hint = $('spare-hint');
  hint.textContent = next ? `Label the next spare: ${next.n}.` : remaining ? 'Label the next spare. No unused spares remain in this sheet.' : '';
  hint.hidden = !hint.textContent;
  $('complete').hidden = labelled !== 50 || remaining !== 0;
}

function renderLists() {
  for (const [id, list] of [['main-list', main], ['spare-list', spares]]) {
    $(id).replaceChildren(...list.map((row) => {
      const li = node('li');
      const button = node('button');
      const title = node('span', postLabel(row));
      const status = node('span', dead(row) ? 'Dead' : done(row) ? 'Done' : 'To do');
      title.className = 'short-title';
      status.className = 'row-status';
      button.type = 'button';
      button.disabled = busy;
      if (row === current) button.setAttribute('aria-current', 'true');
      button.append(title, status);
      button.addEventListener('click', () => open(row));
      li.append(button);
      return li;
    }));
  }
  if (current?.spare) $('spares').open = true;
  const active = document.querySelector('.post-list [aria-current="true"]');
  active?.scrollIntoView({ block: 'nearest' });
}

function renderCities() {
  const query = fold($('city-filter').value);
  for (const { id, search, label, checkbox } of cityOptions) {
    label.hidden = !search.some((part) => part.includes(query));
    checkbox.checked = selected.has(id);
  }
  const chips = $('chips');
  chips.replaceChildren(...[...selected].sort().map((id) => {
    const chip = node('li');
    const name = cityNames.get(id) ?? `${id} (not in list)`;
    const remove = node('button', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${name}`);
    remove.addEventListener('click', () => {
      selected.delete(id);
      renderCities();
      $('city-filter').focus();
    });
    chip.append(node('span', name), remove);
    return chip;
  }));
  chips.hidden = selected.size === 0;
}

function setupCities(cities) {
  cityOptions = cities.map(({ id, name, aliases }) => {
    cityNames.set(id, name);
    const search = [name, id, ...aliases].map(fold);
    for (const alias of search) cityAliases.set(alias, id);
    const label = node('label');
    label.className = 'choice city';
    const checkbox = node('input');
    checkbox.type = 'checkbox';
    checkbox.value = id;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selected.add(id);
      else selected.delete(id);
      renderCities();
    });
    label.append(checkbox, node('span', name), node('small', id));
    return { id, search, label, checkbox };
  });
  $('city-options').replaceChildren(...cityOptions.map(({ label }) => label));
}

function draft() {
  return {
    label_role: $('role').value,
    label_cities: [...selected],
    label_fresher_india: radios.find((radio) => radio.checked)?.value ?? '',
    label_note: $('note').value,
  };
}

function savedValues(row) {
  const ids = row.label_cities.split(/[;|/]/).map(fold).filter((id) => id && id !== 'none' && id !== 'remote');
  return {
    label_role: row.label_role.trim(),
    label_cities: ids.map((id) => cityAliases.get(id) ?? id),
    label_fresher_india: fold(row.label_fresher_india),
    label_note: row.label_note,
  };
}

function updateNavigation() {
  const i = rows.indexOf(current);
  $('previous').disabled = i <= 0;
  $('next').disabled = i < 0 || i === rows.length - 1;
}

function open(row, { keepDraft = true, message = '', focus = true } = {}) {
  if (!row || busy) return;
  if (current && keepDraft) drafts.set(current.key, draft());
  current = row;
  $('editor').hidden = false;
  $('post-title').textContent = row.title || '(Untitled post)';
  $('post-number').textContent = `Post ${row.n}${row.spare ? ' · Spare' : ''}`;
  $('company').textContent = row.company || 'Not stated';
  $('location').textContent = row.location_text || 'Not stated';
  $('source').textContent = row.source || 'Not stated';
  const url = row.link.trim();
  const https = url.startsWith('https://');
  const original = $('original');
  if (https) original.href = url;
  else original.removeAttribute('href');
  original.hidden = !https;
  $('not-https').hidden = https;

  const values = drafts.get(row.key) ?? savedValues(row);
  const role = $('role');
  role.value = values.label_role;
  if (role.selectedIndex < 0) role.value = '';
  selected = new Set(values.label_cities);
  $('city-filter').value = '';
  for (const radio of radios) radio.checked = radio.value === values.label_fresher_india;
  $('note').value = values.label_note;
  renderCities();
  renderLists();
  updateNavigation();
  $('status').textContent = message;
  if (focus) $('post-title').focus();
}

function step(delta) {
  if (current) open(rows[rows.indexOf(current) + delta]);
}

function setBusy(value) {
  busy = value;
  $('controls').disabled = value;
  for (const button of document.querySelectorAll('.post-list button')) button.disabled = value;
}

async function save(action) {
  if (!current || busy) return;
  const row = current;
  const values = draft();
  if (action === 'dead') values.label_note = 'dead';
  const status = $('status');
  status.textContent = 'Saving…';
  setBusy(true);
  let updated;
  try {
    ({ row: updated } = await request('/api/label', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: row.key, ...values }),
    }));
  } catch (error) {
    status.textContent = error.message;
    return;
  } finally {
    setBusy(false);
  }

  Object.assign(row, updated);
  drafts.delete(row.key);
  $('note').value = row.label_note;
  renderProgress();
  const nextSpare = replacement().next;
  const i = main.indexOf(row);
  const next = action === 'dead' ? nextSpare : action === 'advance' ? (i >= 0 ? main[i + 1] ?? nextSpare : nextSpare) : null;
  const message = action === 'dead' ? 'Marked dead. Label the next spare.' : 'Saved';
  if (next && next !== row) open(next, { keepDraft: false, message });
  else {
    renderLists();
    status.textContent = message;
  }
}

$('city-filter').addEventListener('input', renderCities);
$('clear-cities').addEventListener('click', () => { selected.clear(); renderCities(); });
$('previous').addEventListener('click', () => step(-1));
$('next').addEventListener('click', () => step(1));
$('save').addEventListener('click', () => void save('stay'));
$('dead').addEventListener('click', () => void save('dead'));
form.addEventListener('submit', (event) => { event.preventDefault(); void save('advance'); });
form.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && event.ctrlKey && !event.isComposing) {
    event.preventDefault();
    void save('advance');
  }
});

async function start() {
  try {
    const state = await request('/api/state');
    rows = state.rows;
    main = rows.filter((row) => !row.spare);
    spares = rows.filter((row) => row.spare);
    $('guideline').textContent = state.guideline;
    for (const { id, name } of state.roles) {
      const option = node('option', name);
      option.value = id;
      $('role').append(option);
    }
    setupCities(state.cities);
    renderProgress();
    $('workspace').hidden = false;
    const first = main.find((row) => !done(row)) ?? replacement().next ?? main[0] ?? rows[0];
    if (first) open(first, { focus: false });
    else $('progress').textContent = 'The label sheet contains no posts.';
  } catch (error) {
    $('progress').textContent = `Could not load the label sheet: ${error.message}`;
  }
}

void start();
