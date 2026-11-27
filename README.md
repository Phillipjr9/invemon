# Invemon

A React 19 / TypeScript / Vite investment **simulation**, with forest/paper light and dark themes, responsive portfolio tools, bank/crypto demo funding, and an optional Neon-backed account service deployed as Vercel Node functions.

**No real trades, deposits, withdrawals, custody, or investment returns are provided.** Creating a server account does not create a brokerage account.

## Local development

Requires Node 22.

```sh
npm ci
npm run dev          # browser demo when VITE_ACCOUNT_MODE is unset
npm test             # accounting + API/PostgreSQL-engine tests
npx tsc --noEmit
npm run build
```

`npm run preview` serves static build output only; it does not execute `/api` functions. Production builds default to server accounts. For a static-only demo build, explicitly use `VITE_ACCOUNT_MODE=demo npm run build`. For server-account development, use Vercel CLI with your local environment configured.

## Deploy with Neon + Vercel

Read **[docs/VERCEL_NEON_SETUP.md](docs/VERCEL_NEON_SETUP.md)** for migration, environment variables, deployment, smoke tests, security limitations, and the outstanding live-service checklist.

1. Create an isolated Neon database/branch.
2. Set server-only `DATABASE_URL` and exact `APP_ORIGIN`; set public build variable `VITE_ACCOUNT_MODE=server`.
3. Run `npm run db:migrate` from your environment with the connection configured.
4. Import this repository into Vercel (Vite, Node 22, output `dist`). Deploy the API directory too—not just the static output.

Never expose database credentials in a `VITE_` variable or commit `.env` files. The historical Prisma schema is not used by the new APIs; `db/001_accounts.sql` is the initial runtime schema.

## Account capabilities

Server accounts support password registration/login, HttpOnly cookie sessions, profile/risk edits, password changes, session revocation, exports, password-confirmed account deletion, support-request storage, transactional email notifications, and explicit revision-checked cloud save/load of simulation data. Passwords are derived on the server using scrypt. Owner-scoped API access is required for cloud data.

Single-use email verification and password recovery are implemented but require migration `003_account_tokens.sql`, a verified sender, and configured Resend delivery. MFA, social login/passkeys, support-agent tooling and live financial providers are **not enabled**. Account email delivery is implemented through Resend but requires a verified sending domain and server-side configuration; see [email setup](docs/EMAIL_NOTIFICATIONS.md). The older browser-only account flows are UI demonstrations and are not used for production server authentication. Existing local demo users are not silently migrated into server accounts.

## Demo features

- Homepage, regional market tabs, restored photography and phone artwork, signup/login, and responsive dashboard.
- Portfolio, watchlists, synthetic charts, buy/sell/swap review → processing → receipts.
- ACH/domestic wire/SWIFT demo methods and BTC/ETH/USDC/USDT/XRP compatible-network flows; no usable bank routing or deposit wallet instructions.
- Goals are earmarks of existing value, not extra assets or cash transfers. Weekly/biweekly plans use 52/12 and 26/12 monthly equivalents. Risk targets share the onboarding policy.
- Device-local appearance preference, browser workspace storage, and optional explicit cloud demo save/load. Cloud snapshots are user-editable simulations, not a financial ledger.

## Tests

`npm test` also tests email templates, queue ownership, opt-outs, provider retries, idempotency, expiry and worker authorization without sending real emails. `npm run emails:preview` generates six fictional HTML/plain-text specimens for `/#emails`.

`npm test` runs accounting unit tests and API integration tests using PGlite's PostgreSQL engine and a mocked Neon transport. Tests cover origin/method checks, password derivation, session cookies, owner isolation, revision conflicts, profile allowlisting, support/export, password revocation, deletion and throttling. Remote Neon/Vercel connectivity must be smoke-tested after configuration.

Browser scripts in `scripts/verify-*.mjs` use Playwright. `verify-server-accounts.mjs` expects a Vite server built with `VITE_ACCOUNT_MODE=server` on port 5174 and uses mocked HTTP responses; the other scripts expect browser demo mode on port 5173. Set `CHROMIUM_EXECUTABLE_PATH`, `TEST_BASE_URL` or `SERVER_TEST_BASE_URL` as appropriate. `scripts/generate-dark-theme.mjs` regenerates scoped palette overrides when base CSS colors change.

## Market data and asset rights

The crypto directory reads the CoinPaprika-compatible public API. Availability, rate limits, history and commercial licensing depend on the provider. Obtain appropriate production data rights and proxy paid credentials server-side; never bundle paid keys into client code. Asset listings do not imply trading availability. Non-crypto prices and performance remain samples.

Design reference: https://templates.studioniskala.com/invemon/template-kit/home/

Original template: https://themeforest.net/item/invemon-mobile-apps-trading-investment-website-elementor-template-kit/59412221

Confirm rights to reference imagery, branding and fonts or replace them before commercial use.


## Market charts and launch readiness

Asset details offer an opt-in TradingView market chart with explicit listing/pair mapping.
Sample portfolio returns and reference quotes are not live valuations. No stock quote API
or live trade execution is enabled by embedding a chart. See
[launch checklist](docs/LAUNCH_READINESS.md) and [account links](docs/ACCOUNT_LINKS.md).

`npm run test:browser` starts isolated demo/server-mode Vite instances and runs browser
contracts, chart failure paths, asset-image coverage, and responsive dashboard checks.
Install the browser with `npx playwright install chromium` first. API and provider HTTP
are mocked in browser contracts; this does not establish production service health.
