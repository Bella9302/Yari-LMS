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
TrainerRating   →User(trainer), →User(rater), →Course, →LiveSession?, knowledge, clarity, relevance,
                engagement (1–5), comment?, createdAt         unique(rater, trainer, course, session)
Announcement    scope(PLATFORM|COURSE), →Course?, →User(author), title, body, publishAt, emailedAt?
DiscussionThread →Course, →User, title, pinned, locked
DiscussionPost  →Thread, →User, parentId?, body, editedAt?, deletedAt?
Notification    →User, type, payload(JSON), readAt?
Badge           code, name, description, icon, criteria(JSON)
UserBadge       →User, →Badge, awardedAt, →Course?
```

Rating anonymity: trainers see only aggregates, and only once **≥3 ratings** exist for a course or session. Comments are shown shuffled and without dates, so a learner can't be identified by timing. Admin sees everything.

### Certificates, public site, settings

```
CertificateTemplate name, layout(JSON), disclaimerText (non-editable default), accreditationEnabled=false,
                    providerNumber?, unitStandards[]?, nqfLevel?, credits?
Certificate     →Enrolment, →CertificateTemplate, code#(e.g. YG-7K3M-Q9TP), issuedAt, revokedAt?, revokeReason?,
                snapshot(JSON: course title, hours, trainer, learner display name🔒), pdfAssetId
Enquiry         name🔒, email🔒, phone🔒?, company?, interest(SHE|TECH|BOTH), message, consentAt, status
PlatformSetting key, value(JSON)   e.g. brandName="YARI Academy", accreditation flags, at-risk defaults
```

The certificate disclaimer is always rendered when `accreditationEnabled` is false. The template cannot hide it, and a test enforces this.

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
