/* build-basemap.js — bake real OpenStreetMap geometry into data/basemap.json.
   Run with: node scripts/build-basemap.js
   Fetches roads, waterways, rail, water bodies, woods and the golf course for
   the Saddleworth area from Overpass, simplifies them hard (the map is a
   storybook illustration, not an atlas), and writes a small committed JSON.
   Raw response is kept in data/raw/ for reference. */

const fs = require('fs');
const path = require('path');

const BBOX = '53.500,-2.145,53.612,-1.900'; // south,west,north,east
const QUERY = `
[out:json][timeout:120][bbox:${BBOX}];
(
  way[highway~"^(primary|secondary|tertiary|unclassified)$"];
  way[waterway~"^(river|stream|canal)$"];
  way[railway=rail];
  way[natural=water];
  way[landuse=reservoir];
  way[natural=wood];
  way[landuse=forest];
  way[leisure=golf_course];
  way[leisure=park];
);
out geom;
`;

// Real building footprints, restricted to a rough parish hull so the dense
// Oldham/Shaw edge of the bbox stays out of the download.
const PARISH_POLY = [
  [53.612, -2.075], [53.612, -1.99], [53.585, -1.955], [53.55, -1.915],
  [53.52, -1.945], [53.506, -1.985], [53.506, -2.03], [53.53, -2.05],
  [53.54, -2.078], [53.558, -2.078], [53.58, -2.062],
].map((p) => p.join(' ')).join(' ');
const BUILDINGS_QUERY = `
[out:json][timeout:120];
(
  way[building](poly:"${PARISH_POLY}");
  way[highway=residential](poly:"${PARISH_POLY}");
);
out geom;
`;

const COS = Math.cos((53.556 * Math.PI) / 180);
const R5 = (n) => Math.round(n * 1e5) / 1e5;

// perpendicular distance in "latitude degrees" (lng scaled by cos)
function perp(p, a, b) {
  const ax = a[1] * COS, ay = a[0], bx = b[1] * COS, by = b[0];
  const px = p[1] * COS, py = p[0];
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function rdp(pts, tol) {
  if (pts.length < 3) return pts;
  let maxD = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perp(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= tol) return [pts[0], pts[pts.length - 1]];
  return rdp(pts.slice(0, idx + 1), tol).slice(0, -1).concat(rdp(pts.slice(idx), tol));
}
function lengthM(pts) {
  let m = 0;
  for (let i = 1; i < pts.length; i++) {
    m += Math.hypot((pts[i][0] - pts[i - 1][0]) * 111320,
                    (pts[i][1] - pts[i - 1][1]) * 111320 * COS);
  }
  return m;
}
function areaM2(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [y1, x1] = pts[i], [y2, x2] = pts[(i + 1) % pts.length];
    a += (x1 * COS * 111320) * (y2 * 111320) - (x2 * COS * 111320) * (y1 * 111320);
  }
  return Math.abs(a / 2);
}
// join polylines that share endpoints (for the canal & railway, so the boat
// and train can ride one continuous path)
function chain(lines) {
  const eq = (a, b) => Math.abs(a[0] - b[0]) < 4e-5 && Math.abs(a[1] - b[1]) < 4e-5;
  const pool = lines.map((l) => l.slice());
  const out = [];
  while (pool.length) {
    let cur = pool.pop(), grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const l = pool[i];
        if (eq(cur[cur.length - 1], l[0])) { cur = cur.concat(l.slice(1)); }
        else if (eq(cur[cur.length - 1], l[l.length - 1])) { cur = cur.concat(l.slice(0, -1).reverse()); }
        else if (eq(cur[0], l[l.length - 1])) { cur = l.slice(0, -1).concat(cur); }
        else if (eq(cur[0], l[0])) { cur = l.slice(1).reverse().concat(cur); }
        else continue;
        pool.splice(i, 1); grew = true; break;
      }
    }
    out.push(cur);
  }
  return out.sort((a, b) => lengthM(b) - lengthM(a));
}

async function overpass(query) {
  const mirrors = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  let lastErr = null;
  for (const url of mirrors) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'saddleworth-whats-on-basemap/1.0 (hello@aibility.co.uk)',
          'Accept': 'application/json',
        },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`${url} → ${res.status}`);
      return await res.json();
    } catch (e) { lastErr = e; console.log(`  ${e.message}, trying next mirror…`); }
  }
  throw lastErr;
}

async function main() {
  console.log('Querying Overpass…');
  const raw = await overpass(QUERY);
  console.log(`  ${raw.elements.length} ways`);

  const rawDir = path.join(__dirname, '..', 'data-raw');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(path.join(rawDir, 'overpass-basemap.json'), JSON.stringify(raw));

  const out = { roads: [], streams: [], rivers: [], canal: [], rail: [], lakes: [], woods: [], golf: [], parks: [] };
  const canalLines = [], railLines = [];

  for (const el of raw.elements) {
    if (!el.geometry || el.geometry.length < 2) continue;
    const t = el.tags || {};
    let pts = el.geometry.map((g) => [g.lat, g.lon]);
    const closed = pts.length > 3 &&
      Math.abs(pts[0][0] - pts[pts.length - 1][0]) < 1e-7 &&
      Math.abs(pts[0][1] - pts[pts.length - 1][1]) < 1e-7;

    if (t.highway) {
      pts = rdp(pts, 0.00018);
      if (lengthM(pts) < 120) continue;
      const major = t.highway === 'primary' || t.highway === 'secondary';
      out.roads.push({ c: major ? 'major' : 'minor', p: pts.map(([a, b]) => [R5(a), R5(b)]) });
    } else if (t.waterway === 'canal') {
      canalLines.push(rdp(pts, 0.00015));
    } else if (t.waterway === 'river') {
      pts = rdp(pts, 0.0002);
      out.rivers.push(pts.map(([a, b]) => [R5(a), R5(b)]));
    } else if (t.waterway === 'stream') {
      pts = rdp(pts, 0.00025);
      if (lengthM(pts) < 500 && !t.name) continue;
      out.streams.push(pts.map(([a, b]) => [R5(a), R5(b)]));
    } else if (t.railway === 'rail') {
      railLines.push(rdp(pts, 0.0002));
    } else if (t.natural === 'water' || t.landuse === 'reservoir') {
      if (!closed) continue;
      pts = rdp(pts.slice(0, -1), 0.00022);
      if (pts.length < 4 || areaM2(pts) < 6000) continue;
      out.lakes.push({ n: t.name || '', p: pts.map(([a, b]) => [R5(a), R5(b)]) });
    } else if (t.natural === 'wood' || t.landuse === 'forest') {
      if (!closed) continue;
      pts = rdp(pts.slice(0, -1), 0.0003);
      if (pts.length < 4 || areaM2(pts) < 20000) continue;
      out.woods.push(pts.map(([a, b]) => [R5(a), R5(b)]));
    } else if (t.leisure === 'golf_course') {
      pts = rdp(closed ? pts.slice(0, -1) : pts, 0.0003);
      if (pts.length >= 4) out.golf.push(pts.map(([a, b]) => [R5(a), R5(b)]));
    } else if (t.leisure === 'park') {
      if (!closed) continue;
      pts = rdp(pts.slice(0, -1), 0.0003);
      if (pts.length < 4 || areaM2(pts) < 12000) continue;
      out.parks.push(pts.map(([a, b]) => [R5(a), R5(b)]));
    }
  }

  out.canal = chain(canalLines).filter((l) => lengthM(l) > 250)
    .map((l) => rdp(l, 0.00015).map(([a, b]) => [R5(a), R5(b)]));
  out.rail = chain(railLines).filter((l) => lengthM(l) > 400)
    .map((l) => rdp(l, 0.0002).map(([a, b]) => [R5(a), R5(b)]));

  // real building footprints — the actual village fabric
  console.log('Querying Overpass for buildings…');
  const rawB = await overpass(BUILDINGS_QUERY);
  console.log(`  ${rawB.elements.length} buildings`);
  fs.writeFileSync(path.join(rawDir, 'overpass-buildings.json'), JSON.stringify(rawB));
  out.bld = [];
  for (const el of rawB.elements) {
    if (!el.geometry || el.geometry.length < 2) continue;
    const t = el.tags || {};
    if (t.highway === 'residential') {
      const pts = rdp(el.geometry.map((g) => [g.lat, g.lon]), 0.0002);
      if (lengthM(pts) < 80) continue;
      out.roads.push({ c: 'lane', p: pts.map(([a, b]) => [R5(a), R5(b)]) });
      continue;
    }
    if (el.geometry.length < 4) continue;
    let pts = el.geometry.map((g) => [g.lat, g.lon]).slice(0, -1);
    if (areaM2(pts) < 35) continue;
    pts = rdp(pts, 0.00004);
    if (pts.length < 3) continue;
    out.bld.push(pts.map(([a, b]) => [R5(a), R5(b)]));
  }

  const file = path.join(__dirname, '..', 'app', 'data', 'basemap.json');
  fs.writeFileSync(file, JSON.stringify(out));
  const kb = (fs.statSync(file).size / 1024).toFixed(0);
  console.log(`Wrote data/basemap.json (${kb} KB):`);
  for (const [k, v] of Object.entries(out)) {
    console.log(`  ${k}: ${v.length}${k === 'lakes' ? '  [' + v.map((l) => l.n || '?').join(', ') + ']' : ''}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
