# Customer account / production funding transition

## Implemented
- Public dashboard is now AccountDashboard, not the seeded local-storage portfolio. VITE_ACCOUNT_MODE can no longer route customers into browser-only authentication or transaction simulation.
- Account views contain no invented holdings, balances, performance curves, notifications, recurring orders or transaction receipts. There is no conversion/import of historical demo balances. Old user storage and cloud snapshots are preserved but not used for money.
- Customer Settings contains account/security and real email delivery history/preferences, not funding, sample reset, cloud portfolio restoration, email specimens or simulated trade controls.
- Customer funding has no sandbox checkout and filters historical sandbox requests out of its server response. Customer invoice creation fails closed regardless of credentials. The historical signed-callback endpoint remains to retain old sandbox evidence, never credits funds, and is not a live callback.
- Email specimens are no longer published under public/email-preview or included by production builds. The developer command emits them to ignored .email-previews. Marketing explanatory copy and registration now describe actual service availability rather than inviting users to simulate investments.
- Server-only production credential detection and a read-only payment-status adapter use https://api.nowpayments.io. Mismatched payment IDs fail. Production keys cannot activate acceptance, generate an invoice or post a balance.

## Production credentials
In Vercel, save NOWPAYMENTS_API_KEY and NOWPAYMENTS_IPN_SECRET as Sensitive server-only Production variables. Use separate live merchant credentials, not the sandbox pair. No VITE_ prefix. Do not send keys in chat or commit them. Merely supplying keys does NOT enable deposits. No live-enable environment flag exists yet.

## Work still required before accepting funds
1. Separate live payment schema and immutable, balanced decimal journal, with idempotent posting and retained audit evidence.
2. Signed live IPN route plus independent provider status fetch, exact order/invoice/amount/currency binding, settlement-asset accounting, fees, finality and mismatch handling.
3. Operator reconciliation with payment lifecycle, duplicates/out-of-order callbacks, under/overpayments, refunds and operational alerting. A finished provider status alone is not proof of credited customer purchasing power.
4. Bank account approval, restricted publication/change review and receipt reconciliation. Bank instructions remain unpublished drafts; no screenshot-based credits.
5. Actual financial notification events and durable delivery, with real sender verification.
6. Jurisdiction/provider approval, legal/compliance review, custody arrangements, limits, verified email and MFA for live financial actions. The previous relaxation was sandbox-only and grants no live permission.
7. Withdrawal/return-of-funds and incident procedures must be defined before taking customer funds, even if their UI is developed later. Do not collect funds that the service cannot safely return.

No production API credentials were read, modified or tested externally in this code change. No live invoice or transfer was created. No new migration is needed for this customer-interface change. Tests use mocked HTTP/PGlite; they do not certify live financial readiness.

Legacy simulation sources/tests remain unimported by the customer application for historical reference. They are not enabled by a runtime account-mode setting. Decorative marketing artwork is not evidence of customer assets or investment performance.
