'use strict';
const core = require('../_lib/core');

module.exports = async function (context, req) {
  let r;
  try { r = await core.handleRate(req.body); }
  catch (e) { context.log.error(e); r = { status: 500, body: { error: 'Something went wrong.' } }; }
  context.res = { status: r.status, headers: { 'Content-Type': 'application/json' }, body: r.body };
};
