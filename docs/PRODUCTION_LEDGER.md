# Production ledger — migration 007

## Implemented accounting layer

`db/007_production_ledger.sql` creates a separate, initially empty production journal. No balances, users, assets or accounts are seeded and no sandbox records are imported. `server/ledger.mjs` is an internal server adapter, not a public posting endpoint. Adding NOWPayments credentials cannot call it or enable deposits.

- `ledger_assets`: explicit currency/network identifier and fixed atomic precision (e.g. the operator must distinguish tokens on different networks). Immutable after creation.
- `ledger_accounts`: asset-bound custody, customer liability, fee and clearing accounts. Customer accounts require an existing server user; only one liability account per user/asset. Account ownership cannot be reassigned.
- `ledger_journals` / `ledger_entries`: append-only evidence-bearing double-entry journals. Atomic amounts are signed integer strings, never JavaScript floating-point values. Every asset must independently sum to zero. This is not an FX pricing engine.
- Deferred database constraints check balance and correspondence between the evidence envelope and the actual entries at commit. Failed postings roll back the whole statement.
- Posting keys serialize through a transaction advisory lock. An identical retry returns its original journal ID; changed contents fail. A unique evidence reference additionally rejects the same event under a different posting key.
- Update, delete, truncate and appending to a committed journal are blocked. Corrections use another journal. A linked reversal must exactly negate the original account/asset totals, and each original can have only one linked reversal. Reversal events need their own unique evidence reference.
- `ledger_account_balances` computes balances from entries instead of maintaining mutable cached amounts. Positive means debit; customer liabilities are credit-normal (negative). These are accounting balances, not spendable purchasing power.

## Posting contract

Only a trusted internal reconciler may call `postJournal({postingKey,evidenceRef,lines,reverses})`. Each line is `{accountId,asset,units}`; `units` is a nonzero signed integer string. Use `decimalToUnits` to parse an exact nonnegative decimal at a known asset precision; it rejects excess precision rather than rounding.

A reconciler must derive a canonical unique economic-event reference from independently verified evidence, not take keys, account IDs, asset identifiers or amounts from a customer request. Multiple callbacks for one settlement MUST resolve to the same event reference. Merely receiving a signed callback, or a provider saying `finished`, is not permission to credit a balance. Do not post a USD liability against BTC custody: conversions require balanced entries in each asset and explicit clearing/FX accounting.

The evidence reference is a pointer, not the evidence itself. Durable raw provider/bank evidence, verified settlement quantities and fees, finality policy, lifecycle reconciliation, operator review and notifications still need implementation. The journal does not validate external truth or enforce spend/withdrawal limits. There is deliberately no public write API, manual customer credit action, or provider connection in this change.

## Apply to Neon

1. Back up the database and review migration 007. Use the existing Neon database, not a replacement database service.
2. Set server-only `DATABASE_URL` in the operator's shell or private `.env`; never paste it in chat or use a `VITE_` variable.
3. Run `npm run db:migrate` from the repository. The runner applies all numbered migrations in order in one atomic transaction. It now preserves quoted PostgreSQL function bodies. Reapplication is tested locally.
4. Verify the ledger tables exist and are empty before wiring any live service. No migration has been applied to the hosted database by this change.
5. Restrict database credentials. PUBLIC receives no table or posting-function grants. The existing database owner can post and, like any PostgreSQL owner, can disable triggers; database-owner credentials must remain server-only and inaccessible to customers. Configure and verify least-privilege runtime/operator roles, backups, monitoring and audit retention before acceptance. This migration does not provision those roles.

Do not expose the balance view to clients directly: it includes all accounts. Any later balance API must derive owner identity from a server session, enforce tenant isolation, and separately distinguish held/accounting/available funds.

## Validation and remaining gate

`npm run test:ledger` uses PGlite to test exact precision beyond JavaScript's safe integer range, idempotency/conflicts, evidence deduplication, malformed/unknown/mismatched account lines, cross-asset imbalance, atomic rollback, mutation/extension protection and exact single reversals. The migration-runner test applies all migrations twice. These are local database tests, not hosted Neon multi-connection concurrency, disaster-recovery or live-provider certification.

Production deposits remain disabled pending independently verified provider settlement reconciliation and the remaining operational requirements in `PRODUCTION_FUNDING_TRANSITION.md`. No real invoice or transfer was created while developing this ledger.

## Reservation-aware follow-up
Migration 008 adds customer fund reservations and a shared-lock, no-overdraft constraint for customer debits. The balance API now requires migration 008. See `FUND_RESERVATIONS.md` for the internal-only contract, migration instructions and remaining request/execution workflow requirements.
