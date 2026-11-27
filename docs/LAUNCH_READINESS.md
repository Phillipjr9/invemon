# Launch readiness — 2026-11-27

## Implemented in this branch (not a production certification)

- Real-image asset identities in overview holdings/watchlist, portfolio, markets and detail panels; local crypto assets, safe loading/failure fallbacks, contrast checks.
- Opt-in external TradingView chart in asset details and the crypto detail dialog. Explicit stock listings and selected crypto venue/pair mappings; unknown mappings show unavailable, not synthetic history. Third-party script errors/timeouts offer retry/external link. Theme changes rebuild the embed and unmount cleans it up.
- Reference stock prices, 52-week statistics, market sparklines and portfolio returns remain sample data and are labeled separately. External chart data does not update demo valuations. CoinPaprika history/quotes retain their separate attribution.
- Hashed, single-use expiring verification/reset links; deliberate POST consumption; reset session revocation; account settings verification action; recovery UI. Requires migration 003 and email configuration.
- Unit/API tests and a browser suite wired into CI. Browser contracts mock account HTTP and TradingView script insertion. They do not verify actual third-party data or remote database health.

- Customer support center and allowlisted/verified staff desk, public replies, isolated internal notes, password-confirmed staff writes, optimistic concurrency and audit events. Requires migration 004.
- Protected database/schema readiness probe and dry-run-by-default expired-auth cleanup. Neither monitoring nor cleanup is automatically configured/scheduled (see `OPERATIONS.md`).

## Release gates still open

- Apply **003_account_tokens.sql** and **004_support_threads.sql** remotely (the user confirmed only the original eight tables).
- Configure and test a verified mail sender; Resend API key, delivery/bounce tracking, retries for account links.
- Review the updated PR, resolve GitHub billing/check failures, deploy current code with current env. Do not treat a READY build as a working DB connection.
- Smoke-test Vercel + Neon accounts with authorized test credentials: registration, restore session, save/load/revision conflicts, verification, reset, export, and deletion.
- Confirm actual TradingView widget access, instrument availability, displayed delays, attribution and acceptable usage from a normal browser. This sandbox cannot reach TradingView/Resend/Neon hosts. Chart render was tested with a simulated embed only.
- Independent accessibility/security review, WAF/bot protection, error monitoring, retention schedule, tested Neon backup/restore.
- Organization-approved privacy policy/terms, support details, data-provider and trademark review. No invented legal entity or compliance claim.

## Not completed / not unlocked by this work

- Licensed stock quote API / synchronized real-price valuations; market-monitoring alert worker.
- Google OAuth/OIDC, MFA/passkeys, verified email changes.
- Continuous cross-device sync (current workflow is explicit cloud snapshot save/load).
- Actual support staffing, assignment, full-text search and reply-email delivery; the bounded restricted support desk and owner-only history are now implemented (see `SUPPORT_DESK.md`).
- Brokerage/bank/crypto custody providers, KYC/AML/product eligibility, signed provider webhooks, reconciliation and authoritative append-only ledger.
- Real recurring investments, withdrawals, live orders, tax statements or financial advice.

Do not receive real funds or advertise the demo as a licensed financial service. These items require provider agreements, business/legal decisions and operational credentials, not just UI code.

## Authenticator / deployment verification update

Implemented authenticator-app enrollment/login, encrypted secrets, single-use recovery codes, replay rejection, MFA-gated staff access, and read-only-by-default deployment smoke tests. Migration **005_authenticator_mfa.sql is now mandatory before this code is deployed**. See AUTHENTICATOR_MFA.md and OPERATIONS.md. This does not mean live MFA is configured or certified.

Local verification: 41 automated tests, TypeScript, production build and seven browser suites pass. Provider HTTP is mocked and database tests use PGlite. GitHub Actions latest checked job did not start: its annotation reports the repository owner's account is locked due to a billing issue. Resolve GitHub billing and rerun CI; do not bypass the release gate based solely on local results.

Still unverified: live migrations (including 003/004/005), preview origin/protected access, sender and inbox delivery, production smoke tests, authenticator-app enrollment on the deployed host, monitoring scheduling, isolated Neon backup restore, real chart availability/data rights, legal approval and a security/accessibility review. Production promotion has not been performed.
