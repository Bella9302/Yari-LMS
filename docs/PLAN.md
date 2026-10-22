# YARI Academy — Architecture & Data Model (proposal)

Status: **agreed** (decisions in Section 7). Phase 1 is built.

---

## 1. Stack — what I recommend and why

| Concern         | Choice                                                                                                                                       | Why (and where it differs from the brief)                                                                                                                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Framework       | **Next.js 15 (App Router) + TypeScript**, server actions                                                                                     | As suggested. Server components keep JS shipped to phones small.                                                                                                                                                                                                   |
| Styling         | **Tailwind CSS v4** with tokens as CSS variables (`@theme`) + **Radix primitives** (headless)                                                | Radix gives accessible dialogs/menus/tabs with zero visual opinion, so the look is fully ours. No shadcn defaults.                                                                                                                                                 |
| DB              | **PostgreSQL 16 + Prisma**                                                                                                                   | As suggested.                                                                                                                                                                                                                                                      |
| Auth            | **Own session auth** built on `@oslojs/*` (the approach Lucia now documents), **Argon2id** via `@node-rs/argon2`, **TOTP** via `@oslojs/otp` | _Differs._ Lucia is deprecated. Auth.js and most libraries store email in plain text as the lookup key, which conflicts with our requirement to encrypt email and look it up by blind index. Owning ~400 lines of session code is cheaper than fighting a library. |
| Background jobs | **pg-boss** (queue in Postgres)                                                                                                              | Emails, PDF generation, virus scans, nightly at-risk checks — without running Redis.                                                                                                                                                                               |
| Files           | **S3-compatible — Cloudflare R2** (no egress fees) with presigned URLs; **ClamAV** scan before a file is released                            | Cheap, and egress-free matters for video/PDF-heavy training.                                                                                                                                                                                                       |
| Video           | **Bunny Stream** (adaptive bitrate, ~US$5/TB) — _to confirm_                                                                                 | Phones on site need low-bitrate HLS; self-transcoding is a maintenance burden.                                                                                                                                                                                     |
| Email           | **Resend** + React Email templates                                                                                                           | As suggested.                                                                                                                                                                                                                                                      |
| PDF             | **@react-pdf/renderer** server-side                                                                                                          | As suggested.                                                                                                                                                                                                                                                      |
| PWA             | **Serwist** service worker                                                                                                                   | Installable, caches shell + fonts.                                                                                                                                                                                                                                 |
| Tests           | **Vitest** (unit/integration against a real test Postgres) + **Playwright** (E2E at 360px and desktop)                                       | As suggested.                                                                                                                                                                                                                                                      |
| Hosting         | **One VPS with Docker Compose** (app, Postgres, ClamAV, worker, Caddy for HTTPS) + nightly encrypted off-site backups                        | _Preferred over Vercel_: ClamAV and long-running jobs don't fit serverless, and a single VPS is ~R300–600/month. An SA region (e.g. Johannesburg) keeps POPIA cross-border questions simple.                                                                       |

## 2. Security design

### 2.1 Field-level encryption

- **AES-256-GCM**, 96-bit random IV per value. Stored format: `v1.<keyId>.<iv>.<ciphertext+tag>` (base64url).
- **AAD = `table:column:rowId`**, so a ciphertext copied into another row or column fails to decrypt.
- Keys come from env (`FIELD_ENC_KEYS` = JSON of `{keyId: base64key}` + `FIELD_ENC_ACTIVE_KEY`), so key rotation is a background re-encrypt job, not a migration. The interface lets KMS replace env later.
- Encryption is **explicit in a data-access layer** (`src/server/pii/*`), not hidden Prisma middleware, so every decrypt is a deliberate, audit-logged call.

### 2.2 Blind indexes

- `HMAC-SHA256(BLIND_INDEX_KEY, normalise(value))`, with a separate key from the encryption keys.
- Email is normalised to trimmed lower case; SA ID to digits only.
- Unique constraints sit on the index columns.
- Trade-off: you **cannot do partial / "contains" search on encrypted names**. Roster search will decrypt the (already permission-scoped) list in the app and filter there. That is fine at YARI's scale (hundreds to low thousands of learners per view).

### 2.3 Other controls

- **Sessions:** random 160-bit token in an `HttpOnly; Secure; SameSite=Lax` cookie, stored only as a SHA-256 hash. 30-day sliding expiry, rotated on privilege change.
- **CSRF:** server actions check Origin; route handlers use a double-submit token.
- **Login rate limiting:** per IP and per account blind index, with exponential back-off, stored in Postgres.
- **2FA:** TOTP plus 10 single-use recovery codes. It is enforced for Admin and Trainer: they cannot reach any page until 2FA is enrolled.
- **Audit log:** append-only, so the app DB role has no UPDATE/DELETE on it. It records reads of PII (which fields), PII writes, role changes, logins, exports and grade changes.
- **Tenant isolation:** every query for org-scoped data goes through a `scope(user)` helper. On top of that, integration tests assert that a Client Manager from Org A gets 404 on Org B's data. Postgres RLS can be added in Phase 7 as defence in depth.
- **ID masking:** the masking is done on the server. Non-admins never receive the full value in the response.

## 3. Data model (sketch)

`🔒` = AES-GCM ciphertext, `#` = blind index (unique), `→` = FK. All tables have `id` (cuid2), `createdAt` and `updatedAt`.

### Identity, roles, privacy

```
User            email🔒, emailIdx#, passwordHash(argon2id), status(INVITED|ACTIVE|SUSPENDED|DELETED),
                totpSecret🔒?, totpEnabledAt?, lastLoginAt, deletedAt?
UserProfile     →User(1:1), fullName🔒, preferredName🔒?, idNumber🔒?, idNumberIdx#?, phone🔒?,
                address🔒?, employer🔒?, avatarAssetId?
RoleAssignment  →User, role(SUPER_ADMIN|TRAINER|LEARNER|CLIENT_MANAGER), →Organization? (required for CLIENT_MANAGER)
AuthSession     tokenHash, →User, expiresAt, twoFactorVerified, ipHash, userAgent
RecoveryCode    →User, codeHash, usedAt?
AuthToken       →User, type(INVITE|PASSWORD_RESET|EMAIL_VERIFY), tokenHash, expiresAt, usedAt?
LoginAttempt    key(ipHash|emailIdx), success, at
Consent         →User, purpose(TERMS|PRIVACY|MARKETING), policyVersion, grantedAt, withdrawnAt?
DataRequest     →User, type(EXPORT|DELETE), status, handledById?, completedAt?, exportAssetId?
AuditLog        actorId?, action, entityType, entityId, fields[], orgId?, ipHash, at   (append-only)
```

### Client companies

```
Organization    name, slug, regNumber?, status
OrgMembership   →Organization, →User, employeeRef🔒?, department?   (a learner's employer link; drives isolation)
```

### Content

```
Course          slug, title, summary, category(HEALTH_SAFETY|AI_DIGITAL), status(DRAFT|PUBLISHED|ARCHIVED),
                isTemplate, templateSourceId?, coverAssetId?, estMinutes, visibility(PUBLIC|PRIVATE|ORG_ONLY),
                priceCents?, currency?   ← reserved for future payments
CourseStaff     →Course, →User, role(LEAD|ASSISTANT)
Module          →Course, position, title, description
Item            →Module, position, type(VIDEO|PDF|SLIDES|RICH_TEXT|LINK|DOWNLOAD|QUIZ|ASSIGNMENT|LIVE_SESSION),
                title, body(JSON rich text), →Asset?, externalUrl?, required, status
ReleaseRule     →Module? | →Item?, type(AFTER_DATE|ITEM_COMPLETED|MIN_SCORE), afterDate?, →Item(dependency)?,
                minScorePct?          (all rules on a target are ANDed)
Asset           storageKey, mime, bytes, scanStatus(PENDING|CLEAN|INFECTED), →User(uploader), streamVideoId?
Enrolment       →User, →Course, →Organization?, source(ADMIN|CLIENT_MANAGER|SELF|PURCHASE),
                status(ACTIVE|COMPLETED|WITHDRAWN), dueAt?, startedAt?, completedAt?, lastActiveAt?, progressPct
ItemProgress    →Enrolment, →Item, status(NOT_STARTED|IN_PROGRESS|COMPLETED), firstViewedAt?, completedAt?, timeSpentSec
```

### Assessment

```
QuestionBank    →Course, title
Question        →QuestionBank, type(MCQ|MULTI_SELECT|TRUE_FALSE|SHORT_ANSWER|MATCHING), prompt(JSON),
                options(JSON), answerKey(JSON), points, explanation?
Quiz            →Item(1:1), timeLimitMin?, maxAttempts?, passPct, shuffle, showAnswers(NEVER|AFTER_SUBMIT|AFTER_DUE)
QuizSection     →Quiz, →QuestionBank, drawCount        (random draw) | fixed question list
QuizAttempt     →Enrolment, →Quiz, questionSnapshot(JSON), answers(JSON), scorePct?, needsManualMarking,
                startedAt, submittedAt?
Assignment      →Item(1:1), instructions, dueAt?, allowText, allowFiles, maxPoints, →Rubric?, allowLate
Rubric          →Course?, title, isTemplate
RubricCriterion →Rubric, position, title, description
RubricLevel     →RubricCriterion, label, points, description
Submission      →Assignment, →Enrolment, attemptNo, text?, assets[], submittedAt, isLate
Mark            →Submission, →User(grader), score, rubricSelections(JSON), feedbackText?,
                feedbackAssetId?, audioAssetId?, status(DRAFT|RELEASED), releasedAt?
GradeOverride   →Enrolment, →Item, score, reason, →User   (audited)
```

The gradebook is a **view** computed from QuizAttempt, Mark and GradeOverride, so there is no duplicated grade table to drift out of sync.

### Tracking

```
LiveSession     →Course, →User(trainer), title, mode(IN_PERSON|ONLINE|HYBRID), startsAt, endsAt,
                location?, meetingUrl?, qrSecret
Attendance      →LiveSession, →User, method(QR|MANUAL), checkedInAt, →User(recordedBy)?
AtRiskRule      →Course, type(INACTIVE_DAYS|MISSED_DEADLINE|SCORE_BELOW), threshold, active, →User(createdBy)
AtRiskFlag      →AtRiskRule, →Enrolment, raisedAt, resolvedAt?, resolvedById?, note?
```

QR codes rotate every 30 seconds (an HMAC of session id + time window) and work only while the session is live. A screenshot shared by WhatsApp therefore expires almost at once.

### Engagement

```
TrainerRating   →User(trainer), →User(rater)?, →Course, →LiveSession?, knowledge, clarity, relevance,
                engagement (1–5, CHECK), comment?, createdAt
                partial unique: (rater, trainer, course) when no session; (rater, trainer, session) otherwise
Announcement    scope(PLATFORM|COURSE), →Course?, →User(author)?, title, body(rich text), pinned, emailed,
                recipients
DiscussionThread →Course, →User, title, pinned, locked, lastPostAt
DiscussionPost  →Thread, →User?, body(plain text), editedAt?, deletedAt?, →User(deletedBy)?
Notification    →User, type, title, href, readAt?
UserBadge       →User, badge(code), →Course?, awardedAt     unique(user, badge, coalesce(course,''))
```

Badge definitions live in code (`src/lib/badges.ts`), not a table: there are seven and they change with releases.

Rating anonymity: trainers see only aggregates, and only once **≥3 ratings** exist for a course or session. Comments are shown shuffled and without dates, so a learner can't be identified by timing. Admin sees everything.

### Certificates, public site, settings

```
Certificate     code# (YG-XXXX-XXXX), →Enrolment?, →User?, →Course?, holderEnc🔒 (learner name + trainers,
                bound to the code), courseTitle, category, durationMinutes, completedAt, issuedAt,
                accreditation(JSON)?, revokedAt?, →User(revokedBy)?, revokeReason?
                one active certificate per enrolment (partial unique); revocation requires a reason (CHECK)
Enquiry         name🔒, email🔒, phone🔒?, company?, interest(SHE|TECH|BOTH), →Course?, message🔒, consentAt,
                status(NEW|CONTACTED|CLOSED), →User(handledBy)?
Course          + accreditation(JSON)?: unitStandards[], nqfLevel?, credits?
PlatformSetting "site" {academyName, contactEmail, contactPhone}
                "accreditation" {enabled=false, body, providerNumber}
```

The certificate prints the non-accreditation statement unless all three are true: platform accreditation is on, the provider details are filled in, and the course lists unit standards. No template or course setting can hide it, and tests enforce this. Certificates are rendered from their frozen snapshot on each download, rather than stored as files.

## 4. App structure

```
src/
  app/
    (public)/          landing, catalogue, course detail, verify/[code], privacy, enquiry
    (auth)/            login, 2fa, reset, invite/accept
    (app)/             learner home, courses, calendar, profile, my-data
    (app)/teach/       course builder, marking, gradebook, sessions, at-risk, ratings
    (app)/org/         client manager dashboard
    (app)/admin/       users, orgs, settings, audit log, data requests
  server/
    auth/  crypto/  pii/  db/  scope/  audit/  jobs/  storage/  email/  pdf/
  ui/                  design system: tokens, primitives, components
```

## 5. Design system (Phase 1)

- **Tokens:** ink / paper / graphite / amber / teal plus muted error `#B4483C` and success `#3F7D5A`, all checked for AA contrast in both themes. The category accent is applied with `data-category` on a container.
- **Type:** Gloock for display, with fluid sizes up to ~6rem on the landing page. Bricolage Grotesque (variable) for body and UI. Martian Mono for numbers, codes and gradebook cells. All fonts are self-hosted via `next/font` and subset to Latin.
- **Signature elements:** thin 1px rules, oversized numerals for progress, a serif "YG" monogram mark, a cream paper background (not white), and black "card" surfaces in dark mode.
- **Components (first pass):** Button, IconButton, Field/Input/Select, Card, Rule, Tag (category), ProgressRing, Tabs, Dialog, Toast, EmptyState, DataTable (stacks on mobile), PageHeader, AppShell (bottom tab bar on mobile, slim top nav on desktop, no heavy sidebar).
- **Icons:** Lucide at 1.5px stroke, plus a few custom SHE/AI glyphs.

## 6. Phase 1 (Foundation) — concrete deliverables

1. Next.js + TS + Tailwind v4 + ESLint/Prettier, Docker Compose for local Postgres, CI (GitHub Actions: lint, typecheck, unit, E2E).
2. Design tokens, fonts, light/dark mode with a toggle, core components, and a `/styleguide` page.
3. Prisma schema for the Identity / Organization / Audit / Settings tables. Later phases add their tables in their own migrations.
4. Crypto utilities (AES-GCM, blind index, Argon2id), with unit tests including tamper and AAD-swap cases.
5. Auth: invite-based account creation, login, logout, password reset, TOTP enrol/verify, recovery codes, rate limiting, and enforced 2FA for Admin and Trainer.
6. RBAC helpers (`requireRole`, `scope`) and multi-role switching in the shell.
7. Audit log writer and an admin audit log viewer.
8. Consent capture at registration and a privacy notice page (placeholder text for YARI to supply).
9. Tests: unit (crypto, RBAC), integration (tenant isolation, audit entries), E2E (login + 2FA at 360px).

## 7. Decisions (2026-10-22)

| Topic                     | Decision                                                                                                                                                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosting                   | One VPS in a South African region (Docker Compose).                                                                                                                                                                                                  |
| Sign-up                   | **Invite-only.** Client Managers invite learners into their company. Super Admins can invite anyone, including individual learners with no company.                                                                                                  |
| Identity documents        | SA ID number for South Africans, and passport number + issuing country for foreign nationals. **Required for learners**, optional for other roles. SA IDs are checked (date + Luhn).                                                                 |
| Certificate verification  | The public page shows the learner's **full name**, course and date. The privacy notice says so.                                                                                                                                                      |
| Course completion         | All required items done **and** a pass mark on quizzes and assignments.                                                                                                                                                                              |
| Client Manager visibility | Default: progress, completion, pass/fail and final scores for their own staff. Not submission content or trainer feedback. ID numbers are masked.                                                                                                    |
| Brand                     | The "YG" monogram traced from the business card (`public/brand/yg-monogram.svg`). Email domain `yarigroup.co.za`.                                                                                                                                    |
| Information Officer       | None appointed yet. Under POPIA the head of the business is the Information Officer by default. The privacy notice uses `privacy@yarigroup.co.za` as a placeholder. Must be confirmed, and registered with the Information Regulator, before launch. |
| Language                  | English only for now.                                                                                                                                                                                                                                |
| Video, everything else    | Defaults from this document (Bunny Stream, R2, Resend, etc.).                                                                                                                                                                                        |

### Still to confirm (not blocking)

- Does the `privacy@yarigroup.co.za` mailbox exist? Who will act as Information Officer?
- The business card says "SACPCMP registered". Should the landing page show this as a credential of the consultancy, kept clearly separate from the (non-accredited) training?
- Which contact details go on the public site: the card's numbers and Gmail address, or a new `@yarigroup.co.za` address?

## 8. Phase 2 (Content): what was built and the decisions behind it

- **Structure:** Course → Module → Item. Item types are Text (Tiptap rich text), Video, PDF, Slides (as PDF), Link and Download. Quiz and Assignment types arrive in Phase 3.
- **Draft and published, at two levels:**
  - A course is Draft, Published or Archived.
  - Each item is also _visible_ or _hidden_. New items start hidden, so half-built content never reaches learners. An item can't be made visible until it has its content (file or link) and the file has passed the virus scan.
- **Course templates:** "SHE Rep Practical Training" and "Intro to AI Tools at Work" are created by `npm run db:seed`. Creating a course from a template copies its modules, items and release rules (dependencies are re-pointed to the copies). Files are shared, not duplicated. Only Super Admins edit templates.
- **Builder:**
  - Drag-and-drop works with mouse, touch (press and hold) and keyboard (dnd-kit).
  - Screen-reader announcements use item names.
  - Items only land on items and modules only on modules, so keyboard moves on narrow screens behave.
  - Every reorder saves the whole layout, which is checked against the database so a stale tab can't scramble a course.
- **Release conditions:**
  - "From a date" (SA time) and "after item X is completed", on a module or an item. All conditions must be met (AND).
  - "Minimum score" is in the data model and evaluator, and becomes available in the builder with quizzes in Phase 3.
  - Rules that would make items wait on each other forever are rejected.
  - Locks are enforced on the server: locked content and files are never sent, and locked items can't be completed.
- **Files:**
  - The browser uploads directly to storage: a presigned URL with R2, or a signed URL with the local driver.
  - The server then checks the size, checks the real file type by its leading bytes (a renamed `.exe` is rejected), hashes the file (SHA-256) and streams it to **ClamAV** (clamd `INSTREAM`). Infected or failed files are deleted.
  - Production refuses to start without `CLAMAV_HOST`.
  - Files are served only through `/api/files/[id]` after an access check. Video seeking (byte ranges) is supported. Downloads are sandboxed.
- **Video:** Bunny Stream, YouTube (privacy-enhanced `youtube-nocookie`) or Vimeo (`dnt=1`) links are converted to embeds. Uploaded MP4/WebM files are also supported, with `preload="none"` so nothing downloads until the learner presses play.
- **Low data on phones:** PDFs open in the phone's own viewer. The inline PDF frame only loads on wider screens.
- **Progress:**
  - An item counts as viewed when the learner opens it. This is recorded by the browser, so link prefetching never counts.
  - Completion is an explicit "Mark as complete".
  - Course progress is the share of required, visible items completed. Completion is sticky.
  - From Phase 3, completion will also need the pass marks on quizzes and assignments.
- **Enrolment:**
  - **Super Admins** enrol anyone.
  - **Client Managers** enrol their own staff into published _catalogue_ courses (the course's "Who can be enrolled" setting).
  - **Trainers don't enrol:** that would mean browsing every learner on the platform. They see the roster of their own courses, and each roster view is audit-logged.
- **Staff:** each course has a lead trainer and optional co-trainers. Admins can edit every course.

## 9. Phase 3 (Assessment): what was built and the decisions behind it

- **Storage on AWS:** the S3 driver targets Amazon S3 in **Cape Town (`af-south-1`)** by default.
  - af-south-1 is an opt-in region: enable it on the AWS account first.
  - On AWS the server's IAM role is used, so no keys are stored. `S3_ENDPOINT` is only for non-AWS S3-compatible stores.
  - The bucket needs a CORS rule allowing `PUT` from the app's domain.
- **Question banks and quizzes:**
  - Question types: multiple choice, multiple answers, true/false, short answer and matching.
  - A quiz draws all of a bank, or a random number of questions from it, across one or more banks. Order and options can be shuffled per attempt.
  - Each attempt stores a snapshot of its questions, so editing a bank later never changes past results.
  - Answer keys never leave the server while an attempt is open.
- **Quiz rules:**
  - Each quiz has a pass mark, an attempt limit and an optional time limit.
  - Answers autosave, with a copy kept on the device for weak site connections.
  - An expired attempt is submitted automatically with what was saved in time.
  - Correct answers are shown after each attempt, after passing, or never.
- **Marking rules:**
  - **Multiple answers:** partial credit, with wrong picks taking credit back (never below zero).
  - **Matching:** credit per correct pair.
  - **Short answers:** marked against accepted answers, ignoring capitals and spacing. Anything else goes to the trainer instead of being marked wrong.
  - A quiz's grade is its best fully marked attempt.
- **Assignments:**
  - Learners can type an answer, upload files, or both. Files can be documents or phone photos, and are virus-scanned.
  - Due dates are optional, late work is flagged, and late work can be refused.
  - An assignment is marked either out of a total or with a **rubric**: criteria × levels, with the total set by the rubric. A rubric is locked once work has been marked with it, and can be duplicated to change it.
- **Inline marking view:**
  - The learner's work sits on the left: text, PDF preview, images.
  - The rubric or mark and the feedback sit on the right: text, a file, and a recorded **audio note** (browser microphone, about 5 minutes, scanned like any file).
  - Marks can be saved as a private draft, released ("Release & next" moves on to the next learner), or returned for resubmission.
  - Learners see marks and feedback only once released.
- **Gradebook:**
  - One table per course, searchable and filterable: has work to mark, below a pass mark, completed, not started, or by company. It stacks as cards on phones.
  - Each learner has a page listing their attempts and submissions, with a **grade override** that requires a reason and is audit-logged.
  - Exports to **CSV** (Excel-safe, with spreadsheet-formula injection neutralised) and **PDF** (A4 landscape, marked as containing personal information). Exports are audit-logged.
- **Completion:**
  - A quiz or assignment item counts as done only when its pass mark is reached, either by a grade or an override. The "Mark as complete" button doesn't apply to them.
  - A course is complete when every required item is done.
  - Quiz scores feed "minimum score" release conditions, now available in the builder.
- **Cloning:** creating a course from another course or a template copies its question banks, rubrics and quiz/assignment settings. Due dates are not copied.
- **Login limit per network** raised from 20 to 100 attempts per 15 minutes. A whole site's learners often share one Wi-Fi address on a training day. Account lockout still stops password guessing.
- **The database client connects on first use,** so `next build` and Docker image builds need no runtime secrets.

## 10. Phase 4 (Tracking): what was built and the decisions behind it

- **Time on task:**
  - The item page counts a second only while the tab is visible and the learner has interacted in the last 90 seconds (or a video or audio clip is playing).
  - Time is sent every 30 seconds and when the page is hidden (`sendBeacon`).
  - The server caps each heartbeat by the real time since the previous one, so a tampered browser can't inflate hours.
  - The heartbeat endpoint only accepts same-origin requests.
- **Progress tab (trainers):**
  - Every learner's % complete, items opened, time on task, last active, and status (due date, overdue, at risk). Flagged learners are listed first.
  - The learner record page (from Progress or Gradebook) adds activity per item, attendance and at-risk history to grades.
- **Live sessions and attendance:**
  - Sessions can be in person, online or both, with venue or meeting link, SA times, edit and cancel.
  - **QR check-in:**
    - The trainer opens a full-screen code that changes every 30 seconds. The token is an HMAC of a per-session secret that never leaves the server.
    - A code is accepted for its own window plus the previous one, so a screenshot forwarded on WhatsApp stops working within a minute.
    - Check-in opens 30 minutes before the start and closes 30 minutes after the end. Only enrolled learners can check in.
    - Scanning while signed out goes through login and comes back to the check-in page.
  - **Online sessions:** "Join now" records attendance and opens the meeting link.
  - **Register:** the trainer can set present, absent or excused, with a note, and export the register to CSV.
  - Learners see upcoming sessions on their dashboard and course page.
- **At-risk alerts:**
  - Each course can have three rules, each with a threshold set by the trainer:
    - **Inactive** for N days, counted from enrolment if the learner never started.
    - **Missed deadline:** the course due date, or a required assignment not handed in, after N grace days.
    - **Low score:** a marked quiz or assignment below N%, unless since passed.
  - Rules are checked nightly, when a rule changes, and on demand. Flags clear themselves when the condition stops holding.
  - A trainer can dismiss a flag with a note, which stops re-flagging for 7 days. Completed learners are never flagged.
  - Flags are visible to trainers only.
  - A daily email tells course trainers how many learners were newly flagged. It contains counts and a link only, never names.
- **Nightly job:** `npm run jobs:nightly` re-checks at-risk rules, sends the digests, and clears expired sessions, tokens and rate-limit records. Schedule it daily (e.g. 02:00 SAST) with cron or a systemd timer. It is safe to run more often.
- **Client Manager area** (`/org/[company]`):
  - **Overview:** completion ring, staff, completed, overdue, inactive (14+ days), a "needs follow-up" list, and totals per course.
  - **Staff:** invite, search, and a training summary per person. The staff page shows each course's progress, results (score and pass/fail) and session attendance.
  - **Enrol staff.**
  - **Compliance report:** on screen, as CSV, and as PDF (A4, with the non-accreditation statement). Exports are audit-logged.
  - Companies only see enrolments made for their company. They never see submitted work, trainer feedback, or trainers' at-risk flags.

## 11. Phase 5 (Engagement): what was built and the decisions behind it

- **Notifications:** a bell in the header with an unread count, and a `/notifications` page. Opening one marks it read and goes to what it's about (same-site links only). Events that notify:
  - a new announcement;
  - a new discussion topic (course staff);
  - a reply in a topic you've posted in;
  - a released mark (quiz or assignment);
  - a new badge.
- **Announcements:**
  - Course announcements come from the course's trainers (Announcements tab). Platform announcements come from a Super Admin (`/admin/announcements`).
  - Rich text, optional pin, and "also email" (on by default). Emails go out in batches of 100 through Resend.
  - Draft courses never email.
  - Email is best effort: if the provider fails, the announcement and in-app notifications still stand. The trainer is told the email didn't go, and `emailed` stays false.
  - Learners see announcements on their dashboard (latest three), on the course page, and at `/announcements` and `/learn/[course]/announcements`.
- **Discussions** (`/learn/[course]/discussions`):
  - Open to the course's staff and its enrolled learners. Archived courses are read-only.
  - Plain-text posts, up to 10,000 characters, rate-limited to 20 posts per 10 minutes.
  - **Names:** learners see each other as "Thandiwe M."; trainers are named in full and marked "Trainer". Staff see full names (POPIA data minimisation between learners).
  - Authors can edit (marked "edited") and delete their own posts. Deleted posts show "This post was removed".
  - Staff can remove any post, and pin or lock topics. Moderation is audit-logged.
- **Trainer ratings:**
  - **Who can rate:** a learner can rate the trainer of a session they attended (for 60 days after it ends), and each trainer on a course they completed (for 90 days). One rating each, enforced by the database.
  - **What they rate:** knowledge, clarity, practical relevance and engagement, each 1–5. The star control is real radio buttons, so arrow keys and screen readers work. There is an optional comment.
  - **Prompts:** the dashboard shows "Rate your trainer" while a rating is waiting.
  - **Trainers** (`/teach/ratings`) see nothing until 3 ratings exist. After that they see:
    - overall and per-criterion averages;
    - a 12-month trend chart, where months with fewer than 3 ratings are gaps (with a table view);
    - per-course averages, only for courses with 3 or more ratings;
    - comments, shuffled and undated.
  - **Super Admins** (`/admin/ratings`) see every rating with the rater's name, filterable by trainer. Each view is audit-logged.
- **Calendar** (`/calendar`):
  - A month grid plus a day-by-day agenda of live sessions, assignment due dates and course due dates, for the courses you learn on or teach. Times are in SAST.
  - Items you've attended or handed in are marked.
  - **"Add to your calendar"** downloads an `.ics` file covering the last 7 days and the next 120.
- **Badges:**
  - **The seven badges:** First step, Course complete, Full marks, On time, Full attendance, Committed learner (3 courses), and All-rounder (both categories).
  - Badges are awarded automatically when progress is recomputed or attendance is marked.
  - Shown on the dashboard and at `/account/badges`, always with the line "Badges celebrate progress on YARI Academy. They are not qualifications or accreditation."

**Decisions to confirm later:**

- **Calendar subscription:** a live calendar feed (a secret per-user URL) would save re-downloading the `.ics` file. It is deferred because the URL is effectively a password.
- **Discussion formatting:** posts are plain text for now. Attachments and rich text in discussions can come later if trainers ask for them.

## 12. Phase 6 (Certificates & public site): what was built and the decisions behind it

- **Certificates of Completion:**
  - **Issued automatically** when a course completes (all required items done and pass marks met). The learner gets a notification and an email.
  - **Catching up:** courses completed before Phase 6, or any issue that failed, are caught by the nightly job, and on the learner's Certificates page.
  - **Code:** each certificate has a code like `YG-7K3M-Q9TP`. The alphabet has no 0/O, 1/I/L or U, and there are about 6.5 × 10¹¹ possible codes.
  - **Frozen details:** everything printed is frozen at issue time: the learner's name, course title, trainers, course length, completion date and accreditation. Renaming a course later doesn't change issued certificates.
  - **PDF:** A4 landscape in the brand fonts (bundled, under the SIL Open Font License), with the YG monogram, a category accent and a QR code linking to the public check. The non-accreditation statement is set in bold beside the QR code, not hidden in small print.
  - **Who can download the PDF** (`/certificates/[code]`): the holder, a Super Admin, or a Client Manager of the company that enrolled the learner. Downloads by anyone other than the holder are audit-logged. Revoked certificates can't be downloaded.
  - **Where to find them:** learners have Account → Certificates and a button on a completed course. Client Managers have a link on each staff member's page.
- **Public verification** (`/verify`, `/verify/[code]`):
  - Accepts codes typed off paper (lower case, spaces, with or without "YG").
  - Shows the holder's full name (as agreed), the course, the dates, the issuer and the statement.
  - It never shows trainers, contact details or why a certificate was revoked.
  - Lookups are limited to 60 per 15 minutes per connection. Result pages are `noindex`, and `robots.txt` excludes them.
- **Administration:**
  - `/admin/certificates`: search by code or course, see the public page or PDF, **revoke** (a reason is required, audited, and never shown publicly), or **reissue** (e.g. after a name correction: the old code stops verifying and a new one is issued).
  - **Account erasure:** `eraseCertificateHolder(userId)` revokes the person's certificates and erases their name. Phase 7 wires it into account deletion.
- **Accreditation, ready for later:**
  - `/admin/settings` has the switch, the accrediting body and the provider number. Switching it on needs an explicit confirmation and is audited.
  - Once it's on, a Super Admin can add unit standards, NQF level and credits to a course (in course Settings).
  - Only _new_ certificates for such courses carry the accreditation block. Everything else keeps the statement.
- **Platform settings:** the platform name and public contact email and phone are editable at `/admin/settings`. They are validated on every read and fall back to defaults if a stored value is bad.
- **Public site:**
  - **Landing page** (`/`): a type-led hero with the YG monogram, then the two practices:
    - **SHE:** Safety files; Housekeeping and rubble cleaning; Department of Employment and Labour visit preparation; Site visits; Auditing; Incident investigation; SHE management systems; Environmental compliance; SHE rep practical training.
    - **Tech & IT:** AI adoption training; Digital migration; IT support and training.

    After the services come "how it works for companies" (on black, echoing the business card), a catalogue preview, a plain statement about certificates, and the enquiry form.

  - **Catalogue** (`/courses`, `/courses/[slug]`): published courses marked _Public_, filterable by category. The course page shows the module and item outline (titles only, never content), length, an "Enquire about this course" button and the certificate statement. There is no self-enrolment: enrolment stays invite-only, as agreed.
  - **Enquiry form** (`/enquire`, and on the landing page):
    - **Fields:** name, email, optional phone and company, interest, optional course, message, and POPIA consent with a link to the privacy notice.
    - **Spam protection:** a hidden honeypot field and a limit of 5 enquiries per hour per connection.
    - **Storage:** the name, contact details and message are encrypted.
    - **Who is told:** Super Admins get an in-app notification and an email that contains no personal details.
    - **Inbox:** `/admin/enquiries` lists enquiries (each view is audit-logged), with New / Contacted / Closed status and "delete now".
    - **Retention:** enquiries are deleted automatically 12 months after they were last updated.
  - **Site extras:** a sitemap, a robots file, and a fuller public footer. On phones, the main links sit in a second header row rather than behind a menu button.
- **Privacy notice:** new sections on enquiries and on what happens to certificates when an account is deleted.

**Decisions to confirm later:**

- **Contact details:** the public email and phone are blank until set in Settings; I didn't guess them.
- **Course pages:** only courses marked _Public_ in course Settings appear in the catalogue. The two templates are not listed. Phase 7's demo data will publish the two demo courses.

## 13. Phase 7 (Hardening): what was done

- **Security review:** two independent reviews (access control, and web/input/crypto). Every finding was verified against the code, fixed and covered by a regression test. **1 high, 8 medium, 8 low.** Details and the deployment checklist are in `docs/SECURITY.md`.
  - **High:** a Client Manager could attach an existing account to their company and see its details. There is now a consent step: companies send an invitation the person must accept on their Account page.
  - **Content-Security-Policy:** added.
  - **Sessions:** absolute limits (7 days for staff, 30 for others).
  - **Uploads:** checked and served from a server-side copy.
  - **Rate limits:** robust behind a proxy (`TRUSTED_PROXY_HOPS`).
  - **Trainer ratings:** released in batches of 3, so averages can't be subtracted to find one person's scores.
  - `npm audit`: 0 vulnerabilities.
- **POPIA:**
  - **Data access:** an admin approves the request, then the person downloads a full JSON copy while signed in, for 7 days. It includes who viewed or changed their details.
  - **Erasure:** an admin anonymises the account. Identity, written work, files, feedback and posts are removed and certificates withdrawn. Anonymous scores and completion numbers are kept.
  - **Checklist:** the eight conditions are mapped in `docs/POPIA.md`, with the steps YARI GROUP must take before launch (Information Officer, PAIA manual, operator agreements, breach procedure, retention period, cross-border email).
- **Accessibility:** a new axe sweep (`tests/e2e/a11y.spec.ts`) visits about 60 pages as each role, on the demo data:
  - **Themes:** dark mode at 360px and light mode on desktop (the other specs cover light mode at both sizes).
  - **Keyboard:** a skip-link check.
  - **Found and fixed:** invalid definition-list markup on the trainer ratings page.
  - **Result:** all pages pass WCAG 2.1 A/AA automated checks with no sideways scrolling.
- **Low-end phones:** measured on the production build at 360px with Chrome's "Slow 4G" network and a 4× slower CPU, cache disabled:

  | Page              | Transferred | JavaScript | First paint | Loaded |
  | ----------------- | ----------- | ---------- | ----------- | ------ |
  | Landing page      | 278 KB      | 155 KB     | 1.8 s       | 3.2 s  |
  | Course catalogue  | 262 KB      | 149 KB     | 1.6 s       | 3.0 s  |
  | Learner dashboard | 268 KB      | 155 KB     | 1.6 s       | 3.0 s  |
  | Course item       | 271 KB      | 163 KB     | 1.6 s       | 3.0 s  |

  Heavy libraries (rich-text editor, drag and drop, PDF) never reach learner pages. Fonts are about 84 KB and cached long-term. The app is now installable to the home screen (web app manifest).

- **Demo data:** `npm run db:seed:demo` (`src/server/demo/seed.ts`). Everything in it is fictional, and email addresses use `.invalid` so nothing can be sent. It builds:
  - **Courses:** "SHE Representative Practical Training" and "AI Tools for the Workplace", published and public, with quizzes (all five question types), a rubric-marked inspection report, sessions and at-risk rules.
  - **People:** 1 Super Admin, 2 Trainers (both with 2FA keys printed) and a Client Manager for "Ubuntu Build & Civil (Demo)". There are 10 learners, with fictional but valid-format ID numbers.
  - **Activity:** realistic progress, 5 certificates, a marking queue, a failed quiz attempt, an at-risk learner, ratings over time, announcements, a discussion and 2 enquiries.

  It runs once per database and refuses in production unless `ALLOW_DEMO_SEED=yes`.
