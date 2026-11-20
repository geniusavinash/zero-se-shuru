import { $, PANEL_CONFIG, STATUSES, actionStatus, authForm, button, card, corrected, corrections,
  h, input, keysOf, label, options, pager, pretty, report, result, rows, signOutBar, snapshot, tabs, taxonomy } from './common.js';

const host = $('panel');
const status = $('panel-status');

function preferences(title, list, selected) {
  const controls = list.map(item => {
    const box = input('checkbox', item.id);
    box.checked = selected.includes(item.id);
    return box;
  });
  return {
    node: h('fieldset', [h('legend', title), h('div', list.map((item, i) =>
      h('label', [controls[i], item.name], 'check')), 'preferences')]),
    read: () => controls.filter(item => item.checked).map(item => item.value)
  };
}

function profileEditor(client, user, profile, tax, hasMeta, onSave) {
  const name = input('text', profile.name ?? '');
  name.autocomplete = 'name';
  name.maxLength = 120;
  const college = input('text', profile.college ?? '');
  college.maxLength = 160;
  const year = input('number', profile.grad_year ?? '');
  year.min = '1900'; year.max = '2200'; year.step = '1';
  const roles = preferences('Preferred roles', tax.roles, profile.roles ?? []);
  const cities = preferences('Preferred cities', tax.cities, profile.cities ?? []);
  const submit = button('Save profile', 'submit', 'primary');
  const feedback = actionStatus();
  const form = h('form', [label('Name', name), label('College', college), label('Graduation year', year),
    hasMeta ? roles.node : null, hasMeta ? cities.node : h('p', 'Preferences are temporarily unavailable and will be kept unchanged.'),
    h('div', submit), feedback], 'surface stack');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const merged = (read, list, old = []) => [...new Set([...read(), ...old.filter(id => !list.some(item => item.id === id))])];
    const next = { user_id: user, name: name.value.trim(), college: college.value.trim(),
      grad_year: year.value ? Number(year.value) : null,
      ...(hasMeta ? { roles: merged(roles.read, tax.roles, profile.roles ?? []), cities: merged(cities.read, tax.cities, profile.cities ?? []) } : {}) };
    submit.disabled = true;
    report(feedback, 'Saving profile…');
    try {
      await result(client.from('profiles').upsert(next, { onConflict: 'user_id' }));
      Object.assign(profile, next);
      onSave();
      report(feedback, 'Profile saved.');
    } catch { report(feedback, 'Could not save your profile. Please try again.', true); }
    finally { submit.disabled = false; }
  });
  return form;
}

function passwordEditor(auth) {
  const password = input('password');
  const repeat = input('password');
  for (const field of [password, repeat]) {
    field.autocomplete = 'new-password';
    field.minLength = 8;
    field.required = true;
  }
  const submit = button('Change password', 'submit', 'primary');
  const feedback = actionStatus();
  const form = h('form', [label('New password', password), label('Repeat new password', repeat),
    h('div', submit), feedback], 'surface stack');
  form.noValidate = true;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    if (password.value.length < 8) {
      report(feedback, 'Enter a new password with at least 8 characters.', true);
      return;
    }
    if (password.value !== repeat.value) {
      report(feedback, 'The passwords do not match.', true);
      return;
    }
    submit.disabled = true;
    report(feedback, 'Changing password…');
    try {
      await auth.updatePassword(password.value);
      password.value = '';
      repeat.value = '';
      report(feedback, 'Password changed.');
    } catch (error) {
      report(feedback, error?.message || 'Could not change the password. Please try again.', true);
    } finally { submit.disabled = false; }
  });
  return form;
}

function savedEditor(client, user, row, job, tax, jobsAvailable) {
  const select = options(h('select'), STATUSES.map(id => [id, pretty(id)]), row.status);
  const note = h('textarea');
  note.value = row.note ?? '';
  note.rows = 3;
  const submit = button('Save changes', 'submit', 'primary');
  const feedback = actionStatus();
  const form = h('form', [label('Application status', select), label('Note', note), h('div', submit), feedback], 'surface stack');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const change = { user_id: user, job_key: row.job_key, status: select.value, note: note.value, updated_at: new Date().toISOString() };
    submit.disabled = true;
    report(feedback, 'Saving changes…');
    try {
      await result(client.from('saved_jobs').upsert(change, { onConflict: 'user_id,job_key' }));
      Object.assign(row, change);
      report(feedback, 'Changes saved.');
    } catch { report(feedback, 'Could not update this application. Please try again.', true); }
    finally { submit.disabled = false; }
  });
  return h('article', [job ? card(job, tax) : h('div', [h('h3', jobsAvailable ? 'No longer listed' : 'Listing unavailable'), h('p', row.job_key, 'muted')], 'card'), form], 'saved-item');
}

async function start() {
  const { jobs, meta } = await snapshot(message => report($('data-errors'), message, true));
  if (!PANEL_CONFIG || meta?.site?.panels === false) {
    report(status, 'Accounts are unavailable. You can still browse public jobs.');
    return;
  }
  try {
    const auth = await import('./supa.js');
    if (!auth.supa) throw new Error('No account service');
    const session = await auth.getSession();
    if (!session) {
      report(status, '');
      host.append(authForm(auth, true));
      return;
    }
    const client = auth.supa;
    const user = session.user.id;
    host.append(signOutBar(auth));
    const [profileLoad, savedLoad, liveLoad] = await Promise.allSettled([
      result(client.from('profiles').select('name,college,grad_year,roles,cities').eq('user_id', user).maybeSingle()),
      rows((a, b) => client.from('saved_jobs').select('job_key,status,note,updated_at').eq('user_id', user)
        .order('updated_at', { ascending: false }).order('job_key').range(a, b)),
      corrections(client)
    ]);
    report(status, '');
    const current = liveLoad.status === 'fulfilled' ? corrected(jobs ?? [], liveLoad.value) : jobs ?? [];
    const tax = taxonomy(meta, current);
    const byKey = new Map();
    for (const job of current) for (const key of keysOf(job)) byKey.set(key, job);
    for (const job of current) byKey.set(job.key, job);
    const profile = profileLoad.status === 'fulfilled' ? profileLoad.value ?? {} : {};
    const views = tabs(host, ['Profile', 'For you', 'Saved']);
    const [profileView, forYou, saved] = views.panels;
    const matchMessage = actionStatus();
    forYou.append(matchMessage);
    const renderForYou = pager(forYou, button('Show more'));
    const updateMatches = () => {
      const roles = profile.roles ?? [], cities = profile.cities ?? [];
      const matches = current.filter(job => (!roles.length || roles.includes(job.role)) &&
        (!cities.length || job.cities?.some(city => cities.includes(city))));
      report(matchMessage, !jobs ? 'Openings are unavailable.' : profileLoad.status !== 'fulfilled'
        ? 'Preferences could not be loaded. Showing all openings.' : !matches.length ? 'No openings match your preferences.'
          : `${matches.length} ${matches.length === 1 ? 'opening matches' : 'openings match'} your preferences.`);
      renderForYou(matches, job => card(job, tax));
    };
    if (profileLoad.status === 'fulfilled') profileView.append(profileEditor(client, user, profile, tax, !!meta, updateMatches));
    else profileView.append(h('p', 'Could not load your profile. Reload to try again.', 'error'));
    profileView.append(passwordEditor(auth));
    updateMatches();
    if (savedLoad.status !== 'fulfilled') saved.append(h('p', 'Could not load saved jobs. Reload to try again.', 'error'));
    else if (!savedLoad.value.length) saved.append(h('p', 'No saved jobs yet. Use the save button on the public list.'));
    else pager(saved, button('Show more'), 'stack')(savedLoad.value,
      row => savedEditor(client, user, row, byKey.get(row.job_key), tax, !!jobs));
    views.activate(0);
  } catch {
    report(status, 'The account service is unavailable. You can still browse public jobs.', true);
  }
}
start();
