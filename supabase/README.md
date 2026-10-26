# Ridgefield Academy Supabase integration

The separate **Ridgefield Academy** project is `cgknuthrxnyfxncvmelo` in `eu-west-1`. The earlier paused project was not changed.

## Working flows

- `apply.html` and `contact.html` submit to the hosted `ridgefield-api` Edge Function, which validates the fields, enforces consent, rate-limits requests, saves the record and returns an authoritative reference. Retrying the same request is idempotent. Successful persistence does not send email.
- `admin.html` uses Supabase Auth password sign-in. Every private API request verifies the user with Auth and checks the current `rf_staff` membership. The older admissions and document entry pages redirect to the same staff interface.
- Staff can review applications and enquiries, add learners, save content and manage application documents. Content drafts are excluded from the public content API. No public static page is automatically overwritten by a content edit.
- Documents are stored in the private `ridgefield-documents` bucket. Staff uploads accept PDF/JPEG/PNG signatures, with a 5 MB limit. Viewing links last 60 seconds. Only administrators may use the document-deletion endpoint.
- RLS and table privileges also restrict direct Data API requests. Public forms write through the checked function, not direct anonymous INSERT policies. Accounts cannot edit their own roles.

## First administrator

A 24-hour, one-time setup capability has been prepared for the user-specified administrator email. The raw token is stored only under ignored `storage/supabase/`; the database stores its SHA-256 digest. Do not copy the token into source control or this document. Open the supplied localhost setup link and personally choose the password. The setup endpoint creates a confirmed Auth account and its admin membership without sending an invitation email. The token is consumed after successful setup.

To create a fresh setup capability, generate a cryptographically random token, insert its digest and the intended email into `rf_bootstrap` through an administrator connection, and give only the intended owner the `/admin-setup.html#TOKEN` URL. Do not bypass Auth by inserting password records directly into `auth.users`.

## Source and deployment

`schema.sql` is the fresh-project schema snapshot. The cloud DDL was applied through the connected Supabase migration tools; the provider retains the migration history. Do not reapply this snapshot to the existing project. The `ridgefield-api` function is deployed, and `functions/ridgefield-api/index.ts` is its source. Functions authenticate the `apikey` header themselves and verify user JWTs on private routes, so the function configuration intentionally sets `verify_jwt = false`.

Only the project URL and publishable key appear in `assets/rf-baas-config.js`. Elevated keys remain in Supabase's function environment. New and legacy key environment variables are supported. No provider SDK or package dependency was added.

The website changes run on localhost. No production website deployment was performed. Include the manifest-listed frontend assets when publishing the static site. Exclude `supabase/`, `storage/`, `server/`, `tests/`, `output/` and environment files. The local server blocks backend source and private storage. The hosted function allows only the school domains and localhost port 8080 as browser origins; deliberately add any approved preview origin before testing another deployment.

## Verification

Synthetic, disposable data verified real database persistence, duplicate handling, invalid dates, consent, password login, application/enquiry updates, draft filtering, the student register, document content validation, private upload/download, expiring signed URLs, public-download denial and direct privilege-change denial. Deactivating staff immediately blocked both the Edge API and RLS reads using the account's existing JWT. The test account, sessions, content, admissions records and stored file were removed. No real application data was migrated and no emails were sent.

Run the isolated client checks with `node tests/baas-client.cjs`. The existing admissions, review, enquiry and site-connectivity suites also pass. `tests/baas-live.cjs` requires an explicitly seeded synthetic setup capability in the fixture specified by `RF_BAAS_FIXTURE`; never give it a real administrator account. Remove its synthetic records and files after use.

The final Supabase security advisor reports one Auth configuration warning: leaked-password protection is disabled. Review and enable it in Auth settings if available on the project's plan: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection . The application's setup requires at least 12 characters. Performance advisors have only unused-index informational notices on this new database.

Browser visual verification was blocked by the browser URL policy. UI bindings and local responses were checked, but do not label the UI browser-verified.

## Remaining service boundaries

Existing PHP parent/teacher portals, the student portal and the separate humanities service retain their existing backend paths. Their data was not automatically migrated. The learner, family-access, attendance and academic tables provide a protected foundation for a separate portal migration. No existing records, identities or private files were imported. The UI does not offer public registration. Supabase Auth may retain its default signup setting; a newly registered account still has no staff membership or linked learner access. No staff role is assigned from user-editable metadata.

Production operation still needs the owner to configure backups/restore procedures, retention, any email delivery service, and operational account management. A signature check is not an antivirus scan; only authorised staff can upload and a dedicated file-scanning service was not provisioned.

## Permanent application and learner numbers

Applications now receive `RIDC` + their original application year + an accumulating sequence of at least five digits. Cambridge sequences are even; CAPS Secondary and Primary sequences are odd. One database counter covers all pathways and continues into subsequent years. Gaps can occur when selecting the next number with the required parity; issued numbers are not recycled. The ledger holds no learner names or contact details. Synthetic live-test numbers remain reserved after test records are removed.

`learner-numbers.sql` is the incremental change applied to the existing project. It is also included at the end of the fresh-project `schema.sql` snapshot; do not apply it twice. Existing application references were retained in `legacy_reference` when the first permanent number was assigned. Number assignment happens inside the database transaction, not in browser code. Application and student identifiers cannot be edited; changing grade or pathway does not renumber a learner.

Admissions staff can look up the permanent number or an original application reference and expand the full questionnaire. Administrators accept the application and choose **Enrol learner**. The transaction creates one linked learner, copies the permanent number, and updates the application status. Repeating or simultaneously requesting enrolment reuses the same learner record and number. Pending applications cannot be enrolled. Manual learner additions receive a new number and are intended only for learners without an application.

The application steps retain a private retry key separately from the permanent number. Missing backend access or an invalid response does not produce a successful submission. Completed application data includes the preferred start month, pathway-specific fields, support priorities and document-preparation answers. The confirmation page displays the returned permanent number, including when opened directly from its URL.

Verification: `tests/learner-number-database.sql` rolls back its fixtures and checks parity, accumulation, retry rollback, immutable references, repeat enrolment, pathway transfers, year rollover and sequences beyond 99,999. `tests/learner-numbers-live.cjs` uses an explicitly seeded disposable staff account and synthetic applications to verify concurrent submissions/retries, full admin visibility and concurrent enrolment. Test records and identities were removed; number reservations were retained. The latest security advisor returned no findings.

The number identifies a learner; it does not replace the password or authorised account linkage used for private portal access.
