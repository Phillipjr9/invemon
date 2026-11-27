# Funding foundation — sandbox only

This is an initial integration, **not a live crypto deposit service**. No live mode exists. Do not send real funds, configure production payment credentials, or represent sandbox records as customer balances. Existing demo deposits remain simulations and are not connected to this module.

## Setup
1. Apply migration 006 with `npm run db:migrate` after reviewing/backing up the target database.
2. Obtain separate NOWPayments sandbox API and IPN keys through the provider's secure dashboard. Store them server-side as NOWPAYMENTS_SANDBOX_API_KEY and NOWPAYMENTS_SANDBOX_IPN_SECRET. Do not share them in chat or Git.
3. Configure HTTPS APP_ORIGIN and explicitly set NOWPAYMENTS_SANDBOX_ENABLED=true only for the intended test deployment. No external API calls are made while disabled.
4. Temporarily, any signed-in account (including unverified accounts without MFA) can open Settings → Account & security → Funding setup → Check sandbox funding, then create a hosted sandbox invoice. Coin/network selection is left to provider checkout; there is no claim of universal asset/network support.
5. Use provider-generated sandbox callbacks to `/api/funding-ipn`. Signatures use recursively sorted JSON and HMAC-SHA512 with constant-time comparison. Match invoice/order ownership and deduplicate identical events. All accepted callbacks become `needs_review`, even `finished`: **nothing credits a balance**. Unmatched events return 409 for provider retry/review.

The fixed sandbox API endpoint is `https://api-sandbox.nowpayments.io/v1/invoice`. Checkout URLs are restricted to sandbox.nowpayments.io or api-sandbox.nowpayments.io. Actual sandbox account behavior, URL format, nested signature serialization and callback identifiers must be verified against current provider documentation and real test events before deployment approval. Do not broaden the allowlist to arbitrary provider-returned hosts.

## Bank instruction drafts
Set FUNDING_ADMIN_IDS to explicitly authorized app_users UUIDs. Verified email, enabled MFA and an MFA-verified session are required to read/edit drafts. Each edit additionally confirms password and a revision; immutable version rows retain editor/time. Duplicate previous revisions are rejected atomically. A separate funding allowlist prevents ordinary support-agent authority from granting financial administration.

Bank instructions are **unpublished drafts**. They are not exposed to customers and do not accept or credit transfers. No receipts, screenshots, emails or callbacks are treated as proof of bank funds. Database operators have access to stored drafts: do not enter production bank details until access controls, retention and backup policies are approved.

Funding/version rows intentionally prevent cascading account deletion through foreign keys. A retention/anonymization workflow must be designed before inviting sandbox users who expect self-service deletion; accounts with funding/admin records currently cannot be deleted by the ordinary deletion API. No deletion bypass is provided.

## Remaining gates (not implemented)
- A double-entry, immutable decimal ledger and controlled reconciliation workflow.
- Provider status re-fetch, amount/currency/settlement verification, finality rules, under/overpayments, fees, refunds, reorgs, and out-of-order status handling.
- Provider-confirmed deposit notification lifecycle and durable delivery retry. This module sends no funding emails yet.
- Approved live business/provider configuration, legal/compliance eligibility and supported asset/network policy. User-stated provider permission is not independently verified here.
- Publication/review of bank details, account-change notifications, limits, bank-feed reconciliation and independently approved balance crediting.
- Outbound transfers, swapping, custody/key management, travel-rule/sanctions monitoring, withdrawal holds and single-use transfer approval. None are enabled by this integration.
- Security review, provider sandbox end-to-end tests, operator alerts and recovery drills.

Reference: NOWPayments API documentation, Instant Payment Notifications: https://documenter.getpostman.com/view/7907941/S1a32n38 . Automated tests mock provider HTTP and use PGlite, not live Neon or a provider account.

## Temporary sandbox authentication relaxation
Email verification and MFA are not required to create sandbox invoices during integration testing. Sign-in, origin validation, owner isolation, rate limits, sandbox-only endpoints, and callback signature checks remain enforced. Bank administration still requires verified email, MFA, allowlisting and password confirmation. Do not carry this relaxation into a future live-funding implementation.
