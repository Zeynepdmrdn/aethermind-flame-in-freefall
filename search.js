/* Local evidence retrieval for Flame in Freefall. No AI, no network: runs in the browser or in Node.
   Loaded by index.html (<script src="search.js">) and by tests/.

   Method (documented on the page under "How the retrieval works"):
   1. BM25F-style scoring (BM25 with weighted fields; k1 1.5, b 0.75). Each passage has three fields:
        text  (weight 2)    the quoted NASA passage
        label (weight 0.5)  study name and evidence-type words
        meta  (weight 1.5)  verified metadata: platform, vehicle, named test (e.g. VI-3), sample material or fuel, measured/varied variables,
                            plus a slot word (material, vehicle, platform, variable) for each filled slot
   2. Query and passages are lower-cased, split on non-alphanumerics, stripped of stopwords and lightly stemmed.
   3. A small domain synonym map expands query terms; a synonym match counts 0.6 of an exact match
      (best of exact or synonym per term, never summed).
   4. General result rules (no question-specific rules):
        - Study scoping: if the question names a study (Saffire, FLEX, SoFIE or MIST), only that study's passages are returned.
        - Coverage: a passage needs at least 40% of the question's IDF-weighted terms, and at least 75% of the
          best passage's coverage, so passages that only share one generic word are dropped.
        - Relative score: a passage needs at least 60% of the best passage's score.
        - Missing value: if the question asks for a value (concentration, pressure, how long, when...) and no
          returned passage gives a number with a unit (or a year, for "when"), the result is "partial": related
          passages are shown, flagged as not answering the question.
        - Otherwise-unmatched questions return "insufficient". Safety-style wording adds a notice; nothing is inferred. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EvidenceSearch = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STOP = {};
  ('a an the of in on at to for from by with and or but if as is are was were be been being do does did done has have had it its this that these those there their they them ' +
   'what which who whom whose when where why how can could would should will may might must about into over under between than then so such not no yes any some ' +
   'all each both more most other only own same very just also tell me us we our you your i my report reported reports nasa study studies studied ' +
   'anything something many much one two get got give gives show shows use used using says say said ' +
   'time first quick quickly long relate related relation happen happened test tests before after ' +
   'up set terms term kind put thing things like way ways per apply applied').split(' ').forEach(function (w) { STOP[w] = 1; });

  var SUFFIX = [['ations', ''], ['ation', ''], ['ments', ''], ['ment', ''], ['ings', ''], ['ing', ''], ['ions', ''], ['ion', ''], ['edly', ''], ['ed', ''], ['ly', '']];
  function stem(w) {
    if (/^\d+$/.test(w) || w.length <= 3) return w;
    if (/ies$/.test(w) && w.length > 4) w = w.slice(0, -3) + 'y';
    else if (/sses$/.test(w)) w = w.slice(0, -2);
    else if (/s$/.test(w) && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
    for (var i = 0; i < SUFFIX.length; i++) {
      var s = SUFFIX[i][0];
      if (w.length - s.length >= 4 && w.slice(-s.length) === s) { w = w.slice(0, -s.length) + SUFFIX[i][1]; break; }
    }
    if (w.length > 4 && /e$/.test(w)) w = w.slice(0, -1);
    return w;
  }
  // Decimals stay one token (3.2, 54.6) so "3.2 kW" does not match a question about "VI-3".
  function tokenize(text) { return String(text).toLowerCase().match(/\d+\.\d+|[a-z0-9]+/g) || []; }
  function terms(text, keepStop) {
    return tokenize(text).filter(function (w) { return keepStop || (!STOP[w] && (w.length > 1 || /\d/.test(w))); }).map(stem);
  }

  var SYN_RAW = [
    ['airflow', 'ventilation', 'flow', 'draft', 'wind', 'breeze', 'velocity', 'circulation', 'airstream'],
    ['smoke', 'particulate', 'aerosol', 'fume', 'smoky'],
    ['detect', 'detector', 'detection', 'sensor', 'alarm', 'notice', 'sense', 'identify'],
    ['extinction', 'extinguish', 'extinguishment', 'extinguished', 'suppress', 'suppression', 'quench', 'quenched'],
    ['ignition', 'ignite', 'ignited', 'igniter', 'kindle', 'spark'],
    ['oxygen', 'o2', 'oxidizer', 'oxidiser', 'oxidizing', 'normoxic'],
    ['pressure', 'kpa', 'atmosphere', 'ambient', 'mmhg'],
    ['microgravity', 'weightless', 'weightlessness', 'freefall', 'gravity'],
    ['iss', 'station', 'orbit', 'orbiting'],
    ['pmma', 'acrylic', 'plexiglas', 'plexiglass', 'plastic', 'polymethyl', 'methacrylate'],
    ['flammability', 'flammable', 'ignitability'],
    ['fire', 'flame', 'burn', 'burning', 'combustion', 'blaze'],
    ['temperature', 'temp', 'degc', 'hot', 'hotter'],
    ['monoxide', 'co'],
    ['dioxide', 'co2'],
    ['gas', 'gases', 'gaseous', 'vapor', 'vapour', 'monoxide', 'dioxide'],
    ['spacecraft', 'cygnus', 'vehicle', 'capsule'],
    ['discover', 'discovered', 'discovery', 'find', 'found', 'observe', 'observed'],
    ['material', 'sample', 'specimen', 'fabric'],
    ['hazard', 'hazardous', 'dangerous', 'danger'],
    ['goal', 'objective', 'aim', 'purpose', 'intend'],
    ['cool', 'cold'],
    ['terminate', 'terminated', 'stop', 'stopped', 'end', 'ended', 'halt'],
    ['vary', 'varied', 'varying', 'change', 'changed', 'alter', 'adjust', 'manipulate']
  ];
  var SYN = {};
  SYN_RAW.forEach(function (g) {
    var st = []; g.forEach(function (w) { terms(w, true).forEach(function (s) { if (st.indexOf(s) < 0) st.push(s); }); });
    st.forEach(function (s) { SYN[s] = (SYN[s] || []).concat(st.filter(function (x) { return x !== s; })); });
  });

  // Words that mean "give me a value".
  var MEASURE = {};
  ['concentration', 'pressure', 'temperature', 'speed', 'velocity', 'rate', 'level', 'amount', 'duration', 'size', 'value', 'percentage',
   'measurement', 'number', 'length', 'thickness', 'power', 'kpa', 'ppm', 'volume', 'width'].forEach(function (w) { MEASURE[stem(w)] = 1; });
  var VALUE_PHRASE = /\b(how (much|many|long|fast|hot|high|low|big|large|often)|at what (time|point|rate|level|speed)|what (time|value|level|rate|amount|number))\b/i;
  var WHEN_RE = /\b(when|at what time|what time|how long)\b/i;
  var NUM_UNIT = /\d+(\.\d+)?\s?(kpa|s\b|seconds?|cm\/s|cm\b|mol%|%|kw|m3|m³|ppm|mmhg|-hour|hours?|cubic meters)/i;
  var YEAR = /\b(19|20)\d\d\b/;
  var SAFETY_RE = /\b(safe|safer|safely|safety|unsafe|danger|dangerous|risk|risky|limit|limits|threshold|thresholds|recommend|recommended|recommendation|should|allowed|acceptable|permissible|harmless)\b/i;

  var STUDY_NAMES = {saffire: ['saffire'], flex: ['flex'], sofie: ['sofie', 'mist']};

  var K1 = 1.5, B = 0.75, SYN_W = 0.6, MIN_COVERAGE = 0.4, REL_COVERAGE = 0.75, REL_SCORE = 0.6, MAX_RESULTS = 5;
  var FIELD_W = {text: 2, label: 0.5, meta: 1.5};
  var FIELDS = ['text', 'label', 'meta'];

  function metaText(m) {
    var parts = [];
    if (m.platform) parts.push('platform ' + m.platform);
    if (m.vehicle) parts.push('vehicle ' + m.vehicle);
    if (m.tests && m.tests.length) parts.push('test ' + m.tests.join(' '));
    if (m.materials && m.materials.length) parts.push('material ' + m.materials.join(' '));
    if (m.variables && m.variables.length) parts.push('variable ' + m.variables.join(' '));
    return parts.join(' ');
  }

  function create(corpus) {
    var docs = corpus.passages.map(function (p) {
      var f = {
        text: terms(p.text, false),
        label: terms(corpus.studies[p.study].words + ' ' + corpus.typeWords[p.type], false),
        meta: terms(metaText(p.meta || {}), false)
      };
      var tf = {}, len = 0;
      FIELDS.forEach(function (name) {
        tf[name] = {};
        f[name].forEach(function (t) { tf[name][t] = (tf[name][t] || 0) + 1; });
        len += FIELD_W[name] * f[name].length;
      });
      return {p: p, tf: tf, len: len};
    });
    var df = {};
    docs.forEach(function (d) {
      var seen = {};
      FIELDS.forEach(function (n) { for (var t in d.tf[n]) seen[t] = 1; });
      for (var t in seen) df[t] = (df[t] || 0) + 1;
    });
    var N = docs.length, avg = docs.reduce(function (a, d) { return a + d.len; }, 0) / N;

    function idf(t) { var n = df[t] || 0; return Math.log(1 + (N - n + 0.5) / (n + 0.5)); }
    function wtf(t, d) { var s = 0; FIELDS.forEach(function (n) { s += FIELD_W[n] * (d.tf[n][t] || 0); }); return s; }
    function bm25f(t, d) {
      var f = wtf(t, d); if (!f) return 0;
      return idf(t) * (f * (K1 + 1)) / (f + K1 * (1 - B + B * d.len / avg));
    }
    function fieldsOf(t, d) { return FIELDS.filter(function (n) { return d.tf[n][t]; }); }
    function wordFor(text, st) { var w = tokenize(text).filter(function (x) { return stem(x) === st; })[0]; return w || st; }
    function passageText(d) { return d.p.text + ' ' + corpus.studies[d.p.study].words + ' ' + metaText(d.p.meta || {}); }

    function search(question) {
      question = String(question || '');
      var qTerms = []; terms(question, false).forEach(function (t) { if (qTerms.indexOf(t) < 0) qTerms.push(t); });
      var out = {question: question, terms: qTerms, status: 'ok', results: [], notices: [], reason: '', namedStudies: []};
      if (SAFETY_RE.test(question)) out.notices.push({kind: 'safety', text: 'This tool only retrieves what the sources state. It does not infer safety limits, acceptable values or recommendations, and nothing below should be read as one.'});
      if (!qTerms.length) { out.status = 'insufficient'; out.reason = 'The question has no searchable content words.'; return out; }

      var raw = tokenize(question);
      Object.keys(STUDY_NAMES).forEach(function (s) { if (STUDY_NAMES[s].some(function (w) { return raw.indexOf(w) >= 0; })) out.namedStudies.push(s); });
      // Study names only scope the search; matching a study's own name is not evidence for the rest of the question.
      var nameStems = {};
      out.namedStudies.forEach(function (s) { STUDY_NAMES[s].forEach(function (w) { nameStems[stem(w)] = 1; }); });
      qTerms = qTerms.filter(function (t) { return !nameStems[t]; });
      out.terms = qTerms;
      if (!qTerms.length) { out.status = 'insufficient'; out.reason = 'The question names a study but gives no topic to look for in it.'; return out; }

      var totalIdf = qTerms.reduce(function (a, t) { return a + idf(t); }, 0);
      var pool = docs.filter(function (d) { return !out.namedStudies.length || out.namedStudies.indexOf(d.p.study) >= 0; });
      var scored = pool.map(function (d) {
        var score = 0, covered = 0, matches = [];
        qTerms.forEach(function (t) {
          var exact = bm25f(t, d), best = exact, via = exact > 0 ? {term: t, how: 'exact', fields: fieldsOf(t, d)} : null;
          (SYN[t] || []).forEach(function (s) {
            var v = SYN_W * bm25f(s, d);
            if (v > best) { best = v; via = {term: t, how: 'synonym', syn: s, fields: fieldsOf(s, d)}; }
          });
          if (via) {
            via.word = wordFor(question, t);
            if (via.syn) via.synWord = wordFor(passageText(d), via.syn);
            score += best; covered += idf(t); matches.push(via);
          }
        });
        return {p: d.p, score: score, coverage: covered / totalIdf, matches: matches};
      }).filter(function (r) { return r.score > 0; })
        .sort(function (a, b) { return b.score - a.score || (a.p.id < b.p.id ? -1 : 1); });

      var ok = scored.filter(function (r) { return r.coverage >= MIN_COVERAGE; });
      if (!ok.length) {
        out.status = 'insufficient';
        var best = scored.reduce(function (m, r) { return Math.max(m, r.coverage); }, 0);
        out.reason = scored.length
          ? 'The closest passage matched only ' + Math.round(best * 100) + '% of the question’s weighted terms (needs at least ' + Math.round(MIN_COVERAGE * 100) + '%).'
          : (out.namedStudies.length ? 'No passage from the named study shares a searchable term with the question.' : 'No passage shares any searchable term with the question.');
        return out;
      }
      var top = ok[0], minCov = Math.max(MIN_COVERAGE, REL_COVERAGE * top.coverage);
      out.results = ok.filter(function (r) { return r.coverage >= minCov && r.score >= REL_SCORE * top.score; }).slice(0, MAX_RESULTS);
      out.results.forEach(function (r) {
        var hit = {}; r.matches.forEach(function (m) { hit[m.term] = 1; });
        r.unmatched = qTerms.filter(function (t) { return !hit[t]; }).map(function (t) { return wordFor(question, t); });
      });
      if (top.coverage < 0.8 && top.unmatched.length) out.notices.push({kind: 'coverage', text: 'Partial match: the best passage covers ' + Math.round(top.coverage * 100) + '% of the question’s weighted terms. Not matched: ' + top.unmatched.join(', ') + '.'});

      // Does any returned passage give the value the question asks for?
      var measureTerms = qTerms.filter(function (t) { return MEASURE[t]; });
      var whenIntent = WHEN_RE.test(question);
      var valueIntent = measureTerms.length > 0 || VALUE_PHRASE.test(question) || whenIntent;
      if (valueIntent) {
        var found = out.results.some(function (r) {
          var hasNum = NUM_UNIT.test(r.p.text) || (whenIntent && YEAR.test(r.p.text));
          if (!hasNum) return false;
          return !measureTerms.length || r.matches.some(function (m) { return measureTerms.indexOf(m.term) >= 0; });
        });
        if (!found) {
          out.status = 'partial';
          out.notices.push({kind: 'value', text: 'These passages mention the topic but none reports the value the question asks for. They are related evidence, not an answer.'});
        }
      }
      return out;
    }
    return {search: search, stem: stem, tokenize: tokenize, STOP: STOP, config: {K1: K1, B: B, SYN_W: SYN_W, MIN_COVERAGE: MIN_COVERAGE, REL_COVERAGE: REL_COVERAGE, REL_SCORE: REL_SCORE, FIELD_W: FIELD_W}};
  }
  return {create: create};
});
