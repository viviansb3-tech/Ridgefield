// Run with Node: node tests/application-submission.cjs
// Run with macOS JSC: /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc tests/application-submission.cjs
let assert, readSource, runContext;
if (typeof require !== 'undefined') {
  assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  readSource = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  runContext = (src, ctx) => {
    ctx.ctx = ctx;
    return vm.runInNewContext(src, ctx);
  };
} else {
  assert = (cond, msg) => { if (!cond) throw new Error('Assertion failed: ' + (msg || '')); };
  assert.equal = (a, b, msg) => { if (a !== b) throw new Error(`Assertion failed: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}. ${msg || ''}`); };
  readSource = (file) => readFile(file);
  runContext = (src, ctx) => {
    const fn = new Function('ctx', 'with(ctx){\n' + src + '\n}');
    fn(ctx);
  };
}

const appSource = readSource('assets/public-application.js');
const coreSource = readSource('assets/public-core.js');

// Test 1: Verify RidgefieldWorkflow reference creation and display on success page
{
  const wfStart = coreSource.indexOf('/* ===== public-workflow.js ===== */');
  const wfEnd = coreSource.indexOf('/* ===== public-architecture.js ===== */', wfStart);
  const coreCtx = {
    window: {},
    location: { search: '?ref=RF-APP-20260926-TESTREF' },
    sessionStorage: { getItem: () => null, setItem: () => {} },
    document: {
      addEventListener: () => {},
      querySelector: (sel) => {
        if (sel === '[data-reference-output]') return { textContent: '' };
        if (sel === '[data-reference-wrap]') return { classList: { remove: () => {} } };
        return null;
      }
    },
    Math,
    Date,
    String,
    URLSearchParams: typeof URLSearchParams !== 'undefined' ? URLSearchParams : function(s) {
      const map = {};
      (s.replace(/^\?/, '').split('&')).forEach(pair => {
        const [k, v] = pair.split('=');
        if (k) map[decodeURIComponent(k)] = decodeURIComponent(v || '');
      });
      return { get: k => map[k] || null };
    }
  };
  coreCtx.window = coreCtx;
  runContext(coreSource.slice(wfStart, wfEnd), coreCtx);
  const generated = coreCtx.RidgefieldWorkflow.makeRef('RF-APP');
  assert(/^RF-APP-\d{8}-[A-Z0-9]{4,5}$/.test(generated), 'makeRef format invalid: ' + generated);

  const outputEl = { textContent: '' };
  let wrapUnhidden = false;
  coreCtx.document.querySelector = (sel) => {
    if (sel === '[data-reference-output]') return outputEl;
    if (sel === '[data-reference-wrap]') return { classList: { remove: (cls) => { if (cls === 'rf-hidden') wrapUnhidden = true; } } };
    return null;
  };
  coreCtx.RidgefieldWorkflow.showReference();
  assert.equal(outputEl.textContent, 'RF-APP-20260926-TESTREF');
  assert(wrapUnhidden, 'Expected [data-reference-wrap] to be unhidden');
}

// Test 2: Local Application Submission Flow (sendApplicationLocally)
(async () => {
  const submitStart = appSource.indexOf('  async function sendApplicationLocally(){');
  const submitEnd = appSource.indexOf('\n  form.addEventListener("submit"', submitStart);

  let redirectTarget = '';
  let storedDraftKey = 'rf_application_draft';
  let sessionStorageData = { [storedDraftKey]: '{"pathway":"Cambridge"}' };
  let statusMessage = '';

  const mockSubmitBtn = {
    disabled: false,
    textContent: 'Send application',
    dataset: {},
    removeAttribute(k) { delete this.dataset[k]; }
  };

  const appCtx = {
    submitted: false,
    form: {
      querySelector: (sel) => sel === 'button[type="submit"]' ? mockSubmitBtn : null
    },
    refInput: { value: 'RF-APP-20260926-SUBMIT1' },
    FormData: class {
      forEach(cb) {
        cb('Cambridge', 'pathway');
        cb('IGCSE', 'grade-applying');
      }
    },
    URLSearchParams: class {
      constructor() { this.params = []; }
      append(k, v) { this.params.push([k, v]); }
      toString() { return this.params.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&'); }
    },
    setStatus: (msg) => { statusMessage = msg; },
    clearDraft: () => { delete sessionStorageData[storedDraftKey]; },
    sessionStorage: {
      setItem: (k, v) => { sessionStorageData[k] = v; },
      getItem: (k) => sessionStorageData[k] || null
    },
    location: {
      set href(val) { redirectTarget = val; },
      get href() { return redirectTarget; }
    },
    encodeURIComponent: encodeURIComponent,
    fetch: async (url, opts) => {
      assert.equal(url, '/api/send-application');
      assert.equal(opts.method, 'POST');
      return {
        ok: true,
        json: async () => ({ ok: true, message: 'Local preview submission accepted' })
      };
    }
  };

  runContext(appSource.slice(submitStart, submitEnd) + '\nctx.sendApplicationLocally = sendApplicationLocally;\n', appCtx);
  await appCtx.sendApplicationLocally();

  assert.equal(redirectTarget, '/application-success.html?ref=RF-APP-20260926-SUBMIT1');
  assert.equal(sessionStorageData['rf_last_reference'], 'RF-APP-20260926-SUBMIT1');
  assert.equal(sessionStorageData[storedDraftKey], undefined, 'Draft should be cleared on success');
  assert(appCtx.submitted, 'submitted flag should be true');

  // Test 3: Failure scenario (HTTP error)
  redirectTarget = '';
  appCtx.submitted = false;
  appCtx.fetch = async () => ({
    ok: false,
    json: async () => ({ ok: false, error: 'Server unavailable' })
  });
  await appCtx.sendApplicationLocally();

  assert.equal(redirectTarget, '', 'Should not redirect on failure');
  assert.equal(appCtx.submitted, false, 'submitted flag should remain false on failure');
  assert.equal(mockSubmitBtn.disabled, false, 'Submit button should be re-enabled on failure');
  assert.equal(mockSubmitBtn.textContent, 'Send application', 'Button label should be restored');
  assert(statusMessage.includes('Server unavailable'), 'Error message should report failure reason');

  const log = typeof console !== 'undefined' && console.log ? console.log : print;
  log('PASS: admissions submission flow, reference generator, draft cleanup, and error handling.');
})().catch(err => {
  const logErr = typeof console !== 'undefined' && console.error ? console.error : print;
  logErr(err);
  if (typeof process !== 'undefined') process.exitCode = 1;
});
