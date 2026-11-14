'use strict';
/* ONE real request through the full server path (validation -> real Anthropic provider -> citation checks).
   It costs real money (roughly a cent or two on claude-opus-5-5; much less on claude-haiku-5-5), so it only runs with --confirm-spend.
   The key is read from the server environment (ANTHROPIC_API_KEY, or .env). It is never printed.

   PowerShell:  npm.cmd run live-check -- --confirm-spend
*/
const { createServer, makeProvider } = require('../server.js');
const http = require('http');

const confirm = process.argv.includes('--confirm-spend');
const key = (process.env.ANTHROPIC_API_KEY || '').trim();
const model = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

if (!key || /your-key|placeholder|changeme/i.test(key)) {
  console.log('No real ANTHROPIC_API_KEY is set on this machine, so nothing was sent. See README.md > "Configure a real key".');
  process.exit(1);
}
if (!confirm) {
  console.log('Dry run. A key is present (not shown) and the model would be "' + model + '", but no request was made.');
  console.log('To send ONE real request (this spends a small amount on your Anthropic account), run:');
  console.log('  npm.cmd run live-check -- --confirm-spend');
  process.exit(0);
}
if ((process.env.SYNTH_PROVIDER || 'anthropic').toLowerCase() !== 'anthropic' || !makeProvider(process.env)) {
  console.log('The server would not use the real provider with this environment. Nothing was sent.'); process.exit(1);
}

const body = JSON.stringify({ question: 'When was smoke detected in the Saffire VI-3 test?', passageIds: ['saffire-01', 'saffire-02'] });
const server = createServer(process.env);
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const t0 = Date.now();
  const r = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/api/synthesize', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
    let b = ''; res.on('data', (c) => b += c); res.on('end', () => {
      server.close();
      let j = null; try { j = JSON.parse(b); } catch (e) {}
      console.log('HTTP ' + res.statusCode + ' in ' + (Date.now() - t0) + ' ms');
      if (res.statusCode === 200 && j && j.status === 'answer') {
        console.log('provider=' + j.provider + ' model=' + j.model + ' singleTest=' + j.singleTest);
        j.claims.forEach((c, i) => console.log('  claim ' + (i + 1) + ': ' + c.text + '  ' + c.citations.map(x => '[' + x + ']').join('')));
        const ok = j.provider === 'anthropic' && j.claims.length >= 1 && j.claims.every(c => c.citations.length >= 1) && /981/.test(JSON.stringify(j.claims));
        console.log(ok ? 'LIVE CHECK PASSED: real model answered, citations validated, and the answer mentions 981 s.' : 'LIVE CHECK: answered, but review the claims above (expected the 981 s detection time).');
        process.exit(ok ? 0 : 1);
      }
      if (res.statusCode === 200 && j && j.status === 'insufficient') { console.log('The model said the passages were insufficient (unexpected for this question): ' + (j.reason || '')); process.exit(1); }
      console.log('Failed. Server response: ' + b.slice(0, 300));
      console.log('Common causes: 401/provider_auth = wrong key; provider_busy = rate limit or overload; provider_error = see the [synthesize] line above for the detail.');
      process.exit(1);
    });
  });
  r.on('error', (e) => { console.log('Request error: ' + e.message); server.close(); process.exit(1); });
  r.write(body); r.end();
});
