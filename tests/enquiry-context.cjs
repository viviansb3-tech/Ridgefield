// Run with Node: node tests/enquiry-context.cjs
// Run with macOS JSC: /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc tests/enquiry-context.cjs
let assert, readSource, runContext;
if (typeof require !== 'undefined') {
  assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  readSource = () => fs.readFileSync(path.join(__dirname, '../assets/public-enquiry.js'), 'utf8');
  runContext = (src, ctx) => vm.runInNewContext(src, ctx);
} else {
  assert = (cond, msg) => { if (!cond) throw new Error('Assertion failed: ' + (msg || '')); };
  assert.equal = (a, b, msg) => { if (a !== b) throw new Error(`Assertion failed: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}. ${msg || ''}`); };
  assert.match = (str, regex, msg) => { if (!regex.test(str)) throw new Error(`Assertion failed: "${str}" did not match ${regex}. ${msg || ''}`); };
  readSource = () => readFile('assets/public-enquiry.js');
  runContext = (src, ctx) => {
    const fn = new Function('ctx', 'with(ctx){\n' + src + '\n}');
    fn(ctx);
  };
}

const source = readSource();
const start = source.indexOf('  // Explicit request links');
const end = source.indexOf('  function isLocalEnquiryMailMode', start);
function apply(search, subjectValue = '') {
  const subject = { value: subjectValue };
  const context = {
    URLSearchParams: typeof URLSearchParams !== 'undefined' ? URLSearchParams : function(s) {
      const map = {};
      (s.replace(/^\?/, '').split('&')).forEach(pair => {
        const [k, v] = pair.split('=');
        if (k) map[decodeURIComponent(k)] = decodeURIComponent(v || '');
      });
      return { get: k => map[k] || null };
    },
    location: { search },
    type: { value: 'General' },
    path: { value: 'Primary', options: ['', 'Cambridge', 'CAPS Secondary', 'Primary'].map(value => ({ value })) },
    notice: { classList: { remove() {} } },
    saveSafeDraft() {},
    document: { getElementById: () => subject }
  };
  runContext(source.slice(start, end), context);
  return { ...context, subject };
}

for (const [topic, type] of [['fees', 'Fees'], ['prospectus', 'Admissions'], ['tuition', 'Academics']]) {
  const result = apply('?topic=' + topic);
  assert.equal(result.type.value, type);
  assert(result.subject.value);
  assert.equal(result.path.value, '');
}
assert.equal(apply('?topic=fees&pathway=Cambridge').path.value, 'Cambridge');
assert.equal(apply('?topic=fees&pathway=invalid').path.value, '');
assert.equal(apply('?topic=fees', 'My own question').subject.value, 'My own question');
for (const query of ['', '?topic=unknown', '?topic=__proto__', '?topic=constructor']) {
  const result = apply(query);
  assert.equal(result.type.value, 'General');
  assert.equal(result.subject.value, '');
  assert.equal(result.path.value, 'Primary');
}
assert.equal(apply('?pathway=CAPS%20Secondary').path.value, 'CAPS Secondary');

// Verify expanded topic coverage (visit, academics, pathways, syllabus)
const visitResult = apply('?topic=visit');
assert.equal(visitResult.type.value, 'Admissions');
assert.match(visitResult.subject.value, /visit/i);
assert.equal(apply('?topic=cambridge').type.value, 'Cambridge');
assert.equal(apply('?topic=cambridge').path.value, 'Cambridge');
assert.equal(apply('?topic=caps').type.value, 'CAPS Secondary');
assert.equal(apply('?topic=caps').path.value, 'CAPS Secondary');
assert.equal(apply('?topic=primary').type.value, 'Primary');
assert.equal(apply('?topic=primary').path.value, 'Primary');
assert.equal(apply('?topic=academics').type.value, 'Academics');
assert.equal(apply('?topic=syllabus').type.value, 'Academics');

const log = typeof console !== 'undefined' && console.log ? console.log : print;
log('PASS: request topics, explicit pathway, invalid inputs, preserved user subject, saved category precedence.');
