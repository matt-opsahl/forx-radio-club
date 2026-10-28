import {
  html, api, state, onLeave, fmtDate, fmtTime, fmt12, countdownHtml, DAYS, KIND_LABEL, notice, formData,
} from './app.js';
import { bandCard } from './tools.js';

// ---------- shared pieces ----------

function eventItem(e) {
  const d = new Date(e.starts_at);
  const time = `${fmtTime(e.starts_at)}${e.ends_at ? ' – ' + fmtTime(e.ends_at) : ''}`;
  const rsvp = state.user && e.rsvp ? html`
    <div class="row" data-rsvp="${e.id}">
      <button class="btn btn-sm ${e.my_rsvp === 'going' ? 'btn-primary' : ''}" data-status="going">Going</button>
      <button class="btn btn-sm ${e.my_rsvp === 'maybe' ? 'btn-primary' : ''}" data-status="maybe">Maybe</button>
      ${e.my_rsvp ? html`<button class="btn btn-sm" data-status="none" title="Clear RSVP">✕</button>` : ''}
    </div>` : '';
  return html`
    <article class="card event">
      <div class="date-chip"><span>${d.toLocaleDateString(undefined, { month: 'short' })}</span><b>${d.getDate()}</b><span>${d.toLocaleDateString(undefined, { weekday: 'short' })}</span></div>
      <div>
        <div class="row" style="margin-bottom:4px">
          <span class="pill pill-accent">${KIND_LABEL[e.kind] || e.kind}</span>
          ${e.members_only ? html`<span class="pill">Members</span>` : ''}
          ${state.user && e.going ? html`<span class="muted" style="font-size:.85rem">${e.going} going</span>` : ''}
        </div>
        <h3>${e.title}</h3>
        <div class="muted">${time}${e.location ? html` · ${e.location}` : ''}</div>
        ${e.description ? html`<p style="margin:8px 0 0">${e.description}</p>` : ''}
      </div>
      ${rsvp}
    </article>`;
}

function bindRsvp(root, reload) {
  root.querySelectorAll('[data-rsvp] button').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.closest('[data-rsvp]').dataset.rsvp;
    btn.disabled = true;
    try {
      await api(`/api/events/${id}/rsvp`, { method: 'PUT', body: { status: btn.dataset.status } });
      await reload();
    } catch (err) { alert(err.message); btn.disabled = false; }
  }));
}

function netCountdown(root, nets) {
  const tick = () => {
    const now = Date.now();
    root.querySelectorAll('[data-countdown]').forEach(el => {
      const t = Date.parse(el.dataset.countdown);
      el.innerHTML = countdownHtml(t - now).s;
      if (t - now <= 0) el.closest('[data-net]')?.querySelector('.when')?.replaceChildren('On the air now');
    });
  };
  tick();
  const id = setInterval(tick, 1000);
  onLeave(() => clearInterval(id));
}

// ---------- Home ----------

export async function homePage(view) {
  const [nets, events] = await Promise.all([api('/api/nets'), api('/api/events')]);
  const next = nets[0];

  view.innerHTML = html`
    <section class="hero">
      <svg class="hero-waves" viewBox="0 0 200 200" aria-hidden="true">
        <g fill="none" stroke="currentColor" stroke-width="3">
          ${[30, 55, 80, 105, 130].map(r => html`<circle cx="100" cy="100" r="${r}"/>`)}
        </g>
      </svg>
      <div class="wrap hero-inner">
        <div>
          <div class="eyebrow">${state.club.callsign} · ${state.club.city}</div>
          <h1>Get on the air with <span>FORX</span>.</h1>
          <p class="lead">We're the amateur radio club for Greater Grand Forks — operators of every skill level who get together to make contacts, help the community and have fun with radio.</p>
          <div class="row">
            <a class="btn btn-primary" href="#/license">Get your license</a>
            <a class="btn" href="#/join">Join the club</a>
            <a class="btn" href="#/nets">Nets &amp; repeaters</a>
          </div>
        </div>
        ${next ? html`
          <div class="card" data-net>
            <div class="spread">
              <div class="eyebrow" style="margin:0">Next on-air net</div>
              ${next.on_air ? html`<span class="pill on-air">ON AIR</span>` : ''}
            </div>
            <h3 style="margin-top:8px">${next.name}</h3>
            <div class="freq" style="margin-bottom:12px">${next.frequency} · ${next.mode}</div>
            ${next.on_air
              ? html`<div class="countdown when">On the air now</div><div class="muted">until ${fmtTime(next.next_end)}</div>`
              : html`<div class="countdown" data-countdown="${next.next_start}"></div>
                     <div class="muted when">${DAYS[next.day_of_week]}s at ${fmt12(next.time_local)} Central</div>`}
          </div>` : ''}
      </div>
    </section>

    <section class="wrap section">
      <div class="grid grid-3">
        <a class="card card-link" href="#/events">
          <div class="eyebrow">Operating events</div>
          <h3>Making the contacts</h3>
          <p class="muted">Field Day, Winter Field Day, contests, and portable operating — bring your rig or use the club station.</p>
        </a>
        <a class="card card-link" href="#/events">
          <div class="eyebrow">Social events</div>
          <h3>Encouraging camaraderie</h3>
          <p class="muted">Meetings, breakfasts and build nights. A great place to meet local hams and find an Elmer.</p>
        </a>
        <a class="card card-link" href="#/license">
          <div class="eyebrow">License testing</div>
          <h3>Become a ham!</h3>
          <p class="muted">Study with our free practice exams, then take your test at one of our local exam sessions.</p>
        </a>
      </div>
    </section>

    <section class="wrap section-tight">
      <div class="grid grid-2">
        <div>
          <div class="spread"><h2>Coming up</h2><a href="#/events">All events →</a></div>
          <div class="stack" id="home-events">
            ${events.length ? events.slice(0, 3).map(eventItem) : html`<div class="empty">No events scheduled yet.</div>`}
          </div>
        </div>
        <div>
          <div class="spread"><h2>Band conditions</h2><a href="#/tools">Ham tools →</a></div>
          <div id="home-band"><div class="card muted">Loading space weather…</div></div>
        </div>
      </div>
    </section>

    <section class="wrap section">
      <div class="card" style="text-align:center;padding:36px 20px">
        <h2>Serving the community</h2>
        <p class="muted" style="max-width:62ch;margin:0 auto 18px">Our members provide communications for public service events and emergency organizations across the Red River Valley. When other systems fail, amateur radio gets the message through.</p>
        <a class="btn btn-amber" href="#/about">Learn about FORX</a>
      </div>
    </section>`.s;

  netCountdown(view, nets);
  bindRsvp(view, () => homePage(view));
  bandCard(view.querySelector('#home-band'), { compact: true });
}

// ---------- About ----------

export async function aboutPage(view) {
  view.innerHTML = html`
    <section class="wrap page-head">
      <div class="eyebrow">Who we are</div>
      <h1>A distinct identity</h1>
      <p>FORX Amateur Radio Club supports amateur radio operators in the Greater Grand Forks area. We're a group with varying skill sets and interests. We hold events built around operating radios and socializing with local hams, and we provide communication services to the local community through a number of organizations.</p>
    </section>
    <section class="wrap section-tight grid grid-3">
      <div class="card"><h3>📻 Operate</h3><p class="muted">Contests, Field Day, POTA activations, satellite passes, digital modes — there's always someone to learn from.</p></div>
      <div class="card"><h3>🤝 Connect</h3><p class="muted">Monthly meetings, weekly nets, and our Discord keep members talking between events.</p></div>
      <div class="card"><h3>🚨 Serve</h3><p class="muted">We support ARES, SKYWARN storm spotting, and public events like parades and races.</p></div>
    </section>
    <section class="wrap section grid grid-2" id="contact">
      <div>
        <h2>Get in touch</h2>
        <p class="muted">Questions about the club, licensing, or getting a radio set up? Send us a note and an officer will get back to you.</p>
        <div class="row">
          <a class="btn" href="${state.club.discord}" target="_blank" rel="noopener">Join our Discord</a>
          <a class="btn" href="${state.club.facebook}" target="_blank" rel="noopener">Facebook</a>
        </div>
      </div>
      <form class="card" id="contact-form">
        <div id="contact-msg"></div>
        <div class="form-grid">
          <div class="field"><label for="c-name">Name</label><input id="c-name" name="name" required maxlength="100" autocomplete="name"></div>
          <div class="field"><label for="c-email">Email</label><input id="c-email" name="email" type="email" required maxlength="200" autocomplete="email"></div>
        </div>
        <div class="field"><label for="c-msg">Message</label><textarea id="c-msg" name="message" required maxlength="4000"></textarea></div>
        <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <button class="btn btn-primary">Send message</button>
      </form>
    </section>`.s;

  const form = view.querySelector('#contact-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = view.querySelector('#contact-msg');
    try {
      await api('/api/contact', { method: 'POST', body: formData(form) });
      form.reset();
      notice(msg, 'Thanks! Your message was sent to the club officers.', 'ok');
    } catch (err) { notice(msg, err.message); }
  });
}

// ---------- Get licensed ----------

export async function licensePage(view) {
  const events = (await api('/api/events')).filter(e => e.kind === 'exam');
  view.innerHTML = html`
    <section class="wrap page-head">
      <div class="eyebrow">Become a ham</div>
      <h1>Get your amateur radio license</h1>
      <p>No Morse code required. The entry-level Technician license is a 35-question multiple-choice exam, and most people pass after a few weeks of study.</p>
    </section>
    <section class="wrap section-tight grid grid-3">
      ${[
        ['1', 'Study', html`Use a study guide or app, and drill with our <a href="#/tools/exam">free practice exam</a>.`],
        ['2', 'Get an FRN', html`Register for a free FCC Registration Number in the <a href="https://apps.fcc.gov/cores/" target="_blank" rel="noopener">FCC CORES</a> system.`],
        ['3', 'Take the exam', html`Come to one of our volunteer-examiner sessions below. Bring photo ID and your FRN.`],
        ['4', 'Get your call', html`Pay the FCC application fee when emailed. Your call sign shows up in the FCC database within days.`],
      ].map(([n, t, d]) => html`<div class="card"><div class="eyebrow">Step ${n}</div><h3>${t}</h3><p class="muted" style="margin:0">${d}</p></div>`)}
    </section>
    <section class="wrap section-tight">
      <h2>License classes</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Class</th><th>Exam</th><th>Privileges</th></tr></thead>
        <tbody>
          <tr><td><b>Technician</b></td><td>Element 2 · 35 questions, pass 26</td><td>All bands above 30 MHz (local FM, repeaters, satellites) plus some HF on 10m, CW and digital.</td></tr>
          <tr><td><b>General</b></td><td>Element 3 · 35 questions, pass 26</td><td>Most HF privileges — worldwide contacts on 160m through 10m.</td></tr>
          <tr><td><b>Amateur Extra</b></td><td>Element 4 · 50 questions, pass 37</td><td>All amateur privileges on every band.</td></tr>
        </tbody>
      </table></div>
    </section>
    <section class="wrap section">
      <div class="spread"><h2>Upcoming exam sessions</h2><a class="btn btn-primary" href="#/tools/exam">Take a practice exam</a></div>
      <div class="stack">${events.length ? events.map(eventItem) : html`<div class="empty">No exam sessions are scheduled right now — check back soon or contact us.</div>`}</div>
    </section>`.s;
  bindRsvp(view, () => licensePage(view));
}

// ---------- Events ----------

export async function eventsPage(view) {
  const [upcoming, past] = await Promise.all([api('/api/events'), api('/api/events?past=1')]);
  view.innerHTML = html`
    <section class="wrap page-head">
      <div class="eyebrow">Calendar</div>
      <h1>Events</h1>
      <p>Meetings, operating events, socials and exam sessions. ${state.user ? 'Let us know if you are coming with the RSVP buttons.' : html`<a href="#/members">Log in</a> to RSVP and see members-only events.`}</p>
    </section>
    <section class="wrap section-tight stack">
      ${upcoming.length ? upcoming.map(eventItem) : html`<div class="empty">No upcoming events yet.</div>`}
    </section>
    ${past.length ? html`
      <section class="wrap section">
        <h2>Recent events</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Event</th><th>Type</th></tr></thead>
          <tbody>${past.map(e => html`<tr><td class="num">${fmtDate(e.starts_at, { year: 'numeric', month: 'short', day: 'numeric' })}</td><td>${e.title}</td><td>${KIND_LABEL[e.kind] || e.kind}</td></tr>`)}</tbody>
        </table></div>
      </section>` : ''}`.s;
  bindRsvp(view, () => eventsPage(view));
}

// ---------- Nets & repeaters ----------

export const fmtOffset = mhz => (mhz > 0 ? '+' : mhz < 0 ? '−' : '') + Math.abs(mhz).toFixed(3);

export async function netsPage(view) {
  const [nets, reps] = await Promise.all([api('/api/nets'), api('/api/repeaters')]);
  const statusPill = s => html`<span class="pill ${s === 'up' ? 'pill-good' : s === 'down' ? 'pill-poor' : 'pill-fair'}">${s === 'up' ? 'On the air' : s === 'down' ? 'Down' : 'Testing'}</span>`;
  view.innerHTML = html`
    <section class="wrap page-head">
      <div class="eyebrow">On the air</div>
      <h1>Nets &amp; repeaters</h1>
      <p>Check in to a net — everyone is welcome, including brand-new hams. All times are Central.</p>
    </section>
    <section class="wrap section-tight grid grid-2">
      ${nets.map(n => html`
        <div class="card" data-net>
          <div class="spread">
            <h3 style="margin:0">${n.name}</h3>
            ${n.on_air ? html`<span class="pill on-air">ON AIR</span>` : html`<span class="pill">${DAYS[n.day_of_week]} ${fmt12(n.time_local)}</span>`}
          </div>
          <div class="freq" style="margin:6px 0 10px">${n.frequency} · ${n.mode}</div>
          ${n.description ? html`<p class="muted">${n.description}</p>` : ''}
          ${n.on_air ? '' : html`<div class="row"><span class="muted when">Starts in</span><span class="mono" data-countdown="${n.next_start}"></span></div>`}
        </div>`)}
    </section>
    <section class="wrap section">
      <div class="spread">
        <h2>Club repeaters</h2>
        <a class="btn" href="/api/repeaters.csv" download>⬇ Download for CHIRP</a>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Output</th><th>Offset</th><th>Tone</th><th>Mode</th><th>Location</th><th>Status</th></tr></thead>
        <tbody>${reps.map(r => html`
          <tr>
            <td><b>${r.name}</b><div class="muted" style="font-size:.85rem">${r.callsign}${r.notes ? html` · ${r.notes}` : ''}</div></td>
            <td class="num freq">${r.output_mhz.toFixed(3)}</td>
            <td class="num">${fmtOffset(r.offset_mhz)}</td>
            <td class="num">${r.tone ? r.tone.toFixed(1) : '—'}</td>
            <td>${r.mode}</td>
            <td>${r.location}</td>
            <td>${statusPill(r.status)}</td>
          </tr>`)}</tbody>
      </table></div>
      <p class="muted" style="margin-top:10px;font-size:.9rem">The CHIRP file imports straight into most radios: in CHIRP use File → Import, then upload to your radio.</p>
    </section>`.s;
  netCountdown(view, nets);
}

// ---------- Hamfest ----------

export async function hamfestPage(view) {
  const events = (await api('/api/events')).filter(e => e.kind === 'hamfest');
  view.innerHTML = html`
    <section class="hero">
      <div class="wrap" style="padding:56px 0">
        <div class="eyebrow">Annual swap meet</div>
        <h1>FORX Hamfest</h1>
        <p class="lead">Buy, sell and trade radios and parts, catch a forum, take a license exam, and meet hams from across the region.</p>
      </div>
    </section>
    <section class="wrap section">
      ${events.length ? html`<div class="stack">${events.map(eventItem)}</div>`
        : html`<div class="empty">The next Hamfest date hasn't been posted yet. Officers can add it as a "Hamfest" event in the Members area.</div>`}
    </section>
    <section class="wrap section-tight grid grid-3">
      <div class="card"><h3>🛒 Vendors &amp; tables</h3><p class="muted">Table reservations open closer to the date. Contact us to reserve one.</p><a href="#/about#contact">Ask about a table →</a></div>
      <div class="card"><h3>📡 Talk-in</h3><p class="muted">Talk-in on the club 2m repeater. See <a href="#/nets">Nets &amp; Repeaters</a> for frequency and tone.</p></div>
      <div class="card"><h3>📝 Exams &amp; forums</h3><p class="muted">A VE exam session and member forums run during the event. Schedule to be announced.</p></div>
    </section>`.s;
  bindRsvp(view, () => hamfestPage(view));
}

export { eventItem, bindRsvp };
