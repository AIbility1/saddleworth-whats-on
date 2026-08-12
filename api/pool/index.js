'use strict';
const core = require('../_lib/core');

module.exports = async function (context, req) {
  let r;
  try { r = await core.handlePool(); }
  catch (e) { context.log.error(e); r = { status: 200, body: { events: [] } }; }
  context.res = { status: r.status, headers: { 'Content-Type': 'application/json' }, body: r.body };
};
