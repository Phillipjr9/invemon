# Customer page inventory

Checked on branch arena/74f677d2-invemon after deposit-page restoration. Local source comparison and HTTP-mocked browser checks, not a deployed-site audit.

## Present and reachable

| Page | Route | Current scope |
| --- | --- | --- |
| Home | empty hash | Marketing, FAQ, navigation and footer |
| Register / sign in | #signup / #login | Server auth, including MFA challenge |
| Password reset / verification | #reset / #verify | Existing token-based account-link flows |
| Overview | #dashboard | Restored rich shell, real balance lookup and empty/unavailable analytics |
| Portfolio | #dashboard?section=portfolio | Exact owner-scoped ledger asset balances, holds and unreserved funds; not brokerage positions |
| Markets | #dashboard?section=markets | Searchable stocks/funds directory and opt-in charts |
| Crypto | #dashboard?section=crypto | Catalogue, details and browser watchlist; no trading |
| Activity | #dashboard?section=activity | Posted accounting journals, pagination and loaded-record export |
| Settings | #dashboard?section=settings | Profile, security, notifications, appearance, data/privacy |
| Deposit | #deposit or #funding | Restored method/amount UI and recorded payment history; collection disabled |
| Support | #support | Customer threads and server-authorized staff workspace |

Found and fixed: Home's FAQ/footer support actions opened a generic account-settings modal instead of Support. Both now navigate to #support. Removed the no-longer-used modal path.

## Restored page layouts; server-backed features remain unavailable

| Section | Current state | Missing |
| --- | --- | --- |
| Yield & Income | Income hero, four metric cards, period selector, income history/calendar/source panels | Income history, dividend calendar, verified yield product and controls |
| Auto-invest | Contribution metrics, recurring-plan workspace, schedule and run-history panels | Plan creation/management, server schedules, execution and run history |
| Goals | Goals overview, target/savings metrics, goal list, contribution and progress panels | Create/edit goals, server persistence, genuine progress tracking |
| Insights | Analysis metrics, drift/rebalancing, allocation breakdown and review panels | Real allocation/risk/performance analysis |

All four are reachable from the workspace sidebar/mobile More menu and survive deep-link reload. Their fuller page layouts are restored without the old generated figures, APY claims, scores, sample goals or local-money actions. Missing values display unavailable dashes, not invented zeros. Create goal/New DCA plan controls are explicitly disabled until server storage/execution is connected. Income period selection and links to existing account pages work. These layouts are not completed server-backed financial features. Restoring the legacy DashboardPage wholesale would restore browser-generated money, illustrative returns and simulated actions, so it remains disconnected.

## Not implemented as customer pages/workflows

- Withdrawals and saved bank/wallet destinations.
- Admin payout review, completion evidence and reconciliation workflows.
- Buy/sell/swap orders and order history.
- Statements/tax documents and durable financial-notification inbox.
- Full portfolio analytics and reconciled investment-position detail.

These require real server-backed workflows, not navigation aliases. No previously existing Privacy/Terms document pages were found in the active router or page-file inventory; this check does not invent legal documents.

## Intentionally disconnected legacy files

DashboardPage.tsx is the old simulated workspace. LoginPage.tsx/SignupPage.tsx are superseded by ServerAuthPage.tsx. EmailStudio.tsx is a preview tool, not a customer account page; #emails explicitly says so. Their existence on disk does not mean customers should be routed into them.

## Validation

Five existing browser suites pass with HTTP mocks. Added explicit navigation, deep-link reload and 320/1440px overflow checks for Yield, Auto-invest, Goals and Insights, plus a home-footer Support routing regression. Existing suites cover account access, recovery/verification, support, MFA, settings, portfolio/activity, markets, crypto and deposit. TypeScript, production build and diff whitespace checks pass. No live deployment or external provider validation was performed.

Restored layouts additionally verified with four metric/three content panel assertions on each page, income-period selection, disabled unsupported creation controls, reload and both themes at 320/1440px.

## Finance admin follow-up

`#admin` now provides a server-restricted finance review console: withdrawal-purpose reservation queue, reviewing/approved/rejected decisions, append-only internal notes, atomic rejection/release, exact customer balance lookup and support link. Requires private FUNDING_ADMIN_IDS, verified email, MFA-verified session and fresh password for writes. This is not yet a complete payout system: customer request submission, saved destinations, payment execution/completion verification and customer status integration remain outstanding. See ADMIN_SYSTEM.md. Migration 009 is required before deployment; not applied to hosted Neon.

## Customer withdrawals follow-up

`#withdrawals` now contains encrypted saved ACH/wire/crypto destinations, default-disabled request submission with exact fund holds, eligible cancellation and owner-only review-status history. Accessible from dashboard footer, Activity and Deposit. Admin queue links destination metadata through immutable request records. Requires migration 010 and private encryption configuration; no hosted rollout or enablement occurred. This supersedes the earlier missing-customer-request entry. Full payment execution/completion, destination verification, operator reveal, notifications and unified activity feed remain incomplete. See CUSTOMER_WITHDRAWALS.md.
