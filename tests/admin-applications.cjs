// Run with Bun: /Applications/OpenClaw.app/Contents/Resources/runtime/bin/bun tests/admin-applications.cjs
// Run with macOS JSC: /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc tests/admin-applications.cjs
let assert, readFileContent, runVm, log;
if (typeof require !== 'undefined') {
  const fs = require('node:fs'), vm = require('node:vm');
  assert = require('node:assert/strict');
  readFileContent = p => fs.readFileSync(p, 'utf8');
  runVm = (code, ctx) => vm.runInNewContext(code, ctx);
  log = console.log;
} else {
  assert = (cond, msg) => { if (!cond) throw new Error('Assertion failed: ' + (msg || '')); };
  assert.equal = (a, b, msg) => { if (a !== b) throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}. ${msg || ''}`); };
  readFileContent = p => readFile(p);
  runVm = (code, ctx) => {
    ctx.ctx = ctx;
    const fn = new Function('ctx', 'with(ctx){\n' + code + '\n}');
    fn(ctx);
  };
  log = typeof print !== 'undefined' ? print : console.log;
}

const source = readFileContent('assets/rf-admin.js');
function element() {
  return {
    children: [],
    append(...xs) { this.children.push(...xs); },
    prepend(...xs) { this.children.unshift(...xs); },
    replaceChildren() { this.children = []; },
    setAttribute() {}
  };
}

(async () => {
  const app = {
    id: 'application-id',
    reference: 'RIDC202600002',
    learner_first: 'Synthetic',
    learner_last: 'Learner',
    dob: '2012-01-01',
    pathway: 'Cambridge',
    learner_grade: 'IGCSE',
    guardian_name: 'Guardian',
    guardian_email: 'test@example.com',
    guardian_phone: '0000000000',
    status: 'Accepted',
    payload: { 'cambridge-subjects': 'Mathematics' },
    created_at: new Date().toISOString()
  };
  const controls = { appFilter: { value: '' }, appSearch: { value: 'ridc202600002' }, appRows: element() };
  const buttons = [];
  let reads = 0, enrols = 0, notification = '';

  const ctx = {
    ctx: null,
    URLSearchParams: typeof URLSearchParams !== 'undefined' ? URLSearchParams : function(s) {
      const map = {};
      const params = [];
      ((s || '').replace(/^\?/, '').split('&')).forEach(pair => {
        const [k, v] = pair.split('=');
        if (k) {
          const decK = decodeURIComponent(k);
          const decV = decodeURIComponent(v || '');
          map[decK] = decV;
          params.push([decK, decV]);
        }
      });
      return {
        get: k => map[k] || null,
        get size() { return params.length; },
        set: (k, v) => {
          map[k] = String(v);
          const idx = params.findIndex(p => p[0] === k);
          if (idx >= 0) params[idx][1] = String(v);
          else params.push([k, String(v)]);
        },
        append: (k, v) => { map[k] = String(v); params.push([k, String(v)]); },
        toString: () => params.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&')
      };
    },
    Date,
    Promise,
    encodeURIComponent,
    byId: id => controls[id],
    node: () => element(),
    cell: (row) => { const x = element(); row.append(x); return x; },
    empty: () => {},
    select: () => ({ value: 'Accepted', setAttribute() {} }),
    button: (label, callback) => { buttons.push({ label, callback }); return element(); },
    message: x => { notification = x; },
    summary: async () => {},
    request: async (path, options) => {
      if (path.endsWith('/enrol')) { enrols++; app.status = 'Enrolled'; return { studentRef: app.reference }; }
      if (options?.method === 'PATCH') return { ok: true };
      assert(path.includes('number=RIDC202600002'), 'Path must include number parameter: ' + path); reads++; return { applications: [app] };
    },
    json: (method, value) => ({ method, body: JSON.stringify(value) })
  };

  ctx.ctx = ctx;
  const start = source.indexOf('  async function applications()');
  const end = source.indexOf('  async function students()', start);
  runVm(source.slice(start, end) + '\nthis.run=applications;\nctx.run=applications;', ctx);
  await ctx.run();
  assert.equal(reads, 1);
  await buttons.find(x => x.label === 'Save').callback();
  assert.equal(reads, 2, 'Saving must reload applications without shadowing the loader');
  await buttons.find(x => x.label === 'Enrol learner').callback();
  assert.equal(enrols, 1);
  assert(notification.includes(app.reference), 'Notification must include app reference, got: ' + notification);
  assert.equal(reads, 3);
  log('PASS: permanent-number search, status-save reload and enrolment action');
})().catch(e => {
  const errLog = typeof print !== 'undefined' ? print : console.error;
  errLog(e);
  if (typeof process !== 'undefined') process.exitCode = 1;
});
