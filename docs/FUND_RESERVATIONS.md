# Internal fund reservations — migration 008

This is an internal accounting subsystem, not a withdrawal service or execution engine. It makes no NOWPayments, Exodus, bank, blockchain or exchange calls. There is no public reserve/consume endpoint and customer money-moving controls remain disabled.

## Implemented

- Exact integer atomic units; no floating-point money or conversion between assets.
- Owner- and asset-bound reservations for a future order or withdrawal workflow.
- Total, held and unreserved accounting balances. A hold changes unreserved funds, not the total. The dashboard portfolio balance breakdown displays these separately; it does not add held funds twice or claim trading authorization.
- Append-only reservation headers and events. A reservation starts held and can end exactly once as released or consumed. No deletion or editing of its history.
- Idempotent request keys, releases and consumed-debit retries. Changed payloads or contradictory finalizations fail.
- Owner-scoped internal release/finalization. Invalid ownership, asset/network mismatch, non-positive/fractional amounts, over-reservation and mismatched custody/clearing accounts fail.
- Atomic debit finalization: the debit journal and consumed event commit together. An old journal cannot be reused as proof for a new hold. The same journal cannot consume multiple reservations.
- Customer ledger debits, including direct `ledger_post` calls and reversals, cannot bypass outstanding reservations or create an overdraft. A clawback/reversal without enough unreserved funds requires exception handling rather than silently spending another request's hold.

## Locking and transaction contract

All customer liability ledger entry inserts and reservation mutations acquire the same per-account transaction advisory lock. Availability validation is deferred until transaction commit so a debit and its consumed hold can be applied together. Reservation creation also checks availability immediately. Transactions must use READ COMMITTED; unsupported isolation levels fail closed to avoid stale-snapshot accounting. Multi-account operations can deadlock; PostgreSQL aborts one transaction. Callers must retry only the internal accounting transaction with the same idempotency keys, never resend an external payment blindly.

The migration runner now applies all numbered scripts in ONE transaction. This prevents reapplying migration 007 from publishing its older entry guard before migration 008 restores the reservation-aware guard. Apply migrations during a maintenance window, with a backup and operational review. DDL can block concurrent application writes. This repository does not provision runtime database roles or certify disaster recovery.

## Internal server API

`server/reservations.mjs` exports:

- `reserveFunds({userId,accountId,asset,units,purpose,requestKey})`
- `releaseFunds({userId,reservationId,reason})`
- `finalizeReservedDebit({userId,reservationId,postingKey,evidenceRef,counterpartId})`

These are internal functions for trusted controllers, NOT customer-supplied posting APIs. Derive user ID from the server session and account ID/asset from approved workflow records. `units` is a positive atomic-unit string. Reuse the same key and content after an uncertain response. Cancellation must use a stable reason on retries.

`finalizeReservedDebit` performs local accounting only. The caller must independently verify actual external payment/execution evidence before calling it. An evidence reference is not proof of payment and an admin clicking Approve is not proof that money was sent. This function deliberately does not debit arbitrary other customer accounts; its counterpart must be a matching business custody or clearing account.

USD and every crypto/network stay separate in the ledger even if a future valuation service combines them into one dashboard value. No USD conversion, asset pricing, collateral verification or investment yield is inferred here.

## Deployment requirement

1. Review `db/008_fund_reservations.sql` and take a database backup.
2. Pause financial writes. Use the existing private Neon `DATABASE_URL` and run `npm run db:migrate` with Node 22. The complete schema is committed atomically.
3. Expect `Applied 008_fund_reservations.sql` only after the transaction succeeds.
4. The balance API now requires `ledger_spendable_balances`. Missing migration 008 returns an unavailable balance, not a fabricated zero. Apply migration 008 before deploying this code to production.
5. Verify the new objects, enabled triggers and permissions in an isolated Neon test branch; then perform real multi-connection concurrency tests before authorizing live financial writes.

The migration and all writes in development tests use local PGlite only. Migration 008 has NOT been applied to hosted Neon by the agent.

## Still required before customer withdrawals or orders

- Authenticated, email-verified/MFA-protected request controllers, business limits and admin role separation.
- Encrypted, versioned bank/wallet destination storage, validation and change controls.
- Actual order/withdrawal request state machines, review screens, idempotent external execution, durable dispatch/outbox and independently reconciled completion evidence.
- Fees, partial fills/payouts, failed or uncertain executions, refunds, returns, exception queues, alerts and operational procedures.
- Verified settlement and pricing for deposits/conversions; real securities custody/execution for stock purchases.

Local tests cover exact amounts, replay/conflict handling, owner isolation, over-reservation, direct-journal bypass attempts, release, atomic consume, historical-journal reuse, immutability and unsupported isolation. PGlite is single-connection; these tests do not establish hosted concurrency, provider correctness, legal readiness or full money-service readiness.
