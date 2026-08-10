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
  const GROUPS = { food: '#eb6834', ent: '#2a78d6', comm: '#1baf7a' };
  const CATS = {
    offer:     { label: 'Offers & deals',        emoji: '🏷️', group: 'food' },
    food:      { label: 'Food & drink',          emoji: '🍺', group: 'food' },
    music:     { label: 'Live music',            emoji: '🎵', group: 'ent'  },
    quiz:      { label: 'Quiz & comedy',         emoji: '❓', group: 'ent'  },
    market:    { label: 'Markets & fairs',       emoji: '🧺', group: 'comm' },
    community: { label: 'Festivals & community', emoji: '🎪', group: 'comm' },
  };
  const KIND_EMOJI = { pub: '🍻', cafe: '☕', restaurant: '🍽️', takeaway: '🍟',
                       hall: '🎭', attraction: '🏛️', club: '🎺', sport: '🎾',
                       walk: '🥾', spot: '📍' };
  const WALK_C = '#35784b';
  const DOW = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const DAY = 86400000, LIST_CAP = 400;

  // ---- date helpers (all local-midnight) ----
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const dayDiff = (a, b) => Math.round((a - b) / DAY);
  const fmtShort = (d) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
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
  let activeCats = new Set(Object.keys(CATS));
  let query = '';
  let selected = null;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ================= pan / zoom =================
  const stage = $('stage'), world = $('world'), markersEl = $('markers');
  const basemap = $('basemap');
  let view = { x: 0, y: 0, s: 1 }, fitS = 1;

  function applyView() {
    const vw = innerWidth, vh = innerHeight;
    const ws = W * view.s, hs = H * view.s, pad = 70;
    view.x = ws <= vw ? (vw - ws) / 2 : Math.min(pad, Math.max(vw - ws - pad, view.x));
    view.y = hs <= vh ? (vh - hs) / 2 : Math.min(pad, Math.max(vh - hs - pad, view.y));
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
    markersEl.style.setProperty('--inv', 1 / view.s);
    // the drawing itself zooms via viewBox, so ink stays crisp at any scale
    basemap.setAttribute('viewBox',
      `${(-view.x / view.s).toFixed(2)} ${(-view.y / view.s).toFixed(2)} ${(vw / view.s).toFixed(2)} ${(vh / view.s).toFixed(2)}`);
    basemap.classList.toggle('lz', view.s < fitS * 1.7);
    basemap.classList.toggle('hz', view.s > fitS * 3.2);
  }
  function fit() {
    fitS = Math.min(innerWidth / W, innerHeight / H);
    view.s = Math.max(view.s, fitS * 0.9);
    applyView();
  }
  function zoomAt(cx, cy, f) {
    const ns = Math.min(fitS * 8, Math.max(fitS * 0.9, view.s * f));
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
    const t = `${inst.ev.title} ${inst.ev.description || ''} ${inst.venue.name} ${inst.venue.village}`.toLowerCase();
    return t.includes(query);
  };
  const visible = (inst) => activeCats.has(inst.ev.category) && matchText(inst);

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
    let mh = '';
    for (const v of venues.values()) {
      const insts = byVenue.get(v.id);
      const [x, y] = project(v.lat, v.lng);
      const sel = selected === v.id ? ' sel' : '';
      if (v.kind === 'walk') {
        const dim = query && !insts && !`${v.name} ${v.village} walk`.toLowerCase().includes(query) ? ' dim' : '';
        mh += `<button class="pin walk${sel}${dim}" style="left:${x}px;top:${y}px;--pc:${WALK_C}"
                 data-v="${v.id}" title="${esc(v.name)}" aria-label="Walk: ${esc(v.name)}">
                 <span class="bub">🥾${insts && insts.length > 1 ? `<i class="cnt">${insts.length}</i>` : ''}</span></button>`;
      } else if (insts && insts.length) {
        const lead = insts.find((i) => i.date >= today) || insts[insts.length - 1];
        const cat = CATS[lead.ev.category];
        mh += `<button class="pin${sel}" style="left:${x}px;top:${y}px;--pc:${GROUPS[cat.group]}"
                 data-v="${v.id}" title="${esc(v.name)}" aria-label="${esc(v.name)}: ${insts.length} listing${insts.length > 1 ? 's' : ''}">
                 <span class="bub">${cat.emoji}${insts.length > 1 ? `<i class="cnt">${insts.length}</i>` : ''}</span></button>`;
      } else {
        const dim = query && !`${v.name} ${v.village}`.toLowerCase().includes(query) ? ' dim' : '';
        mh += `<button class="pin quiet${sel}${dim}" style="left:${x}px;top:${y}px" data-v="${v.id}"
                 title="${esc(v.name)}" aria-label="${esc(v.name)} (nothing listed in this window)"><span class="bub">${KIND_EMOJI[v.kind] || ''}</span></button>`;
      }
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
          ${inst.ev.offer ? `<br><span class="offer">${esc(inst.ev.offer)}</span>` : ''}</span></button>`;
      n++;
    }
    if (shown.length > LIST_CAP) lh += `<p id="more">…and ${shown.length - LIST_CAP} more — narrow the dates to see them all</p>`;
    if (!shown.length) lh = `<p id="more">Nothing matches — try widening the dates or clearing filters.</p>`;
    listEl.innerHTML = lh;

    const nv = byVenue.size;
    $('count').textContent = `${shown.length} listing${shown.length === 1 ? '' : 's'} at ${nv} venue${nv === 1 ? '' : 's'} · ${fmtShort(t0)} – ${fmtShort(t1)}`;

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
    const insts = expand(t0, t1).filter((i) => i.venue.id === id && activeCats.has(i.ev.category));
    const groupC = v.kind === 'walk' ? WALK_C
      : insts.length ? GROUPS[CATS[(insts.find((i) => i.date >= today) || insts[0]).ev.category].group] : 'var(--g-none)';

    let hh = `<div class="photo" style="--pc:${groupC}">`;
    if (v.photo) hh += `<img src="${esc(v.photo)}" alt="${esc(v.name)}">`;
    else hh += `<span class="ph-emoji">${KIND_EMOJI[v.kind] || '📍'}</span>
                <span class="ph-hint">📷 your photo here — free for local venues</span>`;
    hh += `<button class="close" aria-label="Close">✕</button></div><div class="body">`;
    hh += `<h2>${esc(v.name)}</h2><div class="meta">
      <span class="mchip kind" style="--pc:${groupC}">${esc(v.type)}</span>
      <span class="mchip">📍 ${esc(v.village)}</span></div>`;
    if (v.walk) {
      hh += `<div class="meta"><span class="mchip kind" style="--pc:${WALK_C}">🥾 ${esc(v.walk.km)} km</span>
        <span class="mchip">⏱ ${esc(v.walk.time)}</span><span class="mchip">${esc(v.walk.grade)}</span></div>`;
    }
    if (v.blurb) hh += `<p class="blurb">${esc(v.blurb)}</p>`;
    if (v.tags && v.tags.length) hh += `<div class="meta">${v.tags.map((t) => `<span class="mchip">${esc(t)}</span>`).join('')}</div>`;
    if (v.address) hh += `<p class="addr">${esc(v.address)}</p>`;
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
      for (const inst of insts.slice(0, 40)) {
        const past = inst.date < today && !inst.ongoing;
        const end = inst.ev.end && inst.ev.start !== inst.ev.end ? ` → ${fmtShort(parseISO(inst.ev.end))}` : '';
        hh += `<div class="vevt${past ? ' past' : ''}">
          <div class="d">${inst.ongoing ? 'ongoing' : fmtShort(inst.date)}${end}${inst.ev.recurrence ? ' · ' + (inst.ev.recurrence.freq === 'weekly' ? 'weekly' : 'monthly') : ''}</div>
          <div class="t">${CATS[inst.ev.category].emoji} ${esc(inst.ev.title)}${inst.ev.demo ? '<span class="demo-tag">example</span>' : ''}</div>
          ${inst.ev.time ? `<div class="x">${esc(inst.ev.time)}</div>` : ''}
          ${inst.ev.description ? `<div class="x">${esc(inst.ev.description)}</div>` : ''}
          ${inst.ev.offer ? `<span class="offer">${esc(inst.ev.offer)}</span>` : ''}</div>`;
      }
    }
    if (v.kind !== 'walk' && v.kind !== 'spot' && v.kind !== 'attraction') {
      hh += `<a class="claim" href="mailto:hello@aibility.co.uk?subject=${encodeURIComponent(`List events for ${v.name} — Saddleworth What's On`)}">📣 Run ${esc(v.name)}? List your events, offers &amp; menu — free</a>`;
    }
    hh += `</div>`;

    const panel = $('venue');
    panel.innerHTML = hh;
    panel.classList.add('open');
    panel.scrollTop = 0;
    panel.querySelector('.close').onclick = closeVenue;
    const mb = panel.querySelector('[data-menu]');
    if (mb) mb.onclick = (e) => { e.preventDefault(); openMenu(v); };
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
    if ($('menu-back').classList.contains('open')) closeMenu();
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
    ['This week', 0, 6],
    ['Weekend', satOff, dow === 0 ? 0 : satOff + 1],
    ['This month', 0, 29],
    ['3 months', 0, 89],
    ['Year ahead', 0, 365],
    ['Past year', -365, 0],
    ['Everything', -365, 365],
  ];
  $('presets').innerHTML = PRESETS.map(([l, a, b]) =>
    `<button data-lo="${a}" data-hi="${b}">${l}</button>`).join('');
  $('presets').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setWindow(+b.dataset.lo, +b.dataset.hi);
  });

  // ================= filters =================
  $('chips').innerHTML = Object.entries(CATS).map(([k, c]) =>
    `<button class="chip" style="--pc:${GROUPS[c.group]}" data-c="${k}" aria-pressed="true">
       <i></i>${c.emoji} ${c.label}</button>`).join('');
  $('chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    const k = b.dataset.c;
    if (activeCats.has(k) && activeCats.size === Object.keys(CATS).length) {
      activeCats = new Set([k]);            // first click: focus just this one
    } else if (activeCats.has(k)) {
      activeCats.delete(k);
      if (!activeCats.size) activeCats = new Set(Object.keys(CATS));
    } else activeCats.add(k);
    for (const c of $('chips').children) c.setAttribute('aria-pressed', activeCats.has(c.dataset.c));
    render();
  });
  let qT;
  $('q').addEventListener('input', (e) => {
    clearTimeout(qT);
    qT = setTimeout(() => { query = e.target.value.trim().toLowerCase(); render(); }, 120);
  });

  $('side-toggle').onclick = () => {
    const open = document.body.classList.toggle('side-open');
    $('side-toggle').setAttribute('aria-expanded', open);
  };

  // ================= boot =================
  Promise.all([
    fetch('data/events.json').then((r) => r.json()),
    fetch('data/venues.json').then((r) => r.json()),
    fetch('data/basemap.json').then((r) => r.json()),
  ])
    .then(([data, vdata, geo]) => {
      // the baked OSM directory, dressed with the editorial overlay
      for (const v of vdata.venues) venues.set(v.id, { tags: [], links: {}, ...v });
      for (const [id, ex] of Object.entries(data.venueExtras || {})) {
        const v = venues.get(id);
        if (!v) continue;
        if (ex.type) v.type = ex.type;
        if (ex.blurb) v.blurb = ex.blurb;
        if (ex.menu) v.menu = ex.menu;
        if (ex.photo) v.photo = ex.photo;
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
      setWindow(0, 30);
    })
    .catch((err) => {
      $('count').textContent = 'Could not load events data — ' + err.message;
    });
})();
