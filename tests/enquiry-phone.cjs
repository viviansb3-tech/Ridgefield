// Run with Node: node tests/enquiry-phone.cjs
// Run with macOS JSC: /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc tests/enquiry-phone.cjs
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
  readSource = () => readFile('assets/public-enquiry.js');
  runContext = (src, ctx) => {
    const fn = new Function('ctx', 'with(ctx){\n' + src + '\n}');
    fn(ctx);
  };
}

const source = readSource();
const start = source.indexOf('  const phone=document.getElementById');
const end = source.indexOf('  function saveSafeDraft', start);
const phone = {
  value: '',
  events: {},
  setAttribute(k, v) { this[k] = v; },
  setCustomValidity(message) { this.validationMessage = message; },
  addEventListener(k, fn) { this.events[k] = fn; }
};
const label = {}, hint = {}, contact = {
  value: 'Email',
  events: {},
  addEventListener(k, fn) { this.events[k] = fn; }
};
runContext(source.slice(start, end), {
  contact,
  document: {
    getElementById: id => ({ enqPhone: phone, enqPhoneLabel: label, enqPhoneHint: hint })[id]
  }
});

assert.equal(phone.required, false);
contact.value = 'Phone call';
contact.events.change();
assert.equal(phone.required, true);
assert(phone.validationMessage);
assert.equal(label.textContent, 'Phone *');
phone.value = '   ';
phone.events.input();
assert(phone.validationMessage);
phone.value = '+27 63 697 0178';
phone.events.input();
assert.equal(phone.validationMessage, '');
contact.value = 'Email';
contact.events.change();
assert.equal(phone.required, false);
assert.equal(phone['aria-required'], 'false');
phone.value = '';
contact.value = 'Either phone or email';
contact.events.change();
assert.equal(phone.required, false);
assert.equal(phone.validationMessage, '');
const log = typeof console !== 'undefined' && console.log ? console.log : print;
log('PASS: phone-call requirement, blank number rejection, international formatting, switching contact preference.');
