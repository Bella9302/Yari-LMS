# Project Brief: YARI Academy — Learning Platform for YARI GROUP

> **Working agreement:** build in the phases in Section 8, one at a time. After each phase: run tests, summarise what was built, and stop for review. The agreed architecture and data model live in `docs/PLAN.md`.


---

## 1. About the client

**YARI GROUP** is a South African consultancy with two practice areas:

1. **Environmental Health & Safety (SHE)** — safety files, audits, incident investigation, SHE management systems, environmental compliance, Department of Employment and Labour visit preparation, site visits, SHE rep practical training.
2. **Tech & IT** — AI adoption and digital migration training and support for organisations.

YARI GROUP wants its own learning platform ("YARI Academy" — working name, keep it configurable) to deliver training in both areas to individuals and client companies.

**Important constraint:** YARI GROUP is **not yet accredited** (e.g. by QCTO/SAQA or a SETA) to issue certified qualifications. The platform must never imply accreditation. Any document issued must be a **Certificate of Attendance / Completion**, with a clear statement such as: *"This is a record of attendance and completion. It is not an accredited qualification."* Build the certificate feature so accreditation details (provider number, unit standards, NQF level) can be switched on later without a rebuild.

---

## 2. Goal

A seamless, simple, fully responsive learning management system that feels premium and distinctive — **not** a generic admin template. Think of the best parts of Blackboard Learn Ultra, without the clutter.

---

## 3. Users and roles

| Role | What they do |
|---|---|
| **Super Admin** | Manages the whole platform, users, branding, settings, audit logs |
| **Trainer** | Builds courses, uploads content, marks work, runs sessions, views own ratings |
| **Learner** | Takes courses, submits work, tracks progress, rates trainers, downloads completion certificates |
| **Client Manager** | Represents a client company; enrols their staff, views staff progress and compliance reports (no access to other companies' data) |

Use role-based access control. A user can hold more than one role.

---

## 4. Core features (Blackboard-inspired)

### 4.1 Content
- Courses → Modules → Items (video, PDF, slides, rich text, embedded links, downloadable templates).
- Two course categories: **Health & Safety** and **AI & Digital**. Category drives accent colour and icons.
- **Release conditions** (adaptive release): unlock items by date, by completion of a previous item, or by minimum quiz score.
- Drag-and-drop course builder for trainers. Draft / Published states.
- Course templates (e.g. "SHE Rep Practical Training", "Intro to AI Tools at Work").

### 4.2 Assessment and marking
- Quizzes: multiple choice, multi-select, true/false, short answer, matching. Question banks with random draw.
- Assignments: file upload or text submission, due dates, late flags.
- **Rubrics** attached to assignments.
- **Inline marking view** (like Blackboard's grader): document preview on the left, rubric and feedback on the right, next/previous learner buttons.
- Feedback by text, file, or short audio note.
- **Gradebook**: per course, filterable, exportable to CSV/PDF.

### 4.3 Activity tracking
- Per-learner progress (% complete, time spent, last active, items viewed).
- **At-risk alerts** (like Blackboard's Retention Center): flag learners inactive for X days, missed deadlines, or below a score threshold. Trainers set the rules.
- Session attendance register (for in-person and online sessions), with sign-in by QR code.
- Client Manager dashboard: their staff's progress and completion status.

### 4.4 Trainer ratings
- After each session or course, learners rate the trainer (1–5) on: knowledge, clarity, practical relevance, engagement — plus an optional comment.
- Ratings are anonymous to trainers; Admin sees full detail.
- Trainer profile shows aggregate score and trend over time.

### 4.5 Engagement
- Announcements (course and platform level), with email notification.
- Discussion boards per course.
- Calendar showing due dates and sessions.
- Achievement badges for milestones (non-accredited).

### 4.6 Certificates of completion
- Auto-generated PDF on course completion, branded, with a unique verification code and QR link to a public verification page.
- Mandatory non-accreditation statement (see Section 1).

### 4.7 Public landing page
- A clean public front page for YARI GROUP: both service areas, course catalogue, enquiry form, login.
- Services to list (correct spelling):
  - **SHE:** Safety files; Housekeeping and rubble cleaning; Department of Employment and Labour visit preparation; Site visits; Auditing; Incident investigation; SHE management systems; Environmental compliance; SHE rep practical training.
  - **Tech:** AI adoption training; Digital migration; IT support and training.

---

## 5. Security and privacy (non-negotiable)

The platform will hold personal information and must comply with **POPIA** (Protection of Personal Information Act, South Africa).

- **Passwords:** hash with **Argon2id**. Never store or log plain text.
- **Personal details** (full name, ID number, phone, email, address, employer): these must be readable by authorised users, so they cannot be one-way hashed. Use **field-level encryption (AES-256-GCM)** at rest, with keys held outside the database (environment/KMS).
- **Lookup fields** (email, ID number): store an additional **HMAC-SHA256 blind index** so we can search and enforce uniqueness without decrypting.
- **SA ID numbers:** encrypt, and mask in the UI (e.g. `******1234`) except for Admin.
- HTTPS only, secure HTTP-only cookies, CSRF protection, rate limiting on login, optional TOTP two-factor auth (required for Admin and Trainer).
- **Audit log** of who viewed or changed personal data.
- Consent capture at registration, a privacy notice page, and a learner "download my data" / "delete my account" request flow.
- Client companies' data strictly isolated from each other.

---

## 6. Design direction

The UI must feel bespoke, editorial and confident — **not** a default Tailwind/shadcn dashboard look.

**Brand base (from the YARI GROUP business card):** black and white, high-contrast serif "YG" monogram, sharp and minimal.

- **Palette:**
  - Ink black `#0B0B0C`, paper white `#F7F5F0` (warm off-white), graphite `#2A2A2D`
  - H&S accent: safety amber `#E8A33D`
  - AI & Digital accent: electric teal `#2FD3B5`
  - Error red, success green — muted, not neon
- **Fonts (unusual, from Google Fonts):**
  - Display / headings: **Gloock** (high-contrast serif — echoes the YG monogram)
  - Body / UI: **Bricolage Grotesque**
  - Numbers, codes, data: **Martian Mono**
- **Layout:** generous white space, strong typographic hierarchy, large editorial headings, thin rules, asymmetric grids on the landing page.
- **Motion:** subtle, purposeful (page transitions, progress rings filling, card hover lift). Respect `prefers-reduced-motion`.
- **Light and dark mode**, both first-class. Dark mode leans into the black card look.
- **Mobile first.** Many learners will use phones on site — every screen must work well at 360px wide, with large tap targets and low data use (compressed media, lazy loading).
- **Accessibility:** WCAG 2.1 AA contrast, keyboard navigation, screen-reader labels.
- Avoid: stock gradients, generic purple SaaS styling, emoji icons, cluttered sidebars.

---

## 7. Suggested tech stack (Claude Code may propose better options — explain why)

- **Framework:** Next.js (App Router) + TypeScript
- **Styling:** Tailwind CSS with custom design tokens (no default theme look)
- **Database:** PostgreSQL + Prisma
- **Auth:** Auth.js (or Lucia) with Argon2id, TOTP 2FA
- **File storage:** S3-compatible storage (signed URLs, virus scan on upload)
- **Email:** Resend or similar
- **PDF certificates:** server-side generation (e.g. React-PDF)
- **Testing:** Vitest + Playwright
- **Hosting:** Vercel + managed Postgres, or a single VPS with Docker — keep costs low for a small business

---

## 8. Build phases

1. **Foundation** — repo setup, design system (tokens, fonts, core components), auth, roles, encryption utilities, audit log.
2. **Content** — course builder, modules, items, release conditions, learner course view.
3. **Assessment** — quizzes, assignments, rubrics, inline marking, gradebook.
4. **Tracking** — progress, attendance with QR, at-risk alerts, Client Manager dashboard.
5. **Engagement** — trainer ratings, announcements, discussions, calendar, badges.
6. **Certificates & public site** — completion certificates with verification page, landing page, course catalogue, enquiry form.
7. **Hardening** — security review, POPIA checklist, accessibility audit, performance on low-end phones, seed demo data.

After each phase: run tests, summarise what was built, and wait for my review.

---

## 9. Seed / demo content

Create demo data so the platform can be shown to clients:
- 2 courses: "SHE Representative Practical Training" and "AI Tools for the Workplace"
- 1 Admin, 2 Trainers, 10 Learners, 1 Client company with a Client Manager
- Sample quizzes, one rubric-marked assignment, some ratings and progress data

---

## 10. Out of scope (for now)

- Payments / online checkout (design the data model so it can be added later)
- Accredited certification (see Section 1)
- Native mobile apps (the responsive web app comes first; PWA install support is welcome)
