# Finance admin console

Route: `#admin`. API: `/api/admin`. Requires migration **009_admin_reviews.sql**, plus previous migrations including 008. Not deployed or applied to hosted Neon by this work.

## Access setup

- Existing server account/session required.
- Configure private `FUNDING_ADMIN_IDS` as a comma-separated list of approved app_users UUIDs. This is the existing finance permission used by funding administration, not the support role.
- The account must have verified email, enrolled MFA, and an MFA-verified session. Enrolling MFA may require signing in again to obtain the verified session.
- Empty configuration grants nobody access. Profile values, client role claims and knowing the URL grant no access. Support-agent membership alone grants no finance access.
- Every write additionally requires the admin's current password. Passwords are cleared from the form after success/failure; no password is saved in browser storage.
- Set the existing private DATABASE_URL and APP_ORIGIN appropriately. Never put these or admin settings in VITE_ variables. Do not submit credentials in chat.

Before releasing: backup database, maintenance window, run `npm run db:migrate` to apply the full numbered schema atomically, review application database permissions, deploy, then verify denial for ordinary users and successful MFA-protected access for the intended operator. No automatic role grants or accounts are seeded.

## Implemented

- Latest 100 withdrawal-purpose fund reservations, including terminal states, exact atomic-unit formatted amounts, asset/network identity, customer email, held/released/consumed fund state and separate review decision.
- Pending → reviewing/approved/rejected decisions. Reviewing/approved can be reconsidered while funds remain held. Rejection is terminal.
- Approval does not consume funds, post a debit, send money or mark payment complete.
- Rejection and release commit in the same database function/transaction as append-only review and security events. Failure rolls everything back.
- Per-reservation row locking and expected review revision reject stale updates. Retrying an uncertain write with its old revision returns conflict; refresh history before retrying. A retry never sends money or releases twice.
- No review of order reservations or no-longer-held withdrawals. Reviews use internally derived reservation owners, not a customer ID supplied by an admin form.
- Append-only internal note history, latest 50 entries per request. Notes are plain text, staff-only and excluded from customer endpoints. Do not include bank details, identity documents or secrets.
- Customer email/ID lookup (30-result cap, minimum 3 characters); exact total/reserved/unreserved asset balances. No credentials, session tokens or MFA secrets returned.
- Origin checks, server sessions, rate limiting, validation, fresh-password checks, confirmation prompts and unavailable/error states. No arbitrary balance editor, role editor or database console.
- Responsive light/dark UI; explicit refresh and draft-discard confirmation for workspace refresh, request switching and return-to-account. Browser unload warns about review drafts. Other SPA hash changes are not comprehensively guarded.

## Scope and remaining work

This is an **internal reservation-review console**, not a complete customer payout system. Reservations created by trusted internal workflows are the queue source. Customer withdrawal submission, saved encrypted destinations, eligibility/limits, fee disclosure, request-specific destination snapshots and customer status notifications are not implemented. Empty queue is normal until such a workflow creates real reservations. Do not insert sample customer money or seed test holds in production to populate it.

Payment dispatch and completion are deliberately disabled: there is no independent evidence verifier or destination workflow. This console does not expose consume_customer_funds or accept an arbitrary payment reference as proof. Approved holds remain held until independently settled through a future verified workflow, or rejected/released. Do not use approval as authorization to manually pay until the remaining end-to-end destination, payment and reconciliation controls exist.

Also outstanding: durable request pagination/search and prioritized exception queues beyond the bounded latest-100 list, dual-control maker/checker review, granular roles, sensitive-read audit trail, MFA step-up per write, operational monitoring, reconciliation tools, complete account admin tooling and hosted multi-connection race testing. This implementation is not a compliance/security certification.

## Validation

Eight local PGlite/API tests cover deny-by-default access, verified email/MFA, customer escalation rejection, origin/password enforcement, exact balances, secret omission, no-money approval, release-on-reject, stale/terminal conflicts, audit rollback, immutable history and invalid/order/released reservations. Migration runner tests apply and reapply migration 009. Browser suite mocks HTTP and exercises access denial, approval, conflict draft retention/password clearing, lookup, permission loss and 320–1440px light/dark layouts. No real payment, hosted database mutation or provider call is tested/performed.
