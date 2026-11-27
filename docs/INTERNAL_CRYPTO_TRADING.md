# Internal inventory-backed crypto trading

This is a separate transaction model from the optional external-execution foundation. The customer Portfolio ticket now uses `/api/inventory-trading`, not provider execution. No exchange, brokerage, market-price or blockchain call occurs during quote/confirmation. NOWPayments and manual withdrawal settings were not changed.

## Implemented

Migration **016_internal_inventory.sql** adds:

- Explicit dealer_assets allowlist: USD:BANK cash and business-approved crypto/network asset codes. There is no stock/security asset kind. Operators must only classify actual supported crypto; this declaration is not external verification.
- Business-only registered clearing accounts, with credit-normal inventory (`-debit_units`). Register new empty accounts BEFORE funding. No seeded assets, balances, liquidity or prices.
- Directed pairs with mapped inventories, rational atomic-unit exchange rate, source-denominated fee basis points, source limits, validity deadline and enable/disable switch. Buy and sell require separately configured directions. Crypto swaps use direct directed pairs, not invented USD conversions.
- Immutable owner-bound 30-second quotes (capped by policy validity) with exact source/fee/receiving quantities. Source fees round UP; receiving units round DOWN. Rational rate is target atomic units per source atomic unit, NOT human-unit USD price; configure with the respective asset decimals.
- One atomic four-line internal exchange: debit customer source including fee, credit business source inventory, debit business target inventory, credit customer target. Each asset balances independently. Fees are retained in source inventory and separately recorded on the trade quote; separate revenue recognition/reporting is not implemented.
- Quote ID is the confirmation idempotency key. Replay returns the same journal even after original expiry; no duplicate trade. Different quotes are separate trade intents, so customers must inspect history after an uncertain response before requesting/confirming a different quote.
- Accept rechecks policy availability/expiry, customer unreserved funds and dealer receiving-asset inventory under transaction locks. Existing customer holds remain protected. A deferred inventory guard also prevents mapped inventory from going negative via other ledger postings/reversals.
- Target customer ledger account may be created with ZERO balance when requesting a quote. Account creation is not funding or ownership of an asset; only a completed journal credits it.
- GET: configured current pairs and latest 100 own completed trades. No other customer records or custody details returned. Quote creation is authenticated/rate-limited; confirmation additionally requires verified email, MFA-verified session, current password and valid origin.
- Portfolio UI discloses source, fee, total debit, receiving asset/network, expiry and internal nature before confirmation. Balances refresh after completion. Amount privacy and responsive light/dark layouts are preserved. Journal changes also appear in existing accounting activity/inbox.

## Configuration and rollout

The private `INTERNAL_TRADING_ENABLED` flag defaults OFF. No production flag was changed. This is NOT a license, custody verification or reserve attestation.

Before enabling: take backup, review and apply all numbered migrations through 016, verify runtime DB permissions, approve business eligibility and customer terms, register actual supported ledger assets and dealer asset classifications, create/register new business inventory accounts, independently verify actual business-owned funds, post reconciled opening inventory using the existing immutable ledger with unique external evidence, and configure the directed pair inventories/rate/fees/limits/expiry. Customer funds must likewise originate from verified ledger credits. Do not use customer assets as invented business inventory, do not seed demonstration credits in production, and do not reuse deposit evidence to claim assets twice.

Migration 017 adds an admin pricing editor, empty-inventory registration, read-only inventory balances and unverified evidence notes (see below). Asset approval and actual funding still require trusted operational database work with review; there is no inventory-verification service. There is no customer balance editor or public liquidity-credit endpoint. Rates are business-defined and explicitly NOT advertised as market quotes or best execution. No automatic refresh is inferred when a pricing policy expires.

Operations must review wallet/bank liquidity, inventory ownership/collateral, redemption ability, relevant legal requirements, fees/disclosures, spread/risk controls, source limits, sanctions/eligibility, monitoring and accounting treatment. Account ledger balances alone do not prove funds exist externally. Complete hosted multi-connection tests before enabling real customer writes. Shared customer/dealer locks can deadlock with unrelated financial transactions; PostgreSQL aborts one. Retry only the same quote after inspecting outcome; never issue a new external action blindly.

## Boundaries

No real stocks are offered. No shares are created by this path. No automatic provider connection is required or added. Existing external-execution code remains disconnected with an empty adapter registry/public submission disabled; this ticket does not call it. Crypto/ACH/wire withdrawals are separate manual-admin workflows and still lack full independently verified completion controls. Deposit reconciliation remains a separate prerequisite; unchanged NOWPayments setup does not automatically create verified credits.

No automated funding/verification workflow, reserve attestation, automated bank/blockchain checks, live multi-currency valuation, comprehensive statements, tax reporting or insurance guarantee is provided. The production rollout and actual funding are not completed by this code change.

## Validation

Nine local PGlite/API tests cover disabled-by-default/origin/session gates, exact quotes and fee rounding, no-inventory failure, funded buy/sell/swap, same-quote replay, per-asset balanced journals, owner isolation, customer reservations, inventory-bypass attempts, MFA/password/expiry/precision/pair-disabling and append-only records. Local test credits are fixtures only. Browser HTTP mocks test quote disclosure/confirmation/history/password clearing and 320–1440px light/dark. No actual deposit, exchange, transfer or real asset custody was tested.


## Admin controls (migration 017)

Open **#admin → Crypto inventory & pricing**. Access uses the existing private `FUNDING_ADMIN_IDS` allowlist, verified email, enrolled MFA and MFA-verified session. Do not paste secrets in notes or funding references. All writes also require same-origin requests, rate-limit checks and current password confirmation. No extra deployed function or provider connection was added.

- Inspect all registered business inventories with exact asset/network units. These are ledger allocations, not independently verified reserves. Only approved `dealer_assets` can be selected. Initial asset approvals/decimals remain trusted operational setup, not a UI classification shortcut for securities.
- Register a **new zero-balance** business clearing account for an approved asset. Cannot register a customer account, adopt existing funded accounts, or credit units. Repeating registration may create another empty account; inspect after uncertain responses before repeating.
- Record an internal funding/reconciliation ticket reference plus audit note. It is permanently marked **unverified**, **creditPosted: false**. It cannot create balances, attest backing, or release withdrawals. Repeated evidence submissions are separate notes, not funding credits.
- Create/edit directed pair rates, source fee (0–1,000 bps), minimum/maximum source atomic units, expiry and enabled state. Preview shows one whole source asset's receiving amount using exact integer math. Numerator and denominator are ATOMIC-unit rates: for example USD:BANK (2 decimals) → BTC:BITCOIN (8 decimals), ratio 1/10 means $1.00 receives 0.00000010 BTC before source fees, NOT 0.1 BTC. Review carefully. Enabled policies require future expiry within seven days; there is no automatic rate renewal.
- Asset and inventory mappings cannot change on existing policies. Reverse trading needs a separate direction. Save uses an expected revision; stale tabs fail with 409 and retain their note/form while clearing password. Reload latest data before re-entering changes. Save failures are not automatically retried. Successful saves reset the editor; use Edit to load its current revision again.
- Each change atomically records actor, subject, operation, note and before/after policy in append-only `dealer_admin_events`, plus a security event. Audit failure rolls back the configuration. UI shows the latest 100 events, with before/after details. No delete, force-credit, evidence-verification, role editor, or global-enable endpoint is provided.
- Pair saves share the internal trade serialization lock. Pausing a pair stops previously quoted but unaccepted trades once the pause commits. Already completed trades cannot be undone here. Changing rate/fees/limits does not reprice a live quote: existing quotes retain immutable amounts for up to 30 seconds, subject to expiry, pair enabled state, customer funds and inventory. Disable first to stop outstanding unaccepted quotes immediately after the change commits. The private server-wide gate remains separately managed.

Apply all migrations through **017_inventory_admin.sql** before deploying these controls. No hosted migration, reserve funding, provider setup or production enablement is performed by this change. Local tests cover finance access, empty account registration/evidence without ledger credits, policy revisions/mapping/expiry/rate constraints, audit immutability and rollback, and admin pause blocking an existing quote. Browser tests are HTTP-mocked; hosted multi-connection validation remains required before real-money activation.
