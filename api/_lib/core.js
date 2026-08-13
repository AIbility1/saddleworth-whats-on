/* core.js — shared logic for the community API (events, venues, ratings).
   Used by the Azure Functions in api/ and by scripts/dev-server.js locally.

   Auth model (deliberately open — the community runs it):
   - ANYONE can add an event to any venue. Each event remembers an anonymous
     owner hash derived from the submitting browser's random client id, so
     the person who added a listing can edit or delete it, and nobody else
     can (except the admin). No accounts, no codes.
   - New business submissions are public but land in a moderation queue;
     nothing shows on the map until approved with the ADMIN_CODE. The admin
     code (sent as x-venue-code header) can also delete any event.
   - Ratings are anonymous, one per browser per venue (re-rating replaces
     the old vote).
   - Venue codes (HMAC of venueId) still exist in venueCode()/verify for a
     future "verified venue" tier, but nothing requires them today.

   Storage: Cosmos DB when COSMOS_CONNECTION is set (production); otherwise
   JSON files under .local-data/ (development). In Azure with no Cosmos the
   API refuses politely rather than losing data. */

'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CATS = ['offer', 'food', 'music', 'quiz', 'market', 'community', 'active', 'kids'];
const DOWS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const KINDS = ['pub', 'cafe', 'restaurant', 'takeaway', 'shop', 'hall', 'attraction', 'club', 'sport'];
const SECRET = process.env.VENUE_CODE_SECRET || 'dev-secret-change-me';
const ADMIN = process.env.ADMIN_CODE || 'dev-admin';
// the illustrated map's bounds — a submitted pin must land on the drawing
const LAT_TOP = 53.612, LAT_BOT = 53.506, LNG_L = -2.135, LNG_R = -1.9106;

// ---------- codes ----------
function venueCode(venueId) {
  const h = crypto.createHmac('sha256', SECRET).update(String(venueId)).digest();
  const alpha = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'; // no 0/O, 1/I/L confusion
  let out = '';
  for (let i = 0; i < 8; i++) out += alpha[h[i] % alpha.length];
  return out.slice(0, 4) + '-' + out.slice(4);
}
function safeEq(a, b) {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}
function codeOk(venueId, code) {
  if (!venueId || !code) return false;
  const want = venueCode(venueId).replace('-', '');
  const got = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return safeEq(got, want);
}
const adminOk = (code) => !!code && safeEq(String(code), ADMIN);
const ownerHash = (client) =>
  crypto.createHash('sha256').update('owner:' + client).digest('hex').slice(0, 16);

// ---------- storage ----------
class FileStore {
  constructor(dir) { this.dir = dir; }
  _file(col) { return path.join(this.dir, col + '.json'); }
  _read(col) {
    try { return JSON.parse(fs.readFileSync(this._file(col), 'utf8')); }
    catch { return []; }
  }
  _write(col, all) {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this._file(col), JSON.stringify(all, null, 1));
  }
  async list(col) { return this._read(col); }
  async upsert(col, item) {
    const all = this._read(col).filter((e) => e.id !== item.id);
    all.push(item);
    this._write(col, all);
  }
  async remove(col, id, pk) {
    const all = this._read(col);
    const keep = all.filter((e) => !(e.id === id && (pk === undefined || e[colPk(col)] === pk)));
    this._write(col, keep);
    return keep.length !== all.length;
  }
}
const colPk = (col) => (col === 'venues' || col === 'claims' ? 'id' : 'venueId');

class CosmosStore {
  constructor() {
    const { CosmosClient } = require('@azure/cosmos');
    this.client = new CosmosClient(process.env.COSMOS_CONNECTION);
    this.containers = new Map();
  }
  async container(col) {
    if (!this.containers.has(col)) {
      this.containers.set(col, (async () => {
        const { database } = await this.client.databases.createIfNotExists({ id: 'whatson' });
        const { container } = await database.containers.createIfNotExists({
          id: col, partitionKey: { paths: ['/' + colPk(col)] },
        });
        return container;
      })());
    }
    return this.containers.get(col);
  }
  async list(col) {
    const c = await this.container(col);
    const { resources } = await c.items.query('SELECT * FROM c').fetchAll();
    return resources;
  }
  async upsert(col, item) {
    const c = await this.container(col);
    await c.items.upsert(item);
  }
  async remove(col, id, pk) {
    const c = await this.container(col);
    try { await c.item(id, pk === undefined ? id : pk).delete(); return true; }
    catch (e) { if (e.code === 404) return false; throw e; }
  }
}

let _store = null;
function getStore() {
  if (_store) return _store;
  if (process.env.COSMOS_CONNECTION) _store = new CosmosStore();
  else if (process.env.WEBSITE_INSTANCE_ID) return null; // Azure, no DB configured
  else _store = new FileStore(path.join(__dirname, '..', '..', '.local-data'));
  return _store;
}

// ---------- validation ----------
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const slug = (name) => name.toLowerCase().replace(/^the\s+/, '').replace(/&/g, 'and')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

function validateEvent(venueId, input) {
  const e = input || {};
  const title = str(e.title, 80);
  if (!title) return { error: 'A title is required.' };
  // a listing can sit in more than one category (e.g. food + offer);
  // the first one is primary and drives the pin/emoji
  let cats = Array.isArray(e.categories) ? e.categories.filter((c) => CATS.includes(c)) : [];
  if (!cats.length && CATS.includes(e.category)) cats = [e.category];
  cats = [...new Set(cats)].slice(0, 3);
  if (!cats.length) return { error: 'Pick at least one category.' };
  const out = { venueId, title, category: cats[0], source: 'venue' };
  if (cats.length > 1) out.categories = cats;
  const time = str(e.time, 40); if (time) out.time = time;
  const description = str(e.description, 500); if (description) out.description = description;
  const offer = str(e.offer, 60); if (offer) out.offer = offer;
  const voucher = str(e.voucher, 24).toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (voucher) out.voucher = voucher;

  const r = e.recurrence;
  if (r && typeof r === 'object') {
    if (r.freq === 'weekly') {
      if (!DOWS.includes(r.day)) return { error: 'Pick a day of the week.' };
      out.recurrence = { freq: 'weekly', day: r.day };
      if (isDate(r.until)) out.recurrence.until = r.until;
      if (isDate(r.from)) out.recurrence.from = r.from;
    } else if (r.freq === 'monthly') {
      if (!DOWS.includes(r.day)) return { error: 'Pick a day of the week.' };
      if (![1, 2, 3, 4, -1].includes(r.week)) return { error: 'Pick which week of the month.' };
      out.recurrence = { freq: 'monthly', week: r.week, day: r.day };
    } else return { error: 'Unknown repeat type.' };
  } else {
    if (!isDate(e.start)) return { error: 'A date is required.' };
    out.start = e.start;
    if (isDate(e.end) && e.end >= e.start) out.end = e.end;
  }

  if (e.id) {
    if (typeof e.id !== 'string' || !e.id.startsWith(venueId + '-')) {
      return { error: 'That listing does not belong to this venue.' };
    }
    out.id = e.id;
  } else {
    out.id = `${venueId}-${crypto.randomUUID().slice(0, 8)}`;
  }
  out.updated = new Date().toISOString();
  return { event: out };
}

function validateVenue(input) {
  const v = input || {};
  if (str(v.website2, 50)) return { error: 'Rejected.' }; // honeypot field
  const name = str(v.name, 60);
  if (name.length < 2) return { error: 'A business name is required.' };
  if (!KINDS.includes(v.kind)) return { error: 'Pick what kind of place it is.' };
  const village = str(v.village, 30);
  if (!village) return { error: 'Which village is it in?' };
  const email = str(v.email, 120);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'A contact email is needed so we can send you your listings code.' };
  const lat = Number(v.lat), lng = Number(v.lng);
  if (!(lat > LAT_BOT && lat < LAT_TOP && lng > LNG_L && lng < LNG_R)) {
    return { error: 'Tap the map to place your pin first.' };
  }
  const out = {
    id: 'c-' + slug(name) + '-' + crypto.randomUUID().slice(0, 6),
    name, kind: v.kind, village,
    lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5,
    type: str(v.type, 40) || undefined,
    address: str(v.address, 120) || undefined,
    blurb: str(v.blurb, 300) || undefined,
    email,                                  // kept private — stripped on read
    status: 'pending',
    submitted: new Date().toISOString(),
  };
  const site = str(v.website, 200);
  if (/^https?:\/\/\S+$/.test(site)) out.links = { website: site };
  return { venue: out };
}

// ---------- handlers (transport-agnostic) ----------
const json = (status, body) => ({ status, body });
const noStore = () => json(503, { error: 'Listing storage is not configured yet — email hello@aibility.co.uk.' });
const publicVenue = ({ email, status, submitted, ...rest }) => rest;

async function handleEventsList() {
  const store = getStore();
  if (!store) return noStore();
  return json(200, { events: await store.list('events') });
}
async function handleVerify(body, code) {
  const venueId = str(body && body.venueId, 80);
  if (!codeOk(venueId, code)) return json(401, { error: 'That code is not right for this venue.' });
  return json(200, { ok: true });
}
const isClaimed = async (store, venueId) =>
  (await store.list('claims')).some((c) => c.id === venueId);

async function handleEventUpsert(body, code) {
  let venueId = str(body && body.venueId, 80);
  const client = str(body && body.client, 64);
  // one-off walks & outdoor events: a "spot" pins the event to a point on the
  // map instead of an existing venue
  let spotOut = null;
  const spot = body && body.spot;
  if (!venueId && spot && typeof spot === 'object') {
    const name = str(spot.name, 60);
    const lat = Number(spot.lat), lng = Number(spot.lng);
    if (name.length < 2) return json(400, { error: 'Name the meeting point or start.' });
    if (!(lat > LAT_BOT && lat < LAT_TOP && lng > LNG_L && lng < LNG_R)) {
      return json(400, { error: 'Tap the map to place the pin first.' });
    }
    spotOut = { name, lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5,
                kind: spot.kind === 'walk' ? 'walk' : 'spot' };
    venueId = 's-' + slug(name) + '-' + crypto.randomUUID().slice(0, 6);
  }
  if (!venueId || client.length < 8) return json(400, { error: 'Bad request.' });
  if (str(body.website2, 50)) return json(400, { error: 'Rejected.' }); // honeypot
  const store = getStore();
  if (!store) return noStore();
  // a claimed (verified) venue is locked to its code holder
  if (await isClaimed(store, venueId)) {
    if (!codeOk(venueId, code) && !adminOk(code)) {
      return json(401, { error: 'This venue manages its own listings — its code is needed.' });
    }
  }
  const v = validateEvent(venueId, body.event);
  if (v.error) return json(400, { error: v.error });
  if (spotOut) v.event.spot = spotOut;
  const owner = ownerHash(client);
  if (body.event && body.event.id) {
    const existing = (await store.list('events')).find((e) => e.id === v.event.id);
    if (existing && existing.owner !== owner && !adminOk(code) && !codeOk(venueId, code)) {
      return json(403, { error: 'Only the person who added a listing can change it.' });
    }
    v.event.owner = existing ? existing.owner : owner;
    if (existing && existing.spot && !v.event.spot) v.event.spot = existing.spot;
  } else {
    v.event.owner = owner;
  }
  await store.upsert('events', v.event);
  return json(200, { ok: true, event: v.event });
}
async function handleEventDelete(body, code) {
  const venueId = str(body && body.venueId, 80);
  const client = str(body && body.client, 64);
  const id = str(body && body.id, 120);
  const store = getStore();
  if (!store) return noStore();
  if (!adminOk(code) && !codeOk(venueId, code)) {
    if (await isClaimed(store, venueId)) {
      return json(401, { error: 'This venue manages its own listings — its code is needed.' });
    }
    const existing = (await store.list('events')).find((e) => e.id === id);
    if (!existing) return json(404, { error: 'Listing not found.' });
    if (existing.owner !== ownerHash(client)) {
      return json(403, { error: 'Only the person who added a listing can remove it.' });
    }
  }
  const removed = await store.remove('events', id, venueId);
  return json(removed ? 200 : 404, removed ? { ok: true } : { error: 'Listing not found.' });
}

async function handleVenuesList() {
  const store = getStore();
  if (!store) return noStore();
  const [venues, ratings, claims] = await Promise.all(
    [store.list('venues'), store.list('ratings'), store.list('claims')]);
  const agg = {}, eAgg = {};
  for (const r of ratings) {
    const bucket = r.eventId
      ? (eAgg[r.eventId] = eAgg[r.eventId] || { sum: 0, count: 0 })
      : (agg[r.venueId] = agg[r.venueId] || { sum: 0, count: 0 });
    bucket.sum += r.stars; bucket.count++;
  }
  const roll = (src) => Object.fromEntries(Object.entries(src).map(([k, a]) =>
    [k, { avg: Math.round((a.sum / a.count) * 10) / 10, count: a.count }]));
  return json(200, {
    venues: venues.filter((v) => v.status === 'approved').map(publicVenue),
    ratings: roll(agg),
    eventRatings: roll(eAgg),
    claimed: claims.map((c) => c.id),
  });
}
async function handleVenueSubmit(body) {
  const store = getStore();
  if (!store) return noStore();
  const v = validateVenue(body);
  if (v.error) return json(400, { error: v.error });
  await store.upsert('venues', v.venue);
  return json(200, { ok: true, id: v.venue.id });
}
async function handleModerate(body, code) {
  if (!adminOk(code)) return json(401, { error: 'Wrong admin code.' });
  const store = getStore();
  if (!store) return noStore();
  const action = str(body && body.action, 20);
  if (action === 'list') {
    const venues = await store.list('venues');
    const withCodes = venues.map((v) => ({ ...v, code: venueCode(v.id) }));
    return json(200, { venues: withCodes });
  }
  const id = str(body && body.id, 120);
  const all = await store.list('venues');
  const v = all.find((x) => x.id === id);
  if (!v) return json(404, { error: 'Not found.' });
  if (action === 'approve') {
    v.status = 'approved';
    await store.upsert('venues', v);
    return json(200, { ok: true, code: venueCode(v.id), email: v.email });
  }
  if (action === 'reject') {
    await store.remove('venues', id, id);
    return json(200, { ok: true });
  }
  return json(400, { error: 'Unknown action.' });
}
// verify/lock a venue: once claimed, its listings need its code (any venue id,
// baked or community). Returns the code to hand to the business.
async function handleClaim(body, code) {
  if (!adminOk(code)) return json(401, { error: 'Wrong admin code.' });
  const store = getStore();
  if (!store) return noStore();
  const id = str(body && body.id, 120);
  if (!id) return json(400, { error: 'Which venue?' });
  if (str(body.action, 20) === 'unclaim') {
    await store.remove('claims', id, id);
    return json(200, { ok: true });
  }
  await store.upsert('claims', { id, claimed: new Date().toISOString() });
  return json(200, { ok: true, code: venueCode(id) });
}
async function handleRate(body) {
  const store = getStore();
  if (!store) return noStore();
  const venueId = str(body && body.venueId, 80);
  const client = str(body && body.client, 64);
  const eventId = str(body && body.eventId, 120);
  const stars = Number(body && body.stars);
  if (!venueId || client.length < 8) return json(400, { error: 'Bad request.' });
  if (!(stars >= 1 && stars <= 5)) return json(400, { error: 'Stars must be 1–5.' });
  const hash = crypto.createHash('sha256').update(client).digest('hex').slice(0, 16);
  await store.upsert('ratings', {
    id: eventId ? `e-${eventId}-${hash}` : `${venueId}-${hash}`,
    venueId, ...(eventId ? { eventId } : {}), stars: Math.round(stars),
    updated: new Date().toISOString(),
  });
  return json(200, { ok: true });
}

// ---- Saddleworth Pool League fixtures (saddleworthpoolleague.co.uk) ----
// Read-only feed proxied server-side (no CORS, one fetch per half hour) and
// mapped onto the host pubs' pins. League venues outside the map are skipped.
const POOL_BASE = 'https://www.saddleworthpoolleague.co.uk/api';
const POOL_VENUES = {
  'Hare & Hounds': 'hare-and-hounds',
  'Top House': 'top-house',   // the Springhead pub on Co-operative Street, NOT the Swan's nickname
  'Oddfellows': 'oddfellows',
  'Northgate': 'northgate',
  'Weavers Arms': 'weavers-arms',
  'Bridge Inn': 'bridge-inn',
  'Shawside A': 'the-shawside',   // two tables, one clubhouse on Grains Road
  'Shawside B': 'the-shawside',
  // Springhead SSC plays out of the former Springhead Liberal Club building
  'Springhead SSC': 'springhead-liberal-club',
};
let poolCache = { at: 0, body: null };
async function handlePool() {
  if (poolCache.body && Date.now() - poolCache.at < 30 * 60 * 1000) {
    return json(200, poolCache.body);
  }
  try {
    const get = async (p) => (await fetch(POOL_BASE + p)).json();
    const seasons = await get('/seasons');
    const active = (seasons || []).filter((s) => s.isActive && !s.hidden);
    const events = [];
    for (const season of active) {
      const [teams, fixtures] = await Promise.all([
        get(`/seasons/${season.id}/teams`), get(`/seasons/${season.id}/fixtures`),
      ]);
      const tmap = new Map((teams || []).map((t) => [t.id, t]));
      for (const f of (fixtures || [])) {
        if (!f.date) continue;
        const home = tmap.get(f.homeTeamId), away = tmap.get(f.awayTeamId);
        const slug2 = home && POOL_VENUES[home.venue];
        if (!slug2) continue;
        events.push({
          id: 'pool-' + f.id, venueId: slug2,
          title: `🎱 Pool: ${home.name} v ${away ? away.name : 'TBC'}`,
          category: 'active', start: f.date, time: 'League night',
          description: `Saddleworth Pool League — ${season.name}${f.week ? ', week ' + f.week : ''}.` +
            ' Frame-by-frame live scoring on saddleworthpoolleague.co.uk.',
          source: 'https://www.saddleworthpoolleague.co.uk', pool: true,
        });
      }
    }
    poolCache = { at: Date.now(), body: { events } };
    return json(200, poolCache.body);
  } catch {
    return json(200, { events: [] }); // the league being unreachable never breaks the map
  }
}

module.exports = {
  venueCode, codeOk,
  handleEventsList, handleVerify, handleEventUpsert, handleEventDelete,
  handleVenuesList, handleVenueSubmit, handleModerate, handleClaim, handleRate,
  handlePool,
};
