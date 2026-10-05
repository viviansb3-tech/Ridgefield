// Run with Node: node tests/application-review.cjs
// Run with macOS JSC: /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc tests/application-review.cjs
let source, runContext, assert, log;

if (typeof require !== 'undefined') {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  assert = require('node:assert/strict');
  source = fs.readFileSync(path.join(__dirname, '../assets/public-application.js'), 'utf8');
  runContext = (src, ctx) => vm.runInNewContext(src, ctx);
  log = console.log;
} else {
  assert = (cond, msg) => { if (!cond) throw new Error('Assertion failed: ' + (msg || '')); };
  assert.equal = (a, b, msg) => { if (a !== b) throw new Error(`Assertion failed: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}. ${msg || ''}`); };
  source = readFile('assets/public-application.js');
  runContext = (src, ctx) => {
    const fn = new Function('ctx', 'with(ctx){\n' + src + '\n}');
    fn(ctx);
  };
  log = typeof console !== 'undefined' && console.log ? console.log : print;
}

const summary = { innerHTML: '' }, quiz = { value: '' };
const context = {
  refInput: { value: 'TEST-REF' },
  summaryInput: { value: '' },
  pathway: 'Cambridge',
  hiddenCampus: { value: 'Campus' },
  grade: { value: 'IGCSE' },
  sourceInput: { value: 'internal-source' },
  document: { getElementById: id => id === 'applicationSummary' ? summary : quiz },
  val: id => id === 'learnerFirstName' ? '<script>' : id,
  radio: id => id,
  conditionalRows: () => [['Experience', 'New'], ['Subjects', 'Maths']],
  preparedDocuments: () => ['School report'],
  esc: value => String(value).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
};

const start = source.indexOf('  function buildSummary(){');
const end = source.indexOf('  document.getElementById("applicationSummary").addEventListener', start);
runContext(source.slice(start, end) + '\nbuildSummary();', context);
assert.equal((summary.innerHTML.match(/data-review-edit=/g) || []).length, 5);
assert(!summary.innerHTML.includes('<script>'));
assert(summary.innerHTML.includes('&lt;script&gt;'));
assert(!summary.innerHTML.includes('internal-source'));
assert(context.summaryInput.value.includes('internal-source'));
assert(context.summaryInput.value.includes('TEST-REF'));
assert(quiz.value.includes('Subjects: Maths'));

let handler, visited;
const navigation = {
  current: 6,
  document: { getElementById: () => ({ addEventListener: (_, fn) => handler = fn }) },
  showStep: step => { visited = step; }
};
runContext(source.slice(end, source.indexOf('  function isLocalMailMode', end)), navigation);
for (const step of [1, 2, 3, 4, 5]) {
  handler({ target: { closest: () => ({ dataset: { reviewEdit: String(step) } }) } });
  assert.equal(visited, step);
}
visited = null;
handler({ target: { closest: () => ({ dataset: { reviewEdit: '99' } }) } });
assert.equal(visited, null);
log('PASS: five edit sections, escaped learner values, complete submission summary, valid edit navigation.');
