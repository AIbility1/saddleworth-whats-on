# Outstanding research & maintenance — Saddleworth Live

Paste the prompt below into a fresh session when ready. Everything feeds
`app/data/events.json` (editorial layer, sourced) and deploys on push.

---

**PROMPT:**

Work on the Saddleworth Live map (repo `D:\GitHub\AIbility\saddleworth-whats-on`,
live at saddleworthlive.co.uk — your memory has the project details). Run
web-research agents for the outstanding items below, then seed verified
findings into the editorial layer with source URLs (same pattern as the
existing events), and deploy.

**New categories to research:**
1. **Fishing** — angling clubs with waters in/around Saddleworth (club names,
   waters, day tickets, junior sections, match nights). Check Oldham &
   district angling associations, any club fishing local lodges/reservoirs.
2. **Dating / singles events** — speed dating or singles socials in or near
   the villages (may be thin; don't force it).

**Unpublished slots to pin down (phone/Facebook-level digging):**
- Springhead Sports & Social Club — confirm location (Yell lists it; its pool
  league team "Springhead SSC" is currently unmapped in POOL_VENUES)
- 20th Oldham Scout Group (Uppermill Methodist) — per-section times
- Girlguiding Saddleworth — Rainbows/Brownies/Guides unit nights per village
- Saddleworth Rangers ARLFC — junior training nights (site was down)
- Delph Tots (Methodist Hall) and Jelly Tots (Greenfield Methodist) — days
- babyballet Greenfield satellite — day; Saddleworth School of Dance — venue/day
- Delph Youth Band rehearsal nights; verify Dobcross Youth Band Tue/Fri times
- Uppermill FC training slots; Saddleworth 3Ds session times
- Oldham Active learn-to-swim day-by-day timetable at Saddleworth pool
- Rock Choir Saddleworth — rehearsal night and venue
- Play2 Diggle opening hours; Little Voices term-time lesson day
- Saddleworth Golf Club junior sessions; UCBC junior cricket Friday times
- Opening hours still missing or dated: Three Crowns (Scouthead), Hare &
  Hounds, Swan Inn Delph (2023 CAMRA), Millgate physical hours

**Dates to confirm as they're announced (currently marked TBC or expected):**
- Delph Party in the Park 2026 (expect late Sept, Delph & Dobcross CC)
- Saddleworth Oktoberfest 2026 (seeded as Sat 3 Oct TBC)
- Uppermill bonfire 2026 (seeded as Sun 1 Nov TBC)
- Santa Dash & Winter Wonderland (seeded as Sat 5 Dec TBC)
- Other villages' Christmas switch-ons
- Grandpa Greene's reopening (expected Dec 2026 — update card)
- Dinnerstone reopening under the Muse group — update card, add hours
- 2027 season re-seeds when announced: cricket GMCL Saturdays (7 clubs +
  juniors + All Stars/Dynamos), Diggle Blues 2027, Beer & Cider Festival,
  Rushcart 2027, Whit Friday 2027 details, sailing 2027 programme
- Re-run `scripts/build-venues.js` and `scripts/build-basemap.js` for OSM
  freshness (CLOSED/ALWAYS lists in build-venues.js carry local corrections)

**Rules:** only sourced facts; mark expected dates "confirm nearer the time";
closed venues go in the CLOSED list; the user's local knowledge overrides
web sources.
