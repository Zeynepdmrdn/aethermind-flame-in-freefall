'use strict';
/* Local provider: Ollama (https://ollama.com), running on this computer. Free, no API key, nothing leaves the machine.
   Uses POST /api/chat with `format` = our JSON schema (Ollama structured outputs), stream:false, temperature 0.
   The schema is also repeated in the prompt, as the Ollama docs recommend for small models.
   Failures are mapped to clear errors: Ollama not running / model not installed -> 503 model_unavailable.
   The server still validates every citation and number afterwards, so a weak small model cannot show an unsupported answer. */
const { OUTPUT_SCHEMA, SynthError } = require('./synthesize');

function createOllamaProvider(opts) {
  opts = opts || {};
  const base = String(opts.url || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const model = opts.model || 'qwen2.5:3b';
  const schemaHint = '\n\nReturn ONLY a JSON object that matches this JSON schema (no other text):\n' + JSON.stringify(OUTPUT_SCHEMA);

  async function provider({ system, user, signal }) {
    let res;
    try {
      res = await fetch(base + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          model, stream: false, keep_alive: '10m', format: OUTPUT_SCHEMA,
          options: { temperature: 0, num_ctx: 4096, num_predict: 600 },
          messages: [{ role: 'system', content: system }, { role: 'user', content: user + schemaHint }]
        })
      });
    } catch (e) {
      if (signal && signal.aborted) throw e;   // handler turns this into a timeout
      throw new SynthError(503, 'model_unavailable', 'The local model is not running. Start Ollama, then try again.');
    }
    if (res.status === 404) throw new SynthError(503, 'model_unavailable', 'The local model "' + model + '" is not installed. Run: ollama pull ' + model);
    if (!res.ok) throw new SynthError(502, 'provider_error', 'The local model returned an error (HTTP ' + res.status + ').');
    const j = await res.json();
    return {
      text: (j.message && j.message.content) || '',
      stopReason: j.done_reason === 'length' ? 'max_tokens' : 'end_turn',
      model: j.model || model
    };
  }

  // Cheap readiness probe for GET /api/status: is Ollama up, and is the model installed?
  provider.check = async function check() {
    try {
      const r = await fetch(base + '/api/tags', { signal: AbortSignal.timeout(2000) });
      if (!r.ok) return { ok: false, reason: 'ollama_down' };
      const j = await r.json();
      const names = (j.models || []).map(m => m.name);
      const want = model.includes(':') ? model : model + ':latest';
      return names.includes(want) || names.includes(model) ? { ok: true } : { ok: false, reason: 'model_missing' };
    } catch (e) { return { ok: false, reason: 'ollama_down' }; }
  };
  provider.providerName = 'ollama';
  provider.model = model;
  return provider;
}
module.exports = { createOllamaProvider };
