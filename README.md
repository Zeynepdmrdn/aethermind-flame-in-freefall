# Flame in Freefall (Team AetherMind)

Ask a question in English and get matching passages from three NASA microgravity combustion studies (Saffire VI, FLEX, SoFIE-MIST), each with its scope and a link to the NASA source. In server mode, **Generate cited answer** can also write a short answer from those passages with clickable citations.

## What works without anything extra

| Feature | Needs a server? | Needs an Anthropic account or key? |
|---|---|---|
| Question search, results with scope and NASA links, study cards, Saffire VI-3 timeline, topic browsing, comparison | **No.** Double-click `index.html` (keep `corpus.js` and `search.js` next to it). | **No** |
| **Generate cited answer** | Yes (`server.js`) | **No** with the free local model (Ollama). Only the optional paid Anthropic option needs a key, kept on the server |

If the answer feature is unavailable, the page says so right under the search box and next to the button, and everything above still works.

## Free local model (Ollama), no account and no API cost

`SYNTH_PROVIDER=ollama` (already set in your local `.env`) makes **Generate cited answer** use a model running on this computer. Nothing is sent to the internet and nothing is billed.

Set up once (PowerShell). If `ollama` is not found, use the full path, as on this PC:

```powershell
winget install --id Ollama.Ollama -e
& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" pull qwen2.5:3b      # about 1.9 GB download
& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" list                  # should list qwen2.5:3b
```

Each run:

```powershell
cd "C:\Users\Lenovo\OneDrive\Desktop\AetherMind"
npm.cmd start
```

The console should say `Cited answers: ENABLED (ollama, model qwen2.5:3b)`. Open http://localhost:3000, search, press **Generate cited answer**. On this PC (CPU only) the first answer took about 6 to 9 s and later ones about 4 to 5 s; that is a measurement of a few requests, not a guarantee.

If Ollama is not running, the page says so, the button is disabled, and search keeps working. Start Ollama (it normally runs in the background after install; otherwise start the Ollama app) and search again: the page re-checks on every search, no reload needed.

A 3B model is weak, so the server never trusts it blindly: every claim must cite a passage that was sent, must not read like advice, and every number in a claim must appear in the cited passage. If one check fails, the answer is withheld and shown as an error, never as an answer. This also blocks derived values (for example a "344 s" difference that the passages do not state).

Other model: set `OLLAMA_MODEL` in `.env` (for example `qwen2.5:7b`; slower on CPU, so raise `SYNTH_TIMEOUT_MS` if needed).

## Files

- `index.html` page and UI. Loads `corpus.js` and `search.js` from the same folder.
- `corpus.js` the single evidence corpus (25 passages + verified metadata), used by the browser and by the server.
- `search.js` local retrieval (BM25F + synonyms + rules). No AI, no network.
- `server.js`, `lib/` one host for page and API (same origin). Serves only `index.html`, `corpus.js`, `search.js`.
- `.env.example` placeholders only. `.gitignore` excludes `.env` and `node_modules`.
- `tests/` `run-tests.js`, `browser-test.js`, `live-check.js`, `retrieval-bank.js`.

## Windows PowerShell: start the app (no account needed)

Use `npm.cmd`, not `npm`: on many Windows PCs PowerShell blocks `npm.ps1` ("running scripts is disabled"); `npm.cmd` avoids that.

```powershell
cd "C:\Users\Lenovo\OneDrive\Desktop\AetherMind"
node -v                  # needs v20 or newer
npm.cmd install          # installs the official Anthropic SDK (needs internet once)
npm.cmd start
```

Open http://localhost:3000. Expected console lines:

```
Flame in Freefall on http://localhost:3000
Cited answers: ENABLED (ollama, model qwen2.5:3b)         <- with SYNTH_PROVIDER=ollama in .env
Cited answers: disabled (set SYNTH_PROVIDER=ollama ...)   <- without .env: search still works
```

Stop the server with `Ctrl+C`.

Run the tests (free, no key):

```powershell
npm.cmd test                    # corpus, retrieval, server with the MOCK provider, SDK code vs a FAKE local server
npm.cmd run test:browser        # Chrome: main flow, keyboard, laptop and mobile layouts (set $env:CHROME if Chrome is not found)
$env:OLLAMA_E2E = "1"; npm.cmd run test:browser   # also runs the REAL local model through the browser (needs Ollama + qwen2.5:3b)
```

## Optional paid option: Anthropic API (not needed if you use Ollama)

Set `SYNTH_PROVIDER=anthropic` and add a key as below. Skip this whole section if you use the free local model.

Everything here is your action; nothing in this project creates accounts or spends money by itself.

1. Create an Anthropic account and an API key in the Anthropic Console (https://platform.claude.com), and add credit there. Consider a low monthly spend limit if the Console offers one. API usage is billed per token; one answer here is a small request (see "Cost" below).
2. Put the key on your computer **without pasting it into chat, into `index.html`, or into any committed file**. Choose one:

   **A. A local `.env` file (git-ignored)**
   ```powershell
   cd "C:\Users\Lenovo\OneDrive\Desktop\AetherMind"
   Copy-Item .env.example .env
   notepad .env             # replace your-key-here with your key, save, close Notepad
   ```

   **B. This PowerShell window only (nothing written to disk)**
   ```powershell
   $secure = Read-Host "Anthropic API key" -AsSecureString
   $env:ANTHROPIC_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
   ```
   (Typing is hidden. The variable disappears when you close the window.)
3. Start the server and check that it sees the key (it never prints the key):
   ```powershell
   npm.cmd start
   ```
   The console should say `AI summaries: ENABLED (anthropic)`. In a second PowerShell window:
   ```powershell
   Invoke-RestMethod http://localhost:3000/api/status
   ```
   Expected: `synthesis: True`, `provider: anthropic`.

## Verify ONE live request

Stop the server first (`Ctrl+C`), keep the key set (step 2), then:

```powershell
npm.cmd run live-check                          # dry run: sends nothing, shows what would happen
npm.cmd run live-check -- --confirm-spend       # sends exactly ONE real request
```

It runs the full server path (validation, real Anthropic call, citation checks) for "When was smoke detected in the Saffire VI-3 test?" and prints the answer. `LIVE CHECK PASSED` means the real model answered with validated citations and mentioned 981 s. Then start the app, search for the same question, and press **Generate cited answer** once in the browser. If it fails, the message names the cause (`provider_auth` = wrong key; `provider_busy` = limit or overload; `provider_error` = see the `[synthesize]` line).

**Until this has been run with a real key, the real provider is untested.** The automated tests use a mock provider and a fake local HTTP server only.

## Provider configuration (checked 2026-11-14 against the official docs)

| Item | Setting | Source checked |
|---|---|---|
| SDK | `@anthropic-ai/sdk` `^1.8.0` (npm `latest` was 1.8.0, same as installed) | npm registry |
| Model | `claude-opus-5-5` by default; change with `ANTHROPIC_MODEL` (e.g. `claude-haiku-5-5`) | Models overview |
| Structured output | `output_config.format = {type:"json_schema", schema}`; stable, no beta header | Structured outputs |
| Schema limits | Uses none of the unsupported features (all fields required, `additionalProperties:false`, no min/max constraints beyond the supported set) | Structured outputs |
| Effort | `output_config.effort: "low"` (Opus 5.5 default is `medium`; thinking cannot be disabled) | Effort |
| Forced `tool_choice` | Not used (returns a 400 on Opus 5.5) | Models/effort pages |

Compatibility fixes made in this version:
1. `max_tokens` raised from 2000 to 4000: thinking counts toward `max_tokens` on Opus 5.5.
2. The model's `status` value is compared case-insensitively (structured outputs do not guarantee enum capitalization).
3. The system prompt now asks the first claim to answer the user's actual question directly.
4. Refusals (`stop_reason: "refusal"`) and `max_tokens` cut-offs can break schema validity, so they are checked before parsing and shown as a service error.

Not enabled: the server-side `fallbacks` option for refusals (beta, untested here). Not verified: that the live API accepts this exact request. `live-check` is the test for that.

## Cost (estimate, not measured)

Official prices per million tokens: Opus 5.5 $4 in / $20 out; Haiku 5.5 from $0.10 in / $0.50 out. One answer here sends roughly 700 input tokens and returns a few hundred output tokens including thinking, so very roughly 1 to 2 cents on Opus 5.5 and a fraction of a cent on Haiku 5.5. These token counts are my estimate, not measured. Limits in `.env.example` cap use: 8 answers per client per 10 minutes and `DAILY_CAP` (default 300) per day.

## Deploy on one host (same-origin page + API)

Any host that runs Node 20+ works (Render, Railway, Fly...). These steps were not run from here.
1. Put the folder in a private Git repo (`.env` and `node_modules` are git-ignored). This folder is not a Git repo yet: run `git init` first.
2. Create a web service from the repo. Build command `npm install`, start command `npm start`.
3. In the host's environment settings (never in the repo) set `ANTHROPIC_API_KEY`, `TRUST_PROXY=1`, `NODE_ENV=production` (also blocks the mock provider); optionally `ANTHROPIC_MODEL`, `RATE_LIMIT_MAX`, `DAILY_CAP`.
4. Open the site and check `/api/status` returns `{"synthesis":true,"provider":"anthropic"}`.

Rotate the key in the Console if it is ever exposed.

## How the cited answer is kept honest

The browser sends only the question and up to five passage IDs; the server loads the passage text from `corpus.js`. The model must return JSON with claims and citation IDs. The server rejects the whole answer if a claim has no citation, cites an ID that was not sent, or reads like advice (`should`, `recommend`...). The prompt keeps single-test observations, test conditions and study objectives apart and forbids safety limits and recommendations. If the passages do not answer the question, the page shows "The evidence cannot support an answer". These are model instructions plus server checks, not guarantees: read the cited passages.
