# Research log — what was checked, when, and what it said

Purpose: stop repeat research during development bursts. Before launching web
agents, read this log and EXCLUDE anything checked recently (give agents the
"already checked" list). Rechecking is fine after the "recheck" date — sooner
only if there's a reason (an announcement window opening, a site coming back
up). Log negative results too: "not found" and "not announced" are answers.

Format: one section per sweep date; per item — verdict, key sources, recheck hint.

---

## 13 Aug 2026 sweep (user feedback round: locations, Muse hours, food offers; 2 web agents + OSM audit)

### Venue coordinates (SETTLED — audited & fixed; method below)
- **Every OSM-baked venue in Diggle matches live OSM exactly** — the bake is faithful;
  when a baked pin looks wrong the error is in OSM itself, not our pipeline.
- **9 hand-placed customVenues were wrong; all fixed** against OSM building footprints:
  diggle-hotel (~480m off → 53.56911,-1.98948, by the Standedge portal — this was the
  Diggle complaint), play2-diggle (Warth Mill → 53.56738,-1.99507), rspb-dove-stone
  (pin was in the water → Bank Lane car park 53.5276,-1.9812), walk-dove-stone start
  (→ same car park), castleshaw-roman-fort (→ Rigodunum archaeological_site
  53.5835,-2.00322), uppermill-library (→ 53.5481,-2.00643), greenfield-primary-school
  (~800m → 53.53826,-2.00794), brownhill-countryside-centre (→ 53.5541,-2.0088),
  saddleworth-school (→ 53.5617,-2.0005).
- **Verified correct — don't re-check:** St Chad's, St Mary's Greenfield, St Anne's
  Lydgate, Holy Trinity Dobcross, Christ Church Denshaw, Heights Chapel, Wharmton,
  Pots & Pans obelisk, viaduct, Alphin Pike, Standedge portal, Delph & Dobcross CC,
  Kilngreen, all Diggle/Uppermill baked venues.
- **No OSM reference exists** (positions from FSA/local knowledge, unverifiable by
  map data): springhead-cricket-club, dobcross-band-social-club, tanners-dam,
  little-village-saddleworth, nine-lives, hot-duck, bay-leaf, tunnel-end-pies,
  evade-martial-arts, nurture-saddleworth, top-house, the-shawside.
- **Method (repeatable):** Overpass `nwr["name"~"…"](bbox)` via curl (must send a
  User-Agent; the API 406s without one), haversine-compare against our lat/lng,
  eyeball anything >120m. New hand-placed venues: always pull coords from OSM/FSA
  at entry time rather than eyeballing the illustrated map.

### Muse Uppermill (SETTLED — the user was right)
- **The website's times are KITCHEN times; the bar runs later.** Dish Cult
  (dishcult.com/restaurant/musebareatery) + Google agree: bar Tu–Th & Su to ~22:30,
  Fr–Sa to ~01:00; kitchen 20:15 / 20:45 / 18:45. Card now shows bar hours with
  food times in brackets. Recheck: only if the venue says so.
- **cafe-muse was a stale 2023 OSM duplicate** (building tag) of the current `muse`
  node (updated Jun 2026) — added to CLOSED in build-venues.js, removed from bake.
  Muse Annex kept (separate café, unconfirmed either way).
- findmea.pub's "Muse steak night Monday" is STALE (Muse closes Mondays) — ignore it.
- 2-for-£15 cocktails Sun–Thu confirmed current (site); Brunch After Dark is last-Fri
  monthly £45 (our card was already right).

### Food & drink offers (2 agents, ~200 fetches — 20 offers seeded with sources)
- **Seeded (all confirmed-current on venue's own site/menu unless noted):**
  Old Bell steak day Thu £39.95-for-two; Rams Head all-day Sunday roasts + weekend
  breakfast; Old Original fixed-price menu, Monday curry £10, Freebie-Friday steak
  starter, tapas updated to 5-for-£25 (was £20, now sourced from their own menu.pdf);
  Kings Arms Grains Bar lunch/early-bird set menus + Sunday lunch; Fresca express
  menu + Sunday roast; Roebuck Sunday lunch; Grapes kids-eat-£1 Mon–Thu; Weavers
  Arms wine Wednesday + fizz Friday; White Hart Aug set menu (ends 31 Aug — their
  /event/may-dining-deals/ URL rolls monthly, recheck monthly) + Friday chippy tea
  £19; Navigation 2-for-£22 classics + small-plates 3-for-£12 (Aug 2026 menu PDF);
  42 High St early bird Fri/Sat; Abaco small-plate Thursday 3-for-£25 (the user's
  Abacco tip — confirmed) + 2-for-1 pizzas Mon/Tue + 2-for-1 classics Wed + fish,
  frites & prosecco £50 Fri; Kingfisher 40%-off voucher (ends 6 Sep) + kids-£1
  (ends 28 Aug) + Moretti Friday; Waggon 20% summer-hols family offer (ends 1 Sep).
  Royal George & White Lion existing listings re-verified unchanged.
- **No published offers — don't re-crawl for ~6 months:** Swan Delph, Junction Inn
  (old domain thejunctioninndenshaw.com is HIJACKED by spam — never link it),
  Printers Arms (menu on site dated Jun 2024 — stale), Three Crowns, Spinners Arms,
  Chapter One, Lees Spice Lounge, Paach Baii (Just Eat only, shut Tue), Angel Inn,
  Front House, Bridge Inn, Waterhead Tandoori, Sweet & Smooth, Village Manor,
  Little Owl, Delph Band Club, Oddfellows (now members' club "The Oddies"),
  Church Inn, Granby (Fri disco/Sun karaoke only), Hare & Hounds, Commie (site dead
  since 2017), Albion Tap, Greene's Bistro, Diggle Lock, Gate Inn (own site
  unreachable), Swan Dobcross (site unreachable), Railway Inn, Wellington, Dysarts.
- **FB/phone-level gaps (web exhausted):** Bulls Head tapas (site SSL-broken, FB
  "Tapas At The Bulls Head Delph" login-walled); Milan Bar seems rebranded "The Devi
  Lounge" with a Fri–Sun bottomless lunch — confirm name+price on FB; Crumbles
  afternoon teas (Tripadvisor only); Red Lion Lees (site says "food coming soon",
  news page 2021 — contradicts directories); Kings Arms "weekly offers" teaser;
  White Hart old 2-4-1 Mon/Tue (looks superseded by the set menu — confirm before
  ever listing); Navigation Wednesday curry night; Waggon Moo-Monday pricing (their
  Weekly Offers page currently empty); Saddleworth Hotel afternoon tea price.
- **Venue status:** Scarlotti's (Saddleworth Hotel) residents/private-only, public
  reopening "2026" — noted on card. Diggle Hotel kitchen still closed ("reopening
  soon"). Dinnerstone already logged 12 Aug (Muse Group takeover).
- **Lesson for hours generally: a restaurant site's times are often kitchen times.**
  Check Google/Dish Cult for the bar close before trusting them.

---

## 12 Aug 2026 sweep (8 agents, ~130 searches)

### Fishing (SETTLED — seeded)
- **Diggle Angling Club / Tanners Dam** — VERIFIED CURRENT (club site diggleac.co.uk,
  news May 2026; site sits behind a JS cookie challenge, plain fetchers see a blank
  page). Members only, no day tickets; senior £55 / junior £25 / OAP £45; Thursday
  matches May–Sept; sole water since Jul 2025 (gave up Dowry/New Year's Bridge etc.).
  Seeded. Recheck: annually (membership year starts 1 March).
- **Saddleworth Angling Society** — EXISTS but website saddfish.co.uk SUSPENDED
  (checked 12 Aug 2026). Waters list (Kilngreen, Husteads, Fairbanks, Lea, Eagle Mill,
  Diggle Brook, River Tame, canal Lock 20W–Standedge) is 2020–2022 vintage. NOT seeded
  — phone before publishing: HQ Austerlands 01457 874922; M.Sec Pete Mundy 07762 757026.
  Recheck: when site returns, or call.
- **Oldham Fly Fishing Club** — meets at Springhead Lib Club (noted on that card);
  Piethorne + Kitcliffe trout waters; site ©2020, prices members-only. offc.org.uk.
- Dead ends (don't re-search): "Oldham & District Amalgamated Anglers" doesn't exist;
  Castleshaw reservoirs have no findable permit scheme; Dove Stone is sailing-only;
  Yeoman Hey fly-fishing claim (dovestonepark.co.uk) is demonstrably stale; Cairo AC
  (Denshaw) and Shaw Anglers only in old directories/forums — low confidence.

### Dating / singles (SETTLED — nothing seedable)
- **SSSS (Singles & Socials Society of Saddleworth)** — real (saddind.co.uk Jan+May
  2025) but looks dormant: sssofsaddleworth.co.uk dead (TLS fail), Eventbrite zero
  upcoming, nothing indexed after Nov 2025. NOT seeded. Only live channel would be
  their Facebook (ID 61569601693274) — needs a logged-in check or email
  sssofsaddleworth@gmail.com. Recheck: only via those channels; don't re-crawl the web.
- Speed dating: nothing in Saddleworth/Oldham/Mossley/Stalybridge/Ashton at all
  (Skiddle's Oldham page falls back to Salford; Fastlove has no venue east of
  Manchester; Eventbrite Ashton dating category empty). Don't re-search generally —
  the area is dry; nearest is central Manchester/Salford.

### Autumn/winter 2026 dates (checked against 2026 calendar — snippets lie)
- **Oktoberfest Sat 3 Oct 2026** — CONFIRMED (Oldham Times 26093812; weekday maths
  proves it's a 2026 announcement). Seeded confirmed. Done.
- **Delph Party in the Park 2026** — NOT ANNOUNCED as of 12 Aug. 2025 announcement
  landed ~31 Aug. RECHECK ~1 Sep 2026 (Wake Up Delph FB, ticketsource.co.uk/wake-up-delph).
- **Uppermill Bonfire** — NOT ANNOUNCED; pattern = 1st Sun Nov (seeded TBC Sun 1 Nov).
  UCBC's own event page still shows 2023. RECHECK late Sept/Oct (UCBC Facebook).
- **Santa Dash / Winter Wonderland** — NOT ANNOUNCED; 2025's came 22 Sep. Seeded TBC
  Sat 5 Dec. RECHECK ~mid-Sep 2026 (Saddleworth Round Table Eventbrite/FB, saddind).
- **Village lights switch-ons** (Delph/Dobcross/Greenfield/Diggle/Springhead) — 2026
  NOT ANNOUNCED; the circulating "Sat 30 Nov" dates are the 2024 guide. Pattern:
  last Sat of Nov (Delph+Dobcross+Greenfield same day), Diggle 2nd Sat Dec at the
  Diggle Hotel, Springhead the Fri before. RECHECK mid-Nov 2026 (saddind what's-on guide).
- **2027 re-seeds** — Diggle Blues (mid/late June), Rushcart (weekend before Aug BH),
  Beer & Cider Fest (1st Sat July, Boarshurst): none announced. Don't recheck before 2027.

### Venue hours / reopenings (SETTLED unless noted)
- **Three Crowns Scouthead** — hours seeded from CAMRA (updated 20/07/2026): Mon off,
  Tue–Wed 16–23, Thu–Sun 12–23. Done.
- **Hare & Hounds** — existing hours corroborated (CAMRA 2023 + live Fanzo agree). Done.
- **Swan Inn Delph** — same hours on all live sources as the 2023 CAMRA data (Mon–Fri
  15–23, w/e 13–23); JW Lees' own page publishes no hours. Treat as current. Done.
- **Millgate Arts Centre** — no physical box-office/gallery hours exist to find; seeded
  the Delph Library hours inside the building (Tu–Th 14–17, Fr–Sa 10–13) + bar-around-shows.
  Don't re-search; only a phone call (01457 874644/876644) would add more.
- **Grandpa Greene's** — closes 2 Sep 2026, rebuild approved Nov 2025; reopening
  CONFLICTED (britbrief 8 Aug: Dec 2026; Oldham Times headline: "until 2027"). Card says
  winter 2026/27. RECHECK ~Nov 2026.
- **Dinnerstone** — Muse Group takeover CONFIRMED (~Aug 2026, Oldham Times 26435973);
  no reopening date/name/hours yet. RECHECK ~Oct 2026 or when Muse announces.
- **Springhead Sports & Social Club** — SETTLED: former Springhead Liberal Club (user
  knowledge + CAMRA + FSA), 136 Oldham Road OL4 5SN, FB springheadlibs. Pool team mapped,
  card renamed. Club hours on card are CAMRA 28/12/2022 vintage — refresh opportunistically.

### Takeaways / food shops (SETTLED — seeded; FSA OL3 register swept 12 Aug 2026)
- Added: Buckleys (89 High St, trading May 2026), Tyromancer (new 2026), Tunnel End
  Pie Co (pre-order collection Mo–Fr 11–13), Hot Duck (upstairs at Hei Hei), Bay Leaf
  Delph, Nine Lives + Harrops (Greenfield), Dobcross Village Store, Old Cobblers +
  Village Bakery (via OSM shop bake).
- Corrections: Golden House + Saddleworth Pizza are Greenfield (not Grasscroft);
  Betty's chippy closed → premises now Kobe Coffee; Golden Dragon is Uppermill's only
  chippy; Blackbird & Wilde (Grasscroft) gone from OSM + website parked → treated closed.
- Watchlist: **Sapore Pizza** (97 High St, FSA "awaiting inspection", no web presence —
  possibly not yet open; recheck ~Oct 2026); **Bakestones Delph** (FSA-registered, retail
  hours unknown — likely wholesale; verify before pinning); Pizza Love likely closed.
- Greenfield has NO dedicated chippy/kebab/Chinese shopfront other than Golden House —
  that's an answer, not a gap; don't re-sweep.

### Sport sessions (SETTLED where published)
- **Uppermill AFC** — per-team nights (site slugs mislabelled, content quoted as-is):
  U9s Tue 18–19 leisure-centre 3G (seeded); Walking Football Tue 15–16 (seeded); U13s
  Wed (Astley School, off-map); U16 Blues Mon + Men's Thu 19:30–21 (Mossley Hollins,
  off-map). Full club grid = check remaining team pages if ever needed.
- **Saddleworth 3Ds** — football club (NOT running). Academy 4–7s Mon 17–18 term time
  at Saddleworth School (site footer ©2020 — flagged in seed). 8–11 academy group time
  unpublished.
- **Oldham Active swim lessons** — day-by-day lesson times ARE NOT PUBLISHED anywhere
  (portal booking only) — that's the answer; don't re-search. Pool programme PDF is
  weekly and holiday/term-variant; card links the timetable page instead.
- **Saddleworth Golf juniors** — /juniors/ page 500s (checked repeatedly 12 Aug);
  nothing published elsewhere. RECHECK when site fixed, or ring 01457 873653.
- **UCBC juniors** — "Fridays night" training confirmed on 2026 page, NO clock time
  published (seeded as such). U9/U13/U17 this season (no U11/U15). All Stars/Dynamos
  NOT running 2026 (last trace 2022).
- **Rock Choir** — active (listing touched 11 Aug 2026); rehearsal Tue 20:00 at
  Saddleworth School per Apr 2024 listing (seeded with caveat); rockchoir.com group page
  404s to non-JS fetchers. Con Club is their CONCERT venue only.
- Bonus logged: Saddleworth Sharks SC — trials Mon 18–19 at the pool (undated directory).

### Toddlers / dance / kids providers (SETTLED where published)
- **Jelly Tots** — Fri 09:30–11:30, Greenfield Methodist lower hall, £4/family (FB posts
  Feb 2025, page active Jan 2026). Seeded.
- **Tuesday Tots** — already seeded from church site; agent's FB find (Tue 10–11:30, £4)
  matches. Cross-validated.
- **Delph Tots** — NO published day/time exists (no FB page; Delph CA lists venue+email
  only). Only route: email nataliefinn@rocketmail.com. Don't re-crawl.
- **babyballet** — Satellite Centre, Fri + Sat mornings (ClubHub + FB 10 Jul 2026);
  clock times only inside booking widget. Seeded as "mornings".
- **Saddleworth School of Dance** — full Sept-2026 timetable from live ClassForKids
  booking page (Tue/Wed/Thu at Civic Hall). Seeded. Freshest data in the sweep.
- **Play2 Diggle** — full term/holiday hours from playoldham.co.uk. Seeded. Site warns
  hours change — recheck opportunistically.
- **Little Voices** — active Aug 2026 (Matilda camp seeded); weekly lesson day NOT
  published ("midweek after school, from ~4:40pm, Civic Hall"). Ask
  saddleworth@littlevoices.org.uk if it matters.

### Pool league venue corrections (12 Aug, user-prompted)
- **"Top House" ≠ the Swan Dobcross nickname.** League's Top House = the actual pub at
  38 Co-operative Street, Springhead OL4 5TB (FSA, inspected Mar 2025; not in OSM —
  customVenue). Swan's nickname noted on its card. Fixture mapping corrected.
- **The Shawside**, Grains Road, Shaw OL2 8JB (FSA geocode) — hosts Shawside A/B/C/C2
  on two tables; customVenue added, both league venue strings mapped.

### Walks & sights (12 Aug, user-reported errors — all rebuilt from OSM)
- All 8 walk routes now follow real geometry (canal/Tame/trackbed/Chew Road/Boat Lane/
  Waterworks Rd/lanes) via scratch Dijkstra router; sights snapped to OSM truth —
  biggest errors: Alphin Pike 2.3km, Wharmton mast 909m, viaduct 867m. Distances
  re-measured. Method notes live in the session scripts; re-do the same way if OSM shifts.

### Scouts / Guides / youth bands / Boarshurst kids
- **20th Oldham Scouts** — SEEDED from live scouts.org.uk finder (group 10016719):
  Tue term time, Beavers 18–19 / Cubs 19–20 / Scouts 20:15–21:15; no Squirrels.
  CONFLICT: group's own site (20tholdham.co.uk, stale content) says Cubs 18:30–20 /
  Scouts 19:45–21:15 — went with the official finder + "double-check" note.
- **Girlguiding Saddleworth** — NOT SEEDABLE. Unit finder publishes nothing without
  registration; only find is Uppermill Brownies "Wednesdays" from a Jan 2022 unit-at-risk
  article. FB/IG saddleworthbrownies exist but nothing public. 42nd Oldham (Kiln Green)
  Diggle Brownies named, no night. Only route: register interest on girlguiding.org.uk
  or ask locally. NB saddleworthbrownie.co.uk is a BAKERY. Don't re-crawl.
- **Saddleworth Rangers ARLFC** — site STILL DOWN (connection refused 12 Aug 2026).
  Seeded Tots (Mon/Thu 18:00–18:45) + U7s (Mon 18:00) from Oct 2025 Wayback of the
  club's own /teams pages, flagged. U8s–U18s training fields blank even on their own
  site. Club office 01457 876077 (11–14). Recheck when site returns.
- **Boarshurst Band Club kids** — NOTHING CURRENT VERIFIABLE: youth band last competed
  Feb 2008 (brassbandresults), club site + saddind tag (to Jun 2026) show concerts/
  festivals only. User believes kids things happen there — awaiting their specifics.
- **Delph Youth Band** — SEEDED: Sat 10:30–12:30 at Delph Band Club (actiontogether
  directory, live). Per-group split unpublished. Senior band Mon+Wed 20–22 (delphband.co.uk).
- **Dobcross Youth Band** — Tue+Fri CONFIRMED; start time conflicted (18:00 per 2021
  own-site page vs 18:30 per bbe.org.uk snippet, JS-walled). Cards now say "beginners
  first — confirm start", contact 07828 099296. Recheck only via bbe page in a browser.
