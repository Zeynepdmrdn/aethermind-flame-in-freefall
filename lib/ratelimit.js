'use strict';
/* In-memory rate limiter: a per-client sliding window plus a global daily cap (a cost guard).
   In-memory means it resets on restart and is per server instance; fine for one small host. */
function createLimiter(opts) {
  const max = opts.max || 8;
  const windowMs = opts.windowMs || 10 * 60 * 1000;
  const dailyCap = opts.dailyCap || 300;
  const now = opts.now || Date.now;
  const hits = new Map(); // ip -> [timestamps]
  let day = Math.floor(now() / 86400000), dayCount = 0;

  function check(ip) {
    const t = now();
    const d = Math.floor(t / 86400000);
    if (d !== day) { day = d; dayCount = 0; }
    if (dayCount >= dailyCap) {
      const retryAfter = Math.ceil(((day + 1) * 86400000 - t) / 1000);
      return { ok: false, retryAfter, reason: 'daily_cap' };
    }
    const arr = (hits.get(ip) || []).filter(x => t - x < windowMs);
    if (arr.length >= max) {
      hits.set(ip, arr);
      return { ok: false, retryAfter: Math.max(1, Math.ceil((windowMs - (t - arr[0])) / 1000)), reason: 'per_client' };
    }
    arr.push(t); hits.set(ip, arr); dayCount++;
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(x => t - x < windowMs)) hits.delete(k);
    return { ok: true };
  }
  return { check };
}
module.exports = { createLimiter };
