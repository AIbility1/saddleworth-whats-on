/* dev-server.js — local development server: static files + the community API.
   Run with: node scripts/dev-server.js   (or serve.cmd)
   Uses the same handlers as the Azure Functions in api/, backed by JSON files
   in .local-data/ so the whole self-service flow works without Azure. */

'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const core = require('../api/_lib/core');

const ROOT = path.join(__dirname, '..');
const PORT = 8130;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
};

const ROUTES = {
  'GET /api/events': (body, code) => core.handleEventsList(),
  'GET /api/venues': (body, code) => core.handleVenuesList(),
  'POST /api/verify': (body, code) => core.handleVerify(body, code),
  'POST /api/events/submit': (body, code) => core.handleEventUpsert(body, code),
  'POST /api/events/delete': (body, code) => core.handleEventDelete(body, code),
  'POST /api/venues/submit': (body) => core.handleVenueSubmit(body),
  'POST /api/moderate': (body, code) => core.handleModerate(body, code),
  'POST /api/rate': (body) => core.handleRate(body),
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const key = `${req.method} ${url.pathname}`;

  if (ROUTES[key]) {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', async () => {
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch { }
      try {
        const r = await ROUTES[key](body, req.headers['x-venue-code']);
        res.writeHead(r.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(r.body));
      } catch (e) {
        console.error(e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Something went wrong.' }));
      }
    });
    return;
  }

  // static files
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || p.startsWith('/.') || p.startsWith('/api/')) {
    res.writeHead(403); res.end(); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`Saddleworth What's On dev server: http://localhost:${PORT}/`);
  console.log('Venue codes for testing: node scripts/venue-codes.js <venue-id>');
});
