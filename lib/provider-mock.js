'use strict';
/* MOCK provider for tests and offline UI development. It is NOT a model: it builds a deterministic answer from the
   passages it is given. server.js refuses to start it when NODE_ENV=production, and responses are labelled provider:"mock".
   Modes: ok | insufficient | error | slow | bad-citation | advice | bad-json | refusal */
function createMockProvider(mode) {
  async function provider({ question, passages, signal }) {
    if (mode === 'slow') await new Promise((res, rej) => { const t = setTimeout(res, 60000); signal.addEventListener('abort', () => { clearTimeout(t); rej(new Error('aborted')); }); });
    if (mode === 'error') { const e = new Error('mock upstream failure'); e.status = 500; throw e; }
    if (mode === 'refusal') return { text: '', stopReason: 'refusal', model: 'mock' };
    if (mode === 'bad-json') return { text: 'not json at all', stopReason: 'end_turn', model: 'mock' };
    if (mode === 'insufficient') return { text: JSON.stringify({ status: 'insufficient', claims: [], insufficient_reason: 'Mock: the passages do not state the requested value.' }), stopReason: 'end_turn', model: 'mock' };
    const first = passages[0];
    if (mode === 'bad-citation') return { text: JSON.stringify({ status: 'answer', claims: [{ text: 'Mock claim citing a passage that was not sent.', citations: ['saffire-99'] }], insufficient_reason: '' }), stopReason: 'end_turn', model: 'mock' };
    if (mode === 'advice') return { text: JSON.stringify({ status: 'answer', claims: [{ text: 'Crews should use this detector.', citations: [first.id] }], insufficient_reason: '' }), stopReason: 'end_turn', model: 'mock' };
    // ok: quote up to two passages, each cited.
    const claims = passages.slice(0, 2).map(p => ({ text: 'Mock summary of ' + p.id + ': ' + p.text.slice(0, 160).replace(/\s+/g, ' '), citations: [p.id] }));
    return { text: JSON.stringify({ status: 'answer', claims, insufficient_reason: '' }), stopReason: 'end_turn', model: 'mock' };
  }
  provider.providerName = 'mock';
  return provider;
}
module.exports = { createMockProvider };
