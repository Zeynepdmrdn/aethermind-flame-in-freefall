'use strict';
/* Node tests, no framework: node tests/run-tests.js
   Sections: corpus, retrieval, server (MOCK provider over real HTTP), anthropic-provider (fake HTTP server, no real API call). */
const http = require('http');
const path = require('path');
const corpus = require('../corpus.js');
const E = require('../search.js').create(corpus);

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); } }
const ids = (q) => E.search(q).results.map(r => r.p.id);
const status = (q) => E.search(q).status;

function listen(server) { return new Promise(res => server.listen(0, '127.0.0.1', () => res(server.address().port))); }
function req(port, method, p, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers: Object.assign(data !== null ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}, headers || {}) }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} resolve({ status: res.statusCode, headers: res.headers, text: b, json: j }); });
    });
    r.on('error', reject); if (data !== null) r.write(data); r.end();
  });
}

async function main() {
  // ---------- corpus ----------
  console.log('\n== corpus ==');
  ok('25 passages', corpus.passages.length === 25);
  ok('unique ids', new Set(corpus.passages.map(p => p.id)).size === 25);
  const URLS = ['https://ntrs.nasa.gov/citations/20240007488', 'https://www.nasa.gov/missions/station/cool-flames-created-during-a-first-for-international-space-station-research/', 'https://science.nasa.gov/biological-physical/investigations/sofie-mist/'];
  ok('all urls are the three NASA sources', corpus.passages.every(p => URLS.includes(p.url)));
  ok('types valid', corpus.passages.every(p => ['finding', 'condition', 'objective'].includes(p.type)));
  ok('slides are 11/12/16/21 or null', corpus.passages.every(p => p.slide === null || [11, 12, 16, 21].includes(p.slide)));
  const facts = { saffire: 'cygnus orbiting spacecraft', flex: 'international space station', sofie: 'international space station spacex' };
  const weak = [];
  corpus.passages.forEach(p => {
    const support = new Set(E.tokenize(p.text + ' ' + p.scope + ' ' + facts[p.study]).map(E.stem));
    const vals = [].concat(p.meta.platform || [], p.meta.vehicle || [], p.meta.tests || [], p.meta.materials, p.meta.variables);
    vals.forEach((v, i) => { vals[i] = v.replace(/airflow/g, 'air flow'); });
    vals.forEach(v => {
      const w = E.tokenize(v).map(E.stem); const hit = w.filter(x => support.has(x)).length;
      if (hit / w.length < 0.5) weak.push(p.id + ': ' + v);
    });
  });
  ok('every metadata value has >=50% of its words supported by the passage/scope/study fact', weak.length === 0, weak.join(' | '));

  // ---------- retrieval ----------
  console.log('\n== retrieval ==');
  const cyg = ids('What materials were burned on the Cygnus vehicle?');
  ok('Cygnus materials: saffire-12 (lists the samples) ranks first', cyg[0] === 'saffire-12', cyg.join(','));
  ok('Cygnus materials: Cygnus-specific passage saffire-13 also returned', cyg.includes('saffire-13'));
  ok('Cygnus materials: no FLEX/SoFIE passages', cyg.every(i => i.startsWith('saffire')));
  ok('oxygen VI-3: exactly saffire-04 (no trailing weak hits)', ids('What oxygen concentration was used in the VI-3 test?').join() === 'saffire-04');
  ok('paraphrase ventilation -> airflow passages first', /^(sofie-01|saffire-03)$/.test(ids('How does ventilation relate to the burning in these studies?')[0]));
  ok('paraphrase: detector/notice/plastic -> saffire-01 first', ids('How quickly did the detector notice the burning plastic?')[0] === 'saffire-01');
  ok('new: which spacecraft hosted Saffire VI -> saffire-13 first', ids('Which spacecraft hosted the Saffire VI burn?')[0] === 'saffire-13');
  ok('new: wide samples -> saffire-12 only', ids('Which samples did the final Saffire flight burn, and how wide were they?').join() === 'saffire-12');
  ok('new: SoFIE varied variables -> sofie-01 only', ids('Which variables does SoFIE-MIST change on purpose?').join() === 'sofie-01');
  ok('new: ambient pressure VI-3 -> saffire-04', ids('What ambient pressure did the VI-3 test run at?')[0] === 'saffire-04');
  ok('new: when ignition -> saffire-02 and answered (not partial)', ids('When was ignition in the Saffire test?')[0] === 'saffire-02' && status('When was ignition in the Saffire test?') === 'ok');
  ok('study scoping: FLEX question returns only FLEX', ids('What kind of flames did FLEX find aboard the station?').every(i => i.startsWith('flex')));
  ok('SoFIE oxygen concentration: partial (mentions, no value)', status('What oxygen concentration did SoFIE-MIST use?') === 'partial');
  ok('cool flames temperature: partial (no value in source)', status('What temperature did the cool flames burn at?') === 'partial');
  ok('SoFIE airflow amount: partial', status('How much airflow does SoFIE-MIST apply?') === 'partial');
  ok('FLEX pressure: insufficient (topic absent from FLEX)', status('What pressure was used in the FLEX experiments?') === 'insufficient');
  ok('SoFIE results of low-pressure flame spread: insufficient', status('Did SoFIE-MIST find that flames spread faster at low pressure?') === 'insufficient');
  ok('pizza: insufficient', status('What is the best pizza recipe?') === 'insufficient');
  ok('France: insufficient', status('What is the capital of France?') === 'insufficient');
  ok('rockets: insufficient', status('Explain how rockets reach orbit') === 'insufficient');
  ok('safety 50% oxygen: insufficient + safety notice', status('Is 50% oxygen safe for astronauts?') === 'insufficient' && E.search('Is 50% oxygen safe for astronauts?').notices.some(n => n.kind === 'safety'));
  ok('safety wording on retrievable question still adds notice', E.search('What smoke detector should we install in a spacecraft?').notices.some(n => n.kind === 'safety'));
  ok('study name alone is insufficient', status('Tell me about SoFIE-MIST') === 'insufficient');
  ok('empty/stopword-only is insufficient', status('the of and') === 'insufficient' && status('') === 'insufficient');
  ok('sensor model (topic mentioned, detail absent): coverage notice lists "model"', E.search('Which sensor model did Saffire use for smoke detection?').notices.some(n => n.kind === 'coverage' && /model/.test(n.text)));

  // ---------- server with MOCK provider ----------
  console.log('\n== server (MOCK provider, real HTTP) ==');
  const { createServer } = require('../server.js');
  const base = { SYNTH_PROVIDER: 'mock', MOCK_MODE: 'ok', RATE_LIMIT_MAX: '100', DAILY_CAP: '1000', SYNTH_TIMEOUT_MS: '1500' };
  const open = [];
  async function start(env) { const s = createServer(Object.assign({}, base, env)); const port = await listen(s); open.push(s); return port; }
  const good = { question: 'When was smoke detected in the VI-3 test?', passageIds: ['saffire-01', 'saffire-02'] };

  let port = await start({});
  let r = await req(port, 'GET', '/api/status');
  ok('status: synthesis enabled, provider mock', r.status === 200 && r.json.synthesis === true && r.json.provider === 'mock');
  r = await req(port, 'POST', '/api/synthesize', good);
  ok('mock ok: 200 answer with cited claims', r.status === 200 && r.json.status === 'answer' && r.json.claims.length === 2 && r.json.claims.every(c => c.citations.length >= 1), r.text.slice(0, 200));
  ok('mock ok: sources resolved server-side from the shared corpus', r.json.sources.map(s => s.id).sort().join() === 'saffire-01,saffire-02' && r.json.sources.find(s => s.id === 'saffire-01').slideUrl.endsWith('#page=21'));
  ok('mock ok: single-test flag set for Saffire finding', r.json.singleTest === true && r.json.claims[0].kinds.includes('finding'));
  ok('mock ok: labelled provider mock', r.json.provider === 'mock');
  r = await req(port, 'POST', '/api/synthesize', { question: 'What does SoFIE-MIST plan to vary?', passageIds: ['sofie-01'] });
  ok('objective passage: kinds=objective, not single-test', r.status === 200 && r.json.claims[0].kinds.join() === 'objective' && r.json.singleTest === false);
  // validation
  const bad = async (name, body, st, code, headers) => { const x = await req(port, 'POST', '/api/synthesize', body, headers); ok('validation: ' + name + ' -> ' + st + '/' + code, x.status === st && x.json && x.json.error && x.json.error.code === code, x.status + ' ' + x.text.slice(0, 120)); };
  await bad('not json', '{oops', 400, 'bad_json');
  await bad('missing question', { passageIds: ['saffire-01'] }, 400, 'bad_question');
  await bad('short question', { question: 'hi', passageIds: ['saffire-01'] }, 400, 'bad_question');
  await bad('too long question', { question: 'x'.repeat(301), passageIds: ['saffire-01'] }, 400, 'bad_question');
  await bad('no ids', { question: 'valid question here', passageIds: [] }, 400, 'bad_ids');
  await bad('6 ids', { question: 'valid question here', passageIds: ['saffire-01', 'saffire-02', 'saffire-03', 'saffire-04', 'saffire-05', 'saffire-06'] }, 400, 'bad_ids');
  await bad('duplicate id', { question: 'valid question here', passageIds: ['saffire-01', 'saffire-01'] }, 400, 'bad_ids');
  await bad('malformed id', { question: 'valid question here', passageIds: ['../etc/passwd'] }, 400, 'bad_ids');
  await bad('unknown id', { question: 'valid question here', passageIds: ['saffire-99'] }, 400, 'unknown_id');
  await bad('extra field (passage text smuggling)', { question: 'valid question here', passageIds: ['saffire-01'], passages: ['x'] }, 400, 'bad_request');
  await bad('array body', [1], 400, 'bad_request');
  await bad('wrong content type', JSON.stringify(good), 415, 'content_type', { 'Content-Type': 'text/plain' });
  await bad('cross-origin', good, 403, 'origin', { Origin: 'https://evil.example' });
  r = await req(port, 'POST', '/api/synthesize', 'x'.repeat(6000));
  ok('oversize body rejected (413)', r.status === 413 || r.status === 0, String(r.status));
  r = await req(port, 'GET', '/api/synthesize'); ok('GET /api/synthesize -> 405', r.status === 405);
  // static whitelist
  for (const f of ['/', '/index.html', '/corpus.js', '/search.js']) { r = await req(port, 'GET', f); ok('static ' + f + ' -> 200', r.status === 200 && r.text.length > 100); }
  for (const f of ['/.env', '/.env.example', '/server.js', '/lib/synthesize.js', '/package.json', '/node_modules/@anthropic-ai/sdk/package.json', '/..%2fserver.js', '/tests/run-tests.js']) { r = await req(port, 'GET', f); ok('static blocked ' + f + ' -> 404', r.status === 404); }
  r = await req(port, 'GET', '/'); ok('security headers present', r.headers['x-content-type-options'] === 'nosniff' && /default-src 'self'/.test(r.headers['content-security-policy']));
  ok('same-origin: no CORS headers on API', !(await req(port, 'POST', '/api/synthesize', good)).headers['access-control-allow-origin']);

  // other mock modes
  const modes = [['insufficient', 200, 'insufficient'], ['error', 502, 'provider_error'], ['bad-citation', 502, 'invalid_citation'], ['advice', 502, 'guardrail'], ['bad-json', 502, 'invalid_output'], ['refusal', 502, 'refused']];
  for (const [m, st, code] of modes) {
    const p = await start({ MOCK_MODE: m }); const x = await req(p, 'POST', '/api/synthesize', good);
    const got = x.json && (x.json.error ? x.json.error.code : x.json.status);
    ok('mock mode ' + m + ' -> ' + st + '/' + code, x.status === st && got === code, x.status + ' ' + x.text.slice(0, 150));
    if (m === 'insufficient') ok('insufficient: no claims, no sources', x.json.claims.length === 0 && x.json.sources.length === 0);
  }
  { const p = await start({ MOCK_MODE: 'slow', SYNTH_TIMEOUT_MS: '300' }); const t0 = Date.now(); const x = await req(p, 'POST', '/api/synthesize', good);
    ok('timeout: slow provider aborted -> 504/timeout in ~300ms', x.status === 504 && x.json.error.code === 'timeout' && Date.now() - t0 < 3000, x.status + ' ' + (Date.now() - t0) + 'ms'); }
  // rate limit
  { const p = await start({ RATE_LIMIT_MAX: '3' }); const out = []; for (let i = 0; i < 5; i++) out.push((await req(p, 'POST', '/api/synthesize', good)).status);
    ok('rate limit: 3 ok then 429', out.join() === '200,200,200,429,429', out.join());
    const x = await req(p, 'POST', '/api/synthesize', good); ok('rate limit: Retry-After header + body', Number(x.headers['retry-after']) > 0 && x.json.error.code === 'rate_limited'); }
  { const p = await start({ DAILY_CAP: '2' }); const out = []; for (let i = 0; i < 3; i++) out.push((await req(p, 'POST', '/api/synthesize', good)).status);
    ok('daily cap: 2 ok then 429', out.join() === '200,200,429', out.join()); }
  // not configured
  { const p = await start({ SYNTH_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'your-key-here' }); let x = await req(p, 'GET', '/api/status');
    ok('placeholder key -> status synthesis=false', x.json.synthesis === false);
    x = await req(p, 'POST', '/api/synthesize', good); ok('not configured -> 503/not_configured', x.status === 503 && x.json.error.code === 'not_configured'); }
  ok('mock refused in production', (() => { try { createServer({ SYNTH_PROVIDER: 'mock', NODE_ENV: 'production' }); return false; } catch (e) { return /not allowed/.test(e.message); } })());

  // structured-output enum casing is not guaranteed: accept "Answer"/"INSUFFICIENT"
  { const { validateModelOutput, SYSTEM_PROMPT } = require('../lib/synthesize');
    const v = validateModelOutput({ status: 'Answer', claims: [{ text: 'In the reported VI-3 test smoke was detected at 981 seconds.', citations: ['saffire-01'] }], insufficient_reason: '' }, ['saffire-01']);
    ok('output status compared case-insensitively ("Answer")', v.status === 'answer' && v.claims.length === 1);
    ok('output status "INSUFFICIENT" accepted', validateModelOutput({ status: 'INSUFFICIENT', claims: [], insufficient_reason: 'x' }, ['saffire-01']).status === 'insufficient');
    ok('system prompt asks to answer the actual question first', /actually asked/.test(SYSTEM_PROMPT)); }
  // ---------- real provider code against a fake Anthropic API (no real call) ----------
  console.log('\n== anthropic provider code vs FAKE Anthropic HTTP server (not the real API) ==');
  let seen = null, fakeMode = 'ok';
  const fake = http.createServer((q, s) => {
    let b = ''; q.on('data', c => b += c); q.on('end', () => {
      seen = { method: q.method, url: q.url, headers: q.headers, body: JSON.parse(b || '{}') };
      if (fakeMode === '401') { s.writeHead(401, { 'content-type': 'application/json' }); return s.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } })); }
      if (fakeMode === '529') { s.writeHead(529, { 'content-type': 'application/json', 'retry-after': '0' }); return s.end(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } })); }
      const payload = fakeMode === 'insufficient' ? { status: 'insufficient', claims: [], insufficient_reason: 'Not stated.' } : { status: 'answer', claims: [{ text: 'In the reported VI-3 test, smoke was detected at 981 seconds.', citations: ['saffire-01'] }], insufficient_reason: '' };
      s.writeHead(200, { 'content-type': 'application/json' });
      s.end(JSON.stringify({ id: 'msg_fake', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: fakeMode === 'refusal' ? 'refusal' : 'end_turn', stop_sequence: null,
        content: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text: JSON.stringify(payload) }], usage: { input_tokens: 10, output_tokens: 10 } }));
    });
  });
  const fport = await listen(fake); open.push(fake);
  process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:' + fport;
  const ap = await start({ SYNTH_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'test-key-not-real', ANTHROPIC_MODEL: 'claude-opus-5-5' });
  r = await req(ap, 'POST', '/api/synthesize', { question: 'When was smoke detected in the VI-3 test?', passageIds: ['saffire-01', 'saffire-02'] });
  ok('fake API: handler returns validated answer', r.status === 200 && r.json.status === 'answer' && r.json.provider === 'anthropic' && r.json.claims[0].citations[0] === 'saffire-01', r.text.slice(0, 200));
  ok('fake API: POST /v1/messages with x-api-key from server env', seen.method === 'POST' && /\/v1\/messages$/.test(seen.url) && (seen.headers['x-api-key'] === 'test-key-not-real' || seen.headers['authorization'] === 'Bearer test-key-not-real') && !!seen.headers['anthropic-version']);
  ok('fake API: model, structured output schema, low effort, no thinking/tool_choice/temperature', seen.body.model === 'claude-opus-5-5' && seen.body.output_config.format.type === 'json_schema' && seen.body.output_config.effort === 'low' && !('tool_choice' in seen.body) && !('temperature' in seen.body) && !('thinking' in seen.body));
  const um = seen.body.messages[0].content;
  ok('fake API: prompt carries question + only the sent passages, loaded from corpus', /<question>When was smoke detected/.test(um) && /<passage id="saffire-01"/.test(um) && /readily detected at 981 seconds/.test(um) && !/saffire-03/.test(um));
  ok('fake API: system prompt has grounding, evidence-type and no-advice rules', /ONLY from the passages/.test(seen.body.system) && /single-test/.test(seen.body.system) && /study objective/.test(seen.body.system) && /safety limits/.test(seen.body.system));
  ok('fake API: API key never appears in the response body', !/test-key-not-real/.test(r.text));
  fakeMode = 'insufficient'; r = await req(ap, 'POST', '/api/synthesize', good); ok('fake API: insufficient passes through', r.status === 200 && r.json.status === 'insufficient');
  fakeMode = 'refusal'; r = await req(ap, 'POST', '/api/synthesize', good); ok('fake API: refusal stop_reason -> 502/refused', r.status === 502 && r.json.error.code === 'refused');
  fakeMode = '401'; r = await req(ap, 'POST', '/api/synthesize', good); ok('fake API: 401 -> 502/provider_auth, no upstream detail leaked', r.status === 502 && r.json.error.code === 'provider_auth' && !/x-api-key/.test(r.text));
  fakeMode = '529'; r = await req(ap, 'POST', '/api/synthesize', good); ok('fake API: 529 overloaded -> 503/provider_busy', r.status === 503 && r.json.error.code === 'provider_busy', r.status + ' ' + r.text.slice(0, 100));

  // ---------- number grounding (applies to every provider) ----------
  console.log('\n== number grounding ==');
  { const { validateModelOutput, ungroundedNumber } = require('../lib/synthesize');
    const ps = corpus.passages.filter(p => p.id === 'saffire-01' || p.id === 'saffire-04');
    const ctx = { passages: ps, question: 'When was smoke detected in the VI-3 test?' };
    const claim = (t, c) => ({ status: 'answer', claims: [{ text: t, citations: c }], insufficient_reason: '' });
    ok('grounded number accepted (981 is in saffire-01)', validateModelOutput(claim('In the reported VI-3 test, smoke was detected at 981 seconds.', ['saffire-01']), ['saffire-01'], ctx).status === 'answer');
    ok('passage ids in the text are not treated as numbers', validateModelOutput(claim('Smoke was detected at 981 seconds (saffire-01).', ['saffire-01']), ['saffire-01'], ctx).status === 'answer');
    let code = ''; try { validateModelOutput(claim('Smoke was detected at 950 seconds.', ['saffire-01']), ['saffire-01'], ctx); } catch (e) { code = e.code; }
    ok('invented number rejected (950 is not in the passage)', code === 'ungrounded_number');
    code = ''; try { validateModelOutput(claim('Pressure was 54.6 kPa.', ['saffire-01']), ['saffire-01'], ctx); } catch (e) { code = e.code; }
    ok('number from a passage that is NOT cited is rejected', code === 'ungrounded_number');
    ok('number from the cited passage accepted (54.6 in saffire-04)', validateModelOutput(claim('Ambient pressure was 54.6 kPa.', ['saffire-04']), ['saffire-04'], ctx).status === 'answer');
    ok('derived value is rejected (981 - 637 = 344 is not stated)', ungroundedNumber('The gap was 344 seconds.', ps, 'x') === '344'); }

  // ---------- Ollama provider code vs a FAKE Ollama server (no real model) ----------
  console.log('\n== ollama provider code vs FAKE Ollama server (not the real model) ==');
  let oseen = null, omode = 'ok', otags = [{ name: 'qwen2.5:3b' }];
  const fakeOllama = http.createServer((q, s) => {
    let b = ''; q.on('data', c => b += c); q.on('end', () => {
      if (q.url === '/api/tags') { s.writeHead(200, { 'content-type': 'application/json' }); return s.end(JSON.stringify({ models: otags })); }
      oseen = { method: q.method, url: q.url, body: JSON.parse(b || '{}') };
      if (omode === '404') { s.writeHead(404, { 'content-type': 'application/json' }); return s.end(JSON.stringify({ error: 'model not found' })); }
      const payload = omode === 'insufficient' ? { status: 'insufficient', claims: [], insufficient_reason: 'Not stated.' }
        : omode === 'invented' ? { status: 'answer', claims: [{ text: 'Smoke was detected at 950 seconds.', citations: ['saffire-01'] }], insufficient_reason: '' }
        : { status: 'answer', claims: [{ text: 'In the reported VI-3 test, smoke was detected at 981 seconds.', citations: ['saffire-01'] }], insufficient_reason: '' };
      s.writeHead(200, { 'content-type': 'application/json' });
      s.end(JSON.stringify({ model: 'qwen2.5:3b', message: { role: 'assistant', content: JSON.stringify(payload) }, done: true, done_reason: omode === 'length' ? 'length' : 'stop' }));
    });
  });
  const oport = await listen(fakeOllama); open.push(fakeOllama);
  const oenv = { SYNTH_PROVIDER: 'ollama', OLLAMA_URL: 'http://127.0.0.1:' + oport, OLLAMA_MODEL: 'qwen2.5:3b', SYNTH_TIMEOUT_MS: '' };
  const op = await start(oenv);
  r = await req(op, 'GET', '/api/status');
  ok('ollama status: enabled, provider ollama, model, 90 s default timeout', r.json.synthesis === true && r.json.provider === 'ollama' && r.json.model === 'qwen2.5:3b' && r.json.timeoutMs === 90000, r.text);
  r = await req(op, 'POST', '/api/synthesize', { question: 'When was smoke detected in the VI-3 test?', passageIds: ['saffire-01'] });
  ok('ollama: handler returns validated, cited answer', r.status === 200 && r.json.status === 'answer' && r.json.provider === 'ollama' && r.json.model === 'qwen2.5:3b' && r.json.claims[0].citations[0] === 'saffire-01' && r.json.sources[0].slideUrl.endsWith('#page=21'), r.text.slice(0, 200));
  ok('ollama request: POST /api/chat, model, stream false, schema in format, temperature 0, no API key header', oseen.method === 'POST' && oseen.url === '/api/chat' && oseen.body.model === 'qwen2.5:3b' && oseen.body.stream === false && oseen.body.format && oseen.body.format.properties.status && oseen.body.options.temperature === 0);
  const omsg = oseen.body.messages;
  ok('ollama prompt: system rules + question + only the sent passage, schema repeated in the prompt', /ONLY from the passages/.test(omsg[0].content) && /<passage id="saffire-01"/.test(omsg[1].content) && /readily detected at 981 seconds/.test(omsg[1].content) && !/saffire-02/.test(omsg[1].content) && /JSON schema/.test(omsg[1].content));
  omode = 'insufficient'; r = await req(op, 'POST', '/api/synthesize', { question: 'What flow speed does SoFIE-MIST use?', passageIds: ['sofie-01'] });
  ok('ollama: insufficient passes through', r.status === 200 && r.json.status === 'insufficient' && r.json.claims.length === 0);
  omode = 'invented'; r = await req(op, 'POST', '/api/synthesize', { question: 'When was smoke detected in the VI-3 test?', passageIds: ['saffire-01'] });
  ok('ollama: invented number is withheld (502 ungrounded_number), nothing shown as an answer', r.status === 502 && r.json.error.code === 'ungrounded_number');
  omode = 'length'; r = await req(op, 'POST', '/api/synthesize', { question: 'When was smoke detected in the VI-3 test?', passageIds: ['saffire-01'] });
  ok('ollama: done_reason length -> 502 truncated', r.status === 502 && r.json.error.code === 'truncated');
  omode = '404'; r = await req(op, 'POST', '/api/synthesize', { question: 'When was smoke detected in the VI-3 test?', passageIds: ['saffire-01'] });
  ok('ollama: model not installed -> 503 model_unavailable with the pull command', r.status === 503 && r.json.error.code === 'model_unavailable' && /ollama pull qwen2\.5:3b/.test(r.json.error.message), r.text);
  otags = []; r = await req(op, 'GET', '/api/status');
  ok('ollama status: reachable but model missing -> synthesis false, reason model_missing', r.json.synthesis === false && r.json.reason === 'model_missing', r.text);
  const down = await start({ SYNTH_PROVIDER: 'ollama', OLLAMA_URL: 'http://127.0.0.1:1', OLLAMA_MODEL: 'qwen2.5:3b' });
  r = await req(down, 'GET', '/api/status');
  ok('ollama status: not running -> synthesis false, reason ollama_down', r.json.synthesis === false && r.json.reason === 'ollama_down', r.text);
  r = await req(down, 'POST', '/api/synthesize', { question: 'When was smoke detected in the VI-3 test?', passageIds: ['saffire-01'] });
  ok('ollama not running: POST -> 503 model_unavailable (clear message)', r.status === 503 && r.json.error.code === 'model_unavailable' && /not running/.test(r.json.error.message), r.text);
  r = await req(down, 'GET', '/'); ok('page and search still served when the model is off', r.status === 200 && r.text.length > 1000);

  open.forEach(s => s.close());
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
