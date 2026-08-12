/* build-contours.js — bake faint moorland contour lines from real elevation.
   Run with: node scripts/build-contours.js
   Samples a ~140 m grid over the map area from the Open-Meteo elevation API
   (Copernicus GLO-90 DEM, no key needed), caches the raw grid in
   data-raw/elevation-grid.json, then traces contours at 50 m intervals from
   300 m up — only the high ground gets them, the valley stays clean — and
   writes app/data/contours.json for map-art.js to draw. */

const fs = require('fs');
const path = require('path');

const LAT0 = 53.503, LAT1 = 53.615, LNG0 = -2.140, LNG1 = -1.905;
const ROWS = 91, COLS = 111;              // ~140 m spacing
const LEVELS = [300, 350, 400, 450, 500]; // metres; valley floor is ~150-250 m
const MIN_KM = 0.5;                       // drop specks

const latAt = (r) => LAT0 + (LAT1 - LAT0) * r / (ROWS - 1);
const lngAt = (c) => LNG0 + (LNG1 - LNG0) * c / (COLS - 1);
const dist = (a, b) => Math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 111320 * 0.594);

async function getGrid() {
  const cacheF = path.join(__dirname, '..', 'data-raw', 'elevation-grid.json');
  if (fs.existsSync(cacheF)) {
    const c = JSON.parse(fs.readFileSync(cacheF, 'utf8'));
    if (c.rows === ROWS && c.cols === COLS) { console.log('Using cached elevation grid'); return c.z; }
  }
  console.log('Fetching elevation grid (OpenTopoData SRTM 30m)…');
  const lats = [], lngs = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { lats.push(latAt(r)); lngs.push(lngAt(c)); }
  // resume-capable: partial progress is cached after every batch
  let z = [];
  const partF = cacheF + '.part';
  if (fs.existsSync(partF)) {
    const p = JSON.parse(fs.readFileSync(partF, 'utf8'));
    if (p.rows === ROWS && p.cols === COLS) { z = p.z; console.log(`  resuming at ${z.length}/${lats.length}`); }
  }
  while (z.length < lats.length) {
    const i = z.length;
    const locs = [];
    for (let k = i; k < Math.min(i + 100, lats.length); k++) locs.push(lats[k].toFixed(5) + ',' + lngs[k].toFixed(5));
    const res = await fetch('https://api.opentopodata.org/v1/srtm30m?locations=' + locs.join('|'),
      { headers: { 'User-Agent': 'saddleworthlive.co.uk contours (hello@aibility.co.uk)' } });
    if (res.status === 429) { process.stdout.write(' [429, waiting 20s] '); await new Promise((r2) => setTimeout(r2, 20000)); continue; }
    if (!res.ok) throw new Error('elevation api ' + res.status);
    const j = await res.json();
    z.push(...j.results.map((x) => x.elevation ?? 0));
    fs.writeFileSync(partF, JSON.stringify({ rows: ROWS, cols: COLS, z }));
    process.stdout.write(`\r  ${z.length}/${lats.length}`);
    await new Promise((r2) => setTimeout(r2, 1100));
  }
  console.log();
  fs.writeFileSync(cacheF, JSON.stringify({ rows: ROWS, cols: COLS, z }));
  fs.rmSync(partF, { force: true });
  return z;
}

// marching squares: emit one or two segments per grid cell for a level
function traceLevel(z, level) {
  const at = (r, c) => z[r * COLS + c];
  // interpolated point on a cell edge between two corners
  const ip = (r1, c1, r2, c2) => {
    const z1 = at(r1, c1), z2 = at(r2, c2);
    const t = (level - z1) / (z2 - z1);
    return [latAt(r1) + (latAt(r2) - latAt(r1)) * t, lngAt(c1) + (lngAt(c2) - lngAt(c1)) * t];
  };
  const segs = [];
  for (let r = 0; r < ROWS - 1; r++) for (let c = 0; c < COLS - 1; c++) {
    const tl = at(r, c) >= level, tr = at(r, c + 1) >= level,
          br = at(r + 1, c + 1) >= level, bl = at(r + 1, c) >= level;
    const idx = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
    if (idx === 0 || idx === 15) continue;
    const T = () => ip(r, c, r, c + 1), R = () => ip(r, c + 1, r + 1, c + 1),
          B = () => ip(r + 1, c, r + 1, c + 1), L = () => ip(r, c, r + 1, c);
    const add = (a, b) => segs.push([a, b]);
    switch (idx) {
      case 1: case 14: add(L(), B()); break;
      case 2: case 13: add(B(), R()); break;
      case 3: case 12: add(L(), R()); break;
      case 4: case 11: add(T(), R()); break;
      case 6: case 9:  add(T(), B()); break;
      case 7: case 8:  add(L(), T()); break;
      case 5: case 10: { // saddle — split by the cell-centre average
        const mid = (at(r, c) + at(r, c + 1) + at(r + 1, c) + at(r + 1, c + 1)) / 4;
        const flip = (mid >= level) === (idx === 5);
        if (flip) { add(L(), T()); add(B(), R()); } else { add(L(), B()); add(T(), R()); }
        break;
      }
    }
  }
  return segs;
}

// chain shared-endpoint segments into polylines
function chain(segs) {
  const key = (p) => p[0].toFixed(6) + ',' + p[1].toFixed(6);
  const byEnd = new Map();
  const alive = segs.map(() => true);
  segs.forEach((s, i) => {
    for (const p of [s[0], s[1]]) {
      const k = key(p);
      if (!byEnd.has(k)) byEnd.set(k, []);
      byEnd.get(k).push(i);
    }
  });
  const lines = [];
  for (let i = 0; i < segs.length; i++) {
    if (!alive[i]) continue;
    alive[i] = false;
    const line = [segs[i][0], segs[i][1]];
    for (const dir of [1, 0]) { // extend tail, then head
      for (;;) {
        const end = dir ? line[line.length - 1] : line[0];
        const next = (byEnd.get(key(end)) || []).find((k) => alive[k]);
        if (next === undefined) break;
        alive[next] = false;
        const s = segs[next];
        const p = key(s[0]) === key(end) ? s[1] : s[0];
        dir ? line.push(p) : line.unshift(p);
      }
    }
    lines.push(line);
  }
  return lines;
}

const chaikin = (pts, closed) => {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25],
             [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  if (!closed) { out.unshift(pts[0]); out.push(pts[n - 1]); }
  return out;
};

(async () => {
  const z = await getGrid();
  console.log(`Grid ${ROWS}×${COLS}, elevation ${Math.min(...z)}–${Math.max(...z)} m`);
  const lines = [];
  for (const level of LEVELS) {
    const chains = chain(traceLevel(z, level));
    for (const c of chains) {
      let km = 0; for (let i = 1; i < c.length; i++) km += dist(c[i - 1], c[i]);
      if (km / 1000 < MIN_KM) continue;
      const closed = key0(c[0]) === key0(c[c.length - 1]);
      const sm = chaikin(closed ? c.slice(0, -1) : c, closed);
      lines.push({ ele: level, closed, pts: sm.map((p) => [+p[0].toFixed(5), +p[1].toFixed(5)]) });
    }
    console.log(`  ${level} m: ${lines.filter((l) => l.ele === level).length} lines`);
  }
  function key0(p) { return p[0].toFixed(6) + ',' + p[1].toFixed(6); }
  const out = {
    note: 'Contour lines traced from the Copernicus GLO-90 DEM via the Open-Meteo elevation API by scripts/build-contours.js — drawn faintly over the high ground by map-art.js.',
    levels: LEVELS,
    lines,
  };
  const file = path.join(__dirname, '..', 'app', 'data', 'contours.json');
  fs.writeFileSync(file, JSON.stringify(out));
  console.log(`Wrote ${file} — ${lines.length} contour lines, ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
})();
