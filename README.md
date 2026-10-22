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

Open the printed invitation link, set a password, and enrol your authenticator app (Super Admins and Trainers must use two-step verification). Without `RESEND_API_KEY`, emails such as invitations and password resets are printed to the dev server console.

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
- Client companies are isolated in the data layer (`src/server/pii/users.ts`, `src/server/rbac.ts`), and integration tests cover it.
- `/styleguide` shows the design tokens and components.
