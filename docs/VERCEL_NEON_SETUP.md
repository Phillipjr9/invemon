# Vercel + Neon setup

## Scope and safety boundary

This release adds server accounts to the existing **simulated** investment workspace. It does not turn it into a licensed brokerage, bank, or crypto custodian. Cloud balances are user-editable demo snapshots, **not authoritative financial records**. Never accept customer funds against them.

Implemented:
- Neon PostgreSQL account/session/support/security-event/workspace tables.
- Server-side scrypt password hashing; random, hashed-at-rest session tokens; seven-day HttpOnly cookies (Secure + `__Host-` prefix in production).
- Exact-origin write protection, request limits, persistent IP-based throttling, and owner-scoped queries.
- Registration/sign-in/session restoration, password change with session revocation, profile/risk edits, logout/all-device logout, JSON data export and password-confirmed account deletion.
- Support-request storage with configurable email acknowledgments (no support-agent UI).
- Transactional Resend email queue, preferences, limited 3D-animated welcome/test specimens, and a protected retry worker; see `docs/EMAIL_NOTIFICATIONS.md`.
- Explicit demo cloud save/load with revision conflict detection. Theme and crypto-directory favorites remain device-local.
- Correct goal earmark accounting, risk-policy targets, recurring monthly equivalents, daily price-change math and monthly APY compounding. Synthetic history is labeled.

## 1. Create the Neon database

Create a Neon project and a database for this application. Use a separate Neon branch/database for previews. Copy the **pooled** connection URL with `sslmode=require` into your own local environment and Vercel's encrypted environment settings. Do not paste it into chat or put it in a `VITE_` variable.

Runtime migrations are `db/001_accounts.sql` and `db/002_email_notifications.sql`; the migration script applies both in order. The historical `prisma/schema.prisma` is a design scaffold and is **not** the schema used by these APIs. Do not run Prisma migrations against this installation without reconciling the schemas.

Use a database owner for migration and a restricted DML-only application role for runtime where possible. The browser never connects to Neon. Access isolation is implemented by session-authenticated API queries, not browser credentials or a claimed RLS policy.

## 2. Set environment variables

| Variable | Location | Value |
| --- | --- | --- |
| `DATABASE_URL` | Server only | Neon pooled PostgreSQL URL, TLS enabled |
| `APP_ORIGIN` | Server only | Exact canonical HTTPS origin, e.g. `https://your-domain.example` |
| `VITE_ACCOUNT_MODE` | Build/public | `server` |
| `VITE_CRYPTO_API_BASE_URL` | Build/public, optional | Licensed CoinPaprika-compatible market-data endpoint; default remains public feed |

Production builds default to server accounts even if `VITE_ACCOUNT_MODE` is omitted. Explicit `demo` is only for a demo-only deployment. Local `npm run dev` without that variable uses the historical browser demo. `VITE_` values are public and baked into the build.

`APP_ORIGIN` is intentionally **not inferred from a request header**. Configure it per deployment. Use the canonical origin for all account actions; an alias origin will be rejected. Redirect aliases in your domain configuration. For previews, use the known preview origin and an isolated Neon branch, or set `VITE_ACCOUNT_MODE=demo` for UI-only previews. Never connect untrusted preview code to your production database.

## 3. Apply the schema

Node 22 is required. On your machine:

```sh
npm ci
cp .env.example .env
# Edit .env locally with your Neon URL and exact origin.
npm run db:migrate
npm test
npx tsc --noEmit
npm run build
```

The migration is an additive, idempotent initial schema. It is deliberately not run as part of every Vercel build. Take a backup before later migrations. This session tested it on PGlite's PostgreSQL engine, not on a remote Neon instance.

## 4. Deploy on Vercel

Import the repository with its root as the project root. `vercel.json` selects Vite, `npm run build`, and `dist`, and configures the Node API functions plus basic browser security headers. Use Node 22. Add the variables above to the appropriate environments, apply the migration, then deploy/redeploy. Environment changes to `VITE_` variables require rebuilding.

Do not deploy only the contents of `dist` to static hosting: `/api/account` and `/api/workspace` must also be deployed from this repository.

For local server-account work use Vercel CLI (`npx vercel dev`) with your project/environment configured; plain `vite` does not execute the serverless API handlers. Keep browser API calls relative to `/api`.

No Vercel deployment or Neon database changes were performed in this session.

## 5. Smoke test after deployment

1. Open `/#signup`; create a test account with a unique 12+ character password.
2. Refresh: session should restore without trusting `invemon-account` local storage.
3. Settings → **Save demo to cloud**. Sign in on another browser and **Load cloud demo**.
4. Edit/save the same cloud copy from two browsers: the stale revision must receive 409, not overwrite silently. Export local data before resolving a conflict.
5. Check profile changes, password change/sign-out, all-device sign-out, export, and support request creation.
6. Verify direct unauthenticated `/api/workspace` returns 401 and cross-origin writes fail.
7. Delete the test account and verify its cloud data and sessions are removed. Exports already downloaded and provider backups have separate retention.
8. Check desktop/mobile and light/dark mode. Investments, schedules, payouts and transfers must remain labeled simulations.

## Operational work before public account launch

- Configure backups/PITR in Neon and perform a restore drill; this is not enabled by code.
- Adopt a retention policy for accounts, support requests and security events. Periodically delete expired `app_sessions` and `app_rate_limits` rows using a trusted scheduled task.
- Add production error monitoring/alerts and a support-agent workflow. Existing server errors log only error name/code, not passwords, cookies or database URLs.
- Review platform IP forwarding and add edge/WAF throttling. Database IP rate limits are a baseline, not comprehensive bot/DDoS protection.
- Complete independent security/accessibility review, privacy policy and terms. Password recovery and email ownership checks are currently unavailable; communicate that limitation before inviting users.
- Do not enable a strict CSP without accounting for the current single-file build's inline scripts/styles and permitted market/image/font endpoints. Current headers are a baseline, not a security certification.

## Not implemented / blocked live-service work

| Area | Still required |
| --- | --- |
| Email | Resend transactional delivery is implemented but requires a verified sender and live configuration. Single-use expiring verification/recovery tokens and verified email changes are still unimplemented. No fake recovery codes exist in server mode. |
| MFA / social / passkeys | Enrollment, challenges, recovery, server-verified provider assertions and session step-up. Hidden/unavailable for server accounts rather than simulated as secure. |
| Live brokerage / orders | Broker contract, country/product eligibility, KYC/AML/tax agreements, quotes/licensing, order lifecycle, execution/tax lots and statements. |
| Live banking / crypto | Provider contracts, verified beneficiaries, custody/network policies, withdrawal safeguards, signed/replay-protected webhooks and reconciliation. |
| Financial ledger | A distinct append-only double-entry ledger with decimal amounts, balanced atomic postings, idempotency keys, pending/reserved/settled balances, reversals, provider event ingestion and reconciliation tests. **The snapshot API is not this ledger.** |
| Scheduling / notifications | Durable workers/cron, timezones/holidays, retries, idempotent execution and real notification delivery. Saving a demo plan does not schedule a real trade. |
| Analytics / documents | Provider valuations and cash flows, actual time/money-weighted performance, trade confirmations and jurisdiction-appropriate tax statements. Current charts and CSV/JSON exports are not these documents. |

A real-money launch is blocked on these items and applicable legal/regulatory arrangements. No configuration flag currently enables live investing.
