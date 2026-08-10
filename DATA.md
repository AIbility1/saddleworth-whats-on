# The data

Three layers, deliberately separate:

| Layer | What | Where it comes from |
| --- | --- | --- |
| `data/venues.json` | **The directory** — every pub, café, restaurant, takeaway, hall, museum and sports club in Saddleworth, with real names, coordinates and any contact details | **Baked from OpenStreetMap** by `scripts/build-venues.js` — don't hand-edit |
| `data/events.json` | **The editorial layer** — venue blurbs/tags, walks, sights, and hand-curated events (verified real ones, each with a `source` URL) | Hand-written; the file you edit |
| the **community API** (`api/`) | Day-to-day events, offers and voucher codes added by venues themselves; community-submitted businesses (moderated); star ratings | Cosmos DB in production, `.local-data/` files in dev |

Re-running the bake scripts refreshes geography and the directory (new venues
appear automatically as OSM learns about them) **without touching editorial or
community data**.

## How the community layer works

- Every business's card has *"Run this place? Add your events"*. A venue
  unlocks it with its **venue code** (derived from `VENUE_CODE_SECRET` —
  `scripts/venue-codes.js` prints them; hand one to a venue once, e.g. by
  Facebook message). Their listings go live immediately and they can edit or
  delete them.
- *"Add a missing business"* (left panel) is open to everyone but lands in a
  **moderation queue** — open the site with `#admin` to approve or remove.
  Approval reveals the new venue's code and contact email so you can send it.
- **Ratings** are anonymous 1–5 stars, one per browser per venue; re-rating
  replaces the old vote. No review text, so nothing to moderate.

## Refreshing the baked data

```bash
node scripts/build-basemap.js   # the drawing: lanes, water, rail, woods
node scripts/build-venues.js    # the directory: every venue, re-slugged
```

`build-venues.js` keeps only venues inside the parish (anchor circles around
each village — see `VILLAGES` in the script; Oldham, Shaw, Marsden and Mossley
fall inside the raw bounding box and are filtered out). Venue ids are slugs of
their OSM names (`The Church Inn` → `church-inn`); if a re-bake renames a slug
that `events.json` references, the app just skips those events — the console
count on the left panel makes a missing venue obvious quickly.

## events.json

```jsonc
{
  "venueExtras": {                    // editorial on top of a baked venue, by id
    "church-inn": {
      "type": "Pub & brewery",        // optional override of the baked type
      "blurb": "One or two sentences of character.",
      "tags": ["Dog friendly", "Real ale"],
      "links": { "website": "https://…" },   // OSM's own links win on conflict
      "photo": "assets/venues/church-inn.jpg",
      "menu": { "note": "…", "sections": [
        { "name": "Mains", "items": [
          { "name": "Steak pie", "desc": "with chips", "price": "£14" } ] } ] }
    }
  },
  "customVenues": [                   // real places OSM doesn't know (full record)
    { "id": "diggle-hotel", "name": "The Diggle Hotel", "kind": "pub",
      "village": "Diggle", "lat": 53.57, "lng": -1.9967, "...": "…" }
  ],
  "events": [ /* see below */ ]
}
```

`kind` (baked, or on custom venues) is one of `pub | cafe | restaurant |
takeaway | hall | attraction | club | sport | walk` — it picks the placeholder
art when there's no photo.

**Walks** are custom venues with `kind: "walk"` plus two extra fields: `walk`
(`{ "km", "time", "grade" }`, shown as chips on the card) and `route` (a list
of `[lat, lng]` waypoints, drawn as a dotted trail on the map and highlighted
when the walk is selected). Walks always get a green 🥾 pin, whether or not
they have events; a guided-walk event attached to one shows up like any other
listing.

**Demo flag:** an event with `"demo": true` gets a small "example" tag in the
UI. Real, verified events should omit it and may carry a `"source": "<url>"`
field recording where the listing came from.

## An event, offer or promotion

Events belong to a venue via `"business": "<id>"`. One-off things happening
somewhere that isn't a business (a festival on the green, the Beer Walk) use an
inline `"venue": { "name", "village", "lat", "lng" }` instead and get their own
map pin automatically.

Every event has a `category`, which controls the pin colour and glyph:

| category    | shown as                 |
| ----------- | ------------------------ |
| `offer`     | 🏷️ Offers & deals        |
| `food`      | 🍺 Food & drink          |
| `music`     | 🎵 Live music            |
| `quiz`      | ❓ Quiz & comedy          |
| `market`    | 🧺 Markets & fairs       |
| `community` | 🎪 Festivals & community |

**One-off** events use `start` (and optionally `end` for multi-day events or
long-running offers — the app shows those under "Ongoing" once they've begun):

```jsonc
{ "id": "rushcart-2026", "business": "church-inn",
  "title": "Saddleworth Rushcart 2026", "category": "community",
  "start": "2026-08-22", "end": "2026-08-23", "time": "All weekend",
  "description": "…", "offer": "Free to watch" }
```

**Recurring** events use `recurrence` instead of `start` — the app expands them
into real dates inside whatever window the visitor picks (the map covers a year
back to a year ahead):

```jsonc
"recurrence": { "freq": "weekly",  "day": "thu" }                 // every Thursday
"recurrence": { "freq": "monthly", "week": 1,  "day": "fri" }     // first Friday
"recurrence": { "freq": "monthly", "week": -1, "day": "sat" }     // last Saturday
"recurrence": { "freq": "weekly",  "day": "sun",                  // seasonal:
                "from": "2026-06-07", "until": "2026-09-06" }     //   summer Sundays only
```

`offer` (the little badge) is optional on any event, as are `time` and
`description`. Dates are `YYYY-MM-DD`, local. One-off events silently age out
of the ±1-year window — leave them as history or prune them when passing.

## The illustrated basemap

`js/map-art.js` draws the map from `data/basemap.json` run through the same
projection the pins use — real shapes, storybook clothes. The canal and railway
split at the Standedge portal (the underground stretch is drawn in faint dashed
"tunnel" notation, and the narrowboat and train only ride the surface runs).
Flourishes — houses, church, mills, sheep, compass, cartouche, clouds — are
hand-placed in that file. The wobbly "hand-drawn" edges come from a seeded PRNG,
so the drawing is identical on every load, by design.

## When a real venue signs up

1. Replace their demo `events` entries with their real programme.
2. Add or extend their `venueExtras` entry: `photo` (drop a ~800×500 JPG in
   `assets/venues/`), real `links`, `menu` if they want one.
3. Commit and push — the workflow redeploys the site automatically.
