# Customer withdrawal requests and destinations

Route `#withdrawals`, linked from the dashboard footer, ledger activity and Deposit page. API `/api/withdrawals`. Migration **010_customer_withdrawals.sql** required, together with migrations 008 and 009. This work has not migrated hosted Neon, changed deployment settings, enabled submissions or sent a payment.

## What is implemented

- Owner-scoped saved destinations for US ACH, US domestic wire, and crypto asset/network pairs present in ledger_assets. UI offers the customer's recorded ledger assets only. USD bank destinations require USD:BANK. Crypto addresses have basic lexical checks only, not full blockchain validation.
- Bank routing-number checksum, account type and length checks. These checks are not bank ownership, ACH eligibility, sanctions or address verification.
- AES-256-GCM encryption of sensitive bank/wallet details with owner UUID and immutable destination UUID authenticated as associated data. API reads return only labels, asset/network and masked identifiers, never plaintext or ciphertext.
- Immutable destination versions. Saving changed details creates a new ID; existing requests keep their original version. Deletion/editing/archive and key rotation tooling are not implemented.
- Withdrawal request creation atomically inserts a request and holds the exact customer/asset units. Uses decimal strings and BigInt conversion with no rounding or cross-asset conversion.
- Request keys cover owner, balance account, asset, units and destination. Replays return the original reservation; changed contents conflict. API never takes a client-supplied customer ID or posting account.
- UI keeps a stable key and locks request details after an attempted submission; retrying an uncertain response uses that same key. Password clears after attempts. Keys/details are held only in memory, not persisted across reloads; check server history after reload before submitting again. No claim of cross-device duplicate-intent detection.
- Customer cancellation is owner-only and idempotent. Held pending/reviewing requests can be cancelled. Approved/rejected/consumed requests cannot. Admin and customer state changes lock the same reservation header, with fund-release guards protecting the shared account. Cancelling does not create a debit.
- Customer history shows pending review, under review, approved/awaiting payment, rejected, cancelled or accounting debit recorded. Internal admin notes are not exposed. Current history is bounded to the latest 100 requests; it is not a full statement or notification service.
- Admin queue now includes immutable masked destination labels/methods. No full destination reveal endpoint exists, and no external payment/completion is enabled.

## Private settings and rollout

- `WITHDRAWAL_ENCRYPTION_KEY`: a NEW independent 32-byte key represented by 64 hexadecimal characters. Provision through your private environment manager. Do not reuse/overwrite MFA_ENCRYPTION_KEY. Do not put keys in VITE_ variables or chat.
- Back up this key separately from encrypted data and tightly restrict access. Losing it loses access to saved bank/wallet details. There is no automatic key rotation/migration yet; do not silently replace it.
- `WITHDRAWALS_ENABLED`: absent/false by default. Only the exact string `true` permits new withdrawal requests, and destination encryption must also be configured. Turning it off still permits authenticated history and eligible cancellations. Destination saving is independently allowed when encryption and authentication requirements are satisfied.
- Changes require verified email, enrolled MFA, an MFA-verified session, correct origin and current password. Reads are session-bound. Both reads and writes are rate-limited.
- Apply all migrations atomically with `npm run db:migrate` before deploying the new API/admin queue. Review database role grants, backup/restore and multi-connection race handling in an isolated hosted test environment.

Do **not** enable live request submission just because the flag exists. This is internal request/hold bookkeeping, not production payout authorization. Remaining gates include operational liquidity/asset coverage, bank/wallet ownership and network-specific validation, jurisdiction/eligibility checks, per-request/daily limits and holds after destination changes, fee/payment terms, maker/checker controls, independent evidence verification, reconciliation/exception handling, key custody/recovery procedures and hosted concurrency verification.

## Deliberately not implemented

Payment dispatch, destination reveal to payout staff, blockchain/bank verification, completion evidence, returns/refunds, fees, partial payouts, customer notifications, comprehensive activity feed integration, admin full request detail/pagination, and automated provider calls. Approval keeps money held; it is not evidence that a payment occurred. No stock/swap/yield or deposit/provider settings were changed. Customer history links are added to Activity; pending requests are not fabricated as posted ledger transactions.

## Validation

Eight local PGlite/API tests exercise owner isolation, email/MFA/password/origin enforcement, authenticated encryption owner/version binding, routing validation, exact amounts, default-disabled gate, atomic request/replay/conflict, overspend prevention, cancellation, admin/cancellation conflicts, private-note omission, destination mismatch and immutable rows. Browser HTTP mocks exercise destination field clearing, disabled submission, stable-key uncertain-response retry, cancellation and light/dark 320–1440px layouts. These tests do not validate real banking, crypto addresses, provider uptime or multi-connection PostgreSQL concurrency.
