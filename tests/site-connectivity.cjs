// Complete Website Connectivity, Link, Asset, and Form Audit Suite
// Compatible with Node.js (`node tests/site-connectivity.cjs`) and macOS JSC (`jsc tests/site-connectivity.cjs`)

let readDir, readFileContent, fileExists;
if (typeof require !== 'undefined') {
  const fs = require('node:fs');
  const path = require('node:path');
  readDir = dir => fs.readdirSync(dir);
  readFileContent = p => fs.readFileSync(p, 'utf8');
  fileExists = p => fs.existsSync(p);
} else {
  // macOS JSC environment
  readDir = dir => {
    // List known files or read deploy manifest
    const manifest = JSON.parse(readFile('deploy-manifest.json'));
    return manifest.files.filter(f => !f.includes('/'));
  };
  readFileContent = p => readFile(p);
  fileExists = p => {
    try {
      readFile(p);
      return true;
    } catch (e) {
      return false;
    }
  };
}

let passed = 0;
let errors = [];

function assert(condition, message) {
  if (!condition) {
    errors.push(message);
    typeof print !== "undefined" ? print('FAIL: ' + message) : console.error('FAIL: ' + message);
  } else {
    passed++;
  }
}

const htmlFiles = [
  "404.html",
  "academics.html",
  "admin-applications.html",
  "admin-documents.html",
  "admin-setup.html",
  "admin.html",
  "admission.html",
  "application-documents.html",
  "application-success.html",
  "apply.html",
  "book-lists.html",
  "cambridge.html",
  "campus.html",
  "caps-books.html",
  "caps-curriculum.html",
  "caps-faq.html",
  "caps-secondary.html",
  "caps-subjects.html",
  "caps-team.html",
  "connection-map.html",
  "contact.html",
  "directions.html",
  "distance-learning.html",
  "enquiry-success.html",
  "fees.html",
  "index.html",
  "learning-platform.html",
  "meet-us.html",
  "netlify-forms.html",
  "news.html",
  "parent-portal.html",
  "primary-curriculum.html",
  "primary-faq.html",
  "primary-learning.html",
  "primary-team.html",
  "primary.html",
  "privacy.html",
  "progress-analytics.html",
  "prospectus.html",
  "recognition.html",
  "report-card.html",
  "requirements.html",
  "search.html",
  "staff.html",
  "status.html",
  "story.html",
  "student-life.html",
  "student-portal.html",
  "subjects.html",
  "syllabus.html",
  "teacher-portal.html",
  "tuition.html"
];

typeof print !== "undefined" ? print("Starting complete connectivity audit across " + htmlFiles.length + " HTML pages...") : console.log("Starting connectivity audit...");

// 1. Audit HTML files
htmlFiles.forEach(file => {
  const content = readFileContent(file);

  // Collect all element IDs on this page for in-page anchor validation
  const idRegex = /\bid=["']([^"']+)["']/g;
  const pageIds = new Set();
  let mId;
  while ((mId = idRegex.exec(content)) !== null) {
    pageIds.add(mId[1]);
  }

  // A. Stylesheet links
  const cssRegex = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi;
  let mCss;
  while ((mCss = cssRegex.exec(content)) !== null) {
    const href = mCss[1].split('?')[0];
    if (!href.startsWith('http')) {
      assert(fileExists(href), `Broken stylesheet in ${file}: ${href}`);
    }
  }

  // B. Script sources
  const jsRegex = /<script[^>]+src=["']([^"']+)["']/gi;
  let mJs;
  while ((mJs = jsRegex.exec(content)) !== null) {
    const src = mJs[1].split('?')[0];
    if (!src.startsWith('http')) {
      assert(fileExists(src), `Broken script in ${file}: ${src}`);
    }
  }

  // C. Image sources
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let mImg;
  while ((mImg = imgRegex.exec(content)) !== null) {
    const src = mImg[1].split('?')[0];
    if (!src.startsWith('http') && !src.startsWith('data:')) {
      assert(fileExists(src), `Broken image in ${file}: ${src}`);
    }
  }

  // D. Anchor targets
  const aRegex = /<a[^>]+href=["']([^"']+)["']/gi;
  let mA;
  while ((mA = aRegex.exec(content)) !== null) {
    const href = mA[1];
    if (href.startsWith('#')) {
      const anchorId = href.slice(1);
      if (anchorId && anchorId !== 'top') {
        assert(pageIds.has(anchorId), `In-page anchor #${anchorId} missing in ${file}`);
      }
    } else if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
      // safe protocol check
      if (href.startsWith('javascript:')) {
        assert(false, `Unsafe javascript: link in ${file}: ${href}`);
      }
    } else if (href.startsWith('http://') || href.startsWith('https://')) {
      // external URL
    } else {
      // Local link
      const [pathPart, hashPart] = href.split('#');
      const cleanPath = pathPart.split('?')[0];
      if (cleanPath) {
        assert(fileExists(cleanPath), `Broken link in ${file}: href="${href}" -> ${cleanPath} not found`);
      }
    }
  }

  // E. Form actions
  const formRegex = /<form[^>]+action=["']([^"']+)["']/gi;
  let mForm;
  while ((mForm = formRegex.exec(content)) !== null) {
    const action = mForm[1].split('?')[0].replace(/^\//, '');
    assert(fileExists(action), `Broken form action in ${file}: ${mForm[1]} -> ${action}`);
  }
});

// 2. Audit Search Index
const searchIndexContent = readFileContent("data/search-index.json");
const searchIndex = JSON.parse(searchIndexContent);
assert(Array.isArray(searchIndex), "search-index.json must be a JSON array");
assert(searchIndex.length > 0, "search-index.json must not be empty");

searchIndex.forEach(item => {
  assert(item.title, "Index item has title");
  assert(item.url, "Index item has url");
  const cleanUrl = item.url.split('?')[0].split('#')[0];
  assert(fileExists(cleanUrl), `Indexed page does not exist: ${cleanUrl}`);
});

// 3. Audit Deploy Manifest
const manifestContent = readFileContent("deploy-manifest.json");
const manifest = JSON.parse(manifestContent);
assert(manifest.files.length === manifest.fileCount, `Manifest fileCount mismatch: count=${manifest.fileCount}, length=${manifest.files.length}`);
manifest.files.forEach(f => {
  assert(fileExists(f), `Manifest lists missing file: ${f}`);
});

// 4. Audit Health Endpoint
const health = JSON.parse(readFileContent("health.json"));
assert(health.status === "ok", "health.json status should be ok");
assert(health.profile === "static-public-production", "health profile should be static-public-production");

// 5. Audit Sitemap
const sitemap = readFileContent("sitemap.xml");
assert(sitemap.includes("<loc>https://www.ridgefieldacademy.co.za/</loc>"), "Sitemap contains root / for index.html");
htmlFiles.forEach(f => {
  const content = readFileContent(f);
  const isNoIndex = content.includes('content="noindex');
  if (!isNoIndex && f !== "index.html") {
    assert(sitemap.includes(`/${f}`), `Sitemap missing indexable public page: ${f}`);
  }
});

// 6. Audit Robots.txt & Redirects & Headers
assert(fileExists("robots.txt"), "robots.txt exists");
assert(fileExists("_redirects"), "_redirects exists");
assert(fileExists("_headers"), "_headers exists");

const log = typeof console !== 'undefined' && console.log ? console.log : print;
if (errors.length === 0) {
  log(`\n🎉 ALL CONNECTIVITY CHECKS PASSED: ${passed} assertions verified without a single broken link or asset!`);
} else {
  const errLog = typeof console !== 'undefined' && console.error ? console.error : print;
  errLog(`\n❌ CONNECTIVITY AUDIT FAILED with ${errors.length} errors:`);
  errors.forEach(e => errLog(' - ' + e));
  if (typeof process !== 'undefined') process.exit(1);
}
