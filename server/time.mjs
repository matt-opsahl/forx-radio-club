import { club } from './club.mjs';

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: club.tz, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function parts(date) {
  const p = Object.fromEntries(fmt.formatToParts(date).map(x => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

// Minutes the club time zone is ahead of UTC at this instant (negative for Central).
function offsetMin(date) {
  const p = parts(date);
  return (Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - date.getTime()) / 60000;
}

// Wall-clock time in the club time zone -> real instant.
export function zonedToUtc(y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off = offsetMin(new Date(guess));
  let t = guess - off * 60000;
  const off2 = offsetMin(new Date(t));
  if (off2 !== off) t = guess - off2 * 60000;
  return new Date(t);
}

// Next start/end of a weekly net (day 0=Sun, "HH:MM" club time). If the net is
// on the air right now, returns the current session.
export function nextOccurrence(dow, hhmm, durationMin, now = new Date()) {
  const [h, mi] = hhmm.split(':').map(Number);
  const today = parts(now);
  for (let i = -1; i < 8; i++) {
    const day = new Date(Date.UTC(today.y, today.mo - 1, today.d + i));
    if (day.getUTCDay() !== dow) continue;
    const start = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), h, mi);
    const end = new Date(start.getTime() + durationMin * 60000);
    if (end > now) return { start, end, onAir: start <= now };
  }
  return null;
}

// Days from now at a club-local time, used for demo seed data.
export function daysFromNow(days, hhmm) {
  const t = parts(new Date());
  const day = new Date(Date.UTC(t.y, t.mo - 1, t.d + days));
  const [h, mi] = hhmm.split(':').map(Number);
  return zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), h, mi).toISOString();
}
