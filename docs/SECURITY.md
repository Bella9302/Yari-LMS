# Security review: Phase 7

Two independent read-only reviews were run on the whole codebase in October 2026:

- **Access control and data exposure:** every server action, route handler and page that loads data by id.
- **Web, input and crypto:** headers, CSRF, XSS, uploads, redirects, sessions, rate limits and dependencies.

Each finding was checked against the code before fixing. Regression tests are in `tests/integration/security.test.ts`, `tests/unit/auth-rules.test.ts` and the other suites noted below.

`npm audit --omit=dev`: **0 vulnerabilities** in 643 production dependencies.

## Findings and fixes

| #   | Severity   | Finding                                                                                                                                                                    | Fix                                                                                                                                                                                                 |
| --- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | High       | A Client Manager inviting the email of an existing account attached that person to their company. The company then saw their name, email and status, and could enrol them. | Existing accounts get a **pending company invitation** (`OrgInvitation`). Nothing is granted or visible until the person accepts it on their Account page.                                          |
| 2   | Medium     | Open redirect: `/login?next=/%09/evil.example` passed the same-site check. Browsers strip tabs, which turns the path into `//evil.example`.                                | `safeNextPath` rejects control characters and backslashes, then checks that the path resolves to the same origin.                                                                                   |
| 3   | Medium     | Per-IP rate limits trusted the leftmost `X-Forwarded-For` value, which the client controls.                                                                                | The client IP is now read a configured number of hops from the right (`TRUSTED_PROXY_HOPS`).                                                                                                        |
| 4   | Medium     | Login lockout let anyone lock any learner out for up to 24 hours, and its message revealed which emails have accounts. The failure counter could also be raced.            | Failures are throttled per email (5 per connection per 15 minutes, 30 overall per hour). The response is the same whether or not the account exists. Counters record first and then count (atomic). |
| 5   | Medium     | Password reset ran the Argon2 hash before checking the token, with no rate limit, so junk resets could exhaust the CPU.                                                    | The token is checked first, and resets are rate-limited per connection.                                                                                                                             |
| 6   | Medium     | S3 uploads could be replaced after the virus scan, because the 30-minute presigned PUT still worked.                                                                       | The upload is copied to a server-only key _before_ it is checked, and only that copy is served. Presigned URLs now last 10 minutes.                                                                 |
| 7   | Medium     | Trainer rating averages could be subtracted (total minus a course, or the page before and after one new rating) to recover one learner's scores.                           | Ratings are released to trainers in **batches of 3**: overall, per course, per month and comments. A course figure is hidden unless the rest of the total is also at least 3 ratings.               |
| 8   | Medium     | A Client Manager re-enrolling a withdrawn learner picked up history built while the learner was with another company (progress, results, certificate).                     | Client Managers can't take over another company's enrolment history. Only a Super Admin can move it.                                                                                                |
| 9   | Medium     | Matching-question answers were stored in the same order as their prompts, and shown in that order when the quiz isn't shuffled.                                            | The answer side of matching questions is always shuffled.                                                                                                                                           |
| 10  | Low–medium | A trainer also enrolled on their own course could mark their own work or override their own grade, and so give themselves a certificate.                                   | Marking, quiz marking and grade overrides reject your own work (Super Admins excepted).                                                                                                             |
| 11  | Low        | Saving a "draft" over a released mark changed what the learner saw at once.                                                                                                | Drafts can't overwrite a released mark. The draft button is hidden once a mark is released.                                                                                                         |
| 12  | Low        | When answers are hidden ("never"), per-question points still showed which answers were right.                                                                              | Per-question points follow the same show-answers rule.                                                                                                                                              |
| 13  | Low        | Managers of an archived company could still export reports, enrol and invite through the actions.                                                                          | Company services check that the company is active.                                                                                                                                                  |
| 14  | Low        | Quiz answers could still be saved and submitted after withdrawal or archiving.                                                                                             | Saving and submitting require an active enrolment on a published course.                                                                                                                            |
| 15  | Low        | Sessions slid forever with use.                                                                                                                                            | Absolute limit from sign-in: 7 days for staff, 30 days for others.                                                                                                                                  |
| 16  | Low        | The marking "next" redirect and the engagement "back" paths took values from the form.                                                                                     | Both go through `safeNextPath`.                                                                                                                                                                     |
| 17  | Low        | Some inputs caused server errors: `Origin: null` on the activity beacon, a lone `%` on `/verify`, and very deeply nested rich text.                                        | The Origin header is parsed safely, the extra decode was removed, and the rich-text sanitiser caps depth (24) and size (20,000 nodes). The Vimeo privacy hash is validated.                         |

## Added in this phase

- **Content-Security-Policy** (`next.config.ts`):
  - Scripts and styles come only from this site.
  - Frames are limited to the three video hosts and file storage.
  - `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'self'`.
  - Files under `/api/files` have their own sandbox policy.

  Scripts still allow `'unsafe-inline'` so pages stay static-friendly. Moving to per-request nonces is the next step if every page becomes dynamic.

- **POPIA:** fulfilment of data-access and erasure requests (see `docs/POPIA.md`).

## Deployment checklist

- [ ] **HTTPS:** set `APP_URL` to the `https://` address. That also turns on `upgrade-insecure-requests`.
- [ ] **Proxy hops:** set `TRUSTED_PROXY_HOPS` to the number of reverse proxies in front of the app: 1 for Caddy or nginx, 2 with a CDN in front. Make sure the outermost proxy _appends_ to `X-Forwarded-For`.
- [ ] **Virus scanning:** `CLAMAV_HOST` is required. The app refuses to start without it in production.
- [ ] **Keys:** keep `FIELD_ENC_KEYS`, `BLIND_INDEX_KEY`, `RESEND_API_KEY` and any S3 keys in a secrets manager (or use an IAM role instead of S3 keys). Never commit them, and never put them in backups.
- [ ] **File storage:** S3 bucket private, CORS PUT only from `APP_URL`, versioning on, in `af-south-1`.
- [ ] **Nightly job:** schedule `npm run jobs:nightly` (02:00 SAST).
- [ ] **Backups:** encrypted database backups, with a restore tested.
- [ ] **Demo data:** never run `db:seed:demo` on the live server. It refuses unless the server runs with `DEMO_MODE=true`, which also shows a "demonstration site" banner and stops emails. Never set `DEMO_MODE` on the live site.
