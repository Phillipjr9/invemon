# Launch readiness — 2026-11-27

## Implemented in this branch (not a production certification)

- Real-image asset identities in overview holdings/watchlist, portfolio, markets and detail panels; local crypto assets, safe loading/failure fallbacks, contrast checks.
- Opt-in external TradingView chart in asset details and the crypto detail dialog. Explicit stock listings and selected crypto venue/pair mappings; unknown mappings show unavailable, not synthetic history. Third-party script errors/timeouts offer retry/external link. Theme changes rebuild the embed and unmount cleans it up.
- Reference stock prices, 52-week statistics, market sparklines and portfolio returns remain sample data and are labeled separately. External chart data does not update demo valuations. CoinPaprika history/quotes retain their separate attribution.
- Hashed, single-use expiring verification/reset links; deliberate POST consumption; reset session revocation; account settings verification action; recovery UI. Requires migration 003 and email configuration.
- Unit/API tests and a browser suite wired into CI. Browser contracts mock account HTTP and TradingView script insertion. They do not verify actual third-party data or remote database health.

## Release gates still open

- Apply **003_account_tokens.sql** remotely (the user confirmed only the previous eight tables).
- Configure and test a verified mail sender; Resend API key, delivery/bounce tracking, retries for account links.
- Commit/push changes, review PR, resolve GitHub billing/check failures, deploy current code with current env. Do not treat a READY build as a working DB connection.
- Smoke-test Vercel + Neon accounts with authorized test credentials: registration, restore session, save/load/revision conflicts, verification, reset, export, and deletion.
- Confirm actual TradingView widget access, instrument availability, displayed delays, attribution and acceptable usage from a normal browser. This sandbox cannot reach TradingView/Resend/Neon hosts. Chart render was tested with a simulated embed only.
- Independent accessibility/security review, WAF/bot protection, error monitoring, retention schedule, tested Neon backup/restore.
- Organization-approved privacy policy/terms, support details, data-provider and trademark review. No invented legal entity or compliance claim.

## Not completed / not unlocked by this work

- Licensed stock quote API / synchronized real-price valuations; market-monitoring alert worker.
- Google OAuth/OIDC, MFA/passkeys, verified email changes.
- Continuous cross-device sync (current workflow is explicit cloud snapshot save/load).
- Support-agent dashboard/authorization and actual support staffing.
- Brokerage/bank/crypto custody providers, KYC/AML/product eligibility, signed provider webhooks, reconciliation and authoritative append-only ledger.
- Real recurring investments, withdrawals, live orders, tax statements or financial advice.

Do not receive real funds or advertise the demo as a licensed financial service. These items require provider agreements, business/legal decisions and operational credentials, not just UI code.
