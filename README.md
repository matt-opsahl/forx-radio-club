# FORX Amateur Radio Club website (WA0JXT)

Demo replacement for wa0jxt.org: a public site plus a member login area.

- **Public:** home with next-net countdown, About + contact form, Get Licensed, Events, Nets & Repeaters (CHIRP CSV export), Hamfest, Tools.
- **Tools:** live band conditions (NOAA SWPC solar flux + Kp, cached 15 min), Technician practice exam (35 sample questions), antenna / SWR / Ohm's law / grid square / phonetic calculators.
- **Members:** sign-up with FCC call-sign lookup (callook.info), officer approval, profiles, roster, event RSVPs, saved practice-exam scores.
- **Officers/admin:** edit events, nets and repeaters, approve members, change roles (admin only), and read contact-form messages.

Stack: Node 20, no framework, `better-sqlite3` (`data/forx.db`), plain ES-module front end in `public/`.

## Run locally

```
npm install
npm start          # http://localhost:8795
```

On first start with an empty database the admin account is created (`ADMIN_CALLSIGN`, default WA0JXT). If `ADMIN_PASSWORD` isn't set, a random one is printed in the log. Sample nets, repeaters and events are seeded so the demo looks alive. Officers can edit or delete them in the Members area.

## Docker

```
cp .env.example .env    # set ADMIN_PASSWORD
docker compose up -d --build
docker compose logs     # shows generated admin password if you left it blank
```

The data lives in `./data` (bind mount). Set `COOKIE_SECURE=1` when it's served over HTTPS behind a proxy.

## Notes

- Nets are stored as day + time in Central time (`CLUB_TZ`). Event times are entered in the browser's local time.
- The practice questions are a sample set. Load the official NCVEC pool later for full coverage.
- Repeaters, nets and events in the seed data are placeholders.
