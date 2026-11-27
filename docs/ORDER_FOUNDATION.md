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
