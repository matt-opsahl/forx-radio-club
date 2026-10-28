import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth.mjs';
import { daysFromNow } from './time.mjs';
import { club } from './club.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.DATA_DIR || path.join(root, 'data');
mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'forx.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  callsign TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','officer','admin')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','disabled')),
  license_class TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  show_in_roster INTEGER NOT NULL DEFAULT 1,
  show_email INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_login TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'meeting',
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  location TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  members_only INTEGER NOT NULL DEFAULT 0,
  rsvp INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS rsvps (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('going','maybe')),
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (event_id, user_id)
);
CREATE TABLE IF NOT EXISTS nets (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  time_local TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 60,
  frequency TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'FM',
  description TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS repeaters (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  callsign TEXT NOT NULL DEFAULT '',
  output_mhz REAL NOT NULL,
  offset_mhz REAL NOT NULL DEFAULT 0,
  tone REAL,
  mode TEXT NOT NULL DEFAULT 'FM',
  location TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'up' CHECK (status IN ('up','down','testing')),
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  handled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS exam_attempts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  element TEXT NOT NULL,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  taken_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`);

// First run: create the admin account and some sample content so the demo
// looks alive. Everything seeded here is editable from the Members area.
export function seed() {
  if (db.prepare('SELECT COUNT(*) n FROM users').get().n === 0) {
    const call = (process.env.ADMIN_CALLSIGN || club.callsign).toUpperCase();
    let pw = process.env.ADMIN_PASSWORD;
    if (!pw) {
      pw = randomBytes(9).toString('base64url');
      console.log(`[seed] Admin ${call} created with generated password: ${pw}  (change it after logging in)`);
    }
    db.prepare(`INSERT INTO users (callsign, name, password_hash, role, status)
                VALUES (?, ?, ?, 'admin', 'active')`).run(call, process.env.ADMIN_NAME || 'Club Admin', hashPassword(pw));
  }

  if (db.prepare('SELECT COUNT(*) n FROM nets').get().n === 0) {
    const ins = db.prepare(`INSERT INTO nets (name, day_of_week, time_local, duration_min, frequency, mode, description, sort)
                            VALUES (?,?,?,?,?,?,?,?)`);
    ins.run('FORX Weekly Net', 2, '20:00', 45, '146.940 MHz (−) PL 123.0', 'FM', 'General check-in net. Visitors and new hams welcome. (Sample — replace with the real net.)', 1);
    ins.run('Red River Valley ARES Net', 0, '20:30', 30, '444.700 MHz (+) PL 123.0', 'FM', 'Emergency-communications practice net. (Sample.)', 2);
    ins.run('Sunday 10m Roundtable', 0, '14:00', 60, '28.400 MHz', 'USB', 'Casual HF ragchew for Technicians and up. (Sample.)', 3);
  }

  if (db.prepare('SELECT COUNT(*) n FROM repeaters').get().n === 0) {
    const ins = db.prepare(`INSERT INTO repeaters (name, callsign, output_mhz, offset_mhz, tone, mode, location, notes, status, sort)
                            VALUES (?,?,?,?,?,?,?,?,?,?)`);
    ins.run('Grand Forks 2m', club.callsign, 146.940, -0.6, 123.0, 'FM', 'Grand Forks', 'Sample data — replace with the club’s real repeaters.', 'up', 1);
    ins.run('Grand Forks 70cm', club.callsign, 444.700, 5.0, 123.0, 'FM', 'Grand Forks', 'Sample data.', 'up', 2);
    ins.run('East Grand Forks 2m', club.callsign, 147.315, 0.6, 123.0, 'FM', 'East Grand Forks', 'Sample data.', 'testing', 3);
  }

  if (db.prepare('SELECT COUNT(*) n FROM events').get().n === 0) {
    const ins = db.prepare(`INSERT INTO events (title, kind, starts_at, ends_at, location, description, members_only)
                            VALUES (?,?,?,?,?,?,?)`);
    ins.run('Monthly Club Meeting', 'meeting', daysFromNow(6, '19:00'), daysFromNow(6, '20:30'), 'Grand Forks Public Library', 'Business meeting followed by a short presentation. Everyone welcome.', 0);
    ins.run('License Exam Session', 'exam', daysFromNow(13, '10:00'), daysFromNow(13, '12:00'), 'Grand Forks Public Library', 'Technician, General and Extra exams by ARRL VEs. Bring photo ID, your FRN, and the exam fee.', 0);
    ins.run('Winter Field Day Planning', 'operating', daysFromNow(20, '18:30'), daysFromNow(20, '20:00'), 'Discord voice', 'Plan stations, antennas and the operating schedule.', 1);
    ins.run('Breakfast Eyeball QSO', 'social', daysFromNow(9, '08:00'), daysFromNow(9, '09:30'), 'Local diner (TBA)', 'Coffee, breakfast and radio talk.', 0);
  }
}
