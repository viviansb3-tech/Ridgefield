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

## Teacher and student portal accounts

The portal account upgrade is implemented in the repository but is **not yet deployed to Supabase**. For the existing project, apply `portal-accounts.sql` once in the Supabase SQL editor, then deploy the updated `ridgefield-api` Edge Function. Do not apply the full `schema.sql` to the existing project.

- Teachers can request accounts from `teacher-portal.html`. Supabase Auth email confirmation is required; the registration remains pending until an administrator approves it in **Admin → Portal access**. Approval alone does not grant access to learner records: the administrator must also assign the teacher specific learners and subjects.
- Teacher reads and writes go through the Edge Function. Each record and attendance write is checked against the active teacher's assignment. Browser clients receive no direct table privileges for teacher profiles, assignments or invitations.
- Student registration is invitation-only. In **Admin → Portal access**, an administrator can create or reuse the clearly labelled fictional test learner, enter the tester's email, and issue a single-use link that expires after 24 hours. Share that link privately; it contains the one-time activation token. The student chooses their own password (12–128 characters). The token is stored only as a digest, and only one student login can be linked to a student record.
- Student sessions are read-only and the API returns only records linked to that authenticated student. A learner number is not an authentication credential.
- Administrator accounts remain separately provisioned through the one-time setup capability above. Teacher self-registration cannot assign staff roles or administrator privileges.

Before enabling teacher registration in production, enable email signups, require email confirmation, set the minimum password length to 12, and allow the deployed teacher portal URL as an email redirect destination. Keep the Supabase service-role/secret key only in Edge Function secrets. Do not put activation tokens or test credentials in Git, logs, or handoff documents.

The local fictional tester is a record template, not a live account. The test record and account are created only after an administrator uses the portal-access controls on the deployed version. No account or real learner data has been provisioned by this source change.

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

The parent/guardian portal and separate humanities service retain their existing backend paths; their data was not automatically migrated. The repository's student and teacher pages now use the Supabase account APIs described above, but this change remains local until the additive SQL migration and Edge Function are deployed. No existing records, identities or private files were imported. Unapproved teacher accounts and unlinked Auth users cannot access private portal data.

Production operation still needs the owner to configure backups/restore procedures, retention, any email delivery service, and operational account management. A signature check is not an antivirus scan; only authorised staff can upload and a dedicated file-scanning service was not provisioned.

## Permanent application and learner numbers

Applications now receive `RIDC` + their original application year + an accumulating sequence of at least five digits. Cambridge sequences are even; CAPS Secondary and Primary sequences are odd. One database counter covers all pathways and continues into subsequent years. Gaps can occur when selecting the next number with the required parity; issued numbers are not recycled. The ledger holds no learner names or contact details. Synthetic live-test numbers remain reserved after test records are removed.

`learner-numbers.sql` is the incremental change applied to the existing project. It is also included at the end of the fresh-project `schema.sql` snapshot; do not apply it twice. Existing application references were retained in `legacy_reference` when the first permanent number was assigned. Number assignment happens inside the database transaction, not in browser code. Application and student identifiers cannot be edited; changing grade or pathway does not renumber a learner.

Admissions staff can look up the permanent number or an original application reference and expand the full questionnaire. Administrators accept the application and choose **Enrol learner**. The transaction creates one linked learner, copies the permanent number, and updates the application status. Repeating or simultaneously requesting enrolment reuses the same learner record and number. Pending applications cannot be enrolled. Manual learner additions receive a new number and are intended only for learners without an application.

The application steps retain a private retry key separately from the permanent number. Missing backend access or an invalid response does not produce a successful submission. Completed application data includes the preferred start month, pathway-specific fields, support priorities and document-preparation answers. The confirmation page displays the returned permanent number, including when opened directly from its URL.

Verification: `tests/learner-number-database.sql` rolls back its fixtures and checks parity, accumulation, retry rollback, immutable references, repeat enrolment, pathway transfers, year rollover and sequences beyond 99,999. `tests/learner-numbers-live.cjs` uses an explicitly seeded disposable staff account and synthetic applications to verify concurrent submissions/retries, full admin visibility and concurrent enrolment. Test records and identities were removed; number reservations were retained. The latest security advisor returned no findings.

The number identifies a learner; it does not replace the password or authorised account linkage used for private portal access.
