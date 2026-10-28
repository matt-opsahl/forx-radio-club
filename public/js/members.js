import {
  html, api, state, refreshSession, go, notice, formData, fmtDate, fmtDateTime, DAYS, KIND_LABEL, fmt12,
} from './app.js';
import { eventItem, bindRsvp, fmtOffset } from './pages.js';

const LICENSES = ['Technician', 'General', 'Advanced', 'Amateur Extra', 'Not yet licensed'];
const isOfficer = () => ['officer', 'admin'].includes(state.user?.role);

// ---------- login / join ----------

function loginView(view) {
  view.innerHTML = html`
    <section class="wrap page-head" style="max-width:520px">
      <div class="eyebrow">Members</div>
      <h1>Member login</h1>
      <form class="card" id="login">
        <div id="login-msg"></div>
        <div class="field"><label for="l-call">Call sign</label><input id="l-call" name="callsign" required autocomplete="username" autocapitalize="characters" spellcheck="false"></div>
        <div class="field"><label for="l-pw">Password</label><input id="l-pw" name="password" type="password" required autocomplete="current-password"></div>
        <button class="btn btn-primary" style="width:100%">Log in</button>
        <p class="muted" style="margin:14px 0 0;text-align:center">Not a member yet? <a href="#/join">Create an account</a></p>
      </form>
    </section>`.s;
  const form = view.querySelector('#login');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/api/login', { method: 'POST', body: formData(form) });
      await refreshSession();
      membersPage(view);
    } catch (err) { notice(view.querySelector('#login-msg'), err.message); }
  });
}

export async function joinPage(view) {
  view.innerHTML = html`
    <section class="wrap page-head" style="max-width:640px">
      <div class="eyebrow">Join FORX</div>
      <h1>Create a member account</h1>
      <p>Sign up with your call sign. An officer approves new accounts, usually within a day or two.</p>
      <form class="card" id="join">
        <div id="join-msg"></div>
        <div class="form-grid">
          <div class="field">
            <label for="j-call">Call sign</label>
            <input id="j-call" name="callsign" required maxlength="10" autocapitalize="characters" spellcheck="false" autocomplete="username">
            <small id="j-lookup"></small>
          </div>
          <div class="field"><label for="j-name">Name</label><input id="j-name" name="name" required maxlength="100" autocomplete="name"></div>
          <div class="field"><label for="j-email">Email</label><input id="j-email" name="email" type="email" required maxlength="200" autocomplete="email"></div>
          <div class="field"><label for="j-lic">License class</label>
            <select id="j-lic" name="license_class"><option value="">—</option>${LICENSES.map(l => html`<option>${l}</option>`)}</select></div>
        </div>
        <div class="field"><label for="j-pw">Password <small>(10+ characters)</small></label><input id="j-pw" name="password" type="password" required minlength="10" autocomplete="new-password"></div>
        <button class="btn btn-primary">Request membership</button>
      </form>
    </section>`.s;

  const form = view.querySelector('#join');
  const call = form.querySelector('[name=callsign]');
  const hint = view.querySelector('#j-lookup');
  call.addEventListener('change', async () => {
    const c = call.value.trim().toUpperCase();
    call.value = c;
    if (c.length < 3) return;
    hint.textContent = 'Checking the FCC database…';
    try {
      const r = await api(`/api/callsign/${encodeURIComponent(c)}`);
      if (r.valid) {
        hint.textContent = `✓ Found ${r.name || c}${r.license_class ? ' · ' + r.license_class : ''}${r.grid ? ' · ' + r.grid : ''}`;
        if (!form.name.value && r.name) form.name.value = r.name;
        if (r.license_class) form.license_class.value = r.license_class;
      } else hint.textContent = r.valid === false ? 'Not found in the FCC database — double-check it.' : '';
    } catch (err) { hint.textContent = err.message; }
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/api/join', { method: 'POST', body: formData(form) });
      form.innerHTML = html`<div class="notice ok">Thanks! Your account request was sent. You'll be able to log in once an officer approves it.</div>`.s;
    } catch (err) { notice(view.querySelector('#join-msg'), err.message); }
  });
}

// ---------- member area ----------

const TABS = [
  ['home', 'Dashboard'], ['profile', 'My profile'], ['roster', 'Roster'],
  ['events', 'Manage events', true], ['nets', 'Nets', true], ['repeaters', 'Repeaters', true],
  ['members', 'Members', true], ['messages', 'Messages', true],
];
let currentTab = 'home';

export async function membersPage(view) {
  if (!state.user) await refreshSession().catch(() => {});
  if (!state.user) return loginView(view);
  const tabs = TABS.filter(t => !t[2] || isOfficer());
  if (!tabs.some(t => t[0] === currentTab)) currentTab = 'home';

  view.innerHTML = html`
    <section class="wrap page-head">
      <div class="spread">
        <div>
          <div class="eyebrow">Members area</div>
          <h1>73, ${state.user.name.split(' ')[0]}!</h1>
        </div>
        <div class="row"><span class="pill pill-accent mono">${state.user.callsign}</span><span class="pill">${state.user.role}</span>
          <button class="btn btn-sm" id="logout">Log out</button></div>
      </div>
    </section>
    <section class="wrap">
      <div class="tabs" role="tablist">${tabs.map(([id, label]) => html`<button role="tab" data-tab="${id}" class="${id === currentTab ? 'active' : ''}">${label}</button>`)}</div>
      <div id="tab"></div>
    </section>`.s;

  view.querySelector('#logout').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST', body: {} });
    await refreshSession();
    go('/');
  });
  view.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { currentTab = b.dataset.tab; membersPage(view); }));

  const tab = view.querySelector('#tab');
  try { await TAB_VIEWS[currentTab](tab); }
  catch (err) { notice(tab, err.message); }
}

const TAB_VIEWS = {
  async home(el) {
    const [me, events] = await Promise.all([api('/api/me'), api('/api/events')]);
    el.innerHTML = html`
      <div class="grid grid-2" style="align-items:start">
        <div>
          <h2>Upcoming events</h2>
          <div class="stack">${events.length ? events.slice(0, 5).map(eventItem) : html`<div class="empty">Nothing scheduled.</div>`}</div>
        </div>
        <div class="stack">
          <h2>Practice exam history</h2>
          ${me.exams.length ? html`
            <div class="table-wrap"><table>
              <thead><tr><th>Date</th><th>Exam</th><th>Score</th></tr></thead>
              <tbody>${me.exams.map(x => html`<tr><td>${fmtDate(x.taken_at)}</td><td>${x.element}</td>
                <td class="num"><span class="pill ${x.score / x.total >= 0.74 ? 'pill-good' : 'pill-poor'}">${x.score}/${x.total}</span></td></tr>`)}</tbody>
            </table></div>` : html`<div class="empty">No practice exams yet. <a href="#/tools/exam">Take one →</a></div>`}
          <div class="card">
            <h3>Club links</h3>
            <div class="row"><a class="btn btn-sm" href="${state.club.discord}" target="_blank" rel="noopener">Discord</a>
            <a class="btn btn-sm" href="/api/repeaters.csv">Repeater CHIRP file</a>
            <a class="btn btn-sm" href="#/tools">Ham tools</a></div>
          </div>
        </div>
      </div>`.s;
    bindRsvp(el, () => TAB_VIEWS.home(el));
  },

  async profile(el) {
    const { user } = await api('/api/me');
    el.innerHTML = html`
      <div class="grid grid-2" style="align-items:start">
        <form class="card" id="profile">
          <h3>Profile</h3>
          <div id="p-msg"></div>
          <div class="form-grid">
            <div class="field"><label>Call sign</label><input value="${user.callsign}" disabled></div>
            <div class="field"><label for="p-name">Name</label><input id="p-name" name="name" value="${user.name}" required maxlength="100"></div>
            <div class="field"><label for="p-email">Email</label><input id="p-email" name="email" type="email" value="${user.email}" maxlength="200"></div>
            <div class="field"><label for="p-lic">License class</label>
              <select id="p-lic" name="license_class"><option value="">—</option>${LICENSES.map(l => html`<option ${l === user.license_class ? 'selected' : ''}>${l}</option>`)}</select></div>
          </div>
          <div class="field"><label for="p-bio">About you <small>(rigs, interests, favorite bands)</small></label><textarea id="p-bio" name="bio" maxlength="1000">${user.bio}</textarea></div>
          <div class="field"><label class="check"><input type="checkbox" name="show_in_roster" ${user.show_in_roster ? 'checked' : ''}>Show me in the member roster</label></div>
          <div class="field"><label class="check"><input type="checkbox" name="show_email" ${user.show_email ? 'checked' : ''}>Show my email to other members</label></div>
          <button class="btn btn-primary">Save profile</button>
        </form>
        <form class="card" id="pw">
          <h3>Change password</h3>
          <div id="pw-msg"></div>
          <input type="text" name="username" value="${user.callsign}" autocomplete="username" hidden>
          <div class="field"><label for="pw-cur">Current password</label><input id="pw-cur" name="current" type="password" required autocomplete="current-password"></div>
          <div class="field"><label for="pw-new">New password <small>(10+ characters)</small></label><input id="pw-new" name="next" type="password" required minlength="10" autocomplete="new-password"></div>
          <button class="btn">Update password</button>
        </form>
      </div>`.s;
    const p = el.querySelector('#profile');
    p.addEventListener('submit', async e => {
      e.preventDefault();
      try { await api('/api/me', { method: 'PUT', body: formData(p) }); await refreshSession(); notice(el.querySelector('#p-msg'), 'Profile saved.', 'ok'); }
      catch (err) { notice(el.querySelector('#p-msg'), err.message); }
    });
    const pw = el.querySelector('#pw');
    pw.addEventListener('submit', async e => {
      e.preventDefault();
      try { await api('/api/me/password', { method: 'POST', body: formData(pw) }); pw.reset(); notice(el.querySelector('#pw-msg'), 'Password updated.', 'ok'); }
      catch (err) { notice(el.querySelector('#pw-msg'), err.message); }
    });
  },

  async roster(el) {
    const rows = await api('/api/roster');
    el.innerHTML = html`
      <input type="search" id="r-q" placeholder="Search by call, name or interest…" style="margin-bottom:14px">
      <div class="grid grid-3" id="r-list">
        ${rows.map(r => html`
          <div class="card" data-search="${(r.callsign + ' ' + r.name + ' ' + r.bio + ' ' + r.license_class).toLowerCase()}">
            <div class="spread"><b class="mono" style="font-size:1.15rem;color:var(--amber)">${r.callsign}</b>
              ${r.role !== 'member' ? html`<span class="pill pill-accent">${r.role}</span>` : ''}</div>
            <div>${r.name}</div>
            <div class="muted" style="font-size:.9rem">${r.license_class || '—'}${r.email ? html` · <a href="mailto:${r.email}">${r.email}</a>` : ''}</div>
            ${r.bio ? html`<p style="margin:8px 0 0;font-size:.92rem">${r.bio}</p>` : ''}
          </div>`)}
      </div>`.s;
    el.querySelector('#r-q').addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      el.querySelectorAll('[data-search]').forEach(c => { c.hidden = !c.dataset.search.includes(q); });
    });
  },

  events: el => crudTab(el, {
    endpoint: 'events',
    list: async () => [...(await api('/api/events')), ...(await api('/api/events?past=1'))],
    columns: [
      ['When', e => fmtDateTime(e.starts_at)],
      ['Event', e => html`<b>${e.title}</b><div class="muted" style="font-size:.85rem">${KIND_LABEL[e.kind]}${e.members_only ? ' · members only' : ''}</div>`],
      ['RSVPs', e => html`<button type="button" class="btn btn-sm" data-rsvps="${e.id}">${e.going ?? 0} going</button>`],
    ],
    fields: [
      ['title', 'Title', 'text'],
      ['kind', 'Type', 'select', Object.entries(KIND_LABEL)],
      ['starts_at', 'Starts', 'datetime-local'],
      ['ends_at', 'Ends', 'datetime-local'],
      ['location', 'Location', 'text'],
      ['description', 'Description', 'textarea'],
      ['members_only', 'Members only', 'checkbox'],
      ['rsvp', 'Take RSVPs', 'checkbox', null, true],
    ],
    after(el) {
      el.querySelectorAll('[data-rsvps]').forEach(b => b.addEventListener('click', async () => {
        const rows = await api(`/api/admin/events/${b.dataset.rsvps}/rsvps`);
        alert(rows.length ? rows.map(r => `${r.callsign} (${r.name}) — ${r.status}${r.note ? ': ' + r.note : ''}`).join('\n') : 'No RSVPs yet.');
      }));
    },
  }),

  nets: el => crudTab(el, {
    endpoint: 'nets',
    list: () => api('/api/nets'),
    columns: [
      ['When', n => `${DAYS[n.day_of_week]} ${fmt12(n.time_local)}`],
      ['Net', n => html`<b>${n.name}</b>`],
      ['Frequency', n => html`<span class="freq">${n.frequency}</span> · ${n.mode}`],
    ],
    fields: [
      ['name', 'Name', 'text'],
      ['day_of_week', 'Day', 'select', DAYS.map((d, i) => [String(i), d])],
      ['time_local', 'Time (Central)', 'time'],
      ['duration_min', 'Length (minutes)', 'number', null, 60],
      ['frequency', 'Frequency', 'text'],
      ['mode', 'Mode', 'text', null, 'FM'],
      ['description', 'Description', 'textarea'],
      ['sort', 'Sort order', 'number', null, 0],
    ],
  }),

  repeaters: el => crudTab(el, {
    endpoint: 'repeaters',
    list: () => api('/api/repeaters'),
    columns: [
      ['Name', r => html`<b>${r.name}</b> <span class="muted">${r.callsign}</span>`],
      ['Output', r => html`<span class="freq mono">${r.output_mhz.toFixed(3)}</span> ${fmtOffset(r.offset_mhz)}`],
      ['Tone', r => (r.tone ? r.tone.toFixed(1) : '—')],
      ['Status', r => r.status],
    ],
    fields: [
      ['name', 'Name', 'text'],
      ['callsign', 'Call sign', 'text'],
      ['output_mhz', 'Output (MHz)', 'number'],
      ['offset_mhz', 'Offset (MHz, − for minus)', 'number', null, 0],
      ['tone', 'CTCSS tone (Hz)', 'number'],
      ['mode', 'Mode', 'text', null, 'FM'],
      ['location', 'Location', 'text'],
      ['status', 'Status', 'select', [['up', 'On the air'], ['testing', 'Testing'], ['down', 'Down']]],
      ['notes', 'Notes', 'textarea'],
      ['sort', 'Sort order', 'number', null, 0],
    ],
  }),

  async members(el) {
    const rows = await api('/api/admin/members');
    const admin = state.user.role === 'admin';
    el.innerHTML = html`
      <div id="m-msg"></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Call</th><th>Name</th><th>License</th><th>Joined</th><th>Status</th><th>Role</th></tr></thead>
        <tbody>${rows.map(m => html`
          <tr data-id="${m.id}">
            <td class="mono"><b>${m.callsign}</b></td>
            <td>${m.name}<div class="muted" style="font-size:.85rem">${m.email}</div></td>
            <td>${m.license_class || '—'}</td>
            <td class="num">${fmtDate(m.created_at, { year: 'numeric', month: 'short', day: 'numeric' })}</td>
            <td>${m.id === state.user.id ? m.status : html`
              <select data-field="status">${['pending', 'active', 'disabled'].map(s => html`<option ${s === m.status ? 'selected' : ''}>${s}</option>`)}</select>`}</td>
            <td>${m.id === state.user.id || !admin ? m.role : html`
              <select data-field="role">${['member', 'officer', 'admin'].map(s => html`<option ${s === m.role ? 'selected' : ''}>${s}</option>`)}</select>`}</td>
          </tr>`)}</tbody>
      </table></div>
      <p class="muted" style="font-size:.9rem;margin-top:10px">Set a new member to <b>active</b> to approve them. ${admin ? '' : 'Only admins can change roles.'}</p>`.s;
    el.querySelectorAll('select[data-field]').forEach(sel => sel.addEventListener('change', async () => {
      const tr = sel.closest('tr');
      const body = Object.fromEntries([...tr.querySelectorAll('select[data-field]')].map(s => [s.dataset.field, s.value]));
      try { await api(`/api/admin/members/${tr.dataset.id}`, { method: 'PUT', body }); notice(el.querySelector('#m-msg'), 'Saved.', 'ok'); }
      catch (err) { notice(el.querySelector('#m-msg'), err.message); TAB_VIEWS.members(el); }
    }));
  },

  async messages(el) {
    const rows = await api('/api/admin/messages');
    el.innerHTML = rows.length ? html`<div class="stack">${rows.map(m => html`
      <div class="card" style="${m.handled ? 'opacity:.6' : ''}">
        <div class="spread"><div><b>${m.name}</b> · <a href="mailto:${m.email}">${m.email}</a></div>
          <span class="muted" style="font-size:.85rem">${fmtDateTime(m.created_at)}</span></div>
        <p style="margin:8px 0;white-space:pre-wrap">${m.body}</p>
        <button class="btn btn-sm" data-msg="${m.id}" data-handled="${m.handled ? 0 : 1}">${m.handled ? 'Mark as new' : 'Mark handled'}</button>
      </div>`)}</div>`.s : '<div class="empty">No messages from the contact form yet.</div>';
    el.querySelectorAll('[data-msg]').forEach(b => b.addEventListener('click', async () => {
      await api(`/api/admin/messages/${b.dataset.msg}`, { method: 'PUT', body: { handled: b.dataset.handled === '1' } });
      TAB_VIEWS.messages(el);
    }));
  },
};

// ---------- generic officer editor ----------

const toLocalInput = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function fieldHtml([name, label, type, options, dflt], item) {
  let v = item ? item[name] : dflt;
  if (type === 'datetime-local') v = toLocalInput(v);
  const id = `f-${name}`;
  if (type === 'checkbox') return html`<div class="field"><label class="check"><input type="checkbox" name="${name}" ${v ? 'checked' : ''}>${label}</label></div>`;
  if (type === 'textarea') return html`<div class="field" style="grid-column:1/-1"><label for="${id}">${label}</label><textarea id="${id}" name="${name}">${v ?? ''}</textarea></div>`;
  if (type === 'select') return html`<div class="field"><label for="${id}">${label}</label><select id="${id}" name="${name}">${options.map(([val, text]) => html`<option value="${val}" ${String(v) === val ? 'selected' : ''}>${text}</option>`)}</select></div>`;
  return html`<div class="field"><label for="${id}">${label}</label><input id="${id}" name="${name}" type="${type}" value="${v ?? ''}" ${type === 'number' ? html`step="any"` : ''}></div>`;
}

async function crudTab(el, cfg) {
  const items = await cfg.list();
  const render = (editing) => {
    el.innerHTML = html`
      <div class="grid grid-2" style="align-items:start">
        <div>
          <div class="spread" style="margin-bottom:10px"><h2 style="margin:0">${items.length} ${cfg.endpoint}</h2>
            <button class="btn btn-sm btn-primary" data-new>+ Add new</button></div>
          <div class="table-wrap"><table>
            <thead><tr>${cfg.columns.map(c => html`<th>${c[0]}</th>`)}<th></th></tr></thead>
            <tbody>${items.map(it => html`<tr>${cfg.columns.map(c => html`<td>${c[1](it)}</td>`)}
              <td><button class="btn btn-sm" data-edit="${it.id}">Edit</button></td></tr>`)}</tbody>
          </table></div>
        </div>
        <form class="card" id="crud-form">
          <h3>${editing ? 'Edit' : 'Add'} ${cfg.endpoint.replace(/s$/, '')}</h3>
          <div id="crud-msg"></div>
          <div class="form-grid">${cfg.fields.map(f => fieldHtml(f, editing))}</div>
          <div class="row">
            <button class="btn btn-primary">${editing ? 'Save changes' : 'Add'}</button>
            ${editing ? html`<button type="button" class="btn" data-cancel>Cancel</button>
                             <button type="button" class="btn btn-danger" data-delete>Delete</button>` : ''}
          </div>
        </form>
      </div>`.s;

    el.querySelector('[data-new]').addEventListener('click', () => render(null));
    el.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () =>
      render(items.find(i => String(i.id) === b.dataset.edit))));
    el.querySelector('[data-cancel]')?.addEventListener('click', () => render(null));
    el.querySelector('[data-delete]')?.addEventListener('click', async () => {
      if (!confirm('Delete this permanently?')) return;
      await api(`/api/admin/${cfg.endpoint}/${editing.id}`, { method: 'DELETE' });
      crudTab(el, cfg);
    });
    const form = el.querySelector('#crud-form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const body = formData(form);
      for (const [name, , type] of cfg.fields) {
        if (type === 'datetime-local' && body[name]) body[name] = new Date(body[name]).toISOString();
      }
      try {
        await api(`/api/admin/${cfg.endpoint}${editing ? '/' + editing.id : ''}`, { method: editing ? 'PUT' : 'POST', body });
        crudTab(el, cfg);
      } catch (err) { notice(el.querySelector('#crud-msg'), err.message); }
    });
    cfg.after?.(el);
  };
  render(null);
}
