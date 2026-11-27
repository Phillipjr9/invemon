# Order foundation — not live trading

Migration **013_order_foundation.sql** adds internal immutable execution quotes, queued orders and cancellation history. Portfolio now has the buy/sell/swap ticket and order-history layout. The existing header Trade action opens Portfolio. All routes remain inside the one Vercel function.

## Implemented

- Quote contract distinguishes crypto_buy, crypto_sell, crypto_swap and stock_buy, exact source atomic units, source fee atomic units, quoted target quantity/decimals, source account/asset, expiry and unique provider quote reference.
- Quote creation is internal database work only. There is no customer/admin quote-creation API and no production quote/instrument/fill seed. Trusted future adapters must derive the source account from the verified customer and validate instruments, networks, eligibility, fee terms and executable liquidity.
- Internal `accept_execution_quote(id,user,quote,requestKey)` serializes acceptance, checks ownership/expiry, reserves source plus source-denominated fee and writes one queued order/event/audit atomically. Stable request keys replay the original order; changed quote payloads conflict. Each quote can be accepted only once.
- Internal `cancel_execution_order(order,user)` locks the same reservation header, releases held funds and appends cancellation/audit atomically. It is owner-scoped and idempotent. This foundation has no dispatched state; cancellation is valid ONLY because no dispatcher exists. Before introducing a worker, extend the state machine and synchronize dispatch/cancel on the same row lock. Never use this cancellation path unchanged for an externally submitted order.
- Immutable quotes/order headers/history; no fill state and no balance/position posting from acceptance. Quoted receiving quantity is never treated as a holding. No API accepts client-created prices, execution evidence or fake fill flags.
- GET `/api/orders` returns latest 100 owned orders and source-account availability, omitting internal provider references. POST cancel requires verified email, MFA-verified session and current password. Auth/origin/body/rate guards apply.
- POST quote validates operation and request shape, then returns explicit 503 unavailable. POST accept always returns unavailable. There is deliberately NO environment-only switch to bypass missing execution infrastructure.
- Ticket has all four operation choices, source-asset picker, receive symbol/network field, source amount and disabled quote action. Latest-order history distinguishes queued/cancelled from fills, discloses quoted source fee and masks amounts with dashboard privacy. Existing accounting balances stay separate.

## Still required for automatic trading

This is a tested order bookkeeping contract, NOT a completed execution engine. Missing: supported instrument catalogue/security identifiers; live quote adapters; customer eligibility/limits; signed/approved fee terms; business inventory/collateral validation; durable dispatch/outbox; provider idempotency; unknown-result recovery; acknowledgements/cancel reconciliation; partial/full fills; two-sided accounting and actual custody-backed positions; settlement; trade confirmations; notifications/order-event feed integration; monitoring and operational recovery. No execution adapter, automatic buy/sell/swap, real stock purchase, valuation, returns or tax documents are supplied by this migration.

Do not populate production quotes by copying displayed market prices, marking quotes as executable, or using customer input as provider evidence. Database target quantities alone establish no ownership. Provider/broker/custody arrangements remain separate dependencies; none was chosen or configured here. Crypto/ACH/wire withdrawals remain manual and separate, with earlier completion controls unfinished.

## Deployment and tests

Apply numbered migrations through 013 before deploying. No hosted migrations/settings/deployment were performed here. Existing tables/views and money-service gates are unchanged. Old clients can still read their existing accounting records; `/api/orders` requires the new tables.

Five local PGlite/API tests cover disabled public execution, no environment bypass, exact fee-inclusive reservation, retry conflicts, expired/foreign/mismatched quotes, overspending rollback, owner/password cancellation, immutable records and no fake journal/fill creation. Existing router test verifies one deployed function and protected order reads. HTTP-mocked browser suite checks ticket options, disabled quotes and 320–1440px layout. Hosted multi-connection races and real provider behavior remain untested.

## Durable dispatch follow-up — migration 014

Internal `server/order-dispatch.mjs` now implements dispatch/reconciliation orchestration for trusted adapter objects. No adapter is registered, scheduled worker added or public dispatch/ack endpoint exposed. Quotes/submission remain disabled.

`claim_execution_dispatch` locks the same reservation header as cancellation, checks provider identity/current hold/quote expiry and commits an immutable dispatch intent with the order UUID as stable execution key. Only the first claimant may submit. Once an intent exists, local cancellation cannot release funds. A process crash before/after the external call leaves a dispatch-pending record for reconciliation, NOT an automatically retryable job.

`dispatchOrder` calls a supplied trusted adapter's submit method once and records a submitted acknowledgement or an uncertain outcome. Submit exceptions and malformed acknowledgements keep funds held. Provider errors are not returned to customers. `reconcileOrderDispatch` performs a lookup with the same key; a not-found result remains unresolved rather than retrying submission or releasing money. Provider acknowledgements cannot conflict or be downgraded by a late uncertain event. Provider reference uniqueness is provider-scoped.

Submitted means acknowledgement, NOT a fill. No holdings, ledger debits/credits or returns are created. Customer order history distinguishes queued/cancelled/dispatch-pending/uncertain/submitted and removes cancellation for dispatch-initiated records.

Migration 014 supersedes migration 013's cancellation implementation and is required before deploying the updated order-status query. The full migration runner publishes the numbered schema atomically, preventing temporary publication of the old cancellation guard.

This is a conservative dispatch-intent/recovery contract, not a complete outbox worker. Still missing: real adapter eligibility/quote/expiry validation, provider-side idempotency, lookup guarantees, scheduled worker/reconciliation queues, operator tooling, cancellation-at-provider, proven rejection handling and release, fill/partial-fill reconciliation, two-sided settlement accounting, custody-backed positions, provider security/reliability review and operational authorization. Until those exist, do not enable quote acceptance or use this module to send real orders. Funds can remain held indefinitely on unresolved outcomes; operational recovery must be implemented first.

Six additional local tests cover stable-key one-time submission, timeout/lookup recovery, crash-after-claim handling, dispatch-versus-cancel ordering, provider mismatch, conflicting/late acknowledgements, immutable records and no public dispatch or fabricated fills. Adapters in tests are local test doubles only. Tests do not establish multi-connection correctness or real-provider exactly-once execution.
