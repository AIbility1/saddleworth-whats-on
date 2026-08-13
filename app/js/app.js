/* app.js — Saddleworth What's On.
   A fully static app: loads data/events.json, expands recurring events into a
   ±1-year window, and renders pins on the hand-drawn basemap from map-art.js. */

(function () {
  'use strict';

  // ---- projection: real lat/lng → illustrated-world pixels ----
  const W = 1600, H = 1200;
  const LAT_TOP = 53.612, LAT_BOT = 53.506;
  const LNG_L = -2.135;
  const LNG_R = LNG_L + ((LAT_TOP - LAT_BOT) * (W / H)) / Math.cos((53.556 * Math.PI) / 180);
  const project = (lat, lng) => [
    ((lng - LNG_L) / (LNG_R - LNG_L)) * W,
    ((LAT_TOP - lat) / (LAT_TOP - LAT_BOT)) * H,
  ];

  // ---- categories: 3 colour groups (validated palette), 6 glyphs ----
  const GROUPS = { food: '#eb6834', ent: '#2a78d6', comm: '#1baf7a', out: '#35784b' };
  const CATS = {
    offer:     { label: 'Offers & deals',        emoji: '🏷️', group: 'food' },
    food:      { label: 'Food & drink',          emoji: '🍺', group: 'food' },
    music:     { label: 'Live music',            emoji: '🎵', group: 'ent'  },
    quiz:      { label: 'Quiz nights',           emoji: '❓', group: 'ent'  },
    ent:       { label: 'Entertainment',         emoji: '🎤', group: 'ent'  },
    market:    { label: 'Markets & fairs',       emoji: '🧺', group: 'comm' },
    community: { label: 'Festivals & community', emoji: '🎪', group: 'comm' },
    active:    { label: 'Sport & fitness',       emoji: '🏃', group: 'out'  },
    kids:      { label: 'Kids & family',         emoji: '🧒', group: 'comm' },
  };
  const KIND_EMOJI = { pub: '🍻', cafe: '☕', restaurant: '🍽️', takeaway: '🍟', shop: '🥖',
                       hall: '🎭', attraction: '🏛️', club: '🎺', sport: '🎾',
                       walk: '🥾', sight: '⛰️', spot: '📍' };
  const WALK_C = '#35784b';
  // directory-first: pins are coloured by what the venue IS (4 groups),
  // and a coral badge appears when it has events in the chosen dates
  const KINDG = {
    pub:  { label: 'Pubs & bars',    emoji: '🍻', c: '#eb6834', kinds: ['pub'] },
    food: { label: 'Restaurants & takeaways', emoji: '🍽️', c: '#2a78d6', kinds: ['restaurant', 'takeaway'] },
    cafe: { label: 'Cafés',          emoji: '☕', c: '#8d6748', kinds: ['cafe'] },
    shop: { label: 'Food shops',     emoji: '🥖', c: '#c9891d', kinds: ['shop'] },
    comm: { label: 'Halls & clubs',  emoji: '🎭', c: '#1baf7a', kinds: ['hall', 'attraction', 'club', 'sport', 'spot'] },
    out:  { label: 'Walks & sights', emoji: '🥾', c: '#35784b', kinds: ['walk', 'sight'] },
  };
  const kindGroup = (k) => Object.keys(KINDG).find((g) => KINDG[g].kinds.includes(k)) || 'comm';
  // an event may sit in several categories (e.g. food + offer); first is primary
  const evCats = (ev) => (ev.categories && ev.categories.length ? ev.categories : [ev.category]);
  // "a drink in the sun": pubs/cafés/restaurants with somewhere to sit outside
  const sunnySpot = (v) => ['pub', 'cafe', 'restaurant'].includes(v.kind) &&
    (v.tags || []).some((t) => /beer garden|outdoor|terrace|garden/i.test(t));
  const DOW = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const DAY = 86400000, LIST_CAP = 400;

  // ---- date helpers (all local-midnight) ----
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const dayDiff = (a, b) => Math.round((a - b) / DAY);
  const fmtShort = (d) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const fmtHM = (m) => `${Math.floor(m / 60)}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
  const fmtFull = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtHead = (d) => {
    const base = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    const y = d.getFullYear() === today.getFullYear() ? '' : ' ' + d.getFullYear();
    if (!dayDiff(d, today)) return 'Today · ' + base;
    return base + y;
  };

  // ---- state ----
  let venues = new Map();      // id → venue (incl. pseudo-venues for one-off spots)
  let events = [];
  let lo = 0, hi = 30;         // window, days relative to today
  let activeKinds = new Set(Object.keys(KINDG));
  let activeCats = new Set(Object.keys(CATS));
  let sunOnly = false;         // "a drink in the sun": only outdoor-table venues
  let query = '';
  let selected = null;

  // ---- community state ----
  let ratings = {};            // venueId → {avg, count}, from the API
  let eventRatings = {};       // eventId → {avg, count}
  let claimed = new Set();     // venues verified & locked to their code holder
  let placing = null;          // callback waiting for a map tap (placing a new pin)
  let cid = localStorage.getItem('swo-cid');
  if (!cid) {
    cid = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2);
    localStorage.setItem('swo-cid', cid);
  }
  // the anonymous owner hash the server files our submissions under, so this
  // browser can recognise (and edit) its own listings
  let myOwner = '';
  (async () => {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('owner:' + cid));
      myOwner = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    } catch { }
  })();
  async function api(path, body, code) {
    const opt = body === undefined ? {} : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(code ? { 'x-venue-code': code } : {}) },
      body: JSON.stringify(body),
    };
    const r = await fetch('api/' + path, opt);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'The server had a problem (' + r.status + ').');
    return j;
  }

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ================= pan / zoom =================
  const stage = $('stage'), world = $('world'), markersEl = $('markers');
  const basemap = $('basemap');
  let view = { x: 0, y: 0, s: 1 }, fitS = 1;

  // While a gesture is in flight the drawing moves as a cheap GPU transform
  // (no vector re-render per frame); 160ms after the last movement the
  // viewBox commits and the ink re-renders crisp at the new scale.
  // The svg element is oversized by PAD×viewport on every edge, so a gesture
  // can travel half a screen in any direction before hitting unpainted map —
  // and the painted layer stays bounded (4× viewport), which keeps the GPU
  // from re-rasterising the whole drawing mid-drag.
  const PAD = 0.5;
  let committed = null, commitT = 0;
  function commitView() {
    const vw = innerWidth, vh = innerHeight;
    committed = { x: view.x, y: view.y, s: view.s };
    basemap.style.transformOrigin = `${PAD * vw}px ${PAD * vh}px`; // local point under screen (0,0)
    basemap.setAttribute('viewBox',
      `${((-PAD * vw - view.x) / view.s).toFixed(2)} ${((-PAD * vh - view.y) / view.s).toFixed(2)} ` +
      `${((1 + 2 * PAD) * vw / view.s).toFixed(2)} ${((1 + 2 * PAD) * vh / view.s).toFixed(2)}`);
    basemap.style.transform = 'none';
    basemap.classList.toggle('lz', view.s < fitS * 1.7);
    basemap.classList.toggle('hz', view.s > fitS * 3.2);
    basemap.classList.toggle('xz', view.s > fitS * 9);
    // animals hold a sensible size once past the symbolic-zoom cutoff
    basemap.style.setProperty('--fs', Math.max(0.12, Math.min(1, (fitS * 3.2) / view.s)).toFixed(3));
    syncZoomBar();
  }
  function applyView() {
    const vw = innerWidth, vh = innerHeight;
    const ws = W * view.s, hs = H * view.s, pad = 70;
    view.x = ws <= vw ? (vw - ws) / 2 : Math.min(pad, Math.max(vw - ws - pad, view.x));
    view.y = hs <= vh ? (vh - hs) / 2 : Math.min(pad, Math.max(vh - hs - pad, view.y));
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
    markersEl.style.setProperty('--inv', 1 / view.s);
    if (!committed) commitView();
    else {
      const a = view.s / committed.s;
      basemap.style.transform =
        `translate(${(view.x - a * committed.x).toFixed(2)}px, ${(view.y - a * committed.y).toFixed(2)}px) scale(${a.toFixed(4)})`;
    }
    clearTimeout(commitT);
    commitT = setTimeout(commitView, 160);
  }
  function fit() {
    fitS = Math.min(innerWidth / W, innerHeight / H);
    view.s = Math.max(view.s, fitS * 0.9);
    applyView();
  }
  function zoomAt(cx, cy, f) {
    const ns = Math.min(fitS * 80, Math.max(fitS * 0.9, view.s * f));
    view.x = cx - ((cx - view.x) / view.s) * ns;
    view.y = cy - ((cy - view.y) / view.s) * ns;
    view.s = ns;
    applyView();
  }
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.pow(1.0016, -e.deltaY));
  }, { passive: false });

  const ptrs = new Map();
  let pinchD = 0, dragged = false, downPin = null;
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    if (ptrs.size === 1) {
      dragged = false;
      downPin = e.target.closest && e.target.closest('.pin');
    } else {
      downPin = null;
      const [a, b] = [...ptrs.values()];
      pinchD = Math.hypot(a.x - b.x, a.y - b.y);
    }
    stage.classList.add('dragging');
  });
  stage.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.x0, p.y - p.y0) > 9) dragged = true;
    if (ptrs.size === 1) {
      view.x += dx; view.y += dy; applyView();
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (pinchD > 0) zoomAt(mx, my, d / pinchD);
      pinchD = d;
      view.x += dx / 2; view.y += dy / 2; applyView();
    }
  });
  const endPtr = (e) => {
    // a still press while placing a new business pin drops the pin there
    if (e.type === 'pointerup' && ptrs.size === 1 && placing && !dragged) {
      const wx = (e.clientX - view.x) / view.s, wy = (e.clientY - view.y) / view.s;
      const lat = LAT_TOP - (wy / H) * (LAT_TOP - LAT_BOT);
      const lng = LNG_L + (wx / W) * (LNG_R - LNG_L);
      const cb = placing;
      placing = null;
      document.body.classList.remove('placing');
      ptrs.delete(e.pointerId);
      downPin = null;
      stage.classList.remove('dragging');
      cb(lat, lng);
      return;
    }
    // a press that never really moved is a tap — open the pin it started on
    if (e.type === 'pointerup' && ptrs.size === 1 && downPin && !dragged) {
      renderVenue(downPin.dataset.v, true);
    }
    ptrs.delete(e.pointerId);
    downPin = null;
    if (!ptrs.size) stage.classList.remove('dragging');
  };
  stage.addEventListener('pointerup', endPtr);
  stage.addEventListener('pointercancel', endPtr);
  addEventListener('resize', () => { fit(); });

  $('z-in').onclick = () => zoomAt(innerWidth / 2, innerHeight / 2, 1.45);
  $('z-out').onclick = () => zoomAt(innerWidth / 2, innerHeight / 2, 1 / 1.45);

  // the zoom bar maps 0–1000 onto the zoom range logarithmically, and stays
  // in sync with wheel/pinch/button zooming
  const zbar = $('z-bar');
  let zbarBusy = false;
  function syncZoomBar() {
    if (zbarBusy || !fitS) return;
    const lo2 = fitS * 0.9, hi2 = fitS * 80;
    zbar.value = Math.round(1000 * Math.log(view.s / lo2) / Math.log(hi2 / lo2));
  }
  zbar.addEventListener('input', () => {
    const lo2 = fitS * 0.9, hi2 = fitS * 80;
    const target = lo2 * Math.pow(hi2 / lo2, +zbar.value / 1000);
    zbarBusy = true;
    zoomAt(innerWidth / 2, innerHeight / 2, target / view.s);
    zbarBusy = false;
  });

  function flyTo(lat, lng) {
    const [wx, wy] = project(lat, lng);
    const ts = Math.max(view.s, fitS * 2.1);
    const tx = innerWidth / 2 - wx * ts, ty = innerHeight * 0.44 - wy * ts;
    const from = { ...view };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      view = { x: tx, y: ty, s: ts }; applyView(); return;
    }
    const t0 = performance.now();
    (function step(t) {
      const k = Math.min(1, (t - t0) / 420), e2 = 1 - Math.pow(1 - k, 3);
      view.s = from.s + (ts - from.s) * e2;
      view.x = from.x + (tx - from.x) * e2;
      view.y = from.y + (ty - from.y) * e2;
      applyView();
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }

  // ================= recurrence expansion =================
  // returns instances sorted by date: {ev, venue, date, ongoing}
  function expand(t0, t1) {
    const out = [];
    for (const ev of events) {
      const venue = venues.get(ev._venueId);
      const push = (date, ongoing) => out.push({ ev, venue, date, ongoing: !!ongoing });
      if (ev.recurrence) {
        const r = ev.recurrence;
        const from = r.from ? parseISO(r.from) : null;
        const until = r.until ? parseISO(r.until) : null;
        const a = from && from > t0 ? from : t0;
        const b = until && until < t1 ? until : t1;
        if (a > b) continue;
        if (r.freq === 'weekly') {
          let d = addDays(a, (DOW[r.day] - a.getDay() + 7) % 7);
          for (; d <= b; d = addDays(d, 7)) push(d);
        } else if (r.freq === 'monthly') {
          for (let y = a.getFullYear(), m = a.getMonth(); ; ) {
            let d;
            if (r.week === -1) {
              d = new Date(y, m + 1, 0);                       // last day of month
              d = addDays(d, -((d.getDay() - DOW[r.day] + 7) % 7));
            } else {
              d = new Date(y, m, 1);
              d = addDays(d, (DOW[r.day] - d.getDay() + 7) % 7 + (r.week - 1) * 7);
              if (d.getMonth() !== m) d = null;                // 5th weekday overflow
            }
            if (d && d >= a && d <= b) push(d);
            if (++m > 11) { m = 0; y++; }
            if (new Date(y, m, 1) > b) break;
          }
        }
      } else if (ev.start) {
        const s = parseISO(ev.start), e = ev.end ? parseISO(ev.end) : s;
        if (e < t0 || s > t1) continue;
        if (s >= t0) push(s);
        else push(t0, true);                                   // already running as window opens
      }
    }
    out.sort((x, y) => x.date - y.date || (x.ongoing ? -1 : 0));
    return out;
  }

  const matchText = (inst) => {
    if (!query) return true;
    const v = inst.venue;
    const catWords = evCats(inst.ev).map((c) => (CATS[c] || {}).label || '').join(' ');
    const t = `${inst.ev.title} ${inst.ev.description || ''} ${catWords} ${v.name} ${v.village} ${v.type || ''} ${(v.tags || []).join(' ')}`.toLowerCase();
    return t.includes(query);
  };
  const visible = (inst) => activeKinds.has(kindGroup(inst.venue.kind)) &&
    (!sunOnly || sunnySpot(inst.venue)) &&
    evCats(inst.ev).some((c) => activeCats.has(c)) && matchText(inst);

  // ================= rendering =================
  function render() {
    const t0 = addDays(today, lo), t1 = addDays(today, hi);
    const all = expand(t0, t1);
    const shown = all.filter(visible);

    // --- markers ---
    const byVenue = new Map();
    for (const inst of shown) {
      if (!byVenue.has(inst.venue.id)) byVenue.set(inst.venue.id, []);
      byVenue.get(inst.venue.id).push(inst);
    }
    // with an event-type filter on, the map shows only the venues that answer it —
    // no point showing the Methodist church when someone asked for food deals
    const catFiltered = activeCats.size !== Object.keys(CATS).length;
    let mh = '';
    for (const v of venues.values()) {
      const g = kindGroup(v.kind);
      if (!activeKinds.has(g)) continue;
      const insts = byVenue.get(v.id);
      const has = insts && insts.length;
      if (sunOnly && !sunnySpot(v) && selected !== v.id) continue;
      if (catFiltered && !has && selected !== v.id) continue;
      const [x, y] = project(v.lat, v.lng);
      const sel = selected === v.id ? ' sel' : '';
      const dim = query && !has &&
        !`${v.name} ${v.village} ${v.type} ${(v.tags || []).join(' ')}`.toLowerCase().includes(query) ? ' dim' : '';
      mh += `<button class="pin${has ? ' has' : ''}${sel}${dim}" style="left:${x}px;top:${y}px;--pc:${KINDG[g].c}"
               data-v="${v.id}" title="${esc(v.name)}"
               aria-label="${esc(v.name)}${has ? `: ${insts.length} listing${insts.length > 1 ? 's' : ''}` : ''}">
               <span class="bub">${KIND_EMOJI[v.kind] || '📍'}${has ? `<i class="cnt">${insts.length}</i>` : ''}</span></button>`;
    }
    markersEl.innerHTML = mh;

    // --- list ---
    const listEl = $('list');
    let lh = '', lastKey = '', n = 0;
    for (const inst of shown) {
      if (n >= LIST_CAP) break;
      const key = inst.ongoing ? 'ongoing' : inst.date.toDateString();
      if (key !== lastKey) {
        lh += `<div class="day-h${!inst.ongoing && !dayDiff(inst.date, today) ? ' today' : ''}">${
          inst.ongoing ? 'Ongoing' : fmtHead(inst.date)}</div>`;
        lastKey = key;
      }
      const cat = CATS[inst.ev.category];
      const past = inst.date < today && !inst.ongoing;
      const end = inst.ev.end && inst.ev.start !== inst.ev.end ? ` → ${fmtShort(parseISO(inst.ev.end))}` : '';
      lh += `<button class="evt${past ? ' past' : ''}" style="--pc:${GROUPS[cat.group]}" data-v="${inst.venue.id}" role="listitem">
        <span class="ico">${cat.emoji}</span>
        <span><span class="t">${esc(inst.ev.title)}</span>${inst.ev.demo ? '<span class="demo-tag">example</span>' : ''}<br>
          <span class="w">${esc(inst.venue.name)}${inst.ev.time ? ' · ' + esc(inst.ev.time) : ''}${end}${past ? ' · past' : ''}</span>
          ${inst.ev.offer ? `<br><span class="offer">${esc(inst.ev.offer)}</span>` : ''}${inst.ev.voucher ? `<span class="vouch">🎟 ${esc(inst.ev.voucher)}</span>` : ''}</span></button>`;
      n++;
    }
    if (shown.length > LIST_CAP) lh += `<p id="more">…and ${shown.length - LIST_CAP} more — narrow the dates to see them all</p>`;
    const defaultState = activeKinds.size === Object.keys(KINDG).length &&
                         activeCats.size === Object.keys(CATS).length && !query && !sunOnly;
    if (!shown.length) {
      if (sunOnly) {
        // no events needed — with this one, the pins themselves are the answer
        const n = [...venues.values()].filter(sunnySpot).length;
        lh = `<p id="more">☀️ The map is showing all ${n} spots with outdoor tables —
          daylight over the valley till about ${fmtHM(sunTimes(new Date()).set)}.
          Tap a pin and pick your sun trap.<br>
          <button class="linkish" data-clearf>✕ show everything</button></p>`;
      } else if (!defaultState) {
        // never blame the data when it's the filters — and never dead-end
        const nxt = expand(addDays(t1, 1), addDays(t1, 14)).filter(visible)[0];
        lh = `<p id="more">Nothing matches these filters for ${fmtShort(t0)} – ${fmtShort(t1)}.` +
          (nxt ? `<br>Nearest: <b>${esc(nxt.ev.title)}</b> at ${esc(nxt.venue.name)} · ${fmtShort(nxt.date)}.<br>
            <button class="linkish" data-jump="${dayDiff(nxt.date, today)}">Show it</button> · ` : '<br>') +
          `<button class="linkish" data-clearf>✕ show everything</button></p>`;
      } else {
        lh = `<p id="more">Nothing listed for these dates yet. This map is community-run —
          venue owners tap their pin and add events, offers and voucher codes, free.</p>`;
      }
    }
    listEl.innerHTML = lh;
    const jb = listEl.querySelector('[data-jump]');
    if (jb) jb.onclick = () => setWindow(lo, +jb.dataset.jump);
    const cf = listEl.querySelector('[data-clearf]');
    if (cf) cf.onclick = resetFilters;

    // scenario chips light up whenever the state matches, however it was reached
    const scen = scenActiveKey();
    for (const el of document.querySelectorAll('.scen')) el.classList.toggle('on', el.dataset.s === scen);
    // per-row ✕ clears on the filter chips themselves
    $('chips-clear').hidden = activeKinds.size === Object.keys(KINDG).length;
    $('cats-clear').hidden = activeCats.size === Object.keys(CATS).length;
    // the "showing" banner: filter state must never be invisible
    const showingEl = $('showing');
    if (defaultState) {
      showingEl.style.display = 'none';
      showingEl.innerHTML = '';
    } else {
      let desc;
      if (scen) desc = SCEN[scen].label;
      else {
        const parts = [];
        if (sunOnly) parts.push('☀️ outdoor tables');
        if (activeCats.size !== Object.keys(CATS).length) parts.push([...activeCats].map((c) => CATS[c].label).join(' + '));
        if (activeKinds.size !== Object.keys(KINDG).length) parts.push([...activeKinds].map((g) => KINDG[g].label).join(' + '));
        if (query) parts.push('“' + esc(query) + '”');
        desc = parts.join(' · ');
        if (desc.length > 80) desc = 'your filters';
      }
      showingEl.style.display = '';
      showingEl.innerHTML = `Showing: <b>${desc}</b><button title="Clear filters">✕ show everything</button>`;
      showingEl.querySelector('button').onclick = resetFilters;
    }
    const nv = byVenue.size;
    $('count').textContent = `${shown.length} listing${shown.length === 1 ? '' : 's'} at ${nv} venue${nv === 1 ? '' : 's'} · ${fmtShort(t0)} – ${fmtShort(t1)}`;
    syncFilterBtn();

    if (selected) renderVenue(selected, false);
  }

  // ================= venue card =================
  function renderVenue(id, fly) {
    const v = venues.get(id);
    if (!v) return;
    selected = id;
    for (const p of markersEl.querySelectorAll('.pin')) p.classList.toggle('sel', p.dataset.v === id);
    for (const r of basemap.querySelectorAll('.route')) r.classList.toggle('sel', r.dataset.w === id);

    const t0 = addDays(today, lo), t1 = addDays(today, hi);
    const insts = expand(t0, t1).filter((i) => i.venue.id === id);
    const groupC = KINDG[kindGroup(v.kind)].c;

    let hh = `<div class="photo" style="--pc:${groupC}">`;
    if (v.photo) hh += `<img src="${esc(v.photo)}" alt="${esc(v.name)}">`;
    else hh += `<span class="ph-emoji">${KIND_EMOJI[v.kind] || '📍'}</span>
                <span class="ph-hint">📷 your photo here — free for local venues</span>`;
    hh += `<button class="close" aria-label="Close">✕</button></div><div class="body">`;
    hh += `<h2>${esc(v.name)}</h2><div class="meta">
      <span class="mchip kind" style="--pc:${groupC}">${esc(v.type)}</span>
      <span class="mchip">📍 ${esc(v.village)}</span>
      ${claimed.has(v.id) ? '<span class="mchip" style="color:var(--green);font-weight:600">✓ Verified</span>' : ''}</div>`;
    if (v.walk) {
      hh += `<div class="meta"><span class="mchip kind" style="--pc:${WALK_C}">🥾 ${esc(v.walk.km)} km</span>
        <span class="mchip">⏱ ${esc(v.walk.time)}</span><span class="mchip">${esc(v.walk.grade)}</span></div>`;
    }
    if (!['walk', 'sight', 'spot'].includes(v.kind)) {
      const rt = ratings[v.id];
      const mine = +localStorage.getItem('rated:' + v.id) || 0;
      hh += `<div class="rate-row"><span class="stars">${[1, 2, 3, 4, 5].map((i) =>
        `<button data-star="${i}" class="${i <= mine ? 'on' : ''}" aria-label="Rate ${i} star${i > 1 ? 's' : ''}" title="Rate ${i}/5">★</button>`).join('')}</span>
        <span class="avg">${rt ? `★ ${rt.avg.toFixed(1)} · ${rt.count} rating${rt.count > 1 ? 's' : ''}` : 'Be the first to rate it'}</span></div>`;
    }
    if (v.blurb) hh += `<p class="blurb">${esc(v.blurb)}</p>`;
    if (v.tags && v.tags.length) hh += `<div class="meta">${v.tags.map((t) => `<span class="mchip">${esc(t)}</span>`).join('')}</div>`;
    // outdoor-seating venues get today's daylight window (shade is the garden's own secret)
    if (sunnySpot(v)) {
      hh += `<p class="sun-note">☀️ Outdoor tables here — daylight over the valley till about ${fmtHM(sunTimes(new Date()).set)} today</p>`;
    }
    if (v.address) hh += `<p class="addr">${esc(v.address)}</p>`;
    if (v.hours) {
      const DAYN = { Mo: 'Mon', Tu: 'Tue', We: 'Wed', Th: 'Thu', Fr: 'Fri', Sa: 'Sat', Su: 'Sun', PH: 'bank hols' };
      const pretty = esc(v.hours).replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (m) => DAYN[m] || m)
        .replace(/\boff\b/g, 'closed').split(/;\s*/).join('<br>');
      hh += `<p class="hours">${pretty}</p>`;
    }
    const L = v.links || {};
    const links = [];
    if (v.menu) links.push(`<a href="#" data-menu="1">📖 Menu</a>`);
    if (L.website) links.push(`<a href="${esc(L.website)}" target="_blank" rel="noopener">Website ↗</a>`);
    if (L.facebook) links.push(`<a href="${esc(L.facebook)}" target="_blank" rel="noopener">Facebook ↗</a>`);
    if (L.instagram) links.push(`<a href="${esc(L.instagram)}" target="_blank" rel="noopener">Instagram ↗</a>`);
    if (L.phone) links.push(`<a href="tel:${esc(L.phone)}">☎ ${esc(L.phone)}</a>`);
    if (links.length) hh += `<div class="links">${links.join('')}</div>`;

    hh += `<h3>What's on here</h3>`;
    if (!insts.length) {
      hh += v.kind === 'walk'
        ? `<p class="none">No guided events listed — this one's self-service, any day you fancy.</p>`
        : `<p class="none">Nothing listed between ${fmtShort(t0)} and ${fmtShort(t1)} — widen the dates, or nudge them to list something.</p>`;
    } else {
      const rated = new Set();   // one rating row per event, not per repeat
      for (const inst of insts.slice(0, 40)) {
        const past = inst.date < today && !inst.ongoing;
        const end = inst.ev.end && inst.ev.start !== inst.ev.end ? ` → ${fmtShort(parseISO(inst.ev.end))}` : '';
        let rateRow = '';
        if (!rated.has(inst.ev.id)) {
          rated.add(inst.ev.id);
          const er = eventRatings[inst.ev.id];
          const mineE = +localStorage.getItem('rated:' + inst.ev.id) || 0;
          rateRow = `<div class="rate-row sm"><span class="stars">${[1, 2, 3, 4, 5].map((i) =>
            `<button data-star="${i}" data-event="${esc(inst.ev.id)}" class="${i <= mineE ? 'on' : ''}"
               aria-label="Rate this event ${i}/5" title="Rate ${i}/5">★</button>`).join('')}</span>
            <span class="avg">${er ? `${er.avg.toFixed(1)} · ${er.count}` : 'Rate it'}</span></div>`;
        }
        hh += `<div class="vevt${past ? ' past' : ''}">
          <div class="d">${inst.ongoing ? 'ongoing' : fmtShort(inst.date)}${end}${inst.ev.recurrence ? ' · ' + (inst.ev.recurrence.freq === 'weekly' ? 'weekly' : 'monthly') : ''}</div>
          <div class="t">${evCats(inst.ev).map((c) => (CATS[c] || {}).emoji || '').join('')} ${esc(inst.ev.title)}${inst.ev.demo ? '<span class="demo-tag">example</span>' : ''}</div>
          ${inst.ev.time ? `<div class="x">${esc(inst.ev.time)}</div>` : ''}
          ${inst.ev.description ? `<div class="x">${esc(inst.ev.description)}</div>` : ''}
          ${inst.ev.offer ? `<span class="offer">${esc(inst.ev.offer)}</span>` : ''}${inst.ev.voucher ? `<span class="vouch">🎟 ${esc(inst.ev.voucher)}</span>` : ''}
          ${rateRow}</div>`;
      }
    }
    hh += `<button class="claim" data-manage>＋ Add an event or offer here — free, no sign-up</button>`;
    hh += `</div>`;

    const panel = $('venue');
    panel.innerHTML = hh;
    panel.classList.add('open');
    panel.scrollTop = 0;
    panel.querySelector('.close').onclick = closeVenue;
    const mb = panel.querySelector('[data-menu]');
    if (mb) mb.onclick = (e) => { e.preventDefault(); openMenu(v); };
    const mg = panel.querySelector('[data-manage]');
    if (mg) mg.onclick = () => openManage(v);
    for (const b of panel.querySelectorAll('[data-star]')) {
      b.onclick = () => rate(v, +b.dataset.star, b.dataset.event);
    }
    if (fly) {
      flyTo(v.lat, v.lng);
      if (innerWidth <= 760) document.body.classList.remove('side-open');
    }
  }
  function closeVenue() {
    selected = null;
    $('venue').classList.remove('open');
    for (const p of markersEl.querySelectorAll('.pin.sel')) p.classList.remove('sel');
    for (const r of basemap.querySelectorAll('.route.sel')) r.classList.remove('sel');
  }

  // ================= the menu overlay =================
  function openMenu(v) {
    let mh = `<button class="close" aria-label="Close menu">✕</button>
      <h2>${esc(v.name)}</h2><p class="mn-sub">${esc(v.village)}, Saddleworth</p>
      ${v.menu.note ? `<p class="mn-note">${esc(v.menu.note)}</p>` : ''}<hr class="rule">`;
    for (const sec of v.menu.sections) {
      mh += `<h3>${esc(sec.name)}</h3>`;
      for (const it of sec.items) {
        mh += `<div class="dish"><div class="row"><span class="n">${esc(it.name)}</span>
          <span class="dots"></span><span class="p">${esc(it.price)}</span></div>
          ${it.desc ? `<div class="desc">${esc(it.desc)}</div>` : ''}</div>`;
      }
    }
    $('menu').innerHTML = mh;
    $('menu-back').classList.add('open');
    $('menu').querySelector('.close').onclick = closeMenu;
    $('menu').querySelector('.close').focus();
  }
  function closeMenu() { $('menu-back').classList.remove('open'); }
  $('menu-back').addEventListener('click', (e) => { if (e.target.id === 'menu-back') closeMenu(); });
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.body.classList.contains('placing')) {
      placing = null;
      document.body.classList.remove('placing');
    } else if ($('form-back').classList.contains('open')) $('form-back').classList.remove('open');
    else if ($('menu-back').classList.contains('open')) closeMenu();
    else if ($('venue').classList.contains('open')) closeVenue();
  });

  // clicks on pins & list rows (delegated; ignore drag-clicks)
  markersEl.addEventListener('click', (e) => {
    if (moved > 6) return;
    const pin = e.target.closest('.pin');
    if (pin) renderVenue(pin.dataset.v, true);
  });
  $('list').addEventListener('click', (e) => {
    const row = e.target.closest('.evt');
    if (row) renderVenue(row.dataset.v, true);
  });

  // ================= time window =================
  const loEl = $('lo'), hiEl = $('hi');
  function setWindow(a, b, fromSlider) {
    lo = Math.max(-365, Math.min(365, a));
    hi = Math.max(lo, Math.min(365, b));
    if (!fromSlider) { loEl.value = lo; hiEl.value = hi; }
    const pct = (d) => ((d + 365) / 730) * 100;
    $('fill').style.left = pct(lo) + '%';
    $('fill').style.width = Math.max(0.5, pct(hi) - pct(lo)) + '%';
    $('d-lo').textContent = fmtFull(addDays(today, lo));
    $('d-hi').textContent = fmtFull(addDays(today, hi));
    const span = hi - lo + 1;
    $('d-mid').textContent = span === 1 ? 'one day' : `${span} days`;
    for (const b2 of $('presets').children) {
      b2.classList.toggle('on', +b2.dataset.lo === lo && +b2.dataset.hi === hi);
    }
    render();
  }
  loEl.addEventListener('input', () => {
    let a = +loEl.value, b = +hiEl.value;
    if (a > b) { b = a; hiEl.value = b; }
    setWindow(a, b, true);
  });
  hiEl.addEventListener('input', () => {
    let a = +loEl.value, b = +hiEl.value;
    if (b < a) { a = b; loEl.value = a; }
    setWindow(a, b, true);
  });
  $('back').onclick = () => { const w = hi - lo; setWindow(lo - (w || 1), hi - (w || 1)); };
  $('fwd').onclick = () => { const w = hi - lo; setWindow(lo + (w || 1), hi + (w || 1)); };

  const dow = today.getDay();
  const satOff = dow === 0 ? 0 : 6 - dow;
  const PRESETS = [
    ['Today', 0, 0],
    ['Tomorrow', 1, 1],
    ['This week', 0, 6],
    ['Weekend', satOff, dow === 0 ? 0 : satOff + 1],
    ['This month', 0, 29],
    ['3 months', 0, 89],
  ];
  $('presets').innerHTML = PRESETS.map(([l, a, b]) =>
    `<button data-lo="${a}" data-hi="${b}">${l}</button>`).join('');
  $('presets').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setWindow(+b.dataset.lo, +b.dataset.hi);
  });

  // ================= filters =================
  $('chips').innerHTML = Object.entries(KINDG).map(([k, g]) =>
    `<button class="chip" style="--pc:${g.c}" data-c="${k}" aria-pressed="true">
       <i></i>${g.emoji} ${g.label}</button>`).join('') +
    `<button class="chip-clear" id="chips-clear" hidden title="Show all places">✕ clear</button>`;
  $('chips-clear').onclick = () => {
    activeKinds = new Set(Object.keys(KINDG));
    syncPressed();
    render();
  };
  $('chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    const k = b.dataset.c;
    if (activeKinds.has(k) && activeKinds.size === Object.keys(KINDG).length) {
      activeKinds = new Set([k]);           // first click: focus just this one
    } else if (activeKinds.has(k)) {
      activeKinds.delete(k);
      if (!activeKinds.size) activeKinds = new Set(Object.keys(KINDG));
    } else activeKinds.add(k);
    for (const c of $('chips').children) c.setAttribute('aria-pressed', activeKinds.has(c.dataset.c));
    render();
  });
  $('cat-chips').innerHTML = Object.entries(CATS).map(([k, c]) =>
    `<button class="chip" style="--pc:${GROUPS[c.group]}" data-c="${k}" aria-pressed="true">
       <i></i>${c.emoji} ${c.label}</button>`).join('') +
    `<button class="chip-clear" id="cats-clear" hidden title="Show all kinds of event">✕ clear</button>`;
  $('cats-clear').onclick = () => {
    activeCats = new Set(Object.keys(CATS));
    syncPressed();
    render();
  };
  $('cat-chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    const k = b.dataset.c;
    if (activeCats.has(k) && activeCats.size === Object.keys(CATS).length) {
      activeCats = new Set([k]);            // first click: focus just this one
    } else if (activeCats.has(k)) {
      activeCats.delete(k);
      if (!activeCats.size) activeCats = new Set(Object.keys(CATS));
    } else activeCats.add(k);
    for (const c of $('cat-chips').children) c.setAttribute('aria-pressed', activeCats.has(c.dataset.c));
    render();
  });

  let qT;
  $('q').addEventListener('input', (e) => {
    clearTimeout(qT);
    qT = setTimeout(() => { query = e.target.value.trim().toLowerCase(); render(); }, 120);
  });

  // ---- one-tap scenarios: the user's question, answered in their own words.
  // Each sets dates + category/place filters together (and clears the rest).
  const SCEN = {
    food:  { label: '🍔 Food & deals tonight',    cats: ['food', 'offer'], lo: 0, hi: 0 },
    music: { label: '🎵 Live music this weekend', cats: ['music'], lo: satOff, hi: dow === 0 ? 0 : satOff + 1 },
    quiz:  { label: '❓ Quiz nights this week',   cats: ['quiz'], lo: 0, hi: 6 },
    laughs: { label: '😂 Something for laughs',   cats: ['ent'], lo: 0, hi: 6 },
    kids:  { label: '🧒 For kids & families',     cats: ['kids'], lo: 0, hi: 6 },
    walk:  { label: '🥾 A walk today',            kinds: ['out'], lo: 0, hi: 0 },
    // only offered while the sun is actually out — see syncSunChip()
    sun:   { label: '☀️ A drink in the sun',      sun: true, lo: 0, hi: 0 },
  };
  function syncPressed() {
    for (const c of $('chips').children) c.setAttribute('aria-pressed', activeKinds.has(c.dataset.c));
    for (const c of $('cat-chips').children) c.setAttribute('aria-pressed', activeCats.has(c.dataset.c));
  }
  function scenActiveKey() {
    if (query) return null;
    for (const [k, s] of Object.entries(SCEN)) {
      const kinds = s.kinds || Object.keys(KINDG), cats = s.cats || Object.keys(CATS);
      if (lo === s.lo && hi === s.hi && !!s.sun === sunOnly &&
          activeKinds.size === kinds.length && kinds.every((x) => activeKinds.has(x)) &&
          activeCats.size === cats.length && cats.every((x) => activeCats.has(x))) return k;
    }
    return null;
  }
  function applyScenario(k) {
    const s = SCEN[k];
    const again = s && scenActiveKey() === k;   // tapping the active one turns it off
    query = ''; $('q').value = '';
    if (!s || again) {
      activeKinds = new Set(Object.keys(KINDG));
      activeCats = new Set(Object.keys(CATS));
      sunOnly = false;
      syncPressed();
      setWindow(0, 6);
      return;
    }
    activeKinds = new Set(s.kinds || Object.keys(KINDG));
    activeCats = new Set(s.cats || Object.keys(CATS));
    sunOnly = !!s.sun;
    syncPressed();
    setWindow(s.lo, s.hi);
  }
  const resetFilters = () => applyScenario(null);
  const scenHTML = Object.entries(SCEN).map(([k, s]) =>
    `<button class="scen" data-s="${k}"${s.sun ? ' hidden' : ''}>${s.label}</button>`).join('');
  for (const holder of [$('scen-side'), $('scen-float')]) {
    holder.innerHTML = scenHTML;
    holder.addEventListener('click', (e) => {
      const b = e.target.closest('.scen');
      if (b) applyScenario(b.dataset.s);
    });
  }
  // little arrows on the mobile chip row, so the overflow is discoverable
  const scenF = $('scen-float'), scenL = $('scen-l'), scenR = $('scen-r');
  function updScenArrows() {
    scenL.disabled = scenF.scrollLeft <= 4;
    scenR.disabled = scenF.scrollLeft >= scenF.scrollWidth - scenF.clientWidth - 4;
  }
  scenL.onclick = () => scenF.scrollBy({ left: -170, behavior: 'smooth' });
  scenR.onclick = () => scenF.scrollBy({ left: 170, behavior: 'smooth' });
  scenF.addEventListener('scroll', updScenArrows, { passive: true });
  addEventListener('resize', updScenArrows);
  updScenArrows();

  $('filter-btn').onclick = () => {
    const open = !$('filters').classList.toggle('collapsed');
    $('filter-btn').classList.toggle('open', open);
    $('filter-btn').setAttribute('aria-expanded', open);
  };
  function syncFilterBtn() {
    const filtered = activeKinds.size !== Object.keys(KINDG).length ||
                     activeCats.size !== Object.keys(CATS).length;
    $('filter-btn').classList.toggle('active', filtered);
  }

  $('side-toggle').onclick = () => {
    const open = document.body.classList.toggle('side-open');
    $('side-toggle').setAttribute('aria-expanded', open);
  };
  $('side-head').addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const min = document.body.classList.toggle('side-min');
    $('side-mini').textContent = min ? '▸' : '▾';
    $('side-mini').setAttribute('aria-label', min ? 'Expand panel' : 'Minimise panel');
  });

  // ================= day & night over the valley =================
  // Real sun times for Saddleworth (simple solar geometry, ±15 min is plenty)
  function sunTimes(d) {
    const lat = 53.55 * Math.PI / 180;
    const N = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
    const decl = (23.44 * Math.PI / 180) * Math.sin(2 * Math.PI * (284 + N) / 365);
    const cosH = -Math.tan(lat) * Math.tan(decl);
    const H = Math.acos(Math.min(1, Math.max(-1, cosH))) * 180 / Math.PI / 15;
    const noonUTC = 12 - (-2.01 / 15);
    const off = -d.getTimezoneOffset() / 60;
    return { rise: (noonUTC - H + off) * 60, set: (noonUTC + H + off) * 60 };
  }
  function updateDayNight() {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const { rise, set } = sunTimes(now);
    let mode = '';
    if (mins < rise - 40 || mins > set + 40) mode = 'night';
    else if (mins < rise + 20 || mins > set - 25) mode = 'dusk';
    // 12 Aug 2026: the partial solar eclipse dims the valley, ~18:10–20:05
    if (now.getFullYear() === 2026 && now.getMonth() === 7 && now.getDate() === 12 &&
        mins >= 1090 && mins <= 1205) mode = 'eclipse';
    if (location.hash === '#night') mode = 'night';       // preview hooks
    if (location.hash === '#dusk') mode = 'dusk';
    if (location.hash === '#eclipse') mode = 'eclipse';
    for (const m of ['night', 'dusk', 'eclipse']) basemap.classList.toggle(m, mode === m);
    // 28 Aug 2026, small hours: the partial lunar eclipse coppers the moon
    const blood = (now.getFullYear() === 2026 && now.getMonth() === 7 && now.getDate() === 28 &&
                   mins >= 180 && mins <= 390 && mode === 'night') || location.hash === '#bloodmoon';
    if (location.hash === '#bloodmoon') basemap.classList.add('night');
    basemap.classList.toggle('blood', blood);
    syncSunChip();               // the chip retires itself at dusk
  }
  setInterval(updateDayNight, 60000);

  // ================= live weather =================
  // Real conditions over the valley (Open-Meteo, no key, 15-min refresh) drive
  // rain / snow / storm / fog overlays. Preview: #rain #downpour #snow #storm #fog.
  const weatherEl = $('weather');
  let stormTimer = null;
  let wxCode = null;           // latest Open-Meteo weather code (null until first fetch)
  function setWeather(eff) {
    weatherEl.className = eff;
    if (eff.includes('storm') && !stormTimer) {
      const zap = weatherEl.querySelector('.zap');
      const clouds = weatherEl.querySelectorAll('.scloud');
      const bolt = () => {
        zap.classList.remove('on'); void zap.offsetWidth; zap.classList.add('on');
        const c = clouds[Math.floor(Math.random() * clouds.length)];
        c.classList.remove('strike'); void c.offsetWidth; c.classList.add('strike');
        stormTimer = setTimeout(bolt, 4000 + Math.random() * 11000);
      };
      stormTimer = setTimeout(bolt, 2000 + Math.random() * 5000);
    } else if (!eff.includes('storm') && stormTimer) {
      clearTimeout(stormTimer); stormTimer = null;
      weatherEl.querySelector('.zap').classList.remove('on');
    }
  }
  function effectFor(code) {
    if ([95, 96, 99].includes(code)) return 'storm heavy';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if ([65, 67, 82].includes(code)) return 'rain heavy';
    if ((code >= 51 && code <= 64) || [66, 80, 81].includes(code)) return 'rain';
    if (code === 45 || code === 48) return 'fog';
    return '';
  }
  async function updateWeather() {
    const preview = { '#rain': 61, '#downpour': 65, '#snow': 73, '#storm': 95, '#fog': 45, '#sun': 0 }[location.hash];
    if (preview !== undefined) { wxCode = preview; setWeather(effectFor(preview)); syncSunChip(); return; }
    try {
      const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=53.55&longitude=-2.005' +
        '&current=weather_code&timezone=Europe%2FLondon');
      const j = await r.json();
      wxCode = j.current.weather_code;
      setWeather(effectFor(wxCode));
    } catch { /* the sky abides — never break the map over a weather fetch */ }
    syncSunChip();
  }
  // "A drink in the sun" is only on offer while it's genuinely sunny out there:
  // clear-ish sky (Open-Meteo code 0/1/2) and the sun up until ~45 min before set.
  // #sun previews it regardless of the clock.
  function sunChipOn() {
    if (location.hash === '#sun') return true;
    if (![0, 1, 2].includes(wxCode)) return false;
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const { rise, set } = sunTimes(now);
    return mins >= rise && mins <= set - 45;
  }
  function syncSunChip() {
    for (const el of document.querySelectorAll('.scen[data-s="sun"]')) el.hidden = !sunChipOn();
    updScenArrows();             // the row's width just changed
  }
  setInterval(updateWeather, 15 * 60 * 1000);
  updateWeather();
  addEventListener('hashchange', () => { updateDayNight(); updateWeather(); });

  // ================= community: live events, submissions, ratings =================
  async function loadCommunity() {
    try {
      const [ev, vn, pool] = await Promise.all([
        api('events'), api('venues'), api('pool').catch(() => ({ events: [] })),
      ]);
      for (const [id, v] of [...venues]) if (v.community) venues.delete(id);
      events = events.filter((e) => !e.community);
      for (const v of (vn.venues || [])) {
        venues.set(v.id, { tags: [], links: {}, type: v.type || 'Local business', community: true, ...v });
      }
      ratings = vn.ratings || {};
      eventRatings = vn.eventRatings || {};
      claimed = new Set(vn.claimed || []);
      for (const e of (ev.events || [])) {
        // community walks & outdoor events carry their own map spot
        if (e.spot && !venues.has(e.venueId)) {
          venues.set(e.venueId, {
            id: e.venueId, name: e.spot.name,
            type: e.spot.kind === 'walk' ? 'Organised walk' : 'Out & about',
            kind: e.spot.kind || 'spot', village: 'Saddleworth',
            lat: e.spot.lat, lng: e.spot.lng, tags: [], links: {}, community: true,
          });
        }
        if (!venues.has(e.venueId)) continue;
        events.push({ ...e, business: e.venueId, _venueId: e.venueId, community: true });
      }
      for (const e of (pool.events || [])) {
        if (!venues.has(e.venueId)) continue;
        events.push({ ...e, business: e.venueId, _venueId: e.venueId, community: true });
      }
      render();
    } catch { /* static-only hosting (no API) — the map still works */ }
  }

  async function rate(v, stars, eventId) {
    try {
      await api('rate', { venueId: v.id, stars, client: cid, ...(eventId ? { eventId } : {}) });
      localStorage.setItem('rated:' + (eventId || v.id), stars);
      await loadCommunity();
      renderVenue(v.id, false);
    } catch (e) { alert(e.message); }
  }

  // ---- one shared form overlay ----
  const formBack = $('form-back'), formEl = $('form');
  function openForm(html) {
    formEl.innerHTML = `<button class="close" aria-label="Close">✕</button>` + html;
    formEl.querySelector('.close').onclick = closeForm;
    formBack.classList.add('open');
    formEl.scrollTop = 0;
  }
  function closeForm() { formBack.classList.remove('open'); }
  formBack.addEventListener('click', (e) => { if (e.target === formBack) closeForm(); });

  const DAY_OPTS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'],
                    ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
  const daySelect = (id) => `<select id="${id}">${DAY_OPTS.map(([v2, l]) => `<option value="${v2}">${l}</option>`).join('')}</select>`;

  // ---- open community listings: anyone can add / edit / delete their own.
  // A venue that has claimed its pin is "verified": its listings need its code.
  function openManage(v) {
    const isClaimed = claimed.has(v.id);
    openForm(`<h2>${esc(v.name)}</h2>
      ${isClaimed
        ? `<p class="fsub">✓ This venue manages its own listings. Enter its code to add or change them.</p>
           <label>Venue code</label><input id="f-vcode" placeholder="XXXX-XXXX" autocomplete="off"
             value="${esc(localStorage.getItem('code:' + v.id) || '')}">`
        : `<p class="fsub">Anyone can add what's on here — landlords, bands, quiz hosts, regulars.
           Listings go live straight away; you can edit or delete the ones added from this
           device. Fields marked * are required.</p>`}
      <label>What's happening? *</label><input id="f-title" maxlength="80" placeholder="e.g. Quiz Night, 2-for-1 Pizza, Live Music">
      <label>Type * <span class="lab-soft">— tick all that fit, e.g. Food &amp; drink + Offers</span></label>
      <div class="fcats" id="f-cats">${Object.entries(CATS).map(([k, c]) =>
        `<button type="button" class="fcat" data-k="${k}" aria-pressed="false">${c.emoji} ${c.label}</button>`).join('')}</div>
      <label>When *</label><select id="f-when">
        <option value="once">A date (or a date range)</option>
        <option value="weekly">Every week</option>
        <option value="monthly">Every month</option></select>
      <div id="f-once" class="row2"><div><label>Date *</label><input type="date" id="f-start"></div>
        <div><label>Last day (optional)</label><input type="date" id="f-end"></div></div>
      <div id="f-weekly" class="row2" style="display:none"><div><label>Day *</label>${daySelect('f-day')}</div>
        <div><label>Until (optional)</label><input type="date" id="f-until"></div></div>
      <div id="f-monthly" class="row2" style="display:none"><div><label>Which week *</label>
        <select id="f-week"><option value="1">First</option><option value="2">Second</option>
        <option value="3">Third</option><option value="4">Fourth</option><option value="-1">Last</option></select></div>
        <div><label>Day *</label>${daySelect('f-mday')}</div></div>
      <label>Time (as you'd say it)</label><input id="f-time" maxlength="40" placeholder="e.g. 20:00 · or 12–4pm">
      <label>Description</label><textarea id="f-desc" maxlength="500" placeholder="A sentence or two."></textarea>
      <div class="row2"><div><label>Price / offer</label><input id="f-offer" maxlength="60" placeholder="e.g. 2 courses £18"></div>
        <div><label>Voucher code</label><input id="f-voucher" maxlength="24" placeholder="e.g. SADD10"></div></div>
      <input type="hidden" id="f-id">
      <button class="btn-p" id="f-save">Publish listing</button>
      <p class="err" id="f-err"></p><p class="okmsg" id="f-ok"></p>
      <div class="mine"><b style="font-size:12px">Listings you've added here</b><div id="f-mine"></div></div>`);

    $('f-when').onchange = () => {
      const w = $('f-when').value;
      $('f-once').style.display = w === 'once' ? '' : 'none';
      $('f-weekly').style.display = w === 'weekly' ? '' : 'none';
      $('f-monthly').style.display = w === 'monthly' ? '' : 'none';
    };
    const catBtns = [...$('f-cats').querySelectorAll('.fcat')];
    for (const b of catBtns) {
      b.onclick = () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true');
    }
    const pickedCats = () => catBtns.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.k);
    const setCats = (cats) => catBtns.forEach((b) => b.setAttribute('aria-pressed', String(cats.includes(b.dataset.k))));
    const vcode = () => {
      const el = document.getElementById('f-vcode');
      if (el && el.value.trim()) localStorage.setItem('code:' + v.id, el.value.trim());
      return el ? el.value.trim() : undefined;
    };
    const refreshMine = () => {
      const mine = events.filter((e2) => e2.community && !e2.pool && e2._venueId === v.id &&
        (isClaimed || e2.owner === myOwner));
      $('f-mine').innerHTML = mine.length ? mine.map((e2) => `<div class="me"><span>${esc(e2.title)}${
        e2.recurrence ? ' · ' + (e2.recurrence.freq === 'weekly' ? 'weekly' : 'monthly') : e2.start ? ' · ' + e2.start : ''
      }</span><span><button data-edit="${e2.id}">Edit</button> <button data-del="${e2.id}">Delete</button></span></div>`).join('')
        : `<p class="fsub" style="margin-top:6px">Nothing yet — your first listing is one form away.</p>`;
      for (const b of $('f-mine').querySelectorAll('[data-del]')) {
        b.onclick = async () => {
          try {
            await api('events/delete', { venueId: v.id, id: b.dataset.del, client: cid }, vcode());
            await loadCommunity(); refreshMine();
          } catch (e3) { $('f-err').textContent = e3.message; }
        };
      }
      for (const b of $('f-mine').querySelectorAll('[data-edit]')) {
        b.onclick = () => {
          const e2 = events.find((x) => x.id === b.dataset.edit);
          if (!e2) return;
          $('f-id').value = e2.id; $('f-title').value = e2.title; setCats(evCats(e2));
          $('f-time').value = e2.time || ''; $('f-desc').value = e2.description || '';
          $('f-offer').value = e2.offer || ''; $('f-voucher').value = e2.voucher || '';
          if (e2.recurrence && e2.recurrence.freq === 'weekly') {
            $('f-when').value = 'weekly'; $('f-day').value = e2.recurrence.day; $('f-until').value = e2.recurrence.until || '';
          } else if (e2.recurrence) {
            $('f-when').value = 'monthly'; $('f-week').value = e2.recurrence.week; $('f-mday').value = e2.recurrence.day;
          } else {
            $('f-when').value = 'once'; $('f-start').value = e2.start || ''; $('f-end').value = e2.end || '';
          }
          $('f-when').onchange();
          $('f-ok').textContent = 'Editing "' + e2.title + '" — publish to save changes.';
        };
      }
    };
    refreshMine();

    $('f-save').onclick = async () => {
      $('f-err').textContent = ''; $('f-ok').textContent = '';
      const cats = pickedCats();
      if (!cats.length) { $('f-err').textContent = 'Tick at least one type for the listing.'; return; }
      const w = $('f-when').value;
      const event = {
        id: $('f-id').value || undefined,
        title: $('f-title').value, category: cats[0],
        categories: cats.length > 1 ? cats : undefined,
        time: $('f-time').value, description: $('f-desc').value,
        offer: $('f-offer').value, voucher: $('f-voucher').value,
      };
      if (w === 'once') { event.start = $('f-start').value; event.end = $('f-end').value || undefined; }
      else if (w === 'weekly') { event.recurrence = { freq: 'weekly', day: $('f-day').value, until: $('f-until').value || undefined }; }
      else { event.recurrence = { freq: 'monthly', week: +$('f-week').value, day: $('f-mday').value }; }
      try {
        await api('events/submit', { venueId: v.id, client: cid, event }, vcode());
        await loadCommunity();
        refreshMine();
        $('f-id').value = ''; $('f-title').value = ''; $('f-desc').value = '';
        $('f-offer').value = ''; $('f-voucher').value = ''; $('f-time').value = '';
        setCats([]);
        $('f-ok').textContent = 'Published — it\'s live on the map.';
      } catch (e2) { $('f-err').textContent = e2.message; }
    };
  }

  // ---- anyone can propose a missing business (moderated) ----
  function openAddBusiness(draft) {
    const b = draft || {};
    const KIND_OPTS = [['pub', '🍻 Pub or bar'], ['cafe', '☕ Café or ice cream'], ['restaurant', '🍽️ Restaurant'],
      ['takeaway', '🍟 Takeaway'], ['shop', '🥖 Bakery, deli or food shop'], ['hall', '🎭 Hall, theatre or venue'], ['attraction', '🏛️ Attraction'],
      ['club', '🎺 Club'], ['sport', '🎾 Sports club']];
    const VILLAGES = ['Uppermill', 'Delph', 'Dobcross', 'Diggle', 'Greenfield', 'Grasscroft', 'Lydgate',
      'Scouthead', 'Denshaw', 'Friezland', 'Springhead', 'Grotton', 'Austerlands', 'Strinesdale'];
    openForm(`<h2>Add a business or place</h2>
      <p class="fsub">Free listing, open to everyone. We check new places before they appear — usually the same day.</p>
      <label>Name *</label><input id="b-name" maxlength="60" value="${esc(b.name || '')}">
      <div class="row2"><div><label>What is it? *</label><select id="b-kind">${KIND_OPTS.map(([k, l]) =>
        `<option value="${k}"${b.kind === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label>Village *</label><select id="b-village">${VILLAGES.map((x) =>
        `<option${b.village === x ? ' selected' : ''}>${x}</option>`).join('')}</select></div></div>
      <label>Address</label><input id="b-addr" maxlength="120" value="${esc(b.address || '')}">
      <label>A sentence about it</label><textarea id="b-blurb" maxlength="300">${esc(b.blurb || '')}</textarea>
      <div class="row2"><div><label>Website</label><input id="b-web" maxlength="200" placeholder="https://…" value="${esc(b.website || '')}"></div>
      <div><label>Contact email * (never shown)</label><input id="b-email" maxlength="120" value="${esc(b.email || '')}"></div></div>
      <input id="b-web2" class="hidden-field" tabindex="-1" autocomplete="off">
      <label>Where is it? *</label>
      <button class="btn-s" id="b-place">${b.lat ? '📍 Pin placed — tap to move it' : '📍 Tap to place the pin on the map'}</button>
      <button class="btn-p" id="b-save">Submit for approval</button>
      <p class="err" id="b-err"></p>`);

    const grab = () => ({
      name: $('b-name').value, kind: $('b-kind').value, village: $('b-village').value,
      address: $('b-addr').value, blurb: $('b-blurb').value, website: $('b-web').value,
      email: $('b-email').value, website2: $('b-web2').value, lat: b.lat, lng: b.lng,
    });
    $('b-place').onclick = () => {
      const cur = grab();
      closeForm();
      document.body.classList.add('placing');
      placing = (lat, lng) => { cur.lat = lat; cur.lng = lng; openAddBusiness(cur); };
    };
    $('b-save').onclick = async () => {
      $('b-err').textContent = '';
      try {
        await api('venues/submit', grab());
        openForm(`<h2>Thanks — it's in the queue 🎉</h2>
          <p class="fsub">We check new places before they appear (usually the same day). Your venue
          code for adding events will arrive by email once it's approved.</p>
          <button class="btn-p" id="b-done">Back to the map</button>`);
        $('b-done').onclick = closeForm;
      } catch (e2) { $('b-err').textContent = e2.message; }
    };
  }

  // ---- one-off walks & outdoor events, pinned to a point on the map ----
  function openAddSpot(draft) {
    const b = draft || {};
    openForm(`<h2>Add a walk or outdoor event</h2>
      <p class="fsub">Organising a group walk, a fun run, carols on the green? Pin it to the map —
        free, live straight away, no sign-up.</p>
      <div class="row2"><div><label>What is it? *</label><select id="s-kind">
        <option value="walk"${b.kind !== 'spot' ? ' selected' : ''}>🥾 A walk</option>
        <option value="spot"${b.kind === 'spot' ? ' selected' : ''}>📍 Outdoor event</option></select></div>
      <div><label>Meeting point / start *</label><input id="s-name" maxlength="60"
        placeholder="e.g. Dovestone car park" value="${esc(b.name || '')}"></div></div>
      <label>Where does it start? *</label>
      <button class="btn-s" id="s-place">${b.lat ? '📍 Pin placed — tap to move it' : '📍 Tap to place the pin on the map'}</button>
      <label>What's it called? *</label><input id="f-title" maxlength="80"
        placeholder="e.g. Sunday Social Walk to the Obelisk" value="${esc(b.title || '')}">
      <label>When *</label><select id="f-when">
        <option value="once"${b.when !== 'weekly' && b.when !== 'monthly' ? ' selected' : ''}>A date (or a date range)</option>
        <option value="weekly"${b.when === 'weekly' ? ' selected' : ''}>Every week</option>
        <option value="monthly"${b.when === 'monthly' ? ' selected' : ''}>Every month</option></select>
      <div id="f-once" class="row2"><div><label>Date *</label><input type="date" id="f-start" value="${esc(b.start || '')}"></div>
        <div><label>Last day (optional)</label><input type="date" id="f-end" value="${esc(b.end || '')}"></div></div>
      <div id="f-weekly" class="row2" style="display:none"><div><label>Day *</label>${daySelect('f-day')}</div>
        <div><label>Until (optional)</label><input type="date" id="f-until"></div></div>
      <div id="f-monthly" class="row2" style="display:none"><div><label>Which week *</label>
        <select id="f-week"><option value="1">First</option><option value="2">Second</option>
        <option value="3">Third</option><option value="4">Fourth</option><option value="-1">Last</option></select></div>
        <div><label>Day *</label>${daySelect('f-mday')}</div></div>
      <label>Time</label><input id="f-time" maxlength="40" placeholder="e.g. Meet 10:00" value="${esc(b.time || '')}">
      <label>Description</label><textarea id="f-desc" maxlength="500"
        placeholder="Route, distance, who it's for, what to bring.">${esc(b.description || '')}</textarea>
      <label>Cost (if any)</label><input id="f-offer" maxlength="60" placeholder="e.g. Free · bring boots" value="${esc(b.offer || '')}">
      <button class="btn-p" id="s-save">Put it on the map</button>
      <p class="err" id="f-err"></p>`);
    const whenToggle = () => {
      const w = $('f-when').value;
      $('f-once').style.display = w === 'once' ? '' : 'none';
      $('f-weekly').style.display = w === 'weekly' ? '' : 'none';
      $('f-monthly').style.display = w === 'monthly' ? '' : 'none';
    };
    $('f-when').onchange = whenToggle;
    whenToggle();
    const grab = () => ({
      kind: $('s-kind').value, name: $('s-name').value, title: $('f-title').value,
      when: $('f-when').value, start: $('f-start').value, end: $('f-end').value,
      time: $('f-time').value, description: $('f-desc').value, offer: $('f-offer').value,
      lat: b.lat, lng: b.lng,
    });
    $('s-place').onclick = () => {
      const cur = grab();
      closeForm();
      document.body.classList.add('placing');
      placing = (lat, lng) => { cur.lat = lat; cur.lng = lng; openAddSpot(cur); };
    };
    $('s-save').onclick = async () => {
      $('f-err').textContent = '';
      const g = grab();
      const event = { title: g.title, category: 'community', time: g.time,
                      description: g.description, offer: g.offer };
      if (g.when === 'once') { event.start = g.start; event.end = g.end || undefined; }
      else if (g.when === 'weekly') { event.recurrence = { freq: 'weekly', day: $('f-day').value, until: $('f-until').value || undefined }; }
      else { event.recurrence = { freq: 'monthly', week: +$('f-week').value, day: $('f-mday').value }; }
      try {
        await api('events/submit', { spot: { name: g.name, kind: g.kind, lat: g.lat, lng: g.lng }, client: cid, event });
        await loadCommunity();
        openForm(`<h2>It's on the map 🥾</h2>
          <p class="fsub">Your ${g.kind === 'walk' ? 'walk' : 'event'} is live. You can edit or delete it
          any time from its pin on this device.</p>
          <button class="btn-p" id="s-done">Back to the map</button>`);
        $('s-done').onclick = closeForm;
      } catch (e2) { $('f-err').textContent = e2.message; }
    };
  }

  // ---- moderation (open the site with #admin) ----
  function openAdmin() {
    openForm(`<h2>Moderation</h2>
      <label>Admin code</label><input id="a-code" type="password" value="${esc(localStorage.getItem('swo-admin') || '')}">
      <button class="btn-p" id="a-load">Load submissions</button>
      <p class="err" id="a-err"></p><div class="mine" id="a-list"></div>`);
    $('a-load').onclick = async () => {
      const code = $('a-code').value.trim();
      $('a-err').textContent = '';
      try {
        const r = await api('moderate', { action: 'list' }, code);
        localStorage.setItem('swo-admin', code);
        const rows = (r.venues || []).map((v2) => `<div class="me"><span><b>${esc(v2.name)}</b>
          (${esc(v2.kind)}, ${esc(v2.village)}) · ${esc(v2.status)}<br>
          <span style="color:var(--muted)">${esc(v2.blurb || '')}<br>${esc(v2.email)} · code ${esc(v2.code)}</span></span>
          <span>${v2.status === 'pending' ? `<button data-ap="${v2.id}">Approve</button>` : ''}
          <button data-rj="${v2.id}">Remove</button></span></div>`).join('');
        const evRows = events.filter((e2) => e2.community && !e2.pool).map((e2) => `<div class="me">
          <span>${esc(e2.title)} <span style="color:var(--muted)">@ ${esc((venues.get(e2._venueId) || {}).name || e2._venueId)}</span></span>
          <button data-ed="${e2.id}" data-ev="${e2._venueId}">Remove</button></div>`).join('');
        $('a-list').innerHTML = `
          <b style="font-size:12px">Business submissions</b>
          ${rows || '<p class="fsub">None yet.</p>'}
          <b style="font-size:12px;display:block;margin-top:14px">Community events</b>
          ${evRows || '<p class="fsub">None yet.</p>'}
          <b style="font-size:12px;display:block;margin-top:14px">Verify a venue (lock its listings to its code)</b>
          <label>Venue id (e.g. church-inn)</label><input id="a-claim-id">
          <div class="row2"><button class="btn-s" id="a-claim">Verify & get code</button>
          <button class="btn-s" id="a-unclaim">Un-verify</button></div>
          <p class="fsub" style="margin-top:6px">Verified now: ${[...claimed].map(esc).join(', ') || 'none'}</p>`;
        for (const b of $('a-list').querySelectorAll('[data-ap]')) {
          b.onclick = async () => {
            const res = await api('moderate', { action: 'approve', id: b.dataset.ap }, code);
            await loadCommunity();
            alert(`Approved. Contact: ${res.email}. Their code (if you later verify them): ${res.code}`);
            $('a-load').onclick();
          };
        }
        for (const b of $('a-list').querySelectorAll('[data-rj]')) {
          b.onclick = async () => {
            await api('moderate', { action: 'reject', id: b.dataset.rj }, code);
            await loadCommunity();
            $('a-load').onclick();
          };
        }
        for (const b of $('a-list').querySelectorAll('[data-ed]')) {
          b.onclick = async () => {
            await api('events/delete', { venueId: b.dataset.ev, id: b.dataset.ed }, code);
            await loadCommunity();
            $('a-load').onclick();
          };
        }
        $('a-claim').onclick = async () => {
          const res = await api('claim', { id: $('a-claim-id').value.trim() }, code);
          await loadCommunity();
          alert('Verified. Their code: ' + res.code);
          $('a-load').onclick();
        };
        $('a-unclaim').onclick = async () => {
          await api('claim', { id: $('a-claim-id').value.trim(), action: 'unclaim' }, code);
          await loadCommunity();
          $('a-load').onclick();
        };
      } catch (e2) { $('a-err').textContent = e2.message; }
    };
  }

  // ---- structured data for search engines (venues + upcoming events) ----
  function injectSchema() {
    const old = document.getElementById('ld-json');
    if (old) old.remove();
    const TYPES = { pub: 'BarOrPub', cafe: 'CafeOrCoffeeShop', restaurant: 'Restaurant',
      takeaway: 'Restaurant', shop: 'Store', hall: 'CivicStructure', attraction: 'TouristAttraction',
      club: 'Organization', sport: 'SportsActivityLocation' };
    const blocks = [{
      '@context': 'https://schema.org', '@type': 'WebSite',
      name: "Saddleworth What's On", alternateName: 'Saddleworth Live',
      url: 'https://www.saddleworthlive.co.uk/',
    }];
    for (const v of venues.values()) {
      if (['walk', 'sight', 'spot'].includes(v.kind)) continue;
      const b = {
        '@context': 'https://schema.org', '@type': TYPES[v.kind] || 'LocalBusiness',
        name: v.name,
        address: v.address || `${v.village}, Saddleworth, Oldham`,
        geo: { '@type': 'GeoCoordinates', latitude: v.lat, longitude: v.lng },
      };
      if (v.links && v.links.website) b.url = v.links.website;
      if (v.hours) b.openingHours = v.hours;
      const rt = ratings[v.id];
      if (rt) b.aggregateRating = { '@type': 'AggregateRating', ratingValue: rt.avg, ratingCount: rt.count };
      blocks.push(b);
    }
    for (const e of events.filter((x) => x.start).slice(0, 80)) {
      const ven = venues.get(e._venueId);
      blocks.push({
        '@context': 'https://schema.org', '@type': 'Event',
        name: e.title, startDate: e.start, ...(e.end ? { endDate: e.end } : {}),
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: {
          '@type': 'Place', name: ven ? ven.name : 'Saddleworth',
          address: (ven && ven.address) || 'Saddleworth, Oldham',
          ...(ven ? { geo: { '@type': 'GeoCoordinates', latitude: ven.lat, longitude: ven.lng } } : {}),
        },
        ...(e.description ? { description: e.description } : {}),
      });
    }
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.id = 'ld-json';
    s.textContent = JSON.stringify(blocks);
    document.head.appendChild(s);
  }

  // ================= boot =================
  Promise.all([
    fetch('data/events.json').then((r) => r.json()),
    fetch('data/venues.json').then((r) => r.json()),
    fetch('data/basemap.json').then((r) => r.json()),
    fetch('data/contours.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ])
    .then(([data, vdata, geo, cont]) => {
      if (cont) geo.contours = cont.lines;
      // the baked OSM directory, dressed with the editorial overlay
      for (const v of vdata.venues) venues.set(v.id, { tags: [], links: {}, ...v });
      for (const [id, ex] of Object.entries(data.venueExtras || {})) {
        const v = venues.get(id);
        if (!v) continue;
        if (ex.name) v.name = ex.name;
        if (ex.type) v.type = ex.type;
        if (ex.blurb) v.blurb = ex.blurb;
        if (ex.menu) v.menu = ex.menu;
        if (ex.photo) v.photo = ex.photo;
        if (ex.hours) v.hours = ex.hours;
        if (ex.village) v.village = ex.village;
        if (ex.tags) v.tags = [...new Set([...ex.tags, ...v.tags])];
        v.links = { ...(ex.links || {}), ...v.links };   // OSM's own links win
      }
      for (const v of data.customVenues || []) venues.set(v.id, v);
      // one-off events at open-air spots get lightweight pseudo-venues
      for (const ev of data.events) {
        if (ev.business) { ev._venueId = ev.business; continue; }
        const key = 'spot:' + ev.venue.name;
        if (!venues.has(key)) {
          venues.set(key, { id: key, name: ev.venue.name, type: 'Out & about', kind: 'spot',
            village: ev.venue.village || 'Saddleworth', lat: ev.venue.lat, lng: ev.venue.lng,
            blurb: '', tags: [], links: {} });
        }
        ev._venueId = key;
      }
      events = data.events.filter((ev) => venues.has(ev._venueId));
      MapArt.build($('basemap'), project, W, H, geo);
      loadCommunity().then(injectSchema);
      $('add-biz').onclick = (e) => { e.preventDefault(); openAddBusiness(); };
      $('add-walk').onclick = (e) => { e.preventDefault(); openAddSpot(); };
      if (innerWidth > 760) {   // desktop has the room — show the filters up front
        $('filters').classList.remove('collapsed');
        $('filter-btn').classList.add('open');
        $('filter-btn').setAttribute('aria-expanded', 'true');
      }
      if (location.hash === '#admin') openAdmin();
      // dotted footpath trails for the walks, drawn onto the basemap
      let rh = '<g id="routes">';
      for (const v of venues.values()) {
        if (!v.route) continue;
        const d = v.route.map((p, i) => {
          const [x, y] = project(p[0], p[1]);
          return (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
        }).join('');
        rh += `<path class="route" data-w="${v.id}" d="${d}"/>`;
      }
      basemap.insertAdjacentHTML('beforeend', rh + '</g>');
      view.s = Math.min(innerWidth / W, innerHeight / H);
      fit();
      // open on the valley spine, a touch closer than full-fit
      const [hx, hy] = project(53.553, -2.006);
      view.s = fitS * 1.7;
      view.x = (innerWidth + 360) / 2 - hx * view.s;
      view.y = innerHeight * 0.52 - hy * view.s;
      applyView();
      updateDayNight();
      setWindow(0, 6);
    })
    .catch((err) => {
      $('count').textContent = 'Could not load events data — ' + err.message;
    });
})();
