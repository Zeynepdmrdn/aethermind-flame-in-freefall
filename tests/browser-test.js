'use strict';
/* Browser tests over the Chrome DevTools Protocol (no dependencies; needs Node 22+ for global WebSocket and Chrome/Edge).
   node tests/browser-test.js [screenshotDir]      (set CHROME to the browser exe if it is not auto-found)
   Covers: main flow (question box on top, focus/scroll to results), offline file:// mode, the existing interactions, local search UI,
   the cited-answer UI against the MOCK provider (ok / insufficient / error / timeout / rate-limit / not-configured / stale response),
   real keyboard navigation, laptop and mobile layouts. The real Anthropic provider is NOT exercised here. */
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { spawn } = require('child_process');
const { createServer } = require('../server.js');

const SHOTS = process.argv[2] || null;
const ROOT = path.resolve(__dirname, '..');
const CANDIDATES = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
const CHROME = CANDIDATES.find(p => fs.existsSync(p));
if (!CHROME) { console.error('No Chrome/Edge found. Set CHROME.'); process.exit(2); }

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function getJson(url) { return new Promise((res, rej) => http.get(url, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); }).on('error', rej)); }

class Page {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.waiters = [];
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && this.pending.has(d.id)) { const p = this.pending.get(d.id); this.pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } else if (d.method) this.waiters = this.waiters.filter(w => { if (w.m === d.method) { w.r(d.params); return false; } return true; }); }; }
  send(method, params) { return new Promise((res, rej) => { const id = ++this.id; this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params: params || {} })); }); }
  once(m) { return new Promise(r => this.waiters.push({ m, r })); }
  async nav(url) { const l = this.once('Page.loadEventFired'); await this.send('Page.navigate', { url }); await l; await sleep(150); }
  async ev(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page error: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text)); return r.result.value; }
  async waitFor(expr, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 4000)) { if (await this.ev(expr)) return true; await sleep(60); } return false; }
  async key(key, code, vk, mods) { for (const type of ['keyDown', 'keyUp']) await this.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk, modifiers: mods || 0, text: type === 'keyDown' ? (key === 'Enter' ? String.fromCharCode(13) : (key.length === 1 ? key : undefined)) : undefined }); }
  async tab(shift) { await this.key('Tab', 'Tab', 9, shift ? 8 : 0); await sleep(25); }
  async enter() { await this.key('Enter', 'Enter', 13); await sleep(40); }
  async space() { await this.key(' ', 'Space', 32); await sleep(40); }
  async type(text) { await this.send('Input.insertText', { text }); }
  async viewport(w, h, mobile) { await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile }); }
  async shotView(file) { if (!SHOTS) return; const v = await this.ev(`({y:scrollY,w:innerWidth,h:innerHeight})`); await this.shot(file, { x: 0, y: v.y, width: v.w, height: v.h, scale: 1 }); }
  async shot(file, clip) { if (!SHOTS) return; const m = await this.send('Page.getLayoutMetrics'); const c = m.cssContentSize || m.contentSize; const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: clip || { x: 0, y: 0, width: c.width, height: Math.min(c.height, 6000), scale: 1 } }); fs.writeFileSync(path.join(SHOTS, file), Buffer.from(r.data, 'base64')); }
}

const ACTIVE = `(()=>{const e=document.activeElement;if(!e||e===document.body)return null;const cs=getComputedStyle(e);return {tag:e.tagName,id:e.id||'',text:(e.textContent||e.value||e.getAttribute('aria-label')||'').trim().slice(0,40),cls:e.className||'',outline:cs.outlineStyle+' '+cs.outlineWidth,pressed:e.getAttribute('aria-pressed'),expanded:e.getAttribute('aria-expanded'),type:e.type||''}})()`;
async function tabUntil(pg, pred, max) { for (let i = 0; i < (max || 80); i++) { await pg.tab(); const a = await pg.ev(ACTIVE); if (a && pred(a)) return a; } return null; }
const ORDER = `Array.prototype.map.call(document.querySelectorAll('#cards .card h3'),h=>h.textContent.replace(/^\\d\\. /,'')).join('|')`;
const PIDS = `Array.prototype.map.call(document.querySelectorAll('#res li.hit'),li=>li.getAttribute('data-pid')).join(',')`;

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fif-chrome-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--allow-file-access-from-files', '--user-data-dir=' + profile, '--remote-debugging-port=' + port, 'about:blank'], { stdio: 'ignore' });
  let targets; for (let i = 0; i < 60; i++) { try { targets = await getJson('http://127.0.0.1:' + port + '/json/list'); if (targets.length) break; } catch (e) {} await sleep(250); }
  const pageT = targets.find(t => t.type === 'page');
  const ws = new WebSocket(pageT.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  const pg = new Page(ws); await pg.send('Page.enable'); await pg.send('Runtime.enable');
  const servers = [];
  async function mockServer(env) { const s = createServer(Object.assign({ SYNTH_PROVIDER: 'mock', MOCK_MODE: 'ok', RATE_LIMIT_MAX: '100', DAILY_CAP: '1000', SYNTH_TIMEOUT_MS: '1200' }, env)); await new Promise(r => s.listen(0, '127.0.0.1', r)); servers.push(s); return 'http://127.0.0.1:' + s.address().port + '/'; }
  const origLog = console.log;
  const ask = async (q) => { await pg.ev(`(()=>{const i=document.getElementById('q');i.value=${JSON.stringify(q)};document.getElementById('ask').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));})()`); await sleep(120); };
  const synthReady = `(()=>{const b=document.getElementById('synth-go');return !!b&&!b.disabled})()`;
  const hitText = (n) => pg.ev(`(()=>{const li=document.querySelectorAll('#res li.hit')[${n}];return li?li.getAttribute('data-pid')+': '+li.querySelector('.hit-text').textContent:''})()`);

  try {
    await pg.viewport(1366, 768, false);

    // ================= main flow + offline: opened as a local file =================
    origLog('\n== browser: main flow, file:// (offline) ==');
    await pg.nav('file:///' + ROOT.replace(/\\/g, '/') + '/index.html');
    ok('question box and Search button are visible in the first screen (no scrolling)', await pg.ev(`(()=>{const q=document.getElementById('q').getBoundingClientRect(),b=document.querySelector('#ask button[type=submit]').getBoundingClientRect();return q.top>0&&q.bottom<innerHeight&&b.top>0&&b.bottom<innerHeight&&b.width>60&&/^Search$/.test(document.querySelector('#ask button[type=submit]').textContent)})()`));
    ok('one sentence explains what the user gets', await pg.ev(`(()=>{const l=document.querySelector('.lede').textContent.trim();return /Ask a question/.test(l)&&/NASA source/.test(l)&&(l.match(/\\./g)||[]).length===1})()`));
    ok('no repeated onboarding: old intro paragraphs are gone', await pg.ev(`(()=>{const t=document.body.textContent;return !/Type a question in English/.test(t)&&!/Results appear here/.test(t)&&!/they only fill the box; press Search/.test(t)})()`));
    ok('results section hidden until the first search', await pg.ev(`document.getElementById('evidence').hidden===true`));
    ok('mode note explains offline: search works, cited answer needs the server', await pg.ev(`/Offline mode: search works without a server/.test(document.getElementById('mode-note').textContent)&&/Generate cited answer/.test(document.getElementById('mode-note').textContent)`));
    ok('file://: engine loaded from corpus.js + search.js (no network)', await pg.ev(`document.querySelectorAll('#ex button').length===3 && !document.querySelector('#res .warn')`));
    await pg.shotView('laptop-1-top.png');
    ok('default order Saffire VI | FLEX | SoFIE-MIST', await pg.ev(ORDER) === 'Saffire VI|FLEX (cool flames)|SoFIE-MIST');
    for (const [t, exp] of [['extinction', 'FLEX (cool flames)|SoFIE-MIST|Saffire VI'], ['flammability', 'SoFIE-MIST|Saffire VI|FLEX (cool flames)'], ['smoke', 'Saffire VI|FLEX (cool flames)|SoFIE-MIST']]) {
      await pg.ev(`document.querySelector('[data-topic=${t}]').click()`); ok('topic ' + t + ' reorders cards', await pg.ev(ORDER) === exp);
    }
    await pg.ev(`document.querySelector('button.head[data-id=saffire]').click()`);
    ok('Saffire card opens with timeline: 637 s, 981 s, 344 s calculated', await pg.ev(`(()=>{const t=document.getElementById('timeline');return !!t&&/637 s/.test(t.textContent)&&/981 s/.test(t.textContent)&&/344 s/.test(document.getElementById('tl-span-l').textContent)&&t.querySelectorAll('a[href*="#page="]').length>=5})()`));
    await pg.ev(`(()=>{const a=document.getElementById('cmpA'),b=document.getElementById('cmpB');a.value='saffire';b.value='sofie';a.dispatchEvent(new Event('change'))})()`);
    ok('comparison works with summary', await pg.ev(`document.querySelectorAll('#cmp-table tbody tr').length===10 && /Study objective/.test(document.getElementById('cmp-sum').textContent)`));
    await pg.ev(`document.querySelector('#ex button').click()`);
    ok('example only autofills the box (no search run)', await pg.ev(`document.getElementById('q').value.length>10 && document.getElementById('evidence').hidden===true`));
    await ask('What materials were burned on the Cygnus vehicle?');
    ok('search reveals results and scrolls them into view (heading inside the viewport)', await pg.waitFor(`(()=>{const e=document.getElementById('evidence');if(e.hidden)return false;const r=document.getElementById('ev-h').getBoundingClientRect();return r.top>=-2&&r.top<innerHeight*0.6})()`, 3000));
    ok('focus moves to the results heading (so next Tab enters the results)', await pg.ev(`document.activeElement.id==='ev-h'`));
    ok('results heading states the outcome', await pg.ev(`/^Evidence: \\d passages? found$/.test(document.getElementById('ev-h').textContent)`));
    ok('local search offline: Cygnus materials -> saffire-12 first', (await pg.ev(PIDS)).split(',')[0] === 'saffire-12', await pg.ev(PIDS));
    ok('each result: evidence text, type badge, scope, NASA source link, study-card button', await pg.ev(`[...document.querySelectorAll('#res li.hit')].every(li=>li.querySelector('.hit-text').textContent.length>20&&li.querySelector('.badge.solid')&&/Scope:/.test(li.textContent)&&li.querySelector('a[href*="nasa.gov"]')&&li.querySelector('button.open-card'))`));
    ok('highlights and why-it-matched shown', await pg.ev(`(()=>{const li=document.querySelector('#res li.hit');return !!li.querySelector('mark')&&/Why it matched/.test(li.textContent)})()`));
    ok('Generate cited answer sits next to the results (same header row, above the list), disabled offline with a reason', await pg.ev(`(()=>{const h=document.querySelector('#res .res-head');const b=h&&h.querySelector('#synth-go');return !!b&&b.disabled&&/^Generate cited answer$/.test(b.textContent)&&/Unavailable offline/.test(document.getElementById('synth-why').textContent)&&h.nextElementSibling.id==='synth-out'})()`));
    await pg.shotView('laptop-2-results-offline.png');
    await ask('What flow speed does SoFIE-MIST use?');
    ok('related-but-no-answer: heading says so, banner, every passage badged "Related, not an answer"', await pg.ev(`/^Related evidence: \\d passages?, none answers the question$/.test(document.getElementById('ev-h').textContent)&&/none reports the value/.test(document.getElementById('res').textContent)&&[...document.querySelectorAll('#res li.hit')].every(li=>li.querySelector('.badge.related'))`));
    await ask('What was the free volume of the spacecraft in the VI-3 test?');
    ok('VI-3 passage offers "Show VI-3 timeline"; clicking opens the Saffire card with the timeline focused', await pg.ev(`(()=>{const b=document.querySelector('#res li.hit button[data-timeline]');if(!b)return false;b.click();return document.getElementById('timeline')!==null&&document.activeElement.id==='timeline'&&document.querySelector('button.head[data-id=saffire]').getAttribute('aria-expanded')==='true'})()`));
    await ask('How do astronauts exercise on the ISS?');
    ok('outside the corpus: "No sufficient evidence" heading + box, no passages, no Generate button', await pg.ev(`document.getElementById('ev-h').textContent==='No sufficient evidence'&&!!document.querySelector('#res .insuff')&&!document.querySelector('#res li.hit')&&!document.getElementById('synth-go')`));
    await ask('Is 50% oxygen safe for astronauts?');
    ok('safety wording: banner present', await pg.ev(`/does not infer safety limits/.test(document.getElementById('res').textContent)`));
    await ask('What materials were burned on the Cygnus vehicle?');
    await pg.ev(`document.querySelector('#res li.hit button.open-card').click()`);
    ok('Open study card button expands the study card and focuses it', await pg.ev(`document.querySelector('button.head[data-id=saffire]').getAttribute('aria-expanded')==='true'&&document.activeElement.classList.contains('head')`));

    // ================= http: cited answer UI (MOCK provider) =================
    origLog('\n== browser: http + MOCK provider ==');
    let url = await mockServer({});
    await pg.nav(url);
    ok('http: mode note says Generate cited answer is available', await pg.waitFor(`/Generate cited answer. is available/.test(document.getElementById('mode-note').textContent)`));
    await ask('When was smoke detected in the Saffire test?');
    ok('http: Generate cited answer enabled next to the evidence', await pg.waitFor(synthReady));
    await pg.ev(`document.getElementById('synth-go').click()`);
    ok('loading state: button disabled and labelled, aria-busy, message', await pg.ev(`(()=>{const o=document.getElementById('synth-out'),b=document.getElementById('synth-go');return (b.disabled&&b.textContent==='Generating\\u2026'&&o.getAttribute('aria-busy')==='true'&&/Asking the AI model/.test(o.textContent))||!!document.querySelector('.syn-ans')})()`));
    ok('success: cited claims, mock banner', await pg.waitFor(`(()=>{const a=document.querySelector('#synth-out .syn-ans');return !!a&&document.querySelectorAll('#synth-out .claim').length>=1&&!!document.querySelector('#synth-out .mockbar')})()`));
    ok('success: citations are clickable links to the exact slide URL', await pg.ev(`(()=>{const c=[...document.querySelectorAll('#synth-out a.cite')];return c.length>=1&&c.some(a=>/downloads\\/.*#page=21$/.test(a.href))&&c.every(a=>a.target==='_blank'&&/noopener/.test(a.rel))})()`));
    ok('success: single-test + evidence-type badges; evidence list still below the answer', await pg.ev(`/Single-test observation/.test(document.getElementById('synth-out').textContent)&&/Reported finding/.test(document.getElementById('synth-out').textContent)&&document.querySelectorAll('#res li.hit').length>=1&&!!(document.getElementById('synth-out').compareDocumentPosition(document.querySelector('#res .hits'))&Node.DOCUMENT_POSITION_FOLLOWING)`));
    ok('success: button re-enabled and relabelled', await pg.ev(`!document.getElementById('synth-go').disabled&&document.getElementById('synth-go').textContent==='Generate cited answer'`));
    await pg.shotView('laptop-3-answer-mock.png');

    url = await mockServer({ MOCK_MODE: 'insufficient' }); await pg.nav(url);
    await ask('What flow speed does SoFIE-MIST use?'); await pg.waitFor(synthReady);
    await pg.ev(`document.getElementById('synth-go').click()`);
    ok('evidence cannot support an answer: clear message, no claims, passages remain', await pg.waitFor(`(()=>{const m=document.querySelector('#synth-out .synth-msg.insufficient');return !!m&&/cannot support an answer/.test(m.textContent)&&!document.querySelector('#synth-out .claim')&&document.querySelectorAll('#res li.hit').length>=1})()`));

    url = await mockServer({ MOCK_MODE: 'error' }); await pg.nav(url);
    await ask('When was smoke detected in the Saffire test?'); await pg.waitFor(synthReady);
    await pg.ev(`document.getElementById('synth-go').click()`);
    ok('service-error state: alert, Try again, evidence kept, button usable again', await pg.waitFor(`(()=>{const m=document.querySelector('#synth-out .synth-msg.error');return !!m&&m.getAttribute('role')==='alert'&&/Cited answer unavailable/.test(m.textContent)&&/evidence below is unaffected/.test(m.textContent)&&!!m.querySelector('button')&&document.querySelectorAll('#res li.hit').length>=1&&!document.getElementById('synth-go').disabled})()`));

    url = await mockServer({ MOCK_MODE: 'bad-citation' }); await pg.nav(url);
    await ask('When was smoke detected in the Saffire test?'); await pg.waitFor(synthReady);
    await pg.ev(`document.getElementById('synth-go').click()`);
    ok('invalid citation is rejected server-side and shown as an error, not an answer', await pg.waitFor(`/cited a passage that was not provided/.test(document.getElementById('synth-out').textContent)&&!document.querySelector('#synth-out .syn-ans')`));

    url = await mockServer({ MOCK_MODE: 'slow', SYNTH_TIMEOUT_MS: '700' }); await pg.nav(url);
    await ask('When was smoke detected in the Saffire test?'); await pg.waitFor(synthReady);
    await pg.ev(`document.getElementById('synth-go').click()`);
    ok('timeout: server aborts the provider, UI shows a timeout error', await pg.waitFor(`/took too long/.test(document.getElementById('synth-out').textContent)`, 6000));
    await pg.ev(`document.getElementById('synth-go').click()`); await sleep(100);
    await ask('Which study varies external radiation?'); await sleep(1400);
    ok('stale response ignored after a new search', await pg.ev(`(()=>{const o=document.getElementById('synth-out');return !o.querySelector('.synth-msg')&&!/took too long/.test(o.textContent)&&document.querySelector('#res li.hit').getAttribute('data-pid')==='sofie-01'})()`));

    url = await mockServer({ RATE_LIMIT_MAX: '1' }); await pg.nav(url);
    await ask('When was smoke detected in the Saffire test?'); await pg.waitFor(synthReady);
    await pg.ev(`document.getElementById('synth-go').click()`); await pg.waitFor(`!!document.querySelector('.syn-ans')`);
    await pg.ev(`document.getElementById('synth-go').click()`);
    ok('rate limit: second request shows "Too many requests"', await pg.waitFor(`/Too many requests/.test(document.getElementById('synth-out').textContent)`));

    url = await mockServer({ SYNTH_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: '' }); await pg.nav(url);
    ok('no API key: mode note says search works and answers are not set up', await pg.waitFor(`/Search works\\. .Generate cited answer. is not set up on this server/.test(document.getElementById('mode-note').textContent)`));
    await ask('When was smoke detected in the Saffire test?');
    ok('no API key: Generate button disabled with explanation; evidence unaffected', await pg.waitFor(`(()=>{const b=document.getElementById('synth-go');return b&&b.disabled&&/Not set up on this server/.test(document.getElementById('synth-why').textContent)&&document.querySelectorAll('#res li.hit').length>=1})()`));

    // ================= three fresh queries through the full flow (mock provider on) =================
    origLog('\n== browser: three new queries (passages actually shown) ==');
    url = await mockServer({}); await pg.nav(url); await sleep(300);
    for (const [kind, q] of [['direct answer', 'What was the free volume of the spacecraft in the VI-3 test?'], ['related, lacks the answer', 'What flow speed does SoFIE-MIST use?'], ['outside the corpus', 'How do astronauts exercise on the ISS?']]) {
      await ask(q);
      const h = await pg.ev(`document.getElementById('ev-h').textContent`), n = await pg.ev(`document.querySelectorAll('#res li.hit').length`);
      origLog('  [' + kind + '] "' + q + '" -> heading: ' + h);
      for (let i = 0; i < n; i++) origLog('     ' + (i + 1) + '. ' + (await hitText(i)).slice(0, 150));
      if (!n) origLog('     (no passages: ' + (await pg.ev(`(document.querySelector('#res .insuff p')||{}).textContent||''`)).slice(-90) + ')');
    }

    // ================= keyboard navigation (real key events) =================
    origLog('\n== browser: keyboard navigation (real Tab/Enter/Space/Arrow events) ==');
    await pg.nav(url); await sleep(300);
    const seq = []; let a;
    for (let i = 0; i < 9; i++) { await pg.tab(); a = await pg.ev(ACTIVE); if (a) seq.push(a); }
    ok('Tab order: question box, Search, 3 examples, 3 topics, first card', seq[0].id === 'q' && seq[1].text === 'Search' && seq.slice(2, 5).every(x => x.tag === 'BUTTON') && seq.slice(5, 8).map(x => x.text).join('|') === 'Smoke Detection|Extinction|Material Flammability' && /Saffire VI/.test(seq[8].text), JSON.stringify(seq.map(x => x.text || x.id)));
    ok('focus outline >=2px on every tested control', seq.every(x => /^(solid|auto)\s+([2-9]|\d{2,})/.test(x.outline) || /3px/.test(x.outline)), JSON.stringify(seq.map(x => x.outline)));
    await pg.ev(`document.getElementById('q').focus()`);
    await pg.type('What materials were burned on the Cygnus vehicle?'); await pg.enter();
    ok('Enter in the question box searches; focus lands on the results heading, which is in view', await pg.waitFor(`document.activeElement.id==='ev-h'&&document.getElementById('ev-h').getBoundingClientRect().top<innerHeight*0.6&&document.getElementById('ev-h').getBoundingClientRect().bottom>0`, 3000));
    await pg.tab();
    ok('next Tab goes to "Generate cited answer"', (await pg.ev(ACTIVE)).id === 'synth-go');
    await pg.ev(`document.getElementById('ev-h').focus()`); await pg.tab(true);
    ok('Shift+Tab from the heading returns to the search area', await pg.ev(`!!document.activeElement.closest('header')`));
    await ask('When was smoke detected in the Saffire test?'); await pg.ev(`document.getElementById('ev-h').focus()`);
    await pg.tab(); await pg.enter();
    ok('Enter on Generate cited answer works from the keyboard and renders a cited answer', await pg.waitFor(`!!document.querySelector('#synth-out .syn-ans')`));
    a = await tabUntil(pg, x => /cite/.test(x.cls), 6);
    ok('citation links are keyboard-reachable', !!a);
    a = await tabUntil(pg, x => /Open study card/.test(x.text), 40);
    ok('"Open study card" reachable with visible focus', !!a && /solid|auto/.test(a.outline));
    await pg.enter();
    ok('Enter opens the card and moves focus to its header', await pg.ev(`document.activeElement.classList.contains('head')&&document.activeElement.getAttribute('aria-expanded')==='true'`));
    await ask('What was the free volume of the spacecraft in the VI-3 test?'); await pg.ev(`document.getElementById('ev-h').focus()`);
    a = await tabUntil(pg, x => /Show VI-3 timeline/.test(x.text), 40);
    ok('"Show VI-3 timeline" reachable by keyboard', !!a);
    await pg.enter();
    ok('Enter opens the timeline and focuses it', await pg.ev(`document.activeElement.id==='timeline'`));
    await pg.ev(`document.getElementById('tl-range').focus()`); const before = await pg.ev(`+document.getElementById('tl-range').value`); await pg.key('ArrowRight', 'ArrowRight', 39); await pg.key('ArrowRight', 'ArrowRight', 39);
    ok('timeline slider responds to arrow keys', (await pg.ev(`+document.getElementById('tl-range').value`)) === before + 2);
    await pg.nav(url); await sleep(200);
    await pg.ev(`document.querySelector('[data-topic=extinction]').focus()`); await pg.enter();
    ok('Enter on a focused topic button selects it', await pg.ev(`document.querySelector('.topics button[aria-pressed=true]').textContent`) === 'Extinction');
    await pg.ev(`document.querySelector('button.head').focus()`); await pg.space();
    ok('Space expands a focused card header', await pg.ev(`document.activeElement.getAttribute('aria-expanded')`) === 'true');

    // ================= REAL local model (opt-in: OLLAMA_E2E=1; needs Ollama running with the model) =================
    if (process.env.OLLAMA_E2E) {
      origLog('\n== browser: REAL local model (Ollama), full flow ==');
      const omodel = process.env.OLLAMA_MODEL || 'qwen2.5:3b';
      url = await mockServer({ SYNTH_PROVIDER: 'ollama', OLLAMA_MODEL: omodel, SYNTH_TIMEOUT_MS: '' });
      await pg.nav(url);
      ok('mode note: local model available on this computer', await pg.waitFor(`document.getElementById('mode-note').textContent.indexOf(${JSON.stringify('local model ' + omodel + ' on this computer')})>=0`));
      await ask('When was smoke detected in the Saffire VI-3 test?'); await pg.waitFor(synthReady);
      let t0 = Date.now(); await pg.ev(`document.getElementById('synth-go').click()`);
      ok('loading text names the local model', await pg.ev(`/local model on this computer/.test(document.getElementById('synth-out').textContent)||!!document.querySelector('.syn-ans')`));
      const got = await pg.waitFor(`!!document.querySelector('#synth-out .syn-ans, #synth-out .synth-msg')`, 110000);
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      const answerTxt = await pg.ev(`(document.querySelector('#synth-out .syn-ans, #synth-out .synth-msg')||{}).textContent||''`);
      origLog('  [real answer] ' + secs + ' s :: ' + answerTxt.replace(/\s+/g, ' ').slice(0, 260));
      ok('REAL local answer rendered (no mock banner), labelled as local model, may contain errors', got && await pg.ev(`!!document.querySelector('#synth-out .syn-ans')&&!document.querySelector('#synth-out .mockbar')&&/local model/.test(document.querySelector('#synth-out .badge').textContent)&&/may contain errors/.test(document.querySelector('#synth-out .badge').textContent)`));
      ok('REAL answer states the 981 s detection time and cites saffire-01', await pg.ev(`(()=>{const a=document.querySelector('#synth-out .syn-ans');return !!a&&/981/.test(a.textContent)&&!!a.querySelector('a.cite[data-cite="saffire-01"]')})()`));
      ok('REAL answer citation is a clickable NASA link to slide 21 of the presentation PDF', await pg.ev(`(()=>{const c=document.querySelector('#synth-out a.cite[data-cite="saffire-01"]');return !!c&&c.href.startsWith('https://ntrs.nasa.gov/')&&/#page=21$/.test(c.href)&&c.target==='_blank'})()`));
      ok('evidence passage still shown under the answer, with its own NASA link', await pg.ev(`!!document.querySelector('#res li.hit[data-pid="saffire-01"] a[href*="nasa.gov"]')`));
      await pg.shotView('ollama-1-answer.png');
      await ask('What flow speed does SoFIE-MIST use?'); await pg.waitFor(synthReady);
      t0 = Date.now(); await pg.ev(`document.getElementById('synth-go').click()`);
      const got2 = await pg.waitFor(`!!document.querySelector('#synth-out .syn-ans, #synth-out .synth-msg')`, 110000);
      origLog('  [real insufficient] ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s :: ' + (await pg.ev(`(document.querySelector('#synth-out .syn-ans, #synth-out .synth-msg')||{}).textContent||''`)).replace(/\s+/g, ' ').slice(0, 260));
      ok('REAL model: evidence cannot support an answer (SoFIE-MIST flow speed value), no claims shown', got2 && await pg.ev(`!!document.querySelector('#synth-out .synth-msg.insufficient')&&/cannot support an answer/.test(document.getElementById('synth-out').textContent)&&!document.querySelector('#synth-out .claim')`));
      ok('related passages remain visible and badged under the insufficient message', await pg.ev(`document.querySelectorAll('#res li.hit .badge.related').length>=1`));
      await pg.shotView('ollama-2-insufficient.png');
      await ask('How do astronauts exercise on the ISS?');
      ok('outside the corpus: no Generate button, "No sufficient evidence" (no model call needed)', await pg.ev(`document.getElementById('ev-h').textContent==='No sufficient evidence'&&!document.getElementById('synth-go')`));
      // model off: Ollama unreachable -> search still works, button explains
      url = await mockServer({ SYNTH_PROVIDER: 'ollama', OLLAMA_URL: 'http://127.0.0.1:1', OLLAMA_MODEL: omodel, SYNTH_TIMEOUT_MS: '' });
      await pg.nav(url);
      ok('model off: mode note says the local model is not running; search works', await pg.waitFor(`/local model is not running/.test(document.getElementById('mode-note').textContent)`));
      await ask('When was smoke detected in the Saffire VI-3 test?');
      ok('model off: results shown, Generate disabled with the reason, NASA links intact', await pg.waitFor(`(()=>{const b=document.getElementById('synth-go');return !!b&&b.disabled&&/Local model is not running/.test(document.getElementById('synth-why').textContent)&&!!document.querySelector('#res li.hit a[href*="nasa.gov"]')})()`));
      await pg.shotView('ollama-3-model-off.png');
    }

    // ================= layouts =================
    origLog('\n== browser: layouts ==');
    for (const [name, w, h, mobile] of [['laptop', 1366, 768, false], ['mobile', 390, 844, true]]) {
      await pg.viewport(w, h, mobile); await pg.nav(url); await sleep(250);
      ok(name + ' (' + w + 'px): question box + Search visible without scrolling', await pg.ev(`(()=>{const q=document.getElementById('q').getBoundingClientRect(),b=document.querySelector('#ask button[type=submit]').getBoundingClientRect();return q.bottom<innerHeight&&b.bottom<innerHeight&&q.width>150})()`));
      await pg.shotView(name + '-1-top.png');
      await ask('How does ventilation relate to the burning in these studies?'); await pg.waitFor(synthReady, 3000); await sleep(500);
      await pg.shotView(name + '-2-results.png');
      await pg.ev(`document.getElementById('synth-go').click()`); await pg.waitFor(`!!document.querySelector('.syn-ans')`);
      await pg.ev(`document.querySelector('button.head[data-id=saffire]').click()`);
      const m = await pg.ev(`({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,bad:[...document.querySelectorAll('body *')].filter(e=>{if(e.closest('.tablewrap'))return false;const r=e.getBoundingClientRect();return r.width>0&&r.right>document.documentElement.clientWidth+1}).map(e=>e.tagName+'.'+e.className).slice(0,5)})`);
      ok(name + ' (' + w + 'px): no horizontal overflow with results, answer and open card', m.sw <= m.cw && m.bad.length === 0, JSON.stringify(m));
      const fs_ = await pg.ev(`Math.min(...[...document.querySelectorAll('.hit-text,.claim,.note,.why,.mode')].map(e=>parseFloat(getComputedStyle(e).fontSize)))`);
      ok(name + ': smallest result/answer/note text >= 14px', fs_ >= 14, String(fs_));
      const bt = await pg.ev(`(()=>{const r=document.getElementById('synth-go').getBoundingClientRect();return {w:r.width,h:r.height}})()`);
      ok(name + ': Generate cited answer button is a comfortable target (>=44px tall)', bt.h >= 44, JSON.stringify(bt));
      await pg.shot(name + '-3-full.png');
      const rc = await pg.ev(`(()=>{const r=document.getElementById('evidence').getBoundingClientRect();return {x:0,y:r.top+scrollY,width:innerWidth,height:r.height,scale:1}})()`);
      await pg.shot(name + '-4-evidence.png', rc);
    }
  } finally {
    servers.forEach(s => s.close()); try { ws.close(); } catch (e) {} chrome.kill();
    origLog('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  }
}
main().catch(e => { console.error(e); process.exit(2); });
