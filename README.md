# YARI Academy

The learning platform for YARI GROUP: Health & Safety and AI & Digital training. See `CLAUDE.md` for the brief and `docs/PLAN.md` for the architecture, data model and decisions.

## Getting started

```bash
docker compose up -d            # Postgres 16 (also creates yari_test and yari_e2e)
cp .env.example .env
npm run keys:generate           # paste the output into .env
npm install
npm run db:migrate              # apply migrations
npm run db:seed                 # prints an invitation link for the first Super Admin
npm run dev                     # http://localhost:3000
```

The seed also creates the two course templates. Uploaded files go to `.storage/` with the local storage driver. Without `CLAMAV_HOST`, uploads in development are marked "not scanned (dev)". Production requires ClamAV.

Open the printed invitation link, set a password, and enrol your authenticator app (Super Admins and Trainers must use two-step verification). Without `RESEND_API_KEY`, emails such as invitations, password resets and announcements are printed to the dev server console. In production a missing key is an error. Announcements still post, but the trainer is told the email didn't go.

## Scripts

| Command                                 | What it does                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| `npm test`                              | Unit and integration tests (Vitest). Integration tests rebuild `yari_test`.            |
| `npm run test:e2e`                      | Playwright tests at 360px and desktop, with axe accessibility checks. Uses `yari_e2e`. |
| `npm run lint` / `typecheck` / `format` | Code quality                                                                           |
| `npm run keys:generate`                 | New encryption and blind-index keys                                                    |

## Security model, in short

- Passwords use Argon2id. Personal fields use AES-256-GCM, bound to their row and column. Email and ID lookups use HMAC blind indexes. Keys are kept in env and never in the database.
- Session cookies are HttpOnly, Secure and SameSite, and only their hashes are stored. Login is rate-limited, with account lockout. TOTP two-factor and recovery codes are supported.
- Reads and changes of personal data are written to an append-only audit log (enforced by a database trigger).
- Trainer ratings are anonymous to trainers: they see aggregates only after 3 ratings, and comments shuffled and undated. Learners see each other in discussions by first name and initial only.
- Client companies are isolated in the data layer (`src/server/pii/users.ts`, `src/server/rbac.ts`), and integration tests cover it.
- `/styleguide` shows the design tokens and components.

## Scheduled jobs

Run `npm run jobs:nightly` once a day (for example 02:00 SAST via cron). It does the following:

- re-checks at-risk alerts;
- emails trainers a count of newly flagged learners;
- issues any certificates that are still missing;
- deletes enquiries older than 12 months;
- cleans up expired sessions and tokens.

## Certificates

Certificates are issued on course completion and verified publicly at `/verify`. They always state that they are not an accredited qualification. To print accreditation details later, a Super Admin turns on accreditation in **Admin → Settings** and adds unit standards in each course's **Settings**. No code change is needed. The PDF fonts are bundled in `src/server/pdf/fonts` (SIL Open Font License).
