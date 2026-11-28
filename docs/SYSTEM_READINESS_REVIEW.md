# System readiness review — 2026-11-27

## Scope and evidence
Repository review and local automated checks, not a production audit or compliance certification. No production credentials, settings, balances or payouts changed. Full npm test passed (162 tests before the new deposit-monitor test); admin suite including monitor passed (16 tests). TypeScript and Vite production build passed. `npm audit --omit=dev --audit-level=high` reported zero known vulnerabilities. Browser suites and real external-provider delivery were not rerun in this pass.

## Improvements in this review
- Authenticate production/sandbox callback signatures before database lookups. Environment in the payload cannot select authentication authority.
- Read-only admin deposit monitor: latest 100 production requests, provider/reconciliation status, callback count, invoice/payment/journal references and exception flags. No raw provider payloads, secrets or bank details exposed.
- Flag finished-without-credit, stale uncredited requests and provider refunds after credits. This is an on-demand monitor, not a scheduled alerting service; absent/unmatched provider payments cannot be discovered from request records alone.
- Tests cover customer denial, sandbox exclusion, settled-without-credit classification and no credit side effects.

## Priority 0 — release blockers / money movement
1. PR 11 remains conflicting with main. Resolve and review against the latest production implementation before merge; do not discard newer upstream fixes. This session's working branch must be retained.
2. Verify migrations including 020 on the intended production DB, backups and restoration procedure. Do not blindly rerun migrations to verify schema.
3. Confirm actual NOWPayments response/callback network fields. Strict validation fails closed when evidence is absent; implement a tested authoritative currency/network mapping if required. No bypass or guessed mapping.
4. Verify a restricted real deposit through signature, independent status lookup, one balanced journal, customer display and retry behavior. Local PGlite/mocks do not establish hosted concurrent transaction behavior or actual provider settlement.
5. Confirm business treatment of crypto receipts versus USD face-value credits, fees, custody, liquidity and backing. USD invoice price is not proof of conversion or net USD proceeds.
6. Post-credit refund/fraud recovery requires documented restriction/reversal handling, especially when funds have been spent. Monitor is not automated recovery.

## Priority 1 — admin and bank operations
- SUPER_ADMIN_IDS must be explicitly assigned in deployment administration; existing FUNDING_ADMIN_IDS users are ordinary admins. No assignments were changed. Database-backed staff management, grant/revoke audits and dual approval remain unimplemented.
- US bank drafts require independent verification, secure publication/unpublication with audit history and preferably dual approval before customers can use them. Current drafts remain unpublished.
- Automatic bank credit requires a trustworthy bank feed or statement-reconciliation source with transaction identity, owner matching and exactly-once posting. Screenshots and customer assertions are not payment evidence. Do not enable bank deposits on draft save.
- Manual payouts require evidence-linked sent/confirmed/failed states, safe retry handling and reconciliation. Approval does not prove money was sent. Do not mark paid from an unsupported admin button.
- Build a controlled reconciliation retry mechanism with immutable attempt evidence; no unrestricted balance editing.
- Monitor is bounded to latest 100 production requests, not a full ledger audit/search or unmatched provider-payment discovery service. Add pagination, aging dashboards and authenticated alert scheduling as volume grows.

## Priority 2 — operations and launch
- Verify transaction-email provider configuration, authenticated scheduler and real inbox delivery without exposing customer details.
- Test backup restoration, provider outage recovery, stuck orders and reserved-fund reconciliation in an isolated environment.
- Re-run browser accessibility, responsive layout and dark/light flows for new admin sections.
- Confirm operator legal identity/contact, applicable jurisdiction, eligibility and policy review. Current legal pages explicitly remain operational drafts. No compliance certification implied.
- Existing-user reacceptance for updated policies is not implemented; preserve historical acceptance evidence and do not fabricate consent.
- Keep support roles independent, enforce MFA for privileged staff, review access periodically and revoke departed users through deployment controls until staff management exists.

## Out of scope
No external exchange/broker connection added. No customer-funded test, automatic payout, wallet custody assertion, bank-feed integration or production deployment performed.
