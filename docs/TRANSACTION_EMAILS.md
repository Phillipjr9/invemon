# Transaction email notifications (018)

## New recorded-event notifications

Migration `018_transaction_emails.sql` enqueues these transactional emails:

| Event | Trigger source | Meaning |
| --- | --- | --- |
| Internal crypto trade settled | `dealer_trades` insert | Atomic internal exchange completed; no blockchain transfer or securities purchase |
| Withdrawal requested | `withdrawal_requests` insert | Request recorded and funds reserved; no payout sent |
| Withdrawal under review | customer-linked `admin_review_events` insert | Review update only |
| Withdrawal approved | customer-linked approved review | Approved for manual processing, NOT paid; funds remain held |
| Withdrawal rejected | customer-linked rejected review | Reservation released; no payout/deposit |
| Withdrawal cancelled | customer cancellation reservation event | Reservation released; no payout/deposit |

Queue inserts share the same database transaction as the event. A failed outbox insert rolls back the financial event, including trade journals/inventory or withdrawal holds. Unique event keys prevent duplicates for same-quote trade retries and same-request withdrawal/cancellation retries. Each accepted admin review revision has its own message. No emails are backfilled for historical events when the migration runs. Existing non-customer generic reservations do not receive customer withdrawal emails.

Payloads contain only reference ID and event timestamp, never amounts, balances, wallet/bank details, staff notes or evidence. The sender looks up the recipient from the stored user, not browser input. Emails link to the account for full details and explicitly advise checking current status: delayed review messages may no longer reflect the latest decision. These are transactional notices, separate from optional sign-in/support/workspace preferences. No paid/completed-withdrawal or verified-deposit receipt is emitted, because these workflows do not supply independently verified payout/deposit completion evidence. Legacy disconnected external-execution settlements do not emit the internal-dealer trade notice.

HTML and plain-text templates reuse existing static artwork. Updated security/welcome/shared footer wording no longer claims the entire account service is a simulation; archived demo-workspace emails still accurately describe the archived simulation. The notification history UI labels the new events, including approval-not-payment.

## Delivery and deployment

Uses the existing Resend email integration; no new provider or trading integration. Trade, withdrawal-request/cancel and admin-review routes make bounded best-effort delivery attempts AFTER commit. Delivery errors cannot roll back a completed operation; pending messages stay in the durable queue. Each attempt sends at most three pending messages, so backlog can delay a new notice. Direct database events queue messages but do not perform network calls.

The existing sender requires private `RESEND_API_KEY`, verified `EMAIL_FROM`, and HTTPS `APP_ORIGIN`. Never put credentials in chat, source, VITE variables, or logs. Provider acceptance is not inbox delivery. Existing retries use a stable outbox ID/provider idempotency key, leases, five attempts maximum, and expiration after 23 hours. Failed/expired messages remain visible in email history; there is no infinite replay or promise of guaranteed delivery.

Deploy compatible sender code BEFORE applying migration 018 (or pause financial writes and email workers during rollout). An older sender does not recognize these new types. Review backup/restore and target DB first. Then apply all required numbered migrations through 018 using the reviewed migration runner. Reapplying is tested atomically. Code deployed before the migration keeps operating with prior notification coverage until triggers are installed. Do not roll back to the old sender while new message types remain pending.

For unattended retries, configure an authorized scheduler to call `/api/email-dispatch` using `Authorization: Bearer <CRON_SECRET>`; the secret must be at least 32 characters and stored privately. The worker does not accept user-selected recipients or financial instructions. No scheduler, secrets, paid plan, production schema, or production provider settings were changed here. No cron was silently enabled: choose frequency/capacity for the three-message batch limit, provider limits, and 23-hour expiry. The repository still has no built-in retry schedule.

## Validation

Tests cover all new rendered templates, stored-recipient delivery with optional opt-outs, financial-event atomic enqueue, same-quote/request/cancel duplicate protection, customer isolation, no staff/bank detail leakage, approval-not-payment, and rollback of both trades and withdrawal holds on queue insertion failure. Existing sender tests cover worker authentication, transient/permanent errors, leases, stale expiration and idempotency. Provider calls are mocked. No production email, real trade or payout was sent during implementation.

Browser validation requires a local Chromium installation; the current sandbox lacks it. No fresh browser pass or real inbox delivery is claimed.
