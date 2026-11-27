# Invemon dashboard audit

Date: 2026-11-27

**Implementation update:** Goal contributions now earmark existing value without debiting cash; recurring monthly equivalents, shared risk targets, daily P&L and APY compounding have been corrected. Portfolio health no longer depends on notification preferences. Server accounts and explicit cloud simulation saves have been added for Vercel + Neon. This is a historical audit; remaining live-service blockers and current setup are tracked in `docs/VERCEL_NEON_SETUP.md`. No live-money ledger or provider integration is claimed.

## Bottom line

The dashboard is a polished, interactive product prototype—not a live investment account. Its main sections are already present: overview, portfolio, markets, crypto, income, recurring investments, goals, activity, insights, and settings. The next work should prioritize trustworthy calculations and complete workflows rather than more dashboard cards.

This review inspected the local React application, authentication and crypto services, Prisma schema, configuration, and existing browser tests. Targeted browser checks reproduced the two calculation issues below. It did not inspect deployed infrastructure, connected-app configurations, a brokerage integration, commercial contracts, or jurisdiction-specific legal requirements. No production security assessment was performed. Design and business behavior were not changed during this audit.

## 1. Confirmed correctness issues — fix first

| Priority | Finding | Evidence | Required outcome |
| --- | --- | --- | --- |
| P1 | Goal transfers reduce displayed total wealth | Browser reproduction: $24,564.00 before a $100 goal contribution; $24,464.00 afterward. `submitTrade('goal')` subtracts cash and increments `goal.saved`, while total is holdings plus cash only. | Decide whether goals are earmarks within existing assets or separate goal accounts. A transfer between owned accounts must conserve total wealth. Prevent the same assets from being counted twice. |
| P1 | Recurring investment totals ignore frequency | Browser reproduction: starting monthly total $350; adding $100/week produces $450/month. `monthlyPlan` sums raw amounts. | Use a documented monthly equivalent (e.g. weekly × 52/12; biweekly × 26/12) or an actual calendar forecast. Apply it consistently to summaries and projections. |
| P1 | Risk selections do not determine portfolio targets | `TARGET` is fixed at 40/30/10/10/10 in `DashboardPage.tsx`; signup blueprints in `auth.ts` differ even for Balanced. | Have one allocation-policy source shared by onboarding, drift analysis, recommendations, and rebalance previews. |
| P1 | Chart history is regenerated from the current balance | `buildSeries(range, total)` generates seeded synthetic history; deposits change the history scale. | Keep demo history explicitly synthetic. For trustworthy analytics, store dated valuations and cash flows, and distinguish investment return from deposits/withdrawals. |
| P1 | Rebalancing rescales holdings without a trade ledger | `applySampleRebalance` changes units and cash, retains existing unit cost, and records one zero-amount activity entry. | Preview buys/sells, cash, fees, tax implications, and resulting allocation; execute through ledger-backed transactions. |
| P2 | Daily change calculation is inconsistent with the definition of percentage change | `dayChange` applies each daily percentage directly to current position value rather than reconstructing prior value. | Define daily P&L precisely; account for prior prices, trades, and cash flows. Test against known cases. |
| P2 | APY presentation and cash-interest calculation are inconsistent | Constant 4.65% is presented as APY, while monthly interest is calculated as annual interest / 12. `simulateCashInterest` imposes at least $0.50. | Keep simulation tools clearly labeled; remove invented minimum earnings and use documented accrual assumptions. Live rates require a provider and effective dates. |
| P2 | Turning off notifications can imply a healthy portfolio | `nextStep` falls back to “Your portfolio is aligned with targets” when the notifications array is empty, including when reminders are disabled. | Calculate portfolio health independently of notification delivery preferences. |

## 2. Missing investor-facing workflows

### Account readiness and verification

- Account setup checklist: email verification, identity checks, address, required tax residency information, account agreements, funding readiness.
- Clear review states: not started, needs information, in review, approved, rejected, and restricted.
- Country- and product-specific eligibility. Selecting a country in a form is not approval to trade there.
- A useful restricted-account experience: explain what remains available and what is needed next.

### Funding and cash

- Linked bank accounts or supported payment methods, ownership verification, and bank removal.
- Deposit/withdrawal review screens with destination, currency, fees, estimated availability, and confirmation identifiers.
- Pending, processing, failed, returned, cancelled, and completed transfer states.
- Separate total cash, buying power, unsettled proceeds, reserved amounts, and withdrawable cash.
- Transfer history and a useful transaction-details view. Current activity is a short local record.

### Orders and holdings

- Dedicated orders page: open, partially filled, filled, rejected, cancelled, and expired orders.
- Order review before submission, not immediate execution on confirmation of a dollar amount alone.
- Market/limit support as allowed by the eventual broker; time-in-force, exchange session, quantity, estimated fees, and quote timestamp.
- Order detail, execution breakdown, cancellation, and replacement where supported.
- Realized versus unrealized P&L, tax lots/cost-basis details, dividends, and corporate actions.
- Brokerage/custody integration. Current buys and sells only modify browser records.

### Research and alerts

- Licensed stock/ETF/bond quotes and historical prices; existing non-crypto prices are seeded samples.
- Clear quote source, timestamp, exchange, market-hours status, and delayed/stale indicators.
- Price-alert evaluation and delivery. Current reminders can be saved, but no threshold-monitoring engine or delivery service is wired in.
- Recurring-plan execution, failure recovery, next execution date, holiday/timezone handling, and per-plan execution history.
- Useful company/fund details such as exchange/currency, fund fees, distributions, and risk context, according to provider coverage.
- News and educational context are useful later, but are not a substitute for the missing transaction flows.

### Goals and account settings

- Edit full goal details and risk settings in place, rather than limited contribution changes or routing back through signup.
- Define how goal savings map to actual account assets and how saved amounts can be transferred back.
- Confirm or undo destructive actions: deleting goals/plans and restoring sample data currently happen immediately.
- Profile editing, verified email changes, password changes, real MFA enrollment/recovery, passkey management, active-session/device list, session revocation, and account closure.
- A document center: agreements, statements, confirmations, and jurisdiction-appropriate tax documents. The existing activity CSV is not a tax statement.

### International investing

- Separate country of residence, tax residency, legal account jurisdiction, account currency, instrument trading currency, and display currency.
- FX quote, conversion spread/fees, conversion history, and exchange-rate attribution of returns where supported.
- Localized dates, numbers, timezones, and exchange holidays.
- Tax documentation and withholding workflows appropriate to the selected legal/brokerage model.
- Product eligibility and disclosures by country; do not infer worldwide availability from regional browsing imagery.

## 3. Production launch blockers

### Authentication and authorization

Current auth records and sessions are localStorage entries. Password hashing is client-side SHA-256 with a fixed prefix, with an FNV fallback. OTP and recovery codes are constants. Passkey sign-in is a timed simulation. Google credentials are decoded in the browser rather than verified by an application backend. The remember-device checkbox is not tied to a 30-day server session policy.

Required: managed identity or a properly secured authentication service; real email verification/recovery and MFA/passkeys; verified provider tokens; enforced session lifetime/revocation; rate limits; and server-side authorization for every account operation. Do not repurpose the current auth simulation for real financial accounts.

### Server-owned financial records

There is no wired application backend in the checkout. The Prisma file is a scaffold; package dependencies/scripts do not establish a running Prisma-backed service. Browser state can be edited and cannot serve as an authoritative balance or transaction record.

Required: persistent accounts, an immutable double-entry or equivalent reconciled ledger, exact decimal arithmetic, atomic transactions, idempotent mutation requests, an order/funding state machine, provider webhooks with signature checks, reconciliation, audit logs, and least-privilege access. UI state must not be trusted as authorization or financial truth.

The schema also lacks dedicated recurring-plan, price-alert, preference, linked-bank, document, and execution-history models. UI features need corresponding backend entities, not just copied localStorage JSON.

### Brokerage, custody, compliance, and support

Choose the operating model and providers first. Confirm applicable licensing/registration, investor verification, AML/sanctions controls, custody disclosures, suitability or appropriateness obligations, complaints handling, privacy/retention rules, and country/product restrictions with qualified specialists. Requirements vary by jurisdiction and product.

Live funding/trading controls must remain unavailable until the required integrations and approvals exist. A disclaimer alone does not make a financial workflow production-ready.

### Data and operational resilience

- Licensed market-data plan and server-side data proxy; the current README identifies limitations of the keyless CoinPaprika evaluation feed.
- Provider-outage, stale-data, retry, duplicate-webhook, and reconciliation handling.
- Error tracking, structured logs, service monitoring, alerting, backup/restore drills, and incident-response procedures.
- Separate demo/test/live environments, controlled deployment migrations, and secure secret management.
- Support requests with identifiers, status, and a real response channel; current dialogs are not a customer-service system.

## 4. UX, accessibility, and maintainability gaps

- Dashboard sections use component state, not section-specific URLs. Refresh returns to overview; browser back does not navigate dashboard sections.
- Asset, transaction, and order details need durable URLs where appropriate.
- Loading, retry, empty, and permission-denied states should cover every backend-connected area—not only crypto.
- Financial terms need explanations: buying power, cost basis, DRIP, alpha, unsettled funds, and allocation drift.
- The dashboard chart has keyboard inspection now, but a full screen-reader, focus-management, touch-target, reduced-motion, and color-contrast audit is still needed. Passing viewport checks does not establish accessibility conformance.
- Privacy mode masks many overview values, but is not a security boundary. Review dialogs, tooltips, exports, and notification content for intentional disclosure behavior.
- `DashboardPage.tsx` remains roughly 2,500 lines and mixes accounting, state, simulated services, and UI. Extract domain logic and route-level sections before adding production integrations.
- The new visual system relies on a sizeable override stylesheet; consolidate design tokens and shared components rather than stacking more overrides.
- No unit-test runner or CI workflow is configured in the checkout. Browser smoke tests exist, but do not verify financial correctness.
- README/environment examples describe stale design/features and technologies not wired into the current Vite app. Update them before onboarding other developers.
- Confirm commercial rights for the retained template assets and branding before publishing; the README already flags this requirement.

## 5. Recommended implementation order

### Phase A — make the demo internally trustworthy

1. Resolve goal-accounting semantics and fix wealth conservation.
2. Normalize recurring-plan frequencies and use them consistently in summaries/projections.
3. Unify allocation targets with the selected risk policy.
4. Separate cash-flow changes from portfolio-performance history.
5. Fix health-message fallback and rate-calculation assumptions.
6. Add review steps, transaction details, and confirmations/undo for destructive actions.
7. Add unit tests for accounting and calculation invariants alongside the browser suite.

Acceptance examples: a $100 internal transfer leaves total wealth unchanged; $100/week is not reported as $100/month; a conservative profile does not silently use balanced targets; disabling notifications does not change portfolio-health conclusions.

### Phase B — complete the investor experience

1. Account-readiness/KYC status center and contextual restrictions.
2. Linked funding methods, cash breakdown, and transfer-state views.
3. Order center, review screens, and execution details.
4. Profile/security center and documents area.
5. Durable dashboard navigation, fuller accessibility checks, and clear recovery/empty states.

### Phase C — connect a production operating model

Select regulated partners and country scope; implement real identity, server-owned records and authorization; integrate funding, orders, market data, and reconciliation; then test and operationalize. Add international currencies and markets only when the corresponding account/product eligibility and providers support them.

## Existing foundation worth keeping

The visual identity, responsive layout, portfolio overview, quick actions, holdings filtering, allocation views, goals, manually simulated recurring plans, crypto research UI, search palette, notification center, and activity export are useful foundations. Preserve these while replacing the underlying simulated services and correcting the domain logic.
