// Run with Bun: /Applications/OpenClaw.app/Contents/Resources/runtime/bin/bun tests/baas-client.cjs
// Run with macOS JSC: /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc tests/baas-client.cjs
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
  assert.rejects = async (promise, regex) => {
    let failed = false;
    try {
      await (typeof promise === 'function' ? promise() : promise);
      failed = true;
    } catch (e) {
      if (regex && !regex.test(e.message || String(e))) {
        throw new Error(`Expected error matching ${regex}, got "${e.message || String(e)}"`);
      }
    }
    if (failed) throw new Error('Expected promise to reject, but it resolved successfully.');
  };
  readFileContent = p => readFile(p);
  runVm = (code, ctx) => {
    ctx.ctx = ctx;
    const fn = new Function('ctx', 'with(ctx){\n' + code + '\n}');
    fn(ctx);
  };
  log = typeof print !== 'undefined' ? print : console.log;
}

const HeadersMock = typeof Headers !== 'undefined' ? Headers : class {
  constructor(init = {}) {
    this.map = new Map();
    if (init instanceof HeadersMock) {
      init.map.forEach((v, k) => this.set(k, v));
    } else if (init) {
      Object.entries(init).forEach(([k, v]) => this.set(k, v));
    }
  }
  set(k, v) { this.map.set(k.toLowerCase(), String(v)); }
  get(k) { return this.map.get(k.toLowerCase()) || null; }
  has(k) { return this.map.has(k.toLowerCase()); }
};

const ResponseMock = typeof Response !== 'undefined' ? Response : {
  json: (data, opts = {}) => ({
    ok: opts.status ? opts.status >= 200 && opts.status < 300 : true,
    status: opts.status || 200,
    json: async () => data
  })
};

if (typeof AbortSignal !== 'undefined' && !AbortSignal.timeout) {
  AbortSignal.timeout = function(ms) { return { aborted: false }; };
}
const AbortSignalMock = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal : class {
  static timeout(ms) { return { aborted: false }; }
};
const EventMock = typeof Event !== 'undefined' ? Event : class {};

const source = readFileContent('assets/rf-baas.js');
(async () => {
  const requests = [];
  const store = new Map();
  let mode = 'signin';
  let refreshes = 0;

  const context = {
    console: typeof console !== 'undefined' ? console : { log: print, error: print },
    Headers: HeadersMock,
    Response: ResponseMock,
    AbortSignal: AbortSignalMock,
    Event: EventMock,
    Date,
    JSON,
    Error,
    Promise,
    setTimeout,
    sessionStorage: {
      getItem: k => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k)
    },
    window: {
      RidgefieldBaasConfig: { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' },
      dispatchEvent: () => {}
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (url.includes('grant_type=password')) {
        return ResponseMock.json({ access_token: 'access', refresh_token: 'refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 });
      }
      if (url.includes('/auth/v1/signup?')) {
        return ResponseMock.json({ user: { id: 'teacher-id', email: 'teacher@example.com', user_metadata: JSON.parse(options.body).data } });
      }
      if (url.includes('grant_type=refresh_token')) {
        refreshes++;
        await new Promise(r => setTimeout(r, 10));
        return ResponseMock.json({ access_token: 'new-access', refresh_token: 'new-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 });
      }
      if (mode === 'expired') return ResponseMock.json({ ok: false, error: 'expired' }, { status: 401 });
      return ResponseMock.json({ ok: true });
    }
  };

  runVm(source, context);
  const B = context.window.RidgefieldBaas;
  await assert.rejects(B.request('/admin/summary', { authenticated: true }), /sign in/);
  await B.signIn(' staff@example.com ', ' password preserved ');
  assert.equal(JSON.parse(requests[0].options.body).password, ' password preserved ');
  assert(B.hasSession());
  await B.request('/send-enquiry', { method: 'POST' });
  const lastHeaders = requests.at ? requests.at(-1).options.headers : requests[requests.length - 1].options.headers;
  assert(!lastHeaders.has('authorization'));
  await B.request('/admin/summary', { authenticated: true });
  const authHeaders = requests.at ? requests.at(-1).options.headers : requests[requests.length - 1].options.headers;
  assert.equal(authHeaders.get('Authorization'), 'Bearer access');
  const old = JSON.parse(store.get('rf_supabase_session'));
  old.expires_at = 1;
  store.set('rf_supabase_session', JSON.stringify(old));
  await Promise.all([B.request('/me', { authenticated: true }), B.request('/me', { authenticated: true })]);
  assert.equal(refreshes, 1);
  mode = 'expired';
  await B.request('/me', { authenticated: true });
  assert(!B.hasSession());
  await assert.rejects(B.request('//malicious.example'), /Invalid service path/);
  const application = { firstName: 'Synthetic', lastName: 'Teacher', pathway: 'Cambridge' };
  const user = await B.signUp(' teacher@example.com ', 'a sufficiently long password', { teacher_application: application }, 'https://ridgefieldacademy.co.za/teacher-portal.html');
  assert.equal(user.email, 'teacher@example.com');
  const signup = requests[requests.length - 1];
  assert(signup.url.includes('redirect_to=https%3A%2F%2Fridgefieldacademy.co.za%2Fteacher-portal.html'));
  assert.equal(JSON.parse(signup.options.body).password, 'a sufficiently long password');
  assert.equal(JSON.parse(signup.options.body).data.teacher_application.firstName, 'Synthetic');
  assert(!B.hasSession(), 'An email-unconfirmed signup must not create a browser session.');
  const callbackStore = new Map();
  let replacedUrl = '';
  const callbackContext = {
    ...context,
    sessionStorage: {
      getItem: key => callbackStore.get(key) || null,
      setItem: (key, value) => callbackStore.set(key, String(value)),
      removeItem: key => callbackStore.delete(key)
    },
    location: { hash: '#access_token=callback-access&refresh_token=callback-refresh&expires_in=3600', pathname: '/teacher-portal.html', search: '' },
    history: { replaceState: (_state, _title, url) => { replacedUrl = url; } },
    URLSearchParams,
    window: { ...context.window, dispatchEvent: () => {} }
  };
  runVm(source, callbackContext);
  assert(callbackContext.window.RidgefieldBaas.hasSession(), 'A confirmed email callback must restore its session.');
  assert.equal(replacedUrl, '/teacher-portal.html', 'The auth token fragment must be removed from browser history.');
  log('PASS: authenticated requests, public requests, preserved passwords, concurrent refresh and expired-session clearing');
})().catch(e => {
  const errLog = typeof print !== 'undefined' ? print : console.error;
  errLog(e);
  if (typeof process !== 'undefined') process.exitCode = 1;
});
