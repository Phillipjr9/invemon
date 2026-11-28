# Account policies and signup acceptance

## Pages and scope

Public hash routes: `#terms`, `#privacy`, `#risk`, `#funding-conditions`.

`shared/legal-policies.json` is the single content/version source for the public reader and server-side evidence. Bundle `2026-11-27.2` includes Terms of Service (eligibility, security, permitted conduct, quotes/fees, dispute/closure principles), Privacy Notice (data categories/purposes, provider sharing, cookies/storage, retention/rights), Risk Disclosure (volatility, counterparty/inventory, liquidity, network/security/tax risks), and Funding & Withdrawal Conditions (NOWPayments instructions/reconciliation, holds, manual review/payout status, errors/refunds/complaints).

The documents explain the implemented internal inventory model, source-fee/rounding behavior, and approval-not-payment. They do not invent brokerage/custody licensing, insurance, guaranteed returns, verified reserves, payment timelines, arbitration venues, a legal business entity/address, or blanket waivers of mandatory rights. They do not add an identity-document collection flow, KYC provider, new financial provider, marketing opt-in or cookie tracker. A Privacy Notice acknowledgment is not blanket processing or marketing consent. Adult confirmation is self-attestation, NOT independent age/eligibility verification.

**Legal review required before public launch:** these are operational policy drafts, prominently identified as such on the pages. The operator must supply and have counsel review its actual legal identity/contact, regulatory position, service jurisdictions/customer eligibility, actual custody/funds structure, third-party processing arrangements, retention schedule, mandatory notices and complaint/consumer-rights requirements. No legal-compliance certification is implied. A support link is not a substitute for required formal controller/operator contact details. Do not remove the review warning until the required facts and counsel review are complete.

## Signup behavior

`ServerAuthPage` shows four separate required, unchecked controls:
1. Agreement to Terms + Funding & Withdrawal Conditions.
2. Acknowledgment of the Privacy Notice (explicitly not marketing consent).
3. Acknowledgment of the Risk Disclosure/full-loss risk.
4. Confirmation of age 18+ and legal capacity.

Document links open a new tab with noopener/noreferrer so the in-progress form stays intact. Home and account footers also link to all four public documents. The public reader offers section navigation, print layout, light/dark and mobile layouts and heading focus. No artificial scroll-to-bottom claim is collected.

The client sends `policyVersion`, `termsAccepted`, `privacyAcknowledged`, `riskAcknowledged`, `adultConfirmed`. The backend checks exact current version and strict boolean true for EVERY acknowledgment before password hashing or creating an account. Missing/stale version returns 409 instructing reload/review; missing or non-boolean acknowledgments return 400. Direct API registration cannot bypass this. Successful registration does not enable financial features or establish actual eligibility/backing.

## Evidence / migration 019

`legal_policy_bundles` archives the complete shared JSON bundle, its version and SHA-256 of `JSON.stringify(bundle)` (not raw file bytes). Versions are immutable and each version/digest pair is unique. `account_legal_acceptances` stores owner, bundle version/digest, four required booleans, server timestamp and `signup` source. Composite FK prevents accepting a digest different from the archived version. Client-supplied hashes, timestamps and profile overrides are ignored.

User creation, bundle archival, acceptance and welcome-outbox insertion are ONE transaction. Failure rolls everything back and issues no session. Evidence cannot be updated/truncated through SQL; no acceptance-update/delete API is provided. Acceptance rows follow permitted account deletion via ON DELETE CASCADE; they are not a promise of permanent legal retention. Bundle snapshots remain archived. Financial-account deletion restrictions still apply. No raw IP, user agent, DOB, identity documents or passwords are added to evidence. Revisit retention/identity requirements with counsel before launch.

Account data export includes the owner's acceptance metadata or null; session ownership scopes it. Existing accounts receive no fabricated or retroactive acceptance and can still sign in. Future reacceptance, blocking existing users on policy updates, email change notices and multiple acceptance history revisions are NOT implemented. Version changes require an explicit rollout plan: never edit a published version in place. The hash/FK deliberately rejects new registration if content changes under an existing archived version.

## Deployment / verification

Back up and review the correct database, then apply migration **019** BEFORE deploying this registration backend, to avoid signup/export errors. Review all unapplied migrations; if 018 is also pending, follow its compatible-sender rollout instructions or pause financial writes/workers during rollout. The runner reapplies the full numbered schema atomically, so review the complete migration scope rather than assuming it only runs 019. No hosted migration, production deployment, acceptance backfill or Vercel/provider setting change was performed here.

All automated fixtures/smoke registrations now supply explicit test acknowledgments; these are not real legal-user acceptances or independent eligibility verification. The existing deployment write-smoke command must still be explicitly enabled for an owned test account and may create/clean up its test acceptance with that account. Do not run production write tests casually.

Tests cover strict/stale/missing acknowledgments, no user/email writes on rejection, server-derived metadata, archived documents, export, profile tamper resistance, preexisting users left untouched and atomic rollback on evidence failure. Migration application/reapplication, the full automated suite, TypeScript/build and twelve HTTP-mocked browser suites pass. Browser checks cover public routes, focus, unchecked required controls, actual boolean/version request payload, signup preservation in a new tab and 320–1440px light/dark layouts. These tests do not establish enforceability or regulatory compliance.
