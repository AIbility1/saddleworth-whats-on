/* map-art.js — the hand-drawn Saddleworth basemap.
   Geometry is real: data/basemap.json is baked from OpenStreetMap by
   scripts/build-basemap.js (roads, canal, river, rail, reservoirs, woods, the
   golf course), then everything is dressed in storybook ink-and-wash. The
   flourishes — houses, sheep, compass, cartouche — are drawn here by hand.
   Deterministic jitter (seeded PRNG) keeps the wobble identical every load. */

(function () {
  'use strict';

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const INK = '#56503f';
  const COL = {
    meadow: '#b7cf92', field: '#c8d9a4', fieldSun: '#d3d9a0',
    moor: '#c6b795', moorEdge: '#b3a37e', heather: '#a98bb5',
    park: '#aed09a', golf: '#b9d69b', wood: '#7ba05e', woodEdge: '#5d8547',
    water: '#8ec3e6', waterDeep: '#4f86ad',
    road: '#f8f0dc', roadEdge: '#c2b28b',
    rail: '#4c4a42', stone: '#d9cdb4', slate: '#7d8791', brick: '#b0614f',
    wall: '#8f8568', treeTop: '#6f9c53', treeDark: '#4e7a3f', trunk: '#7a5c3e',
    paper: '#f4f3ee',
  };

  function build(svg, project, W, H, geo) {
    const rnd = mulberry32(7);
    const jit = (amt) => (rnd() - 0.5) * amt;
    const P = (lat, lng) => project(lat, lng);
    const pts = (arr) => arr.map(([la, ln]) => P(la, ln));
    const r1 = (n) => Math.round(n * 10) / 10;

    function smooth(points, closed) {
      const p = points.map(([x, y]) => [r1(x), r1(y)]);
      if (p.length < 3) return 'M' + p.map((q) => q.join(',')).join(' L');
      const n = p.length;
      let d = 'M' + p[0].join(',');
      for (let i = 0; i < (closed ? n : n - 1); i++) {
        const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
        const a = closed || i > 0 ? p0 : p1;
        const b = closed || i < n - 2 ? p3 : p2;
        const c1 = [r1(p1[0] + (p2[0] - a[0]) / 6), r1(p1[1] + (p2[1] - a[1]) / 6)];
        const c2 = [r1(p2[0] - (b[0] - p1[0]) / 6), r1(p2[1] - (b[1] - p1[1]) / 6)];
        d += `C${c1},${c2},${p2}`;
      }
      return d + (closed ? 'Z' : '');
    }
    function blob(cx, cy, rx, ry, n, wob, rot) {
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (rot || 0);
        out.push([cx + Math.cos(a) * rx * (1 + jit(wob)), cy + Math.sin(a) * ry * (1 + jit(wob))]);
      }
      return smooth(out, true);
    }
    const line = (points, closed) => smooth(points, closed);
    // walk a polyline to the point (and direction) at a length fraction
    function pointAt(poly, frac) {
      let total = 0;
      const seg = [];
      for (let i = 1; i < poly.length; i++) {
        const d = Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
        seg.push(d); total += d;
      }
      let want = total * frac;
      for (let i = 0; i < seg.length; i++) {
        if (want <= seg[i]) {
          const t = seg[i] ? want / seg[i] : 0;
          const [x1, y1] = poly[i], [x2, y2] = poly[i + 1];
          return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t,
                   a: Math.atan2(y2 - y1, x2 - x1) };
        }
        want -= seg[i];
      }
      const [x, y] = poly[poly.length - 1];
      return { x, y, a: 0 };
    }

    let s = '';

    // ================= the paper cut-out =================
    const M = 26, steps = 34, edge = [];
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      edge.push([W / 2 + Math.cos(a) * (W / 2 - M) * (1 + jit(0.035)),
                 H / 2 + Math.sin(a) * (H / 2 - M) * (1 + jit(0.035))]);
    }
    const edgePath = smooth(edge, true);
    s += `<defs><clipPath id="paper-clip"><path d="${edgePath}"/></clipPath></defs>`;
    // painted shadow (a filter here would re-render on every zoom frame)
    s += `<path d="${edgePath}" transform="translate(0,11)" fill="rgba(70,58,25,0.13)"/>`;
    s += `<path d="${edgePath}" transform="translate(0,5)" fill="rgba(70,58,25,0.12)"/>`;
    s += `<path d="${edgePath}" fill="${COL.meadow}"/>`;
    s += `<g clip-path="url(#paper-clip)">`;

    // sunlit field patchwork
    const fields = [
      [53.545, -2.03, 120, 60], [53.5555, -2.038, 90, 55], [53.537, -2.024, 100, 50],
      [53.5525, -1.988, 80, 55], [53.564, -2.032, 85, 45], [53.5335, -2.001, 95, 45],
      [53.578, -2.014, 85, 50], [53.5415, -1.9755, 75, 45],
    ];
    for (const [la, ln, rx, ry] of fields) {
      const [x, y] = P(la, ln);
      s += `<path d="${blob(x, y, rx, ry, 9, 0.25, rnd() * 3)}" fill="${rnd() > 0.5 ? COL.field : COL.fieldSun}" opacity="0.5"/>`;
    }

    // the high moors — muted khaki washes over the real high ground
    const moors = [
      // Saddleworth Moor & Standedge, all along the east above the valley
      [[53.612, -1.955], [53.596, -1.938], [53.575, -1.925], [53.552, -1.92], [53.53, -1.928],
       [53.514, -1.947], [53.508, -1.975], [53.518, -1.9865], [53.5365, -1.9815], [53.5525, -1.9765],
       [53.5695, -1.9795], [53.5845, -1.9885], [53.5975, -1.9865], [53.608, -1.972]],
      // the tops above Denshaw & Castleshaw
      [[53.612, -2.1], [53.6135, -2.045], [53.6105, -1.998], [53.5985, -1.996], [53.5905, -2.0165],
       [53.5895, -2.0555], [53.5955, -2.093], [53.605, -2.108]],
      // the western ridge toward Oldham
      [[53.5165, -2.1285], [53.5385, -2.1345], [53.558, -2.128], [53.5675, -2.108], [53.5625, -2.0885],
       [53.5435, -2.0845], [53.5225, -2.0925], [53.5115, -2.11]],
    ];
    for (const m of moors) {
      s += `<path d="${line(pts(m), true)}" fill="${COL.moor}" stroke="${COL.moorEdge}" stroke-width="1.5" opacity="0.65"/>`;
    }
    const heath = [[53.591, -1.9695], [53.5745, -1.9525], [53.5545, -1.9475], [53.5305, -1.9605],
                   [53.6, -2.0615], [53.5525, -2.1055], [53.605, -2.005]];
    for (const [la, ln] of heath) {
      const [x, y] = P(la, ln);
      for (let i = 0; i < 14; i++) {
        s += `<circle cx="${r1(x + jit(56))}" cy="${r1(y + jit(34))}" r="${r1(2 + rnd() * 2.6)}" fill="${COL.heather}" opacity="0.45"/>`;
      }
    }
    const hillmarks = [[53.5975, -1.976], [53.5855, -1.9575], [53.5665, -1.9485], [53.5445, -1.9445],
                       [53.5255, -1.9645], [53.6, -2.028], [53.5955, -2.0755], [53.5535, -2.1085],
                       [53.5345, -2.1005], [53.5665, -2.0985], [53.5775, -1.9985], [53.5615, -1.9675],
                       [53.516, -2.005], [53.6055, -1.9605]];
    for (const [la, ln] of hillmarks) {
      const [x, y] = P(la, ln);
      const w = 16 + rnd() * 12;
      s += `<path d="M${r1(x - w)},${r1(y)} q${r1(w * 0.55)},${r1(-w * 0.9)} ${r1(w)},0 M${r1(x - w * 0.25)},${r1(y + 6)} q${r1(w * 0.4)},${r1(-w * 0.62)} ${r1(w * 0.75)},0"
             fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" opacity="0.38"/>`;
    }

    // ================= real geometry (OSM) =================
    // parks & the golf course, quietly greener than the meadow
    for (const p of geo.parks) s += `<path d="${line(pts(p), true)}" fill="${COL.park}" opacity="0.85"/>`;
    let golfC = null;
    for (const g of geo.golf) {
      s += `<path d="${line(pts(g), true)}" fill="${COL.golf}" stroke="${COL.woodEdge}" stroke-width="1" opacity="0.85"/>`;
      if (!golfC || g.length > golfC.length) golfC = g;
    }
    if (golfC) {
      const c = pts(golfC).reduce((a, q) => [a[0] + q[0] / golfC.length, a[1] + q[1] / golfC.length], [0, 0]);
      s += `<g transform="translate(${r1(c[0])},${r1(c[1])})"><line x1="0" y1="0" x2="0" y2="-14" stroke="${INK}" stroke-width="1.6"/>
            <path d="M0,-14 L9,-11 L0,-8z" fill="${COL.brick}" stroke="${INK}" stroke-width="1"/></g>`;
    }
    // woods, streams, rivers — merged into single paths (fewer nodes, faster raster)
    const joinL = (arr, closed) => arr.map((p) => line(pts(p), closed)).join('');
    if (geo.woods.length) s += `<path d="${joinL(geo.woods, true)}" fill="${COL.wood}" stroke="${COL.woodEdge}" stroke-width="1" opacity="0.75"/>`;
    if (geo.streams.length) s += `<path d="${joinL(geo.streams)}" fill="none" stroke="${COL.water}" stroke-width="1.7" stroke-linecap="round" opacity="0.55"/>`;
    if (geo.rivers.length) s += `<path d="${joinL(geo.rivers)}" fill="none" stroke="${COL.water}" stroke-width="3.4" stroke-linecap="round" opacity="0.9"/>`;
    // reservoirs & ponds
    for (const lk of geo.lakes) {
      s += `<path d="${line(pts(lk.p), true)}" fill="${COL.water}" stroke="${COL.waterDeep}" stroke-width="2"/>`;
    }

    // roads: village lanes thinnest, then lanes-between-villages, then the A-roads
    const cls = { lane: [], minor: [], major: [] };
    for (const r of geo.roads) (cls[r.c] || cls.minor).push(r.p);
    if (cls.lane.length) {
      s += `<path d="${joinL(cls.lane)}" fill="none" stroke="${COL.roadEdge}" stroke-width="3.2" stroke-linecap="round" opacity="0.45"/>`;
      s += `<path d="${joinL(cls.lane)}" fill="none" stroke="${COL.road}" stroke-width="1.9" stroke-linecap="round"/>`;
    }
    if (cls.minor.length) {
      s += `<path d="${joinL(cls.minor)}" fill="none" stroke="${COL.roadEdge}" stroke-width="4.2" stroke-linecap="round" opacity="0.6"/>`;
      s += `<path d="${joinL(cls.minor)}" fill="none" stroke="${COL.road}" stroke-width="2.4" stroke-linecap="round"/>`;
    }
    if (cls.major.length) {
      s += `<path d="${joinL(cls.major)}" fill="none" stroke="${COL.roadEdge}" stroke-width="7" stroke-linecap="round"/>`;
      s += `<path d="${joinL(cls.major)}" fill="none" stroke="${COL.road}" stroke-width="4.2" stroke-linecap="round"/>`;
    }

    // real building footprints, gridded into cells so zoomed-in views only
    // rasterise their own corner of the parish (hidden at far zoom via .lz)
    const cells = new Map();
    for (const b of geo.bld) {
      const q = pts(b);
      const key = `${Math.floor(q[0][0] / 400)}_${Math.floor(q[0][1] / 400)}`;
      const d = 'M' + q.map((p) => `${r1(p[0])},${r1(p[1])}`).join('L') + 'Z';
      cells.set(key, (cells.get(key) || '') + d);
    }
    s += `<g id="bld-layer">`;
    for (const d of cells.values()) {
      s += `<path d="${d}" fill="${COL.stone}" stroke="${INK}" stroke-width="0.7" stroke-linejoin="round"/>`;
    }
    s += `</g>`;

    // Both the canal and the railway dive under the moor at Standedge — split
    // each chain at the portal and draw the underground stretch as faint
    // dashes, the way old maps notate tunnels. The boat and train ride only
    // the longest above-ground run.
    const inTunnel = (la, ln) => la > 53.5722 && ln > -1.999;
    function runs(chain) {
      const out = [];
      let cur = null, curT = null;
      for (const q of chain) {
        const t = inTunnel(q[0], q[1]);
        if (!cur || t !== curT) { cur = [q]; curT = t; out.push({ t, p: cur }); }
        else cur.push(q);
      }
      return out.filter((r) => r.p.length > 1);
    }
    // split each chain ONCE and reuse — the barge/train path identity depends
    // on it (comparing freshly recomputed runs never matches)
    const canalRuns = geo.canal.map((c) => runs(c));
    const railRuns = geo.rail.map((c) => runs(c));
    const longestSurface = (runsList) => {
      let best = null;
      for (const rs of runsList) for (const r of rs) {
        if (!r.t && (!best || r.p.length > best.length)) best = r.p;
      }
      return best;
    };

    // the Huddersfield Narrow Canal
    const bargeRun = longestSurface(canalRuns);
    for (const rs of canalRuns) {
      for (const r of rs) {
        const d = line(pts(r.p));
        if (r.t) {
          s += `<path d="${d}" fill="none" stroke="${COL.waterDeep}" stroke-width="2.4" stroke-dasharray="3 6" stroke-linecap="round" opacity="0.5"/>`;
        } else {
          s += `<path d="${d}" fill="none" stroke="${COL.waterDeep}" stroke-width="6.4" stroke-linecap="round"/>`;
          s += `<path ${r.p === bargeRun ? 'id="canal-path" ' : ''}d="${d}" fill="none" stroke="${COL.water}" stroke-width="3.6" stroke-linecap="round"/>`;
        }
      }
    }
    // lock gates ticked along the flight
    if (bargeRun) {
      const cp = pts(bargeRun);
      for (const f of [0.16, 0.26, 0.36, 0.46, 0.56, 0.66, 0.76]) {
        const q = pointAt(cp, f);
        const px = Math.cos(q.a + Math.PI / 2) * 5, py = Math.sin(q.a + Math.PI / 2) * 5;
        s += `<line x1="${r1(q.x - px)}" y1="${r1(q.y - py)}" x2="${r1(q.x + px)}" y2="${r1(q.y + py)}" stroke="${INK}" stroke-width="2" opacity="0.75"/>`;
      }
    }

    // the railway
    const trainRun = longestSurface(railRuns);
    for (const rs of railRuns) {
      for (const r of rs) {
        const d = line(pts(r.p));
        if (r.t) {
          s += `<path d="${d}" fill="none" stroke="${COL.rail}" stroke-width="2" stroke-dasharray="3 6" opacity="0.45"/>`;
        } else {
          s += `<path d="${d}" fill="none" stroke="${COL.rail}" stroke-width="3.6"/>`;
          s += `<path ${r.p === trainRun ? 'id="rail-path" ' : ''}d="${d}" fill="none" stroke="#f1ead6" stroke-width="1.7" stroke-dasharray="6.5 6.5"/>`;
        }
      }
    }
    // the Standedge Tunnel mouth
    const [tx, ty] = P(53.5735, -1.9955);
    s += `<g transform="translate(${r1(tx)},${r1(ty)})">
            <path d="M-11,4 a11,11 0 0 1 22,0z" fill="#2e2b24" stroke="${INK}" stroke-width="2"/>
            <path d="M-15,5 h30" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/></g>`;

    // dry-stone wall squiggles
    const walls = [
      [[53.5605, -2.052], [53.5575, -2.0425], [53.5595, -2.033]],
      [[53.5505, -2.0345], [53.5475, -2.0265], [53.549, -2.0185]],
      [[53.5725, -2.0455], [53.5695, -2.0365]],
      [[53.5845, -2.0245], [53.5815, -2.0135]],
      [[53.5305, -1.9905], [53.5325, -1.9815]],
      [[53.5875, -1.9985], [53.5905, -1.9895]],
    ];
    for (const w of walls) {
      s += `<path d="${line(pts(w))}" fill="none" stroke="${COL.wall}" stroke-width="2" stroke-dasharray="7 3.5" stroke-linecap="round" opacity="0.7"/>`;
    }

    // ================= landmark glyphs =================
    // Symbolic markers for the far view — hidden at street zoom (.hz), where
    // the real footprints take over.
    s += `<g id="glyph-layer">`;
    function church(la, ln) {
      const [x, y] = P(la, ln);
      return `<g transform="translate(${r1(x)},${r1(y)})">
        <rect x="-4" y="-14" width="8" height="14" fill="${COL.stone}" stroke="${INK}" stroke-width="1.3"/>
        <path d="M-5,-14 L0,-21 L5,-14z" fill="${COL.slate}" stroke="${INK}" stroke-width="1.3"/>
        <line x1="0" y1="-21" x2="0" y2="-25" stroke="${INK}" stroke-width="1.4"/>
        <line x1="-2" y1="-23.4" x2="2" y2="-23.4" stroke="${INK}" stroke-width="1.4"/>
        <rect x="4" y="-9" width="11" height="9" fill="${COL.stone}" stroke="${INK}" stroke-width="1.3"/>
        <path d="M3,-9 L9.5,-14.5 L16,-9z" fill="${COL.slate}" stroke="${INK}" stroke-width="1.3"/></g>`;
    }
    s += church(53.55429, -1.99013);   // St Chad's, from its real building footprint
    s += church(53.57819, -2.02849);   // Heights Chapel on its hillside
    const [ox, oy] = P(53.5455, -1.9868);
    s += `<g transform="translate(${r1(ox)},${r1(oy)})">
      <path d="M-3.5,0 L-1.6,-19 L1.6,-19 L3.5,0z" fill="${COL.stone}" stroke="${INK}" stroke-width="1.4"/>
      <rect x="-5" y="0" width="10" height="3.4" fill="${COL.stone}" stroke="${INK}" stroke-width="1.4"/></g>`;
    // the Wharmton mast — visible from every village, so it goes on the map
    const [mx2, my2] = P(53.5398, -2.0072);
    s += `<g transform="translate(${r1(mx2)},${r1(my2)})">
      <line x1="0" y1="0" x2="0" y2="-24" stroke="${INK}" stroke-width="1.7"/>
      <line x1="-4.5" y1="-6" x2="4.5" y2="-6" stroke="${INK}" stroke-width="1.2"/>
      <line x1="-3.5" y1="-12" x2="3.5" y2="-12" stroke="${INK}" stroke-width="1.2"/>
      <line x1="-2.5" y1="-18" x2="2.5" y2="-18" stroke="${INK}" stroke-width="1.2"/>
      <circle cy="-25.5" r="1.7" fill="#c9463d" stroke="${INK}" stroke-width="0.8"/></g>`;
    // a sail on Dovestone
    const [sx2, sy2] = P(53.5312, -1.9638);
    s += `<g transform="translate(${r1(sx2)},${r1(sy2)})">
      <path d="M-4,3 h8 l-1.6,2.6 h-4.8z" fill="#fff" stroke="${INK}" stroke-width="1.1"/>
      <line x1="0" y1="3" x2="0" y2="-8" stroke="${INK}" stroke-width="1.2"/>
      <path d="M0,-8 L5.5,-1.5 L0.6,-1.5z" fill="#fff" stroke="${INK}" stroke-width="1.1"/></g>`;

    // ================= trees & sheep =================
    function tree(x, y, k) {
      const r = 5 + rnd() * 3;
      return `<g transform="translate(${r1(x)},${r1(y)})"><line x1="0" y1="0" x2="0" y2="-6" stroke="${COL.trunk}" stroke-width="2"/>
        <circle cx="0" cy="${r1(-6 - r * 0.6)}" r="${r1(r)}" fill="${k ? COL.treeTop : COL.treeDark}" stroke="${INK}" stroke-width="1.2"/></g>`;
    }
    function pine(x, y) {
      return `<g transform="translate(${r1(x)},${r1(y)})"><line x1="0" y1="0" x2="0" y2="-4" stroke="${COL.trunk}" stroke-width="2"/>
        <path d="M0,-16 L5,-4 L-5,-4z M0,-19 L4,-9.5 L-4,-9.5z" fill="${COL.treeDark}" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/></g>`;
    }
    const copses = [[53.5445, -2.0055, 2], [53.5405, -1.9905, 2], [53.5665, -2.0225, 2],
                    [53.5575, -2.0165, 2], [53.542, -2.033, 2], [53.533, -1.999, 2],
                    [53.5495, -2.0245, 2], [53.5775, -2.0125, 2]];
    for (const [la, ln, n] of copses) {
      const [cx, cy] = P(la, ln);
      for (let i = 0; i < n; i++) s += tree(cx + jit(40), cy + jit(24), rnd() > 0.35);
    }
    const pinesAt = [[53.533, -1.9695], [53.5345, -1.9675], [53.536, -1.9705], [53.5375, -1.966]];
    for (const [la, ln] of pinesAt) { const [x, y] = P(la, ln); s += pine(x + jit(8), y + jit(6)); }

    // ---- livestock, gently roaming ----
    // Each animal ambles around a small wobbly loop near home, pausing to
    // graze (held keyPoints), on its own clock — a slow, living hillside.
    function roam(x, y, art, radius, dur) {
      const path = blob(0, 0, radius, radius * 0.65, 6, 0.5, rnd() * 3);
      const begin = -(rnd() * dur).toFixed(1);
      return `<g transform="translate(${r1(x)},${r1(y)})"><g>
        <animateMotion dur="${dur.toFixed(0)}s" begin="${begin}s" repeatCount="indefinite"
          calcMode="linear" keyPoints="0;0.18;0.18;0.45;0.45;0.75;0.75;1"
          keyTimes="0;0.15;0.32;0.45;0.62;0.75;0.9;1" path="${path}"/>
        ${art}</g></g>`;
    }
    const sheepArt = () => `<g transform="rotate(${r1(jit(20))})">
        <ellipse cx="0" cy="0" rx="5.5" ry="3.6" fill="#f6f2e6" stroke="${INK}" stroke-width="1.2"/>
        <circle cx="5.5" cy="-1.6" r="2" fill="#3a362c"/>
        <line x1="-2.5" y1="3" x2="-2.5" y2="5.4" stroke="${INK}" stroke-width="1.2"/>
        <line x1="2.5" y1="3" x2="2.5" y2="5.4" stroke="${INK}" stroke-width="1.2"/></g>`;
    const cowArt = () => `<g transform="rotate(${r1(jit(14))})">
        <line x1="-4.5" y1="3" x2="-4.5" y2="6.6" stroke="${INK}" stroke-width="1.3"/>
        <line x1="-1.5" y1="3.4" x2="-1.5" y2="6.8" stroke="${INK}" stroke-width="1.3"/>
        <line x1="1.8" y1="3.4" x2="1.8" y2="6.8" stroke="${INK}" stroke-width="1.3"/>
        <line x1="4.6" y1="3" x2="4.6" y2="6.6" stroke="${INK}" stroke-width="1.3"/>
        <path d="M-7,-0.5 Q-8.8,1 -8.2,3" fill="none" stroke="${INK}" stroke-width="1.1"/>
        <ellipse cx="0" cy="0" rx="7" ry="4.2" fill="#f4f1e8" stroke="${INK}" stroke-width="1.2"/>
        <ellipse cx="-2.4" cy="-1" rx="2.5" ry="1.7" fill="#3a362c"/>
        <ellipse cx="2.9" cy="1.3" rx="2" ry="1.4" fill="#3a362c"/>
        <circle cx="7.6" cy="-1.8" r="2.2" fill="#f4f1e8" stroke="${INK}" stroke-width="1.1"/>
        <line x1="6.2" y1="-3.4" x2="5.4" y2="-4.4" stroke="${INK}" stroke-width="1.1"/></g>`;
    const horseArt = () => `<g transform="rotate(${r1(jit(14))})">
        <line x1="-4" y1="2.8" x2="-4.2" y2="8" stroke="${INK}" stroke-width="1.3"/>
        <line x1="-1.6" y1="3.2" x2="-1.7" y2="8.2" stroke="${INK}" stroke-width="1.3"/>
        <line x1="1.6" y1="3.2" x2="1.7" y2="8.2" stroke="${INK}" stroke-width="1.3"/>
        <line x1="4" y1="2.8" x2="4.3" y2="8" stroke="${INK}" stroke-width="1.3"/>
        <path d="M-6.2,-1 Q-8,1.5 -7,4.5" fill="none" stroke="#5c3a1e" stroke-width="1.6" stroke-linecap="round"/>
        <ellipse cx="0" cy="0" rx="6.4" ry="3.3" fill="#8a5a33" stroke="${INK}" stroke-width="1.2"/>
        <path d="M5.2,-1.8 Q8.2,-2.6 8.8,1.6" fill="none" stroke="#8a5a33" stroke-width="3"
          stroke-linecap="round"/>
        <path d="M5.2,-1.8 Q8.2,-2.6 8.8,1.6" fill="none" stroke="${INK}" stroke-width="0.9" opacity="0.6"/>
        <circle cx="8.9" cy="2.4" r="1.7" fill="#8a5a33" stroke="${INK}" stroke-width="1"/></g>`;
    const flock = [[53.579, -1.963], [53.5825, -1.978], [53.5755, -2.052], [53.5975, -2.0195],
                   [53.5905, -2.008], [53.549, -1.9725], [53.5465, -1.9565], [53.556, -2.0655],
                   [53.568, -2.0685], [53.5285, -2.0955], [53.5165, -1.9885]];
    for (const [la, ln] of flock) {
      const [x, y] = P(la, ln);
      s += roam(x + jit(14), y + jit(10), sheepArt(), 13 + rnd() * 9, 110 + rnd() * 110);
    }
    // Friesians in the valley pastures…
    const herd = [[53.531, -2.0075], [53.5305, -2.0058], [53.5722, -2.0128], [53.5715, -2.0108],
                  [53.5408, -1.9846]];
    for (const [la, ln] of herd) {
      const [x, y] = P(la, ln);
      s += roam(x + jit(10), y + jit(8), cowArt(), 10 + rnd() * 5, 150 + rnd() * 90);
    }
    // …and horses by the Friezland riding arena and up the Castleshaw valley
    const stable = [[53.5338, -2.0044], [53.5332, -2.0028], [53.5788, -2.0175]];
    for (const [la, ln] of stable) {
      const [x, y] = P(la, ln);
      s += roam(x + jit(10), y + jit(8), horseArt(), 12 + rnd() * 5, 130 + rnd() * 80);
    }
    // red grouse pottering about the heather tops
    const grouseArt = () => `<g transform="rotate(${r1(jit(24))})">
        <line x1="-1" y1="2.4" x2="-1" y2="3.6" stroke="${INK}" stroke-width="0.9"/>
        <line x1="1" y1="2.4" x2="1" y2="3.6" stroke="${INK}" stroke-width="0.9"/>
        <path d="M-3.4,-0.6 L-5.2,-1.8" stroke="${INK}" stroke-width="1.1" stroke-linecap="round"/>
        <ellipse cx="0" cy="0" rx="3.6" ry="2.6" fill="#7a4a2e" stroke="${INK}" stroke-width="1"/>
        <circle cx="3" cy="-1.7" r="1.5" fill="#7a4a2e" stroke="${INK}" stroke-width="0.9"/>
        <path d="M2.3,-2.9 Q3,-3.7 3.8,-3" fill="none" stroke="#c9302b" stroke-width="1.1" stroke-linecap="round"/></g>`;
    const moorBirds = [[53.59, -1.968], [53.5745, -1.9505], [53.5545, -1.9455],
                       [53.5975, -2.0615], [53.552, -1.9375]];
    for (const [la, ln] of moorBirds) {
      const [x, y] = P(la, ln);
      s += roam(x + jit(12), y + jit(8), grouseArt(), 8 + rnd() * 7, 70 + rnd() * 70);
    }
    // owls in the pines, shuffling on their perches
    const owlArt = () => `<g>
        <path d="M-2.2,-3.2 L-3,-4.8 M2.2,-3.2 L3,-4.8" stroke="${INK}" stroke-width="1" stroke-linecap="round"/>
        <ellipse cx="0" cy="0" rx="3" ry="4" fill="#9b7a52" stroke="${INK}" stroke-width="1.1"/>
        <ellipse cx="0" cy="1" rx="1.8" ry="2.3" fill="#dccba9"/>
        <circle cx="-1.15" cy="-1.7" r="1.05" fill="#fff" stroke="${INK}" stroke-width="0.6"/>
        <circle cx="1.15" cy="-1.7" r="1.05" fill="#fff" stroke="${INK}" stroke-width="0.6"/>
        <circle cx="-1.15" cy="-1.7" r="0.45" fill="#26211a"/>
        <circle cx="1.15" cy="-1.7" r="0.45" fill="#26211a"/></g>`;
    const roosts = [[53.5338, -1.9678], [53.5705, -1.9908], [53.5828, -2.0078]];
    for (const [la, ln] of roosts) {
      const [x, y] = P(la, ln);
      s += roam(x + jit(6), y + jit(4), owlArt(), 3, 180 + rnd() * 80);
    }
    s += `</g>`; // end glyph-layer

    // ================= labels =================
    s += `<g id="label-layer">`;
    function label(la, ln, text, size, rot) {
      const [x, y] = P(la, ln);
      return `<text x="${r1(x)}" y="${r1(y)}" transform="rotate(${rot || 0} ${r1(x)} ${r1(y)})"
        font-family="Georgia, serif" font-style="italic" font-size="${size}" fill="#3f3a2c"
        text-anchor="middle" paint-order="stroke" stroke="${COL.paper}" stroke-width="4"
        stroke-linejoin="round">${text}</text>`;
    }
    function area(la, ln, text, rot) {
      const [x, y] = P(la, ln);
      return `<text x="${r1(x)}" y="${r1(y)}" transform="rotate(${rot || 0} ${r1(x)} ${r1(y)})"
        font-family="Georgia, serif" font-size="15" letter-spacing="6" fill="rgba(86,80,63,0.55)"
        text-anchor="middle">${text}</text>`;
    }
    s += label(53.5432, -2.0195, 'Uppermill', 22);
    s += label(53.5715, -2.0245, 'Delph', 19);
    s += label(53.5586, -2.013, 'Dobcross', 17);
    s += label(53.5738, -1.9905, 'Diggle', 18);
    s += label(53.5352, -1.9878, 'Greenfield', 18);
    s += label(53.5326, -2.0158, 'Grasscroft', 15);
    s += label(53.5388, -2.0435, 'Lydgate', 15);
    s += label(53.5455, -2.0595, 'Scouthead', 15);
    s += label(53.5888, -2.0505, 'Denshaw', 17);
    s += label(53.5262, -1.9585, 'Dove Stone', 13);
    s += label(53.589, -2.0125, 'Castleshaw', 12);
    s += label(53.5372, -2.01, 'Wharmton', 12);
    s += label(53.5772, -1.9885, 'Standedge', 13, -8);
    s += label(53.5487, -1.9835, 'Pots &amp; Pans', 12);
    s += area(53.558, -1.9345, 'SADDLEWORTH  MOOR', -78);
    s += label(53.5405, -2.1195, 'to Oldham', 13, -4);
    s += label(53.5878, -1.9645, 'to Huddersfield', 13, -28);
    s += label(53.5268, -1.9985, 'to Mossley', 13, 10);
    s += `</g>`; // end label-layer

    // ================= moving things =================
    s += `<g class="moving">
      <g>
        <animateMotion dur="150s" repeatCount="indefinite" rotate="auto"><mpath href="#canal-path"/></animateMotion>
        <rect x="-13" y="-3.5" width="26" height="7" rx="3" fill="#3c5a3c" stroke="${INK}" stroke-width="1.3"/>
        <rect x="-8" y="-2" width="12" height="4" rx="1.5" fill="#c9463d" stroke="${INK}" stroke-width="1"/>
        <circle cx="9" cy="0" r="1.3" fill="#f2e2b0"/>
      </g>
      <g>
        <animateMotion dur="52s" repeatCount="indefinite" rotate="auto"><mpath href="#rail-path"/></animateMotion>
        <rect x="-16" y="-3.2" width="15" height="6.4" rx="2" fill="#26547c" stroke="${INK}" stroke-width="1.1"/>
        <rect x="1" y="-3.2" width="15" height="6.4" rx="2" fill="#26547c" stroke="${INK}" stroke-width="1.1"/>
        <rect x="-12.5" y="-1.6" width="3.2" height="3.2" fill="#cfe3f2"/><rect x="-6.5" y="-1.6" width="3.2" height="3.2" fill="#cfe3f2"/>
        <rect x="4.5" y="-1.6" width="3.2" height="3.2" fill="#cfe3f2"/><rect x="10.5" y="-1.6" width="3.2" height="3.2" fill="#cfe3f2"/>
      </g>
    </g>`;

    s += `</g>`; // end paper clip

    // inked edge on top, then the marginalia on the "desk"
    s += `<path d="${edgePath}" fill="none" stroke="${INK}" stroke-width="3"/>`;

    // compass rose
    const cxr = W - 112, cyr = 128;
    s += `<g transform="translate(${cxr},${cyr})" opacity="0.92">
      <circle r="30" fill="${COL.paper}" stroke="${INK}" stroke-width="1.6"/>
      <circle r="24" fill="none" stroke="${INK}" stroke-width="0.8"/>
      <path d="M0,-26 L5,0 L0,7 L-5,0z" fill="${COL.brick}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M0,26 L5,0 L0,-7 L-5,0z" fill="${COL.paper}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M-26,0 L0,5 L7,0 L0,-5z M26,0 L0,5 L-7,0 L0,-5z" fill="${COL.stone}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>
      <text y="-36" text-anchor="middle" font-family="Georgia, serif" font-size="15" font-weight="bold" fill="${INK}">N</text></g>`;
    // cartouche
    const mile = (1609 / 11132) * H; // 0.1° of latitude spans H px; a mile is 1.609 km
    s += `<g transform="translate(52,${H - 128})">
      <rect x="0" y="0" width="252" height="86" rx="6" fill="${COL.paper}" stroke="${INK}" stroke-width="2"/>
      <rect x="5" y="5" width="242" height="76" rx="4" fill="none" stroke="${INK}" stroke-width="0.9"/>
      <text x="126" y="30" text-anchor="middle" font-family="Georgia, serif" font-size="19" letter-spacing="3" fill="${INK}">SADDLEWORTH</text>
      <text x="126" y="47" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="11" fill="#6b654e">real lanes &amp; waterways, storybook clothes</text>
      <line x1="${126 - mile / 2}" y1="62" x2="${126 + mile / 2}" y2="62" stroke="${INK}" stroke-width="2"/>
      <line x1="${126 - mile / 2}" y1="57" x2="${126 - mile / 2}" y2="67" stroke="${INK}" stroke-width="2"/>
      <line x1="${126 + mile / 2}" y1="57" x2="${126 + mile / 2}" y2="67" stroke="${INK}" stroke-width="2"/>
      <text x="126" y="76" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="10.5" fill="#6b654e">one mile, give or take</text></g>`;

    // clouds drifting over the tops
    function cloud(x, y, k, dur) {
      return `<g class="cloud" style="--dur:${dur}s" opacity="0.45">
        <g transform="translate(${x},${y}) scale(${k})">
          <ellipse cx="0" cy="0" rx="34" ry="13" fill="#fff"/>
          <ellipse cx="-20" cy="5" rx="20" ry="9" fill="#fff"/>
          <ellipse cx="22" cy="4" rx="22" ry="10" fill="#fff"/></g></g>`;
    }
    s += cloud(140, 170, 1, 190) + cloud(420, 640, 1.35, 240) + cloud(60, 980, 0.9, 210);

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); // app.js drives this for crisp zoom
    svg.innerHTML = s;
  }

  window.MapArt = { build };
})();
