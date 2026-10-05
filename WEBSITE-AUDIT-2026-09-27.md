# Ridgefield Academy website audit

Audit date: 27 September 2026. Scope: the current local project, not a certification of the deployed production website.

## Assessment

The site has a working page structure, but it is not yet consistent enough to treat as publication-ready. The most important problems concern curriculum/grade information, campus assignments, unsupported operational claims, and a deployment stylesheet-policy conflict. Several recently rewritten pages are more definitive than the older pages and supporting data justify.

No production HTML, CSS or JavaScript was changed during this audit. This report distinguishes **confirmed inconsistency**, **browser-confirmed defect**, **source-confirmed deployment risk**, and **school confirmation required**. An unsupported claim is not proof that the claim is false.

## Coverage and checks

- Read the main content of all 40 public HTML pages, plus the hidden Netlify form definition file: 41 HTML files total.
- Examined shared navigation, search, form scripts, styles, generated public data, search index, deployment headers/redirects and release metadata.
- Structural scan: all 40 public pages have one H1 and one main landmark; no duplicate HTML IDs or images missing alt attributes were detected. This does not establish the quality of alt text or complete accessibility compliance.
- Ran all 9 current Node test suites: **8 passed; 1 failed**. `tests/application-submission.cjs` fails with `ReferenceError: ctx is not defined`. The connectivity suite passed **4,702 assertions**. These checks verify paths and selected logic, not factual content or delivery to an admissions inbox.
- Browser samples: existing application page, fresh Primary page and Contact page reached through a campus-visit link. Checked the desktop layout at 1280px and mobile Contact at 390 × 844. This was not a visual inspection of every page at every screen size.
- No real forms were submitted and no messages were sent. Production Netlify processing, email delivery, security headers and external school claims were not verified live.

## Priority findings

### 01 — Conflicting Cambridge grade progression [High · confirmed inconsistency]

`cambridge.html:150–177` describes Pre-IGCSE in Grades 8–9, IGCSE in Grades 10–11, and AS in Grade 12. `admission.html` repeats that model. In contrast, `syllabus.html:77,107–112`, `story.html`, and `book-lists.html` describe Grade 8 introduction, IGCSE in Grades 9–10, and AS across Grades 11–12.

**Impact:** Families receive incompatible information about placement, examination years and required books.

**Correction:** Obtain the approved school grade map and use one shared version across admissions, programme, syllabus, story and resource pages. Cambridge qualification stages should not be assigned to grades independently on each page.

### 02 — The application cannot represent all advertised Cambridge entry routes [High · confirmed functional/content mismatch]

`assets/public-application.js:14` offers only `IGCSE` and `AS Level` under Cambridge. There is no Grade 8/Pre-IGCSE choice, despite `cambridge.html` and `admission.html` advertising that entry route. Other pages advertise selected A Levels while the form and homepage generally describe AS only.

**Correction:** Confirm the available entry levels and qualification options, then align the dropdown, programme descriptions, subject availability and confirmation summaries. Do not assume that A Level admission is available merely because a page mentions it.

### 03 — Primary campus information contradicts itself [High · confirmed inconsistency]

`primary.html`, `primary-faq.html`, `contact.html`, the shared footer and generated application data locate Primary at **22 Maartens Street**. `campus.html:140` identifies Block B at **25 Wilcock Road** as the “Cambridge & Primary Hub”; `directions.html:105` also places Primary international classes there.

**Impact:** Parents can travel to the wrong campus. If two separate Primary offerings exist, the website and form do not explain that distinction.

**Correction:** Have the school approve a pathway-to-campus table and clarify whether the Block A/Block B model represents the same two locations. Reuse that table everywhere.

### 04 — Primary phase labels are inconsistent and misleading [High · confirmed inconsistency]

`primary.html:162,177` and `academics.html` label Intermediate as Grades **4–5**, followed by Senior Primary Grades **6–7**. `primary-curriculum.html` and `primary-faq.html` use Grades **4–6**, then Grade 7 transition.

The DBE lists Intermediate Phase as Grades **4–6** and Senior Phase as Grades **7–9**. If the school uses an internal “Senior Primary” grouping, label it as an internal grouping rather than presenting it as the CAPS phase structure. Source: [DBE CAPS](https://www.education.gov.za/Curriculum/NCSGradesR12/CAPS/tabid/420/Default.aspx).

### 05 — Grade 12 CAPS applications conflict with advertised intake restrictions [High · confirmed inconsistency]

`caps-secondary.html:352,398` says admissions are open for Grades **8–11**, while `assets/public-application.js:20` permits **Grade 12** and other pages describe the entire Grades 8–12 range without the intake distinction.

**Correction:** Confirm whether Grade 12 transfers are accepted; either include them consistently or route them to a placement enquiry before application.

### 06 — Production CSP conflicts with extensive inline styling [High · source-confirmed deployment risk]

`_headers:8` specifies `style-src 'self'` without an allowance for inline style attributes. The current HTML contains **372 inline style attributes across 35 pages**, including layout, colours and hero treatment. These attributes will be blocked when this policy is served by a host that honours `_headers`. A basic Python localhost server does not reproduce that deployment behaviour.

**Impact:** A successful localhost screenshot does not demonstrate that the deployed page will retain the same layout.

**Correction:** Move inline presentation into external CSS classes and verify on a staging host serving the actual policy. Do not broadly weaken CSP as a shortcut. See [MDN style-src-attr](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src-attr).

### 07 — Staff biographies are published as facts while marked unverified [High · school confirmation required]

`staff.html:96` says identities, roles and qualifications must be confirmed before launch. The same page publishes detailed names, degrees, Cambridge credentials and years of experience (for example `staff.html:109` onward). `caps-team.html` and `primary-team.html` repeat these profiles and publication warnings. Admissions also names Mrs. Revien van der Westhuizen, while the staff directory assigns admissions administration to Mrs. Linda Maree; these may be different legitimate roles, but the distinction needs approval.

**Correction:** Obtain a school-approved directory and biography evidence. Retain only verified identities/credentials and remove internal publication notes from the public site once resolved. This audit has not established that any named person is fictitious.

### 08 — Form readiness is asserted without delivery evidence [High · confirmed claim/evidence mismatch]

`status.html:107,111` describes the form workflow and enquiry routing as “Configured & Verified”. Local form scripts call `/api/send-application` and `/api/send-enquiry`, but the supplied project is static and contains no matching backend. Non-local hosts use native POST with Netlify markup, which requires the actual host's form handling to be enabled and tested.

**Correction:** Treat local preview submission as unavailable until a backend is present. Verify the deployed form service and delivery using an explicitly authorised test, then describe only the status actually checked.

### 09 — Privacy notice does not match the actual form fields or demonstrated operation [High · confirmed inconsistency / confirmation required]

`privacy.html:97` says the forms collect **gender and residential address**; those fields are absent from the current application/enquiry forms. `privacy.html:112,117` also asserts verified processors, access boundaries and routine purging. The local static source does not establish those operational controls. The page's HTTPS claim must be limited to the actual production configuration; localhost is HTTP.

**Correction:** Inventory actual form fields and processors, and have the school confirm access/retention procedures before publishing the notice. This is a content/implementation audit, not a legal compliance opinion.

### 10 — Desktop Apply button is clipped [High · browser-confirmed defect]

On `primary.html` at a **1280px** viewport, the header Apply link's measured bounds were **left 1217.7px, right 1364.5px**. Much of the button falls outside the viewport while body horizontal overflow is hidden. The desktop navigation remains active above the 980px breakpoint in `assets/rf-nav.css:197,454`.

**Correction:** Adapt the shared header at intermediate desktop widths: reduce brand/tagline width, reduce spacing, or switch to the compact navigation before the controls overflow. Verify 1024, 1280, 1440 and mobile widths.

### 11 — Many enquiry links pass topics the form does not recognise [Medium · browser and source confirmed]

`assets/public-enquiry.js:67` recognises only `fees`, `prospectus` and `tuition`. Pages use six additional topic values: `visit`, `primary`, `academics`, `caps`, `cambridge`, `syllabus`—**43 links** in total. Some also pass a valid pathway, which is preserved, but the enquiry purpose is still lost.

Browser reproduction: Primary → “Schedule a Campus Visit” → `contact.html?topic=visit` leaves enquiry type at Admissions, no pathway selected and the subject empty.

**Correction:** Define one supported enquiry-topic map, include visit requests, and preserve both purpose and pathway. A visit enquiry should not be represented as a confirmed booking.

### 12 — Search coverage and freshness claims are incorrect [Medium · source confirmed]

The search index has **33 entries**, not the “41 Pages Fully Indexed” claim on `404.html:62` or “41 Endpoints Synced” on `status.html:115`. Important public pages **staff.html** and **student-life.html** are absent. Excluding transaction/utility pages can be intentional; excluding these content pages should be reviewed. `search.html` calls it real-time indexing, but the code fetches a static JSON file.

**Correction:** Generate search entries from approved current content, explicitly define exclusions, and report the actual count. Use “instant search” rather than “real-time indexing” unless index generation is actually automated.

### 13 — Search matches shared navigation instead of page-specific relevance [Medium · source confirmed]

Every one of the **33** indexed text entries contains “Fees”, because header/footer navigation is included. The search scoring adds points when any query word appears anywhere in the indexed text, so common navigation terms create broad irrelevant matches. Some indexed titles/descriptions still reflect earlier page versions.

**Correction:** Index primary page content and curated keywords, exclude navigation/footer boilerplate, and regenerate after edits. Test searches such as fees, staff, sport, Grade 7, and campus visit for useful ordering and coverage.

### 14 — Mobile Contact form is buried beneath an oversized introduction [Medium · browser-confirmed usability issue]

At **390 × 844**, the Contact hero measured **1152px high**, and the enquiry form began approximately **2363px** from the page top. The page has a hero, repeated contact introduction, assurance chips and a direct-contact card before the form. The hero does include a jump link, but the default reading journey is unnecessarily long for a task-focused page.

**Correction:** Reduce the utility-page hero, condense repeated copy and bring the form or a prominent form jump action much earlier. Recheck the Contact and Search layouts separately from marketing pages.

### 15 — Four-step application copy conflicts with the six-step form [Medium · confirmed inconsistency]

`application-documents.html:139` says “4-step online form”, and `news.html` describes a four-step online application. `apply.html` has six steps. A four-stage admissions overview is reasonable, but it must not be described as the count of form screens.

**Correction:** Distinguish “four-stage admissions process” from “six-step application form”.

### 16 — Success pages imply more than a submission establishes [Medium · source confirmed]

`application-success.html:67` labels a family interview “Scheduled”, even though the form only records visit preference and does not schedule an appointment. Both success pages are directly navigable static HTML and assert receipt regardless of how a visitor arrived. `assets/public-core.js:223–228` also falls back to a shared `rf_last_reference`, which can display an enquiry reference on the application confirmation page or vice versa.

**Correction:** State that the team will contact the family to arrange a consultation. Scope references by submission type and avoid presenting a direct page visit as proof of receipt. Genuine receipt needs the form service's acknowledgement.

### 17 — Fees pages promise transparency but do not provide the promised figures [Medium · confirmed expectation mismatch]

`admission.html` promises transparent annual/term rates, `404.html` says visitors can review fee tiers, and `search.html:50` advertises 2026 fee schedules. `fees.html` provides no actual amounts or downloadable schedule; it asks users to request them. “No Hidden Surcharges” and multiple payment options also need finance-office confirmation.

**Correction:** Either publish an approved dated schedule or consistently describe this as a fee-request service. Do not imply that exact rates or inclusions are available on the page when they are not.

### 18 — Prospectus page suggests a download that does not exist [Medium · confirmed expectation mismatch]

`prospectus.html:65` says “Download or request”, but the resource action leads to the enquiry form, not a PDF. “Fast Delivery / Direct Digital Dispatch” is not evidenced by an automatic document-delivery workflow.

**Correction:** Rename actions and copy to “Request the current prospectus”, or provide an approved dated document and an actual download link.

### 19 — Subject catalogues and underlying data disagree [Medium · confirmed inconsistency]

`subjects.html` and `syllabus.html` list 12 Cambridge subjects including Geography and History. `assets/generated-public-data.js` lists 11, includes ICT, and omits Geography and History. `caps-secondary.html` makes definite offering claims while `caps-subjects.html` says it is only a planning guide and the exact offer must be confirmed. Maths and Mathematical Literacy are grouped under a Grades 8–12 label without clarifying grade-specific availability.

**Correction:** Obtain an approved subject-by-grade-and-level matrix. Use the same source for subject pages, programme cards, enquiries and resource lists.

### 20 — Required documents differ between pages [Medium · confirmed inconsistency]

`primary.html:370` asks for immunisation records and parent/guardian IDs; its previous admission step also mentions a clinic card. These are not listed in the shared application checklist or `application-documents.html`. The documents page prescribes certified identification and address evidence under three months old, while the form uses broader wording.

**Correction:** Make one approved, pathway-specific checklist, distinguishing required items from conditional items and clarifying when originals/certified copies are needed.

### 21 — University recognition wording overpromises [Medium · school confirmation/editorial review required]

`recognition.html:68` broadly says Cambridge and CAPS graduates qualify for exemption; other sections suggest seamless worldwide entry. Its later caveat correctly says statutory minimums do not guarantee programme admission. `cambridge.html` similarly uses broad university-entry statements for AS Level.

**Correction:** Lead with conditional language: eligibility depends on subjects, levels, results, destination and institution. Keep the existing caveat and link to current official entry criteria. This audit does not determine eligibility for any learner.

### 22 — Strong operational claims need evidence before publication [Medium · school confirmation required]

Examples: school-wide class caps of 15 on staff/tuition/news versus the original Cambridge-specific framing; live streamed/recorded remote classes and partner examination venues in `distance-learning.html`; a Matric study lounge and computer laboratory on the CAPS page; specified office hours in `directions.html:135`; current textbook stock/publisher relationships and verified edition lists on book-list pages; specific timeline milestones in `story.html`.

**Correction:** Maintain a school-approved fact register with owner and verification date. Remove or qualify any claim that has not been approved. Existing copy on another draft page is not independent evidence.

### 23 — Status page is a static assurance page, not live monitoring [Medium · confirmed implementation mismatch]

`assets/status-page.js` only fetches `health.json` to replace release/build text. It does not test form delivery, uptime, inbox routing or privacy controls. Nevertheless `status.html` says “All Systems Online”, “Real-time deployment telemetry”, “Zero Exposure”, “military-grade client isolation” and “guarantee maximum uptime”. Its hard-coded B9-RC values differ from the September build metadata, and the metadata predates later edits.

**Correction:** Limit the page to honest build information, or implement real health checks. Remove unsupported guarantees and compliance badges. Update release metadata as part of a documented release process.

### 24 — Long asset caching can hide fixes [Medium · source-confirmed deployment risk]

`_headers` caches `/assets/*` for **30 days**. Most HTML still references stable unversioned filenames such as `assets/public-core.js` and `assets/rf-nav.css`; only some recently edited assets carry version queries. Returning visitors can retain older CSS/JS while receiving newer HTML.

**Correction:** Use content-hashed asset filenames or consistent release versioning, with a shorter revalidation policy for mutable assets. Test upgrades from a previously cached release.

### 25 — Accessibility and public-copy inconsistencies remain [Medium/Low · confirmed]

- Browser inspection shows two skip links: static “Skip to content” and script-added “Skip to main content”. `assets/public-core.js:145` only checks its own skip-link class.
- `apply.html:191` tells families about “Netlify Form Notifications”. That is deployment/admin information, not application guidance.
- Internal editorial notes remain on staff/team/requirements pages, for example “before final public launch” and descriptions of what the website deliberately does not invent.
- UK/South African and US spellings are mixed: personalised/personalized, enrolment/enrollment, recognised/recognized, honours/honors. Standardise one editorial convention.
- Utility and success pages repeat a large admissions promotion, which can distract from the task just completed.

**Correction:** Remove duplicate navigation aids, keep developer notes in the handoff, and perform a consistent plain-language editorial pass.

### 26 — Test and release claims exceed what the checks establish [Medium · confirmed]

The current `tests/application-submission.cjs:124` runs code assigning to `ctx` inside a Node VM where `ctx` is not defined, causing the suite to fail before its intended assertions. The other eight suites pass. The connectivity suite verifies that destinations exist, not that their content is accurate, that query parameters are handled, that headers preserve styling, or that POSTs deliver email.

`deploy-manifest.json` lists exclusions, but a manifest alone is not an enforcement mechanism for uploading only those files. Deployment packaging should actually use the allowlist so handoff/audit/test files do not ship inadvertently.

**Correction:** Repair the submission test harness, add integration checks for the important boundaries, and describe the exact scope of each “verified” claim. Confirm how deployment packaging consumes the manifest.

## Additional editorial observations

- “News, Events & School Updates” currently contains evergreen navigation cards without dated news or event details. Either label it an information hub or provide genuine dated updates.
- 2026-only calls to action coexist with 2026/2027 intake messages. At this audit date 2026 is not inherently invalid, but the school should define the current intake cycle and update all CTAs together.
- Historical distance-learning pricing is explicitly labelled historical, but placing an old R500 monthly figure beside current-intake messaging still risks confusion; a dated approved schedule would be clearer.
- Cambridge naming varies between “Cambridge International”, “Cambridge Assessment International Education”, and “Cambridge International Assessment”. Standardise approved terminology.
- The homepage retains an older layout/copy style while most inner pages now use photo heroes and statistic capsules. The application page is more compact than the newly enlarged Contact page. Decide which page types need marketing heroes and which should prioritise task completion.

## Recommended correction order

1. Approve curriculum grades, campus assignments, admission availability, staff identities, subjects and document requirements with the school.
2. Fix the CSP/inline-style conflict and intermediate-width header clipping.
3. Align application options, enquiry topics, confirmation wording and search coverage with the approved content.
4. Verify actual production form processing; replace status/privacy guarantees with evidence-backed wording.
5. Simplify utility-page layouts, remove editorial residue, standardise spelling, and establish reliable versioning/index generation and release checks.

## Page coverage inventory

All source content reviewed: 404, academics, admission, application-documents, application-success, apply, book-lists, cambridge, campus, caps-books, caps-curriculum, caps-faq, caps-secondary, caps-subjects, caps-team, contact, directions, distance-learning, enquiry-success, fees, index, meet-us, news, primary-curriculum, primary-faq, primary-learning, primary-team, primary, privacy, prospectus, recognition, requirements, search, staff, status, story, student-life, subjects, syllabus, tuition. Also inspected netlify-forms as an internal form-registration artifact.
