# POPIA checklist: YARI Academy

How the platform meets the Protection of Personal Information Act (Act 4 of 2013), and what YARI GROUP still has to do itself. Software can only cover part of POPIA. Items marked **YARI GROUP** are organisational and must be done before launch.

_Last reviewed: Phase 7 (October 2026). This is not legal advice. Review it with your Information Officer._

## What personal information we hold

| Information                                                           | Why                                                    | Where it lives               | Protection                                                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| Name, email, phone, address, employer                                 | Run training, contact learners, report to the employer | `UserProfile`, `User`        | AES-256-GCM per field, keys outside the database                                                     |
| SA ID / passport number                                               | Identify learners on training records                  | `UserProfile`                | Encrypted. HMAC blind index for uniqueness. Masked (`******1234`) everywhere except for Super Admins |
| Training records (progress, attempts, submissions, marks, attendance) | The service itself                                     | Course tables                | Access control by role, course and company                                                           |
| Uploaded work and feedback files                                      | Assignments                                            | S3 (`af-south-1`, Cape Town) | Private bucket, short-lived signed URLs, virus-scanned                                               |
| Ratings of trainers                                                   | Quality improvement                                    | `TrainerRating`              | Anonymous to trainers (released in batches of 3)                                                     |
| Enquiries from the public site                                        | Reply to the enquiry                                   | `Enquiry`                    | Name, contact details and message encrypted. Deleted after 12 months                                 |
| Security logs (sign-ins, views of personal data)                      | Security, accountability                               | `AuditLog`                   | Append-only (database trigger). IP addresses stored only as keyed hashes                             |

## The eight conditions for lawful processing

### 1. Accountability (s8)

- [x] Every view and change of personal details is written to an append-only audit log (`/admin/audit`): who did it, when, which fields, and never the values.
- [ ] **YARI GROUP:** appoint and register an **Information Officer** (and deputy) with the Information Regulator. The privacy notice currently points to `privacy@yarigroup.co.za`. Make sure that mailbox exists and is monitored.
- [ ] **YARI GROUP:** have the Information Officer review the privacy notice (`/privacy`, marked as a draft in the code).

### 2. Processing limitation: lawful, minimal, consent (s9–12)

- [x] Explicit consent to the terms and privacy notice is recorded (with version) when an invitation is accepted. Marketing email is a separate, optional consent that can be withdrawn at any time (Account → Privacy).
- [x] Data minimisation:
  - Learners see each other in discussions only as "Thandiwe M.".
  - Client Managers see only their own company's enrolments, never submitted work, feedback or trainers' at-risk notes.
  - ID numbers are masked except for Super Admins.
  - Enquiry emails to admins contain no personal details.
- [x] A company can't attach an existing account to itself. The person is asked and must accept before the company sees anything (Phase 7 fix).
- [x] The public enquiry form asks for consent, explains the 12-month retention, and links to the privacy notice.

### 3. Purpose specification and retention (s13–14)

- [x] **Enquiries:** deleted automatically 12 months after their last update (nightly job).
- [x] **Security records:** expired sessions, used tokens and rate-limit records are cleaned up nightly.
- [x] **Account deletion:** the account is anonymised (see condition 8).
- [ ] **YARI GROUP:** decide how long completed training records are kept. The OHS Act and client contracts may require several years. The platform keeps anonymised completion numbers after erasure. Document the period in the privacy notice.

### 4. Further processing limitation (s15)

- [x] Data is used only for the purposes in the privacy notice. There are no analytics or advertising scripts, and no third-party trackers. The Content-Security-Policy blocks scripts from other sites.

### 5. Information quality (s16)

- [x] Learners can update their contact details. Changes to name, email and ID go through an admin, because they appear on certificates. Certificates can be reissued after a correction, and the old one is withdrawn.

### 6. Openness (s17–18)

- [x] The privacy notice is public at `/privacy`. It is shown and accepted during sign-up, and covers certificates, company reporting, enquiries and rights.
- [ ] **YARI GROUP:** publish a **PAIA manual** (Promotion of Access to Information Act, s51), which is required of private bodies, and link it from the footer.

### 7. Security safeguards (s19–22)

- [x] **Passwords:** Argon2id.
- [x] **Personal fields:** AES-256-GCM, bound to their row and field. Keys are held in the environment, with key IDs and support for rotation.
- [x] **Network:** HTTPS only (HSTS preload), secure HttpOnly `__Host-` cookies.
- [x] **Request protection:** CSRF protection on server actions, plus Origin checks on the beacon endpoint.
- [x] **Content-Security-Policy and framing:** the policy is set, and pages can't be framed by other sites.
- [x] **Two-step verification:** required for Super Admins and Trainers. Recovery codes are available.
- [x] **Sessions:**
  - **Expiry:** sessions expire, staff sessions end after at most 7 days, and others after at most 30.
  - **Revocation:** sessions are revoked when a password changes or an account is suspended.
- [x] **Rate limits:**
  - **Sign-in:** limited per network and per email (without revealing which emails exist).
  - **Other:** password reset, the enquiry form, certificate checks, discussion posts and invitations.
- [x] **Uploads:**
  - **Checks:** each file is checked against its declared type, virus-scanned (ClamAV, required in production) and served only after the checks.
  - **Snapshot:** the checks run on a server-side copy that the uploader can't change afterwards.
  - **Serving:** downloads are sandboxed.
- [x] **Security review:** completed in Phase 7. Findings and fixes are in `docs/SECURITY.md`.
- [ ] **YARI GROUP:** sign **operator agreements** (s21) with every service that processes data for you:
  - AWS (hosting and storage, Cape Town region);
  - Resend (email);
  - the database host.

  Resend is US-based, so emails (recipient address and content) leave South Africa. See condition 8, cross-border.

- [ ] **YARI GROUP:** write a **breach response procedure** (s22). If personal information may have been accessed by someone unauthorised, notify the Information Regulator and the people affected as soon as reasonably possible. The audit log helps work out who was affected.
- [ ] **YARI GROUP / hosting:**
  - Encrypt database backups.
  - Keep the encryption keys (`FIELD_ENC_KEYS`, `BLIND_INDEX_KEY`) in a secrets manager, separate from backups.
  - Test a restore.

### 8. Data subject participation (s23–25)

- [x] **Access:**
  1. A learner requests a copy (Account → Privacy).
  2. A Super Admin confirms their identity and approves it.
  3. The learner downloads a complete JSON copy while signed in, for 7 days.

  The copy includes their profile, training records, answers, submissions, ratings they gave, posts, certificates, and a log of when staff or their company viewed or changed their details. Nothing personal is emailed.

- [x] **Correction:** contact details by the learner. Identity details by an admin, with certificate reissue.
- [x] **Deletion:** a Super Admin erases the account from the request. This needs a typed confirmation, is audited, and can't be done to yourself or to the last Super Admin.
  - **Removed:** name, email, ID number, phone, address, employer, employee number, password, 2FA, sessions, written work, uploaded files, feedback, discussion text, badges and notifications.
  - **Certificates:** they stop verifying, and the name is removed from them.
  - **Kept (with no identity):** progress percentages, scores, attendance and anonymous ratings, so company completion figures stay correct.
- [x] **Response time:** requests show a 30-day countdown in `/admin/data-requests`.

### Cross-border transfers (s72)

- [x] **Inside South Africa:** the server and file storage are in South Africa (one server, AWS `af-south-1`).
- [ ] **YARI GROUP:** email via Resend is processed in the USA. Either rely on s72(1)(b) (a contract with adequate protection, through Resend's data processing agreement) and mention it in the privacy notice, or switch to an email provider with South African or EU processing.

### Direct marketing (s69)

- [x] **Consent:** marketing email is opt-in only, separate from the terms, and withdrawable in one click on the Privacy page.
- [ ] **When you start sending:** add an unsubscribe link to any marketing emails.

## Before launch: YARI GROUP to do

1. Register the Information Officer with the Information Regulator.
2. Finalise and approve the privacy notice and terms (currently drafts).
3. Publish a PAIA manual.
4. Sign operator agreements: AWS, Resend and the database host.
5. Decide the training-record retention period.
6. Write the breach response procedure and assign who does what.
7. Set up encrypted backups, store keys separately, and test a restore.
