'use strict';
/* Real provider: the official Anthropic SDK (@anthropic-ai/sdk). The API key is read from the server environment only.

   Checked against the official docs on 2026-11-14 (platform.claude.com/docs):
   - Model: `claude-opus-5-5` is a current Claude API ID (Models overview); `claude-haiku-5-5` is the cheaper current option.
     Set ANTHROPIC_MODEL to change it; any model in the structured-outputs supported list works.
   - Structured output: `output_config.format = {type: "json_schema", schema}` is stable, no beta header. Schema rules met:
     additionalProperties:false, every property required, no minItems>1/maxItems/minLength/maxLength, no recursion.
   - Effort: `output_config.effort` ("low".."max") sits beside `format` in the same OutputConfig (SDK types agree).
     Opus 5.5 defaults to "medium" and cannot disable thinking; we pass "low" for a short grounded answer.
   - max_tokens: thinking counts toward it, so it is generous (4000) for a ~3-sentence answer.
   - Forced tool_choice is NOT used (400 on Opus 5.5). Refusals (stop_reason "refusal") and max_tokens cut-offs can break
     schema validity, so the handler checks stop_reason before parsing.
   - Not used: server-side `fallbacks` (beta) for refusals; a refusal is shown as a service error and local results stay. */
const Anthropic = require('@anthropic-ai/sdk');
const { OUTPUT_SCHEMA } = require('./synthesize');

function createAnthropicProvider(opts) {
  const Client = Anthropic.default || Anthropic;
  const client = new Client({
    apiKey: opts.apiKey,
    maxRetries: 1,
    timeout: opts.timeoutMs || 20000   // SDK timeout in ms; the handler also aborts via signal
  });
  const model = opts.model || 'claude-opus-5-5';
  async function provider({ system, user, signal }) {
    const response = await client.messages.create({
      model,
      max_tokens: 4000,   // thinking tokens count toward this cap (Opus 5.5 always thinks adaptively)
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } }
    }, { signal });
    const text = (response.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    return { text, stopReason: response.stop_reason, model: response.model || model };
  }
  provider.providerName = 'anthropic';
  provider.model = model;
  return provider;
}
module.exports = { createAnthropicProvider };
