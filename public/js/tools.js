import { html, api, state, onLeave } from './app.js';
import { TECH } from './questions.js';

// ---------- band conditions ----------

const pillFor = lvl => `pill-${lvl.toLowerCase()}`;

export async function bandCard(el, { compact = false } = {}) {
  try {
    const b = await api('/api/band');
    el.innerHTML = html`
      <div class="card">
        <div class="stat-row">
          <div class="stat"><b>${b.sfi}</b><span>Solar flux</span></div>
          <div class="stat"><b>${b.kp}</b><span>Kp index</span></div>
          <div class="stat"><b class="${b.geomag === 'Quiet' ? 'pill-good' : b.geomag === 'Unsettled' ? 'pill-fair' : 'pill-poor'}" style="border:0;font-family:inherit">${b.geomag}</b><span>Geomagnetic</span></div>
        </div>
        <div class="bands">
          <span class="h">Band</span><span class="h">Day</span><span class="h">Night</span>
          ${b.bands.map(r => html`
            <span class="mono">${r.band}</span>
            <span><span class="pill ${pillFor(r.day)}">${r.day}</span></span>
            <span><span class="pill ${pillFor(r.night)}">${r.night}</span></span>`)}
        </div>
        <p class="muted" style="margin:12px 0 0;font-size:.82rem">
          ${b.source}${b.stale ? ' (cached)' : ''} · updated ${new Date(b.updated + (b.updated.endsWith('Z') ? '' : 'Z')).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.
          ${compact ? '' : 'Band ratings are a rough estimate from solar flux and Kp — get on the air and find out!'}
        </p>
      </div>`.s;
  } catch {
    el.innerHTML = '<div class="card muted">Space-weather data is unavailable right now.</div>';
  }
}

// ---------- calculators ----------

const num = v => (v === '' || v == null ? NaN : Number(v));
const fix = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '—');

export function maidenhead(lat, lon) {
  const L = lon + 180, A = lat + 90;
  const up = 'ABCDEFGHIJKLMNOPQR', low = 'abcdefghijklmnopqrstuvwx';
  return up[Math.floor(L / 20)] + up[Math.floor(A / 10)] +
    Math.floor((L % 20) / 2) + Math.floor(A % 10) +
    low[Math.floor((L % 2) * 12)] + low[Math.floor((A % 1) * 24)];
}

const PHONETIC = {
  A: 'Alfa', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot', G: 'Golf', H: 'Hotel', I: 'India',
  J: 'Juliett', K: 'Kilo', L: 'Lima', M: 'Mike', N: 'November', O: 'Oscar', P: 'Papa', Q: 'Quebec', R: 'Romeo',
  S: 'Sierra', T: 'Tango', U: 'Uniform', V: 'Victor', W: 'Whiskey', X: 'X-ray', Y: 'Yankee', Z: 'Zulu',
  0: 'Zero', 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', '/': 'Stroke',
};

const calculators = [
  {
    id: 'antenna', title: 'Antenna length', blurb: 'Wire lengths for a frequency, using the classic 468/f and 234/f formulas.',
    inputs: [['f', 'Frequency (MHz)', '146.52']],
    calc: ({ f }) => {
      f = num(f);
      if (!(f > 0)) return null;
      const dip = 468 / f, quarter = 234 / f;
      return [
        ['Half-wave dipole (total)', `${fix(dip)} ft · ${fix(dip * 12, 1)} in`],
        ['Each dipole leg', `${fix(dip / 2)} ft · ${fix(dip * 6, 1)} in`],
        ['Quarter-wave vertical', `${fix(quarter)} ft · ${fix(quarter * 12, 1)} in`],
        ['Full wavelength (free space)', `${fix(299.792458 / f, 3)} m`],
      ];
    },
  },
  {
    id: 'swr', title: 'SWR & return loss', blurb: 'What your SWR reading really means for power reaching the antenna.',
    inputs: [['swr', 'SWR (e.g. 1.5)', '1.5']],
    calc: ({ swr }) => {
      const s = num(swr);
      if (!(s >= 1)) return null;
      const g = (s - 1) / (s + 1);
      return [
        ['Reflection coefficient', fix(g, 3)],
        ['Power reflected', `${fix(g * g * 100, 1)} %`],
        ['Return loss', s === 1 ? '∞ dB' : `${fix(-20 * Math.log10(g), 1)} dB`],
        ['Mismatch loss', `${fix(-10 * Math.log10(1 - g * g), 2)} dB`],
      ];
    },
  },
  {
    id: 'ohm', title: "Ohm's law & power", blurb: 'Fill in any two values and the rest are calculated.',
    inputs: [['e', 'Volts (E)', '13.8'], ['i', 'Amps (I)', ''], ['r', 'Ohms (R)', ''], ['p', 'Watts (P)', '100']],
    calc: ({ e, i, r, p }) => {
      [e, i, r, p] = [e, i, r, p].map(num);
      const have = [e, i, r, p].filter(Number.isFinite).length;
      if (have < 2) return null;
      if (Number.isFinite(e) && Number.isFinite(i)) { r = e / i; p = e * i; }
      else if (Number.isFinite(e) && Number.isFinite(r)) { i = e / r; p = e * i; }
      else if (Number.isFinite(e) && Number.isFinite(p)) { i = p / e; r = e / i; }
      else if (Number.isFinite(i) && Number.isFinite(r)) { e = i * r; p = e * i; }
      else if (Number.isFinite(i) && Number.isFinite(p)) { e = p / i; r = e / i; }
      else if (Number.isFinite(r) && Number.isFinite(p)) { e = Math.sqrt(p * r); i = e / r; }
      return [['Volts', `${fix(e, 3)} V`], ['Amps', `${fix(i, 3)} A`], ['Ohms', `${fix(r, 3)} Ω`], ['Watts', `${fix(p, 2)} W`]];
    },
  },
  {
    id: 'grid', title: 'Grid square locator', blurb: 'Your Maidenhead grid for contests, VHF and satellite work.',
    inputs: [['lat', 'Latitude', '47.925'], ['lon', 'Longitude', '-97.032']],
    extra: () => html`<button type="button" class="btn btn-sm" data-geo>📍 Use my location</button>`,
    calc: ({ lat, lon }) => {
      lat = num(lat); lon = num(lon);
      if (!(lat >= -90 && lat < 90 && lon >= -180 && lon < 180)) return null;
      return [['Grid square', maidenhead(lat, lon)]];
    },
  },
  {
    id: 'phon', title: 'Phonetic spelling', blurb: 'Spell out a call sign the ITU way.',
    inputs: [['text', 'Call sign or text', 'WA0JXT']],
    calc: ({ text }) => {
      const words = [...String(text).toUpperCase()].map(ch => PHONETIC[ch]).filter(Boolean);
      return words.length ? [['Say it as', words.join(' · ')]] : null;
    },
  },
];

function mountCalculator(card, c) {
  const out = card.querySelector('.calc-out');
  const update = () => {
    const vals = Object.fromEntries([...card.querySelectorAll('input')].map(i => [i.name, i.value]));
    const rows = c.calc(vals);
    out.innerHTML = rows
      ? html`<div class="calc-rows">${rows.map(([k, v]) => html`<div><span class="muted">${k}</span><b class="mono">${v}</b></div>`)}</div>`.s
      : '<span class="muted">Enter values above.</span>';
  };
  card.addEventListener('input', update);
  card.querySelector('[data-geo]')?.addEventListener('click', e => {
    const btn = e.currentTarget;
    if (!navigator.geolocation) return;
    btn.disabled = true;
    navigator.geolocation.getCurrentPosition(pos => {
      card.querySelector('[name=lat]').value = pos.coords.latitude.toFixed(4);
      card.querySelector('[name=lon]').value = pos.coords.longitude.toFixed(4);
      btn.disabled = false;
      update();
    }, () => { btn.disabled = false; });
  });
  update();
}

export async function toolsPage(view) {
  view.innerHTML = html`
    <section class="wrap page-head">
      <div class="eyebrow">Shack tools</div>
      <h1>Ham radio tools</h1>
      <p>Live band conditions, a practice exam, and the calculators you reach for when building antennas.</p>
    </section>
    <section class="wrap section-tight grid grid-2">
      <div>
        <h2>Band conditions</h2>
        <div id="band"><div class="card muted">Loading space weather…</div></div>
      </div>
      <div>
        <h2>Practice exam</h2>
        <a class="card card-link" href="#/tools/exam">
          <div class="eyebrow">Technician · Element 2</div>
          <h3>Test yourself before exam day</h3>
          <p class="muted">Quick 10-question drill or a full 35-question practice test, graded as you go with explanations.${state.user ? ' Your scores are saved to your member profile.' : ''}</p>
          <span class="btn btn-primary">Start practicing →</span>
        </a>
      </div>
    </section>
    <section class="wrap section">
      <h2>Calculators</h2>
      <div class="grid grid-calc">
        ${calculators.map(c => html`
          <form class="card" data-calc="${c.id}" onsubmit="return false">
            <h3>${c.title}</h3>
            <p class="muted" style="font-size:.9rem">${c.blurb}</p>
            <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">
              ${c.inputs.map(([name, label, val]) => html`
                <div class="field"><label for="${c.id}-${name}">${label}</label>
                <input id="${c.id}-${name}" name="${name}" value="${val}" ${c.id === 'phon' ? '' : html`inputmode="decimal"`} autocomplete="off"></div>`)}
            </div>
            ${c.extra?.() || ''}
            <div class="calc-out" style="margin-top:12px"></div>
          </form>`)}
      </div>
    </section>`.s;
  bandCard(view.querySelector('#band'));
  calculators.forEach(c => mountCalculator(view.querySelector(`[data-calc="${c.id}"]`), c));
}

// ---------- practice exam ----------

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function examPage(view) {
  view.innerHTML = html`
    <section class="wrap page-head">
      <div class="eyebrow"><a href="#/tools">Tools</a> / Practice exam</div>
      <h1>Technician practice exam</h1>
      <p>The real exam is 35 questions and you need 26 correct (74%) to pass. Each answer is checked as soon as you pick it.</p>
    </section>
    <section class="wrap section-tight" id="exam">
      <div class="grid grid-2">
        <button class="card card-link" style="text-align:left;font:inherit;color:inherit;cursor:pointer" data-n="10">
          <div class="eyebrow">Quick drill</div><h3>10 questions</h3><p class="muted" style="margin:0">About 5 minutes.</p>
        </button>
        <button class="card card-link" style="text-align:left;font:inherit;color:inherit;cursor:pointer" data-n="35">
          <div class="eyebrow">Full practice test</div><h3>35 questions</h3><p class="muted" style="margin:0">Same length as the real exam.</p>
        </button>
      </div>
      <p class="muted" style="margin-top:14px;font-size:.9rem">This demo uses a sample question set written for the club. The full NCVEC question pool can be loaded later.</p>
    </section>`.s;
  view.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => runExam(view.querySelector('#exam'), Number(b.dataset.n))));
}

function runExam(el, n) {
  const qs = shuffle(TECH).slice(0, n).map(q => {
    const order = shuffle(q.a.map((_, i) => i));
    return { ...q, order, correct: order.indexOf(q.c) };
  });
  let idx = 0, score = 0;
  const missed = [];

  const showQuestion = () => {
    const q = qs[idx];
    el.innerHTML = html`
      <div class="card" style="max-width:760px">
        <div class="spread" style="margin-bottom:10px">
          <span class="q-id">Question ${idx + 1} of ${qs.length}</span>
          <span class="q-id">${score} correct</span>
        </div>
        <div class="progress" style="margin-bottom:18px"><div style="width:${(idx / qs.length) * 100}%"></div></div>
        <h3>${q.q}</h3>
        <div class="answers">
          ${q.order.map((ai, k) => html`<button class="answer" data-k="${k}"><b>${'ABCD'[k]}</b><span>${q.a[ai]}</span></button>`)}
        </div>
        <div id="after"></div>
      </div>`.s;
    el.querySelectorAll('.answer').forEach(btn => btn.addEventListener('click', () => {
      const k = Number(btn.dataset.k);
      const right = k === q.correct;
      if (right) score++; else missed.push(q);
      el.querySelectorAll('.answer').forEach(b => {
        b.disabled = true;
        const bk = Number(b.dataset.k);
        if (bk === q.correct) b.classList.add('right');
        else if (bk === k) b.classList.add('wrong');
      });
      el.querySelector('#after').innerHTML = html`
        <p class="explain"><b style="color:var(${right ? '--good' : '--poor'})">${right ? 'Correct.' : 'Not quite.'}</b> ${q.e}</p>
        <button class="btn btn-primary" id="next">${idx + 1 < qs.length ? 'Next question →' : 'See results'}</button>`.s;
      const next = el.querySelector('#next');
      next.focus();
      next.addEventListener('click', () => { idx++; idx < qs.length ? showQuestion() : showResults(); });
    }));
  };

  const showResults = async () => {
    const pct = Math.round((score / qs.length) * 100);
    const pass = pct >= 74;
    let saved = '';
    if (state.user) {
      try { await api('/api/exam-attempts', { method: 'POST', body: { element: 'Technician', score, total: qs.length } }); saved = 'Saved to your member profile.'; }
      catch { saved = 'Could not save this score.'; }
    }
    el.innerHTML = html`
      <div class="card" style="max-width:760px">
        <div class="eyebrow">Results</div>
        <div class="result-big" style="color:var(${pass ? '--good' : '--poor'})">${score} / ${qs.length} · ${pct}%</div>
        <p>${pass ? 'That would pass! Ready to book an exam session?' : 'Not a pass yet (74% needed). Review the misses below and try again.'} <span class="muted">${saved}</span></p>
        <div class="row">
          <button class="btn btn-primary" data-again>Try again</button>
          <a class="btn" href="#/license">Find an exam session</a>
        </div>
        ${missed.length ? html`
          <h3 style="margin-top:24px">Review (${missed.length} missed)</h3>
          ${missed.map(q => html`<div class="q"><b>${q.q}</b><div class="explain">Answer: <b style="color:var(--good)">${q.a[q.c]}</b> — ${q.e}</div></div>`)}` : ''}
      </div>`.s;
    el.querySelector('[data-again]').addEventListener('click', () => runExam(el, n));
  };

  showQuestion();
}
