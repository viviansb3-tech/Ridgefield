// Run with Node: node tests/search-page.cjs
// Run with macOS JSC: /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc tests/search-page.cjs

let assert, readSource, runContext;
if (typeof require !== 'undefined') {
  assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  readSource = () => fs.readFileSync(path.join(__dirname, '../assets/public-search.js'), 'utf8');
  runContext = (src, ctx) => vm.runInNewContext(src, ctx);
} else {
  assert = (cond, msg) => { if (!cond) throw new Error('Assertion failed: ' + (msg || '')); };
  assert.equal = (a, b, msg) => { if (a !== b) throw new Error(`Assertion failed: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}. ${msg || ''}`); };
  assert.match = (str, regex, msg) => { if (!regex.test(str)) throw new Error(`Assertion failed: "${str}" did not match ${regex}. ${msg || ''}`); };
  readSource = () => readFile('assets/public-search.js');
  runContext = (src, ctx) => {
    const fn = new Function('ctx', 'with(ctx){\n' + src + '\n}');
    fn(ctx);
  };
}

const source = readSource();

class Element {
  constructor() {
    this.value = '';
    this.textContent = '';
    this.children = [];
    this.attributes = {};
    this.events = {};
  }
  setAttribute(key, value) { this.attributes[key] = value; }
  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); }
  addEventListener(name, fn) { this.events[name] = fn; }
  focus() {}
}

function setup(fetch, search = '') {
  const elements = Object.fromEntries(
    ['siteSearch', 'searchResults', 'searchCount', 'siteSearchButton'].map(id => [id, new Element()])
  );
  const context = {
    URL: typeof URL !== 'undefined' ? URL : function(href) { this.href = href; },
    URLSearchParams: typeof URLSearchParams !== 'undefined' ? URLSearchParams : function(search) {
      const map = {};
      const qMatch = search.match(/[?&]q=([^&]+)/);
      if (qMatch) map.q = decodeURIComponent(qMatch[1]);
      return { get: (k) => map[k] || null };
    },
    fetch,
    document: {
      getElementById: id => elements[id],
      createElement: () => new Element()
    },
    location: {
      href: 'https://example.test/search.html' + search,
      search,
      pathname: '/search.html'
    },
    history: {
      replaceState: (_, __, url) => { context.lastUrl = String(url); }
    }
  };
  runContext(source, context);
  return { elements, context };
}

const flush = () => new Promise(resolve => {
  if (typeof setImmediate !== 'undefined') setImmediate(resolve);
  else setTimeout(resolve, 10);
});

(async () => {
  let calls = 0;
  const data = Array.from({ length: 18 }, (_, i) => ({
    title: 'Cambridge ' + i,
    url: 'cambridge.html',
    description: 'Learning'
  }));
  data.push({ title: 'Cambridge unsafe', url: 'javascript:alert(1)' });

  const { elements: e, context } = setup(async () => {
    calls++;
    return calls === 1 ? { ok: false } : { ok: true, json: async () => data };
  });

  assert.equal(calls, 0, 'No calls on initialization without query');
  e.siteSearch.value = 'Cambridge';
  await e.siteSearch.events.input();

  assert.match(e.searchCount.textContent, /unavailable/);
  assert.equal(e.searchResults.children[1].textContent, 'Retry search');

  await e.siteSearch.events.input();
  assert.equal(e.searchCount.textContent, 'Showing 15 of 18 results');
  assert.equal(e.searchResults.children.length, 15);
  assert.match(context.lastUrl, /q=Cambridge/);

  await e.siteSearch.events.input();
  assert.equal(calls, 2);

  e.siteSearch.value = 'zzzz';
  await e.siteSearch.events.input();
  assert.equal(e.searchCount.textContent, '0 results');

  let resolve;
  const pending = setup(() => new Promise(r => { resolve = r; }), '?q=Cambridge');
  pending.elements.siteSearch.value = '';
  await pending.elements.siteSearch.events.input();

  resolve({ ok: true, json: async () => data });
  await flush();

  assert.equal(pending.elements.searchResults.children[0].textContent, 'Enter at least two characters to search.');
  assert.equal(pending.elements.searchResults.attributes['aria-busy'], 'false');
  assert(!pending.context.lastUrl.includes('?q='));

  const log = typeof console !== 'undefined' && console.log ? console.log : print;
  log('PASS: idle state, HTTP failure/retry, caching, result totals, unsafe URL filtering, no matches, stale request suppression, query URLs.');
})().catch(error => {
  const err = typeof console !== 'undefined' && console.error ? console.error : print;
  err(error);
  if (typeof process !== 'undefined') process.exitCode = 1;
});
