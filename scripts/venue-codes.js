/* venue-codes.js — print venue access codes (derived from VENUE_CODE_SECRET).
   Usage:
     node scripts/venue-codes.js              # all venues
     node scripts/venue-codes.js church-inn   # one venue
   Set VENUE_CODE_SECRET to the production secret to print the real codes;
   without it you get the dev codes the local dev server accepts. */

'use strict';
const path = require('path');
const fs = require('fs');
const { venueCode } = require('../api/_lib/core');

const only = process.argv[2];
const baked = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'venues.json'), 'utf8')).venues;
const editorial = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'events.json'), 'utf8'));
const all = baked.concat(editorial.customVenues || []);

if (!process.env.VENUE_CODE_SECRET) {
  console.log('(VENUE_CODE_SECRET not set — these are DEV codes)\n');
}
for (const v of all) {
  if (['walk', 'sight', 'spot'].includes(v.kind)) continue;
  if (only && v.id !== only) continue;
  console.log(`${venueCode(v.id)}  ${v.id}  (${v.name}, ${v.village})`);
}
