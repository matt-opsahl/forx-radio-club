// Club identity shown across the site. Edit here (or override with env vars).
export const club = {
  name: process.env.CLUB_NAME || 'FORX Amateur Radio Club',
  short: 'FORX ARC',
  callsign: process.env.CLUB_CALLSIGN || 'WA0JXT',
  city: 'Greater Grand Forks, ND / MN',
  grid: process.env.CLUB_GRID || 'EN17',
  tz: process.env.CLUB_TZ || 'America/Chicago',
  email: process.env.CLUB_EMAIL || '',
  discord: 'https://discord.gg/8PqWzC9G5g',
  facebook: 'https://www.facebook.com/ForxAmateurRadioClub/',
};
