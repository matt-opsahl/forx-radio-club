# FORX Amateur Radio Club website (WA0JXT)

Demo replacement for wa0jxt.org: a public site plus a member login area.

- **Public:** home with next-net countdown, About + contact form, Get Licensed, Events, Nets & Repeaters (CHIRP CSV export), Hamfest, Tools.
- **Tools:** live band conditions (NOAA SWPC solar flux + Kp, cached 15 min), Technician practice exam (35 sample questions), antenna / SWR / Ohm's law / grid square / phonetic calculators.
- **Members:** sign-up with FCC call-sign lookup (callook.info), officer approval, profiles, roster, event RSVPs, saved practice-exam scores.
- **Officers/admin:** edit events, nets and repeaters, approve members, change roles (admin only), and read contact-form messages.

Stack: Node 20, no framework, `better-sqlite3` (`data/forx.db`), plain ES-module front end in `public/`.

On first start with an empty database the admin account is created (`ADMIN_CALLSIGN`, default WA0JXT, password `ADMIN_PASSWORD`; if that's blank a random one is printed in `docker compose logs`). Sample nets, repeaters and events are seeded so the demo looks alive. Officers can edit or delete them in the Members area.

## Deploy

On the server, first time (set `ADMIN_PASSWORD` and `BACKUP_PASSPHRASE` in nano):

```
cd /root && git clone https://github.com/matt-opsahl/forx-radio-club.git && cd /root/forx-radio-club && cp .env.example .env && nano .env && docker compose up -d --build
```

Updates:

```
cd /root/forx-radio-club && git pull && docker compose up -d --build
```

The site is on `FORX_PORT` (8795). Behind the reverse proxy, point the site at that port. The login cookie is HTTPS-only (`COOKIE_SECURE=1`), so log in through the proxy, not the bare port.

## Backups

`ops/db-backup.sh` snapshots `data/forx.db`, encrypts it with `BACKUP_PASSPHRASE` and copies it to `onedrive:claude/forx-radio-club-db-backups` (30 days kept). Add to `crontab -e`:

```
15 4 * * * /root/forx-radio-club/ops/db-backup.sh >> /var/log/forx-db-backup.log 2>&1
```

Restoring: see `ops/RESTORE.md`.

## Local development

`npm install && npm start` serves http://localhost:8795 with the database in `./data`. In Claude Code, the `forx-radio-club` entry in the 480 Scheduling `.claude/launch.json` starts it. Set `COOKIE_SECURE=0` (the default outside Docker) for plain-HTTP login.

## Notes

- Nets are stored as day + time in Central time (`CLUB_TZ`). Event times are entered in the browser's local time.
- The practice questions are a sample set. Load the official NCVEC pool later for full coverage.
- Repeaters, nets and events in the seed data are placeholders.
