// Prints retrieval results for a bank of questions. Usage: node tests/retrieval-bank.js
const corpus = require('../corpus.js');
const E = require('../search.js').create(corpus);
const bank = [
  ['regression', 'What oxygen concentration was used in the VI-3 test?'],
  ['regression', 'Which fuel did the 2012 cool flames burn?'],
  ['regression', 'How quickly did the detector notice the burning plastic?'],
  ['regression', 'How does ventilation relate to the burning in these studies?'],
  ['regression', 'What materials were burned on the Cygnus vehicle?'],
  ['regression', 'How long was the duct flow running before it stopped?'],
  ['regression', 'How hot did the surroundings get in the Saffire fire?'],
  ['regression', 'What is the best pizza recipe?'],
  ['regression', 'Is 50% oxygen safe for astronauts?'],
  ['new-answerable', 'Which samples did the final Saffire flight burn, and how wide were they?'],
  ['new-answerable', 'What kind of flames did FLEX find aboard the station?'],
  ['new-answerable', 'Which variables does SoFIE-MIST change on purpose?'],
  ['new-answerable', 'What gases did the Cygnus fire put into the cabin?'],
  ['new-answerable', 'What ambient pressure did the VI-3 test run at?'],
  ['new-answerable', 'When was ignition in the Saffire test?'],
  ['new-paraphrase', 'Which spacecraft hosted the Saffire VI burn?'],
  ['new-paraphrase', 'How was the plastic block set up in terms of thickness?'],
  ['mentions-but-no-value', 'What oxygen concentration did SoFIE-MIST use?'],
  ['mentions-but-no-value', 'What temperature did the cool flames burn at?'],
  ['mentions-but-no-value', 'What pressure was used in the FLEX experiments?'],
  ['mentions-but-no-value', 'How much airflow does SoFIE-MIST apply?'],
  ['unanswerable', 'What is the capital of France?'],
  ['unanswerable', 'Which sensor model did Saffire use for smoke detection?'],
  ['unanswerable', 'Did SoFIE-MIST find that flames spread faster at low pressure?'],
  ['unanswerable', 'What are the results of SoFIE-MIST?'],
  ['safety', 'What ventilation rate is acceptable for crew cabins?'],
  ['safety', 'What smoke detector should we install in a spacecraft?']
];
for (const [kind, q] of bank) {
  const r = E.search(q);
  console.log(`\n[${kind}] ${q}\n  terms: ${r.terms.join(', ')}${r.namedStudies.length ? '  study=' + r.namedStudies : ''}  => ${r.status.toUpperCase()}`);
  if (r.status === 'insufficient') console.log('  ' + r.reason);
  r.results.forEach((x, i) => console.log(`  ${i + 1}. ${x.p.id} [${x.p.type}] s=${x.score.toFixed(2)} cov=${Math.round(x.coverage * 100)}% ${x.matches.map(m => (m.how === 'exact' ? m.word : m.word + '~' + m.synWord) + '{' + m.fields.join('+') + '}').join(', ')}`));
  r.notices.forEach(n => console.log('  NOTICE(' + n.kind + ')'));
}
