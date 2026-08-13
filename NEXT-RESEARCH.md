# Outstanding research & maintenance — Saddleworth Live

**Read `RESEARCH-LOG.md` first** — it records what was already checked (with
dates, sources and dead ends). Give research agents the "already checked" list
so they don't re-crawl the same ground. Everything below is genuinely open as
of 12 Aug 2026; recheck dates come from the log.

---

**PROMPT:**

Work on the Saddleworth Live map (repo `D:\GitHub\AIbility\saddleworth-whats-on`,
live at saddleworthlive.co.uk — your memory has the project details). Read
`RESEARCH-LOG.md`, exclude recently-checked sources from agent prompts, seed
verified findings into `app/data/events.json` with source URLs, log the sweep,
and deploy.

**Dates to confirm as they're announced** (all seeded TBC where a pattern exists):
- Delph Party in the Park 2026 — recheck ~1 Sep (Wake Up Delph FB / ticketsource)
- Uppermill Bonfire (seeded Sun 1 Nov TBC) — recheck late Sep/Oct (UCBC Facebook)
- Santa Dash & Winter Wonderland (seeded Sat 5 Dec TBC) — recheck ~mid-Sep
  (Saddleworth Round Table)
- Village Christmas switch-ons (Delph/Dobcross/Greenfield/Diggle/Springhead) —
  recheck mid-Nov (saddind.co.uk what's-on guide)
- Grandpa Greene's reopening (closes 2 Sep; "Dec 2026" vs "2027" conflict) —
  recheck ~Nov 2026, update card + hours
- Dinnerstone under Muse Group — recheck ~Oct 2026 for name/date/hours
- 2027 re-seeds when announced: GMCL cricket Saturdays (7 clubs + juniors),
  Diggle Blues (June), Whit Friday (21 May 2027 seeded), Rushcart, Beer & Cider
  Festival (1st Sat Jul), sailing programme, Diggle AC match nights (May–Sep)

**Offers upkeep (from 13 Aug sweep — see log for what's already covered):**
- White Hart set menu: their /event/may-dining-deals/ page rolls monthly — recheck
  at each month's start and update the seeded event's dates/prices
- Kingfisher 40%-off (ends 6 Sep) and kids-£1 (ends 28 Aug) age out on their own;
  check /offers for replacements when they do
- Waggon Moo-Monday pricing + "Weekly Offers" page (currently empty) — phone or FB
- Abaco promotions live in their menu PDF (April 2026 vintage) — recheck ~quarterly
- FB-only leads to confirm before listing: Bulls Head tapas nights, Milan Bar/"Devi
  Lounge" bottomless lunch, Crumbles afternoon tea, Red Lion Lees food
- Hours rule of thumb: site times are often KITCHEN times — cross-check the bar
  close on Google/Dish Cult before seeding (that was the Muse complaint)

**Phone/ask-level gaps (web is exhausted — see log before re-searching):**
- Boarshurst Band Club kids activities — user believes something runs; get
  specifics from them or the club (01457 875836 / boarshurstband.co.uk)
- Girlguiding Saddleworth unit nights — register interest on girlguiding.org.uk
  or ask on local FB; nothing is published
- Delph Tots day/time — email nataliefinn@rocketmail.com
- Saddleworth Angling Society — phone 01457 874922 / 07762 757026 before seeding
  waters (site suspended, details are 2020–22 vintage)
- Saddleworth Golf juniors — site /juniors/ 500s; ring 01457 873653
- Little Voices weekly lesson day — saddleworth@littlevoices.org.uk
- Saddleworth Rangers U8s–U18s training nights — site down; 01457 876077
- Dobcross Youth Band exact start (18:00 vs 18:30) — bbe.org.uk page in a real
  browser, or 07828 099296
- UCBC junior Friday clock time — events@ucbc.club
- Springhead SSC hours are Dec 2022 CAMRA vintage — refresh opportunistically

**Watchlist:**
- Sapore Pizza (97 High St, Uppermill) — FSA "awaiting inspection", no web
  presence; check ~Oct 2026 whether it actually opened
- Bakestones (Delph business centre) — FSA-registered bakery, retail hours
  unknown; verify walk-in trade before pinning
- SSSS singles group — dormant-looking; check their Facebook before ever seeding

**Maintenance:**
- Re-run `scripts/build-venues.js` + `scripts/build-basemap.js` monthly-ish
  (CLOSED/ALWAYS lists in build-venues.js carry local corrections; shop kinds
  — bakery/deli/cheese/farm/confectionery — bake as kind `shop` since Aug 2026)
- Pool-league season rollover happens automatically via /api/pool

**Rules:** only sourced facts; mark expected dates "confirm nearer the time";
closed venues go in the CLOSED list; the user's local knowledge overrides web
sources; log every sweep in RESEARCH-LOG.md.
