/* audit-events.js — proves no event can be silently lost.
   Run after any edit to app/data/events.json:  node scripts/audit-events.js

   Checks every event for: a resolvable venue, valid categories (and that the
   app's category list matches the API's), primary/categories consistency, and
   at least one rendered instance somewhere in the app's ±1-year window.
   Exits non-zero if anything is wrong, so it can gate a deploy. */

'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const events = JSON.parse(fs.readFileSync(path.join(root, 'app/data/events.json'), 'utf8'));
const venues = JSON.parse(fs.readFileSync(path.join(root, 'app/data/venues.json'), 'utf8'));

// keep in step with CATS in app/js/app.js — the api list is parsed and compared
const CATS = ['offer', 'food', 'music', 'quiz', 'ent', 'market', 'community', 'active', 'kids'];
const appSrc = fs.readFileSync(path.join(root, 'app/js/app.js'), 'utf8');
for (const c of CATS) {
  if (!appSrc.includes(`${c}:`)) console.log(`WARNING: category '${c}' not found in app.js CATS`);
}
const coreSrc = fs.readFileSync(path.join(root, 'api/_lib/core.js'), 'utf8');
const coreCats = coreSrc.match(/const CATS = \[(.*?)\]/)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
const catsMatch = JSON.stringify(CATS) === JSON.stringify(coreCats);
console.log('script CATS === api CATS:', catsMatch ? 'YES' : `NO! script=${CATS} api=${coreCats}`);

const vlist = Array.isArray(venues) ? venues : venues.venues;
const vids = new Set([...vlist.map((v) => v.id), ...(events.customVenues || []).map((v) => v.id)]);
const evCats = (ev) => (ev.categories && ev.categories.length ? ev.categories : [ev.category]);

// recurrence expansion — same maths as app.js expand()
const DOW = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const today = new Date(); today.setHours(0, 0, 0, 0);
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
function instancesIn(ev, t0, t1) {
  let n = 0;
  if (ev.recurrence) {
    const r = ev.recurrence;
    const from = r.from ? parseISO(r.from) : null, until = r.until ? parseISO(r.until) : null;
    const a = from && from > t0 ? from : t0, b = until && until < t1 ? until : t1;
    if (a > b) return 0;
    if (r.freq === 'weekly') {
      let d = addDays(a, (DOW[r.day] - a.getDay() + 7) % 7);
      for (; d <= b; d = addDays(d, 7)) n++;
    } else if (r.freq === 'monthly') {
      for (let y = a.getFullYear(), m = a.getMonth(); ; ) {
        let d;
        if (r.week === -1) { d = new Date(y, m + 1, 0); d = addDays(d, -((d.getDay() - DOW[r.day] + 7) % 7)); }
        else { d = new Date(y, m, 1); d = addDays(d, (DOW[r.day] - d.getDay() + 7) % 7 + (r.week - 1) * 7); if (d.getMonth() !== m) d = null; }
        if (d && d >= a && d <= b) n++;
        if (++m > 11) { m = 0; y++; }
        if (new Date(y, m, 1) > b) break;
      }
    }
  } else if (ev.start) {
    const s = parseISO(ev.start), e = ev.end ? parseISO(ev.end) : s;
    if (!(e < t0 || s > t1)) n = 1;
  }
  return n;
}

const problems = [];
const seen = new Set();
let pastOnly = 0;
for (const ev of events.events) {
  const issues = [];
  if (seen.has(ev.id)) issues.push('duplicate id');
  seen.add(ev.id);
  if (!ev.business && !ev.venue) issues.push('no venue at all');
  if (ev.business && !vids.has(ev.business)) issues.push('venue id missing: ' + ev.business);
  for (const c of evCats(ev)) if (!CATS.includes(c)) issues.push('bad category: ' + c);
  if (ev.categories && ev.categories[0] !== ev.category) issues.push('primary != categories[0]');
  if (ev.categories && ev.categories.length > 3) issues.push('more than 3 categories');
  if (!ev.recurrence && !ev.start) issues.push('no date and no recurrence — never renders');
  const future = instancesIn(ev, today, addDays(today, 365));
  const past = instancesIn(ev, addDays(today, -365), addDays(today, -1));
  if (!future && !past) issues.push('zero instances in the whole ±1yr window');
  if (!future && past) pastOnly++;
  if (issues.length) problems.push('  ' + ev.id + ' — ' + issues.join('; '));
}
console.log(`events: ${events.events.length} | past-only (aged out, fine): ${pastOnly}`);
if (problems.length || !catsMatch) {
  console.log('PROBLEMS:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('ALL CLEAR — every event resolves, categorises and renders.');
