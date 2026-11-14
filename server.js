'use strict';
/* One host for the page and the API, so browser requests are same-origin (no CORS).
   Serves only index.html, corpus.js and search.js (an explicit whitelist: never .env or server code),
   GET /api/status and POST /api/synthesize.
   Zero web-framework dependencies; the only runtime dependency is the official Anthropic SDK. */
const http = require('http');
const fs = require('fs');
const path = require('path');

// Minimal .env loader (no dependency). Real environment variables win over the file.
(function loadDotEnv() {
  const f = path.join(__dirname, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2]; if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
})();

const corpus = require('./corpus.js');
const { createHandler } = require('./lib/synthesize');
const { createLimiter } = require('./lib/ratelimit');

function makeProvider(env) {
  const kind = (env.SYNTH_PROVIDER || 'anthropic').toLowerCase();
  if (kind === 'mock') {
    if (env.NODE_ENV === 'production') throw new Error('SYNTH_PROVIDER=mock is not allowed when NODE_ENV=production.');
    return require('./lib/provider-mock').createMockProvider(env.MOCK_MODE || 'ok');
  }
  if (kind === 'ollama') {
    return require('./lib/provider-ollama').createOllamaProvider({ url: env.OLLAMA_URL, model: env.OLLAMA_MODEL || 'qwen2.5:3b' });
  }
  const key = (env.ANTHROPIC_API_KEY || '').trim();
  if (!key || /your-key|placeholder|changeme/i.test(key)) return null; // not configured
  return require('./lib/provider-anthropic').createAnthropicProvider({ apiKey: key, model: env.ANTHROPIC_MODEL || 'claude-opus-5-5', timeoutMs: Number(env.SYNTH_TIMEOUT_MS) || 20000 });
}

const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/corpus.js': ['corpus.js', 'text/javascript; charset=utf-8'],
  '/search.js': ['search.js', 'text/javascript; charset=utf-8']
};

function defaultTimeoutMs(env) {
  // A local CPU model is much slower than a hosted API.
  return Number(env.SYNTH_TIMEOUT_MS) || ((env.SYNTH_PROVIDER || '').toLowerCase() === 'ollama' ? 90000 : 20000);
}

function createServer(env) {
  env = env || process.env;
  const provider = makeProvider(env);
  const timeoutMs = defaultTimeoutMs(env);
  const limiter = createLimiter({ max: Number(env.RATE_LIMIT_MAX) || 8, windowMs: Number(env.RATE_LIMIT_WINDOW_MS) || 600000, dailyCap: Number(env.DAILY_CAP) || 300 });
  const trustProxy = env.TRUST_PROXY === '1';
  const handler = createHandler({
    corpus, provider, limiter, timeoutMs,
    log: (o) => console.log('[synthesize]', JSON.stringify(o))
  });

  const baseHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
  };
  function send(res, status, body, headers) {
    const h = Object.assign({}, baseHeaders, headers || {});
    if (body !== null && typeof body === 'object' && !Buffer.isBuffer(body)) { body = JSON.stringify(body); h['Content-Type'] = 'application/json; charset=utf-8'; h['Cache-Control'] = 'no-store'; }
    res.writeHead(status, h); res.end(body);
  }
  function clientIp(req) {
    if (trustProxy) { const x = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean); if (x.length) return x[x.length - 1]; }
    return req.socket.remoteAddress || 'unknown';
  }

  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;

    if (p === '/api/status') {
      if (req.method !== 'GET') return send(res, 405, { error: { code: 'method', message: 'Use GET.' } }, { Allow: 'GET' });
      return (async () => {
        const ready = provider && provider.check ? await provider.check() : { ok: !!provider };
        send(res, 200, {
          synthesis: !!provider && ready.ok, provider: provider ? provider.providerName : null, model: provider && provider.model || null,
          reason: !provider ? 'no_key' : (ready.ok ? null : ready.reason), timeoutMs
        });
      })();
    }
    if (p === '/api/synthesize') {
      if (req.method !== 'POST') return send(res, 405, { error: { code: 'method', message: 'Use POST.' } }, { Allow: 'POST' });
      if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: { code: 'content_type', message: 'Content-Type must be application/json.' } });
      const origin = req.headers.origin;
      if (origin) { let ok = false; try { ok = new URL(origin).host === req.headers.host; } catch (e) {} if (!ok) return send(res, 403, { error: { code: 'origin', message: 'Cross-origin requests are not allowed.' } }); }
      let size = 0; const chunks = []; let aborted = false;
      req.on('data', (c) => { size += c.length; if (size > 4096) { aborted = true; send(res, 413, { error: { code: 'too_large', message: 'Request body is too large.' } }, { Connection: 'close' }); req.destroy(); } else chunks.push(c); });
      req.on('end', async () => {
        if (aborted) return;
        const out = await handler({ ip: clientIp(req), rawBody: Buffer.concat(chunks).toString('utf8') });
        send(res, out.status, out.body, out.headers);
      });
      req.on('error', () => {});
      return;
    }
    const entry = STATIC[p];
    if (entry && (req.method === 'GET' || req.method === 'HEAD')) {
      return fs.readFile(path.join(__dirname, entry[0]), (err, data) => {
        if (err) return send(res, 500, 'Server error', { 'Content-Type': 'text/plain' });
        send(res, 200, req.method === 'HEAD' ? '' : data, { 'Content-Type': entry[1], 'Cache-Control': 'no-cache' });
      });
    }
    send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
  });
}

module.exports = { createServer, makeProvider };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const server = createServer(process.env);
  server.listen(port, () => {
    const prov = makeProvider(process.env);
    console.log('Flame in Freefall on http://localhost:' + port);
    console.log(prov ? 'Cited answers: ENABLED (' + prov.providerName + (prov.model ? ', model ' + prov.model : '') + ')' : 'Cited answers: disabled (set SYNTH_PROVIDER=ollama for a free local model, or ANTHROPIC_API_KEY). Search works regardless.');
  });
}
