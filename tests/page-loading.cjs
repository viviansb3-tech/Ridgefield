// Run with Bun: /Applications/OpenClaw.app/Contents/Resources/runtime/bin/bun tests/page-loading.cjs
// Run with macOS JSC: /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc tests/page-loading.cjs
let assert, readFileContent, runVm, checkSyntax, log;
if (typeof require !== 'undefined') {
  const { runInNewContext, Script } = require('node:vm');
  const { readFileSync } = require('node:fs');
  assert = require('node:assert/strict');
  readFileContent = p => readFileSync(p, 'utf8');
  runVm = (code, ctx) => runInNewContext(code, ctx);
  checkSyntax = code => new Script(code);
  log = console.log;
} else {
  assert = (cond, msg) => { if (!cond) throw new Error('Assertion failed: ' + (msg || '')); };
  assert.equal = (a, b, msg) => { if (a !== b) throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}. ${msg || ''}`); };
  assert.deepEqual = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}. ${msg || ''}`); };
  readFileContent = p => readFile(p);
  runVm = (code, ctx) => {
    ctx.ctx = ctx;
    const fn = new Function('ctx', 'with(ctx){\n' + code + '\n}');
    fn(ctx);
  };
  checkSyntax = code => new Function(code);
  log = typeof print !== 'undefined' ? print : console.log;
}

const source = readFileContent('assets/page-loading.js');
checkSyntax(readFileContent('assets/connection-map.js'));

function setup(state = 'loading') {
  const timers = new Map(), events = {};
  let shown = 0, removed = 0, n = 0;
  const document = {
    readyState: state,
    body: { append() { shown++; } },
    createElement() { return { setAttribute() {}, remove() { removed++; } }; },
    addEventListener(k, v) { events[k] = v; }
  };
  runVm(source, {
    document,
    window: { addEventListener(k, v) { events[k] = v; } },
    setTimeout(f, ms) { timers.set(++n, { f, ms }); return n; },
    clearTimeout(i) { timers.delete(i); }
  });
  return {
    document,
    events,
    timers,
    run(ms) {
      for (const [id, t] of timers) {
        if (t.ms === ms) {
          timers.delete(id);
          t.f();
        }
      }
    },
    counts() { return [shown, removed]; }
  };
}

let s = setup();
s.events.DOMContentLoaded();
s.run(150);
assert.deepEqual(s.counts(), [0, 0]);

s = setup();
s.run(150);
assert.deepEqual(s.counts(), [1, 0]);
s.events.DOMContentLoaded();
assert.deepEqual(s.counts(), [1, 1]);

s = setup();
s.run(150);
s.run(5000);
assert.deepEqual(s.counts(), [1, 1]);

s = setup();
s.run(150);
s.events.pageshow();
assert.deepEqual(s.counts(), [1, 1]);

s = setup('complete');
assert.equal(s.timers.size, 0);

log('Loading lifecycle: fast page, slow page, timeout, history restoration and completed page passed. Map syntax passed.');
