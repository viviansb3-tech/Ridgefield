# Antigravity handoff: Humanities learning portal

Date: 22 October 2026
Status: Implementation brief; backend, accounts and book hosting are not implemented.

## User request

Continue the humanities page using the shared Textbooks email. Embed book access and administration into the site, with student and teacher access.

The available checkout is the Ridgefield Academy static website. No humanities implementation or backend was found. Build the portal as a separate `/humanities/` area for now, preserving existing school pages. Confirm the intended school/university branding before adding it to the main school navigation or publishing. The source materials appear to be university resources, not Ridgefield school textbooks.

## Source material

Email: “Textbooks”, Femi Chapola, 20 October 2026. The message's visible body and attachment names were read; PDF contents have not been read or imported. Do not invent module titles, teaching content, deadlines or learning outcomes from filenames.

Seven attachments:
- PRESCRIBED BOOK-PERFORMANCE MANAGEMENT.pdf
- Reader 2.pdf
- 2025 EARH 3724 STUDY GUIDE 20250726.pdf
- PSPE3724 2026 Study Guide ON BB.pdf
- EPFM3724_Study Guide 2026 PM.pdf
- Study Guide 2026 TL - PSTH3724_copy.pdf
- READER 1 Egan's helping process model.pdf

Four linked resources:
- EARH3724 Reader.pdf — https://drive.google.com/file/d/1bweTAfZhYIxudrqGG0dSmijtIlB9aGR2/view
- EARH Textbook.pdf — https://drive.google.com/file/d/1XvW7aZVJJZsnHQq4grGVKI9PqSjqaQHJ/view
- MariaDamianovaE - Personality Psychology 2nd EDITION.pdf — https://drive.google.com/file/d/1iNgiC54-FB3ebWDb3De6Wxe4EJ8k73fN/view
- Talk Therapy Toolkit (Soft Copy) copy.pdf — https://drive.google.com/file/d/1_tGQBXAzx-hCrNHf54ZPiYQY7G56x8Rj/view

Keep this source inventory internal. Do not publish email addresses, private email URLs or original Drive links in the public frontend. Retrieve authorized files and inspect their title pages and contents before assigning them to modules. Keep the 2025 guide clearly labelled as 2025; do not silently present it as the 2026 guide. Confirm permission to host and distribute each book before making it available to learners. Unverified resources remain drafts.

## Embedded experience

Use the site's own `/humanities/` routes, with a consistent header and responsive layout. Administration should be part of the authenticated application, not a third-party dashboard in an iframe.

- `/humanities/`: entry page and sign-in.
- `/humanities/dashboard`: enrolled modules and recently accessed resources.
- `/humanities/modules/:id`: module description and published reading list.
- `/humanities/books/:id`: authorised PDF reader, resource details and permitted download action.
- `/humanities/teaching`: assigned modules, upload queue, draft/published resources and enrolled students.
- `/humanities/admin`: user invitations, role assignment, module ownership, enrolments and audit history.

Support loading, empty, upload-progress, processing, access-denied, expired-session and retry states. Show a useful fallback when the browser cannot display a PDF. Make all controls keyboard accessible and usable on mobile. Never present a preview role switcher as real authentication.

## Roles and permissions

| Action | Student | Teacher | Administrator |
| --- | --- | --- | --- |
| Read published resources | Enrolled modules only | Assigned modules only | All modules |
| Download | Only when allowed on resource | Assigned modules | All resources |
| Upload/edit/publish resources | No | Assigned modules only | All modules |
| View enrolments | Own only | Assigned modules only | All modules |
| Manage enrolments and module ownership | No | No | Yes |
| Invite users/change roles | No | No | Yes |

Enforce permissions on the server and storage access, including direct URL requests. UI visibility is not an access control. Clients must never assign their own teacher/admin role. Bootstrap the first administrator through a documented trusted operator step.

## Backend implementation

Use an established authentication provider, a relational database and private object storage. Select the provider after checking the actual hosting account and existing configuration; none is configured in this checkout. Keep credentials and privileged keys server-side. Do not introduce a paid service without the user's approval.

Suggested data model:
- `profiles`: authentication user ID, display name, role, active status.
- `modules`: code, verified title, academic year, description, publication status.
- `teaching_assignments`: teacher and module, unique pair.
- `enrolments`: student and module, status, unique pair.
- `resources`: module, title, edition/year, author, private storage key, MIME type, byte size, checksum, draft/published status, download setting, rights confirmation, creator and timestamps.
- `reading_progress`: user, resource, page and updated timestamp; visible to that user by default.
- `audit_events`: actor, action, target, timestamp and minimal change metadata; never tokens or PDF contents.

Use foreign keys and migrations. Define deletion/archive behaviour so revoking a user or module assignment immediately removes access. Keep draft files inaccessible to students.

API behaviour:
- Current-user endpoint returns server-verified identity and role.
- Module and resource listing endpoints filter by current permissions.
- Upload creation checks teacher/module assignment or admin status before issuing a short-lived upload permission.
- Upload completion verifies stored file type, PDF signature and configured size limit; quarantine and scan files before publication. Generated object names prevent path traversal and collisions.
- Resource publishing requires valid metadata, completed processing and distribution permission.
- Reader/download endpoint checks active user, enrolment, publication and download permission on every request before issuing short-lived access or streaming the PDF. Support PDF range requests.
- User invitations, role updates and enrolments require administrator access and create audit events.

Use secure session cookies where applicable, CSRF protection for cookie-authenticated mutations, rate limits and generic login errors. Never use localStorage roles as authority. PDF reader access cannot prevent screenshots or copying; do not promise DRM. Short-lived URLs remain usable until expiry, so choose and document a brief lifetime.

Keep PDFs out of public static folders, source control and the existing deployment ZIP. Do not put student data in public JSON. Configure backups, storage quotas and a restore procedure before production use.

## Implementation sequence

1. Inspect current repository instructions and preserve existing work. Create the isolated humanities routes and source inventory without changing the school release.
2. Retrieve and review the eleven source resources; deduplicate using checksums, record verified metadata and leave uncertain module mappings unassigned.
3. Implement migrations, authentication, server-side role checks and private storage using the selected hosting provider.
4. Build administrator invitations and enrolments, then teacher upload/review/publish flows.
5. Build student library and embedded PDF reader, with progress saved per user.
6. Connect all screens to the real backend. Distinguish mock preview states from working services.
7. Verify locally or in a private staging environment. Publish only after branding, hosting and book distribution permissions are resolved.

## Required verification

Use synthetic accounts and a small test PDF, not real student data.

- Administrator invites a teacher and student, assigns a module and enrols the student.
- Teacher uploads the test PDF, sees progress, edits metadata and publishes it.
- Enrolled student can find and read it; progress survives sign-out/sign-in.
- Anonymous users and an unenrolled student cannot list, read or download it, including by direct API/storage URL.
- A teacher cannot edit another teacher's module or grant roles.
- A draft or archived resource is unavailable to students; revoked enrolments lose access.
- Oversized/non-PDF uploads fail clearly; failed uploads do not appear as published books.
- Expired sessions and file links recover gracefully without exposing data.
- Desktop and mobile reader, navigation, upload and administration work with keyboard access.
- Existing Ridgefield pages and forms still pass their relevant checks.

## Completion handoff

Update `ANTIGRAVITY-HANDOFF.md` with changed files, migrations, configured service names (no secrets), setup steps, tested flows, remaining blockers and a working preview URL. State separately whether files are imported, authentication is live, access controls are verified, and deployment is complete. Do not claim this document alone gives students or teachers access.
