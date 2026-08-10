/* build-venues.js — bake the real venue directory from OpenStreetMap.
   Run with: node scripts/build-venues.js
   Fetches every named pub, bar, café, restaurant, takeaway, theatre, hall,
   museum and sports club in the Saddleworth area and writes data/venues.json
   with real coordinates and any contact details OSM carries. Editorial content
   (blurbs, tags, menus, events) lives in data/events.json keyed by the slugs
   this script generates — re-baking refreshes positions and adds new venues
   without touching editorial. Raw response kept in data/raw/. */

const fs = require('fs');
const path = require('path');

const BBOX = '53.500,-2.145,53.612,-1.900';
// canvas bounds (venues outside the drawn map are dropped)
const LAT_TOP = 53.612, LAT_BOT = 53.506, LNG_L = -2.135, LNG_R = -1.9106;

const QUERY = `
[out:json][timeout:120][bbox:${BBOX}];
(
  nwr[amenity~"^(pub|bar|cafe|restaurant|fast_food|ice_cream|theatre|cinema|community_centre|arts_centre)$"][name];
  nwr[tourism~"^(museum|gallery|hotel|guest_house)$"][name];
  nwr[leisure~"^(sports_centre|golf_course|marina|climbing)$"][name];
  nwr[club][name];
);
out center tags;
`;

// The parish, as anchor circles: a venue is kept only if it sits within
// `radius` km of one of these — that is what keeps Oldham, Shaw, Marsden and
// Mossley (all inside the bbox) off the Saddleworth map.
const VILLAGES = [
  ['Uppermill', 53.5468, -2.0066, 1.4], ['Delph', 53.5685, -2.0195, 1.2],
  ['Dobcross', 53.5564, -2.0130, 0.9], ['Diggle', 53.5695, -1.9975, 1.3],
  ['Greenfield', 53.5365, -1.9920, 1.5], ['Grasscroft', 53.5352, -2.0117, 0.85],
  ['Lydgate', 53.5409, -2.0378, 0.8], ['Scouthead', 53.5477, -2.0532, 1.0],
  ['Denshaw', 53.5860, -2.0440, 2.3], ['Friezland', 53.5322, -2.0035, 0.55],
  ['Springhead', 53.5410, -2.0700, 0.7], ['Grotton', 53.5430, -2.0600, 0.8],
  ['Austerlands', 53.5520, -2.0680, 0.8], ['Strinesdale', 53.5583, -2.0562, 0.35],
  ['Greenfield', 53.5320, -1.9660, 1.2], // Dovestone
  ['Greenfield', 53.5306, -2.0272, 0.45], // Well-i-Hole (Saddleworth CC)
];

function kindOf(t) {
  const a = t.amenity || '';
  if (a === 'pub' || a === 'bar') return 'pub';
  if (a === 'cafe' || a === 'ice_cream') return 'cafe';
  if (a === 'restaurant') return 'restaurant';
  if (a === 'fast_food') return 'takeaway';
  if (a === 'theatre' || a === 'cinema' || a === 'community_centre' || a === 'arts_centre') return 'hall';
  if (t.tourism === 'hotel' || t.tourism === 'guest_house') return 'restaurant';
  if (t.tourism) return 'attraction';
  if (t.club === 'music' || t.club === 'social' || t.club === 'veterans') return 'club';
  return 'sport';
}
function typeOf(t, kind) {
  const cuisine = (t.cuisine || '').split(';')[0].replace(/_/g, ' ');
  const map = {
    pub: t.microbrewery === 'yes' ? 'Pub & brewery' : 'Pub',
    cafe: t.amenity === 'ice_cream' ? 'Ice cream & café' : 'Café',
    restaurant: t.tourism ? 'Inn & rooms' : cuisine ? `Restaurant · ${cuisine}` : 'Restaurant',
    takeaway: cuisine ? `Takeaway · ${cuisine}` : 'Takeaway',
    hall: t.amenity === 'theatre' ? 'Theatre' : t.amenity === 'cinema' ? 'Cinema'
        : t.amenity === 'arts_centre' ? 'Arts centre' : 'Community hall',
    attraction: t.tourism === 'museum' ? 'Museum' : 'Gallery',
    club: 'Club',
    sport: t.leisure === 'golf_course' ? 'Golf club' : t.leisure === 'marina' ? 'Marina' : 'Sports club',
  };
  return map[kind] || 'Venue';
}
const slug = (name) => name.toLowerCase()
  .replace(/^(the|ye olde|ye)\s+/, '')
  .replace(/&/g, 'and').replace(/[''`’]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// nearest anchor whose circle contains the point — null means "not Saddleworth"
function anchorVillage(lat, lng) {
  let best = null, bd = 1e9;
  for (const [n, la, ln, rad] of VILLAGES) {
    const km = Math.hypot((lat - la) * 111.32, (lng - ln) * 111.32 * 0.594);
    if (km <= rad && km < bd) { bd = km; best = n; }
  }
  return best;
}

async function main() {
  console.log('Querying Overpass for venues…');
  const mirrors = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  let raw = null, lastErr = null;
  for (const url of mirrors) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'saddleworth-whats-on-venues/1.0 (hello@aibility.co.uk)',
          'Accept': 'application/json',
        },
        body: 'data=' + encodeURIComponent(QUERY),
      });
      if (!res.ok) throw new Error(`${url} → ${res.status}`);
      raw = await res.json();
      break;
    } catch (e) { lastErr = e; console.log(`  ${e.message}, trying next mirror…`); }
  }
  if (!raw) throw lastErr;
  console.log(`  ${raw.elements.length} elements`);

  const rawDir = path.join(__dirname, '..', 'data', 'raw');
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(path.join(rawDir, 'overpass-venues.json'), JSON.stringify(raw));

  const byId = new Map();
  for (const el of raw.elements) {
    const t = el.tags || {};
    if (!t.name) continue;
    if (t.disused === 'yes' || (t.opening_hours || '') === 'closed' ||
        Object.keys(t).some((k) => k.startsWith('disused:') || k.startsWith('abandoned:'))) continue;
    const lat = el.lat != null ? el.lat : el.center && el.center.lat;
    const lng = el.lon != null ? el.lon : el.center && el.center.lon;
    if (lat == null) continue;
    if (lat < LAT_BOT || lat > LAT_TOP || lng < LNG_L || lng > LNG_R) continue;

    const village = anchorVillage(lat, lng);
    if (!village) continue;
    const kind = kindOf(t);
    const id = slug(t.name);
    if (!id) continue;
    const addr = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
    const v = {
      id,
      name: t.name,
      type: typeOf(t, kind),
      kind,
      village,
      lat: Math.round(lat * 1e5) / 1e5,
      lng: Math.round(lng * 1e5) / 1e5,
    };
    const full = [addr, v.village, t['addr:postcode']].filter(Boolean).join(', ');
    if (full) v.address = full;
    if (t.opening_hours) v.hours = t.opening_hours.slice(0, 200);
    const links = {};
    const site = t.website || t['contact:website'];
    if (site) links.website = site;
    const fb = t['contact:facebook'] || t.facebook;
    if (fb) links.facebook = fb.startsWith('http') ? fb : `https://www.facebook.com/${fb}`;
    const ph = t.phone || t['contact:phone'];
    if (ph) links.phone = ph;
    if (Object.keys(links).length) v.links = links;
    const auto = [];
    if (t.real_ale === 'yes') auto.push('Real ale');
    if (t.food === 'yes') auto.push('Food served');
    if (t.outdoor_seating === 'yes') auto.push('Outdoor seating');
    if (t.dog === 'yes') auto.push('Dog friendly');
    if (t.accommodation && t.accommodation !== 'no') auto.push('Rooms');
    if (auto.length) v.tags = auto;

    // dedupe (a pub often exists as both a node and its building) — keep the
    // element that knows more about itself
    const prev = byId.get(id);
    if (!prev || Object.keys(t).length > prev._tagCount) {
      v._tagCount = Object.keys(t).length;
      byId.set(id, v);
    }
  }

  const venues = [...byId.values()].map((v) => { delete v._tagCount; return v; })
    .sort((a, b) => a.village.localeCompare(b.village) || a.name.localeCompare(b.name));

  const file = path.join(__dirname, '..', 'data', 'venues.json');
  fs.writeFileSync(file, JSON.stringify({ source: 'OpenStreetMap (ODbL) — baked by scripts/build-venues.js', venues }, null, 1));
  console.log(`Wrote data/venues.json — ${venues.length} venues:`);
  let village = '';
  for (const v of venues) {
    if (v.village !== village) { village = v.village; console.log(`  — ${village} —`); }
    console.log(`  ${v.id}  (${v.type}${v.links && v.links.website ? ', site' : ''})`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
