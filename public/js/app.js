import { homePage, aboutPage, licensePage, eventsPage, netsPage, hamfestPage } from './pages.js';
import { toolsPage, examPage } from './tools.js';
import { membersPage, joinPage } from './members.js';

// ---------- tiny HTML templating (escapes everything except raw()) ----------

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = s => new Raw(s);
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = v =>
  v == null || v === false ? '' :
  v instanceof Raw ? v.s :
  Array.isArray(v) ? v.map(escape).join('') :
  String(v).replace(/[&<>"']/g, c => ESC[c]);
export const html = (strings, ...vals) =>
  raw(strings.reduce((out, s, i) => out + s + (i < vals.length ? escape(vals[i]) : ''), ''));

// ---------- API ----------

export async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (r.headers.get('content-type') || '').includes('json') ? await r.json() : null;
  if (!r.ok) throw new Error(data?.error || `Request failed (${r.status})`);
  return data;
}

export const state = { club: null, user: null };

export async function refreshSession() {
  const s = await api('/api/site');
  state.club = s.club;
  state.user = s.user;
  const link = document.getElementById('nav-members');
  link.textContent = state.user ? `${state.user.callsign} · Members` : 'Member Login';
}

// ---------- formatting ----------

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const fmtDate = (iso, opts = { weekday: 'short', month: 'short', day: 'numeric' }) =>
  new Date(iso).toLocaleDateString(undefined, opts);
export const fmtTime = iso => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export const fmtDateTime = iso => `${fmtDate(iso)} · ${fmtTime(iso)}`;
export const fmt12 = hhmm => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

export function countdownParts(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60 };
}
export function countdownHtml(ms) {
  const { d, h, m, s } = countdownParts(ms);
  const pad = n => String(n).padStart(2, '0');
  return html`${d ? html`${d}<small>d</small>` : ''}${pad(h)}<small>h</small>${pad(m)}<small>m</small>${pad(s)}<small>s</small>`;
}

export const KIND_LABEL = {
  meeting: 'Meeting', operating: 'Operating', social: 'Social', exam: 'License exam', service: 'Public service', hamfest: 'Hamfest',
};

export function notice(el, msg, kind = 'err') {
  el.innerHTML = msg ? html`<div class="notice ${kind}">${msg}</div>`.s : '';
}

// Reads a <form> into a plain object; checkboxes become booleans.
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    out[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return out;
}

// ---------- router ----------

const routes = {
  '/': homePage,
  '/about': aboutPage,
  '/license': licensePage,
  '/events': eventsPage,
  '/nets': netsPage,
  '/tools': toolsPage,
  '/tools/exam': examPage,
  '/hamfest': hamfestPage,
  '/members': membersPage,
  '/join': joinPage,
};

let cleanups = [];
export const onLeave = fn => cleanups.push(fn);

export function go(path) { location.hash = '#' + path; }

async function render() {
  cleanups.forEach(fn => fn());
  cleanups = [];
  const [path, anchor] = (location.hash.slice(1) || '/').split('#');
  const page = routes[path] || routes['/'];
  const view = document.getElementById('view');

  document.querySelectorAll('.nav a').forEach(a => {
    const href = a.getAttribute('href').slice(1);
    a.classList.toggle('active', href !== '/' && (path === href || path.startsWith(href + '/')));
  });
  document.getElementById('nav').classList.remove('open');
  document.querySelector('.nav-toggle').setAttribute('aria-expanded', 'false');

  view.innerHTML = '<div class="wrap loading">Loading…</div>';
  try {
    await page(view);
  } catch (err) {
    console.error(err);
    view.innerHTML = html`<div class="wrap section"><div class="notice err">${err.message}</div></div>`.s;
  }
  if (anchor) document.getElementById(anchor)?.scrollIntoView();
  else window.scrollTo(0, 0);
}

document.querySelector('.nav-toggle').addEventListener('click', e => {
  const nav = document.getElementById('nav');
  const open = nav.classList.toggle('open');
  e.currentTarget.setAttribute('aria-expanded', String(open));
});

window.addEventListener('hashchange', render);
refreshSession().catch(() => {}).finally(render);
