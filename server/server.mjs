import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, seed } from './db.mjs';
import { club } from './club.mjs';
import { nextOccurrence } from './time.mjs';
import { bandConditions } from './band.mjs';
import {
  hashPassword, verifyPassword, newToken, hashToken, parseCookies,
  sessionCookie, rateLimited, SESSION_COOKIE, SESSION_DAYS,
} from './auth.mjs';

const PORT = Number(process.env.PORT || 8795);
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

seed();

// ---------- helpers ----------

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

async function readBody(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) fail(415, 'Expected JSON');
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 100_000) fail(413, 'Request too large');
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { fail(400, 'Invalid JSON'); }
}

const clientIp = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

function str(v, max, { required = false, label = 'Field' } = {}) {
  const s = String(v ?? '').trim();
  if (required && !s) fail(400, `${label} is required`);
  if (s.length > max) fail(400, `${label} is too long`);
  return s;
}
const CALL_RE = /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{0,4}[A-Z]$/;
function callsign(v) {
  const c = str(v, 10, { required: true, label: 'Call sign' }).toUpperCase();
  if (!CALL_RE.test(c)) fail(400, 'That does not look like a valid call sign');
  return c;
}
function password(v) {
  const p = String(v ?? '');
  if (p.length < 10) fail(400, 'Password must be at least 10 characters');
  if (p.length > 200) fail(400, 'Password is too long');
  return p;
}
const LICENSE = ['', 'Technician', 'General', 'Advanced', 'Amateur Extra', 'Not yet licensed'];
const ROLE_RANK = { member: 1, officer: 2, admin: 3 };

function currentUser(req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                          WHERE s.token_hash = ? AND s.expires_at > ?`).get(hashToken(token), new Date().toISOString());
  return row && row.status === 'active' ? row : null;
}

const publicUser = u => u && ({
  id: u.id, callsign: u.callsign, name: u.name, email: u.email, role: u.role,
  license_class: u.license_class, bio: u.bio,
  show_in_roster: !!u.show_in_roster, show_email: !!u.show_email,
});

// ---------- routes ----------

const routes = [];
const route = (method, pattern, role, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, role, handler });
};

// Public site data
route('GET', '/api/site', null, ({ user }) => ({ club, user: publicUser(user) }));

route('GET', '/api/nets', null, () => {
  const now = new Date();
  return db.prepare('SELECT * FROM nets ORDER BY sort, id').all().map(n => {
    const next = nextOccurrence(n.day_of_week, n.time_local, n.duration_min, now);
    return { ...n, next_start: next?.start.toISOString(), next_end: next?.end.toISOString(), on_air: !!next?.onAir };
  }).sort((a, b) => (a.next_start || '').localeCompare(b.next_start || ''));
});

route('GET', '/api/repeaters', null, () => db.prepare('SELECT * FROM repeaters ORDER BY sort, output_mhz').all());

route('GET', '/api/repeaters.csv', null, ({ res }) => {
  const rows = db.prepare('SELECT * FROM repeaters ORDER BY sort, output_mhz').all();
  const header = 'Location,Name,Frequency,Duplex,Offset,Tone,rToneFreq,cToneFreq,DtcsCode,DtcsPolarity,Mode,TStep,Skip,Comment,URCALL,RPT1CALL,RPT2CALL,DVCODE';
  const q = s => `"${String(s).replace(/"/g, '""')}"`;
  const lines = rows.map((r, i) => [
    i, q(r.name.slice(0, 16)), r.output_mhz.toFixed(6),
    r.offset_mhz > 0 ? '+' : r.offset_mhz < 0 ? '-' : '', Math.abs(r.offset_mhz).toFixed(6),
    r.tone ? 'Tone' : '', (r.tone || 88.5).toFixed(1), (r.tone || 88.5).toFixed(1), '023', 'NN',
    r.mode === 'FM' ? 'FM' : r.mode, '5.00', '', q(`${r.callsign} ${r.location}`.trim()), '', '', '', '',
  ].join(','));
  send(res, 200, [header, ...lines].join('\r\n') + '\r\n', {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${club.callsign}-repeaters-chirp.csv"`,
  });
});

route('GET', '/api/events', null, ({ user, url }) => {
  const past = url.searchParams.get('past') === '1';
  const now = new Date().toISOString();
  const rows = db.prepare(`
    SELECT e.*, (SELECT COUNT(*) FROM rsvps r WHERE r.event_id = e.id AND r.status='going') AS going,
           (SELECT status FROM rsvps r WHERE r.event_id = e.id AND r.user_id = ?) AS my_rsvp
    FROM events e
    WHERE ${past ? 'COALESCE(e.ends_at, e.starts_at) < ?' : 'COALESCE(e.ends_at, e.starts_at) >= ?'}
      AND (e.members_only = 0 OR ?)
    ORDER BY e.starts_at ${past ? 'DESC LIMIT 30' : 'ASC'}`).all(user?.id ?? 0, now, user ? 1 : 0);
  return rows.map(e => user ? e : { ...e, going: undefined, my_rsvp: undefined });
});

route('GET', '/api/band', null, async () => (await bandConditions()) ?? fail(503, 'Band data unavailable right now'));

route('POST', '/api/contact', null, async ({ req, body }) => {
  if (body.website) return { ok: true }; // honeypot
  if (rateLimited(`contact:${clientIp(req)}`, 5, 3600_000)) fail(429, 'Too many messages — try again later');
  const name = str(body.name, 100, { required: true, label: 'Name' });
  const email = str(body.email, 200, { required: true, label: 'Email' });
  if (!/^\S+@\S+\.\S+$/.test(email)) fail(400, 'Please enter a valid email');
  const msg = str(body.message, 4000, { required: true, label: 'Message' });
  db.prepare('INSERT INTO messages (name, email, body) VALUES (?,?,?)').run(name, email, msg);
  return { ok: true };
});

// Look up a call sign in the FCC database (via callook.info) to prefill sign-up.
route('GET', '/api/callsign/:call', null, async ({ req, params }) => {
  if (rateLimited(`call:${clientIp(req)}`, 30, 600_000)) fail(429, 'Too many lookups');
  const call = callsign(params.call);
  try {
    const r = await fetch(`https://callook.info/${call}/json`, { signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    if (j.status !== 'VALID') return { valid: false };
    const cls = { TECHNICIAN: 'Technician', GENERAL: 'General', ADVANCED: 'Advanced', EXTRA: 'Amateur Extra' }[j.current?.operClass] || '';
    const name = String(j.name || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    return { valid: true, name, license_class: cls, grid: j.location?.gridsquare || '' };
  } catch {
    return { valid: null };
  }
});

// Auth
route('POST', '/api/login', null, ({ req, res, body }) => {
  const call = str(body.callsign, 10).toUpperCase();
  if (rateLimited(`login:${clientIp(req)}`, 20, 900_000) || rateLimited(`login:${call}`, 8, 900_000))
    fail(429, 'Too many attempts — wait 15 minutes');
  const u = db.prepare('SELECT * FROM users WHERE callsign = ?').get(call);
  if (!u || !verifyPassword(String(body.password ?? ''), u.password_hash)) fail(401, 'Call sign or password is incorrect');
  if (u.status === 'pending') fail(403, 'Your account is waiting for an officer to approve it');
  if (u.status !== 'active') fail(403, 'This account is disabled');
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(hashToken(token), u.id, expires);
  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(new Date().toISOString(), u.id);
  res.setHeader('Set-Cookie', sessionCookie(req, token, SESSION_DAYS * 86400));
  return { user: publicUser(u) };
});

route('POST', '/api/logout', null, ({ req, res }) => {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
  return { ok: true };
});

route('POST', '/api/join', null, ({ req, body }) => {
  if (rateLimited(`join:${clientIp(req)}`, 5, 3600_000)) fail(429, 'Too many sign-ups from here — try later');
  const call = callsign(body.callsign);
  const name = str(body.name, 100, { required: true, label: 'Name' });
  const email = str(body.email, 200, { required: true, label: 'Email' });
  if (!/^\S+@\S+\.\S+$/.test(email)) fail(400, 'Please enter a valid email');
  const lic = LICENSE.includes(body.license_class) ? body.license_class : '';
  const pw = password(body.password);
  if (db.prepare('SELECT 1 FROM users WHERE callsign = ?').get(call)) fail(409, 'That call sign already has an account');
  db.prepare(`INSERT INTO users (callsign, name, email, password_hash, license_class) VALUES (?,?,?,?,?)`)
    .run(call, name, email, hashPassword(pw), lic);
  return { ok: true };
});

// Member area
route('GET', '/api/me', 'member', ({ user }) => {
  const exams = db.prepare('SELECT element, score, total, taken_at FROM exam_attempts WHERE user_id = ? ORDER BY taken_at DESC LIMIT 20').all(user.id);
  return { user: publicUser(user), exams };
});

route('PUT', '/api/me', 'member', ({ user, body }) => {
  const name = str(body.name, 100, { required: true, label: 'Name' });
  const email = str(body.email, 200, { label: 'Email' });
  const lic = LICENSE.includes(body.license_class) ? body.license_class : user.license_class;
  const bio = str(body.bio, 1000, { label: 'About you' });
  db.prepare(`UPDATE users SET name=?, email=?, license_class=?, bio=?, show_in_roster=?, show_email=? WHERE id=?`)
    .run(name, email, lic, bio, body.show_in_roster ? 1 : 0, body.show_email ? 1 : 0, user.id);
  return { ok: true };
});

route('POST', '/api/me/password', 'member', ({ user, body }) => {
  if (!verifyPassword(String(body.current ?? ''), user.password_hash)) fail(400, 'Current password is incorrect');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password(body.next)), user.id);
  return { ok: true };
});

route('GET', '/api/roster', 'member', () => db.prepare(`
  SELECT callsign, name, license_class, bio, role, CASE WHEN show_email THEN email ELSE '' END AS email
  FROM users WHERE status = 'active' AND show_in_roster = 1 ORDER BY callsign`).all());

route('PUT', '/api/events/:id/rsvp', 'member', ({ user, params, body }) => {
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(Number(params.id)) ?? fail(404, 'Event not found');
  if (!ev.rsvp) fail(400, 'This event does not take RSVPs');
  if (body.status === 'none') {
    db.prepare('DELETE FROM rsvps WHERE event_id = ? AND user_id = ?').run(ev.id, user.id);
  } else {
    if (!['going', 'maybe'].includes(body.status)) fail(400, 'Invalid RSVP');
    db.prepare(`INSERT INTO rsvps (event_id, user_id, status, note) VALUES (?,?,?,?)
                ON CONFLICT (event_id, user_id) DO UPDATE SET status = excluded.status, note = excluded.note`)
      .run(ev.id, user.id, body.status, str(body.note, 200));
  }
  return { ok: true };
});

route('POST', '/api/exam-attempts', 'member', ({ user, body }) => {
  const total = Number(body.total), score = Number(body.score);
  if (!Number.isInteger(total) || !Number.isInteger(score) || total < 1 || total > 100 || score < 0 || score > total) fail(400, 'Invalid score');
  db.prepare('INSERT INTO exam_attempts (user_id, element, score, total) VALUES (?,?,?,?)').run(user.id, str(body.element, 20), score, total);
  return { ok: true };
});

// Officer tools: generic CRUD for club content
const crud = {
  events: {
    fields: {
      title: v => str(v, 120, { required: true, label: 'Title' }),
      kind: v => ['meeting', 'operating', 'social', 'exam', 'service', 'hamfest'].includes(v) ? v : 'meeting',
      starts_at: v => { const d = new Date(v); if (isNaN(d)) fail(400, 'Start time is required'); return d.toISOString(); },
      ends_at: v => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d.toISOString(); },
      location: v => str(v, 200),
      description: v => str(v, 4000),
      members_only: v => (v ? 1 : 0),
      rsvp: v => (v ? 1 : 0),
    },
  },
  nets: {
    fields: {
      name: v => str(v, 120, { required: true, label: 'Name' }),
      day_of_week: v => { const n = Number(v); if (!(n >= 0 && n <= 6)) fail(400, 'Pick a day'); return n; },
      time_local: v => { if (!/^\d{2}:\d{2}$/.test(v)) fail(400, 'Time must be HH:MM'); return v; },
      duration_min: v => Math.min(600, Math.max(5, Number(v) || 60)),
      frequency: v => str(v, 120),
      mode: v => str(v, 20) || 'FM',
      description: v => str(v, 2000),
      sort: v => Number(v) || 0,
    },
  },
  repeaters: {
    fields: {
      name: v => str(v, 60, { required: true, label: 'Name' }),
      callsign: v => str(v, 10).toUpperCase(),
      output_mhz: v => { const n = Number(v); if (!(n > 1 && n < 3000)) fail(400, 'Output frequency (MHz) is required'); return n; },
      offset_mhz: v => Number(v) || 0,
      tone: v => (v === '' || v == null ? null : Number(v) || null),
      mode: v => str(v, 20) || 'FM',
      location: v => str(v, 100),
      notes: v => str(v, 1000),
      status: v => (['up', 'down', 'testing'].includes(v) ? v : 'up'),
      sort: v => Number(v) || 0,
    },
  },
};

for (const [table, { fields }] of Object.entries(crud)) {
  const cols = Object.keys(fields);
  const clean = body => cols.map(c => fields[c](body[c]));
  route('POST', `/api/admin/${table}`, 'officer', ({ body }) => {
    const info = db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...clean(body));
    return { id: info.lastInsertRowid };
  });
  route('PUT', `/api/admin/${table}/:id`, 'officer', ({ body, params }) => {
    const info = db.prepare(`UPDATE ${table} SET ${cols.map(c => `${c}=?`).join(',')} WHERE id = ?`).run(...clean(body), Number(params.id));
    if (!info.changes) fail(404, 'Not found');
    return { ok: true };
  });
  route('DELETE', `/api/admin/${table}/:id`, 'officer', ({ params }) => {
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(Number(params.id));
    return { ok: true };
  });
}

route('GET', '/api/admin/events/:id/rsvps', 'officer', ({ params }) => db.prepare(`
  SELECT u.callsign, u.name, r.status, r.note FROM rsvps r JOIN users u ON u.id = r.user_id
  WHERE r.event_id = ? ORDER BY r.status, u.callsign`).all(Number(params.id)));

route('GET', '/api/admin/messages', 'officer', () => db.prepare('SELECT * FROM messages ORDER BY handled, created_at DESC LIMIT 200').all());
route('PUT', '/api/admin/messages/:id', 'officer', ({ params, body }) => {
  db.prepare('UPDATE messages SET handled = ? WHERE id = ?').run(body.handled ? 1 : 0, Number(params.id));
  return { ok: true };
});

route('GET', '/api/admin/members', 'officer', () => db.prepare(`
  SELECT id, callsign, name, email, role, status, license_class, created_at, last_login
  FROM users ORDER BY status = 'pending' DESC, callsign`).all());

route('PUT', '/api/admin/members/:id', 'officer', ({ user, params, body }) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(params.id)) ?? fail(404, 'Member not found');
  if (target.id === user.id) fail(400, 'You cannot change your own role or status');
  if (ROLE_RANK[target.role] >= ROLE_RANK[user.role] && user.role !== 'admin') fail(403, 'Only an admin can change another officer');
  const status = ['pending', 'active', 'disabled'].includes(body.status) ? body.status : target.status;
  let role = target.role;
  if (body.role && body.role !== target.role) {
    if (user.role !== 'admin') fail(403, 'Only an admin can change roles');
    if (!ROLE_RANK[body.role]) fail(400, 'Invalid role');
    role = body.role;
  }
  db.prepare('UPDATE users SET status = ?, role = ? WHERE id = ?').run(status, role, target.id);
  if (status !== 'active') db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
  return { ok: true };
});

// ---------- static files ----------

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

async function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(publicDir, decodeURIComponent(pathname)));
  if (!file.startsWith(publicDir)) return send(res, 403, 'Forbidden');
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
  } catch {
    file = path.join(publicDir, 'index.html'); // unknown path -> app shell
  }
  try {
    const data = await readFile(file);
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    send(res, 404, 'Not found');
  }
}

// ---------- server ----------

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  const url = new URL(req.url, 'http://localhost');
  try {
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      return await serveStatic(req, res, url.pathname);
    }
    const match = routes.find(r => r.method === req.method && r.re.test(url.pathname));
    if (!match) return send(res, 404, { error: 'Not found' });
    const m = url.pathname.match(match.re);
    const params = Object.fromEntries(match.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const user = currentUser(req);
    if (match.role) {
      if (!user) fail(401, 'Please log in');
      if (ROLE_RANK[user.role] < ROLE_RANK[match.role]) fail(403, 'Officers only');
    }
    const body = ['POST', 'PUT'].includes(req.method) ? await readBody(req) : {};
    const result = await match.handler({ req, res, url, params, user, body });
    if (!res.headersSent) send(res, 200, result ?? { ok: true });
  } catch (err) {
    if (err instanceof HttpError) return send(res, err.status, { error: err.message });
    console.error(err);
    if (!res.headersSent) send(res, 500, { error: 'Server error' });
  }
});

db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
server.listen(PORT, () => console.log(`${club.name} site on http://localhost:${PORT}`));
