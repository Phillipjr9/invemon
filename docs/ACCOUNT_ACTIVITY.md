# Unified activity and persistent account notifications

Migration **012_account_activity.sql** adds an owner-scoped event projection and notification read-state table. Apply the numbered migrations before deploying. No hosted schema migration, production deployment or financial enablement was performed by this work.

## Event sources

- Posted customer liability journal changes, aggregated per owner and asset/network. Split journals expose only that owner's changes; custody accounts, posting keys and evidence references are excluded.
- Customer withdrawal requests: amount represents a hold request, not a payment/debit.
- Admin reviewing/approved/rejected decisions for linked customer withdrawals, without internal notes or staff identity.
- Customer cancellation, derived from the exact immutable cancellation-release event.

Events are projected from durable immutable records rather than created by the browser. Existing historical events become visible and initially unread after rollout. Journal and workflow events intentionally remain distinct: a request, review and eventual accounting debit are not three payments. No payout-sent/received event is invented. Goal plans, support messages, security events, deposit-provider lifecycle events and full order activity are not part of this feed yet.

## API

`/api/activity` is allowlisted through the existing single Vercel function (no extra deployed function).

- GET: latest 30 events, stable descending created_at/id ordering. `before=<event-id>` fetches older entries. Cursor lookups require ownership; unknown/foreign cursors yield no entries. IDs are namespaced immutable source IDs.
- GET `?view=inbox`: same latest-30 projection plus exact unread-count string across all the owner's events.
- POST `{action:'read',id}`: owner-validates the event and idempotently persists read state.
- POST `{action:'read-all'}`: marks events present in that database statement's snapshot, including older events not in the preview. Future events remain unread.

All reads/writes require a session. Writes retain origin/body validation and rate limiting. No client-selected user ID, free-text event creation, internal admin notes, payment address or destination ciphertext is returned. Read marks are not financial records and cannot alter the underlying event or balance.

## Dashboard

The Activity section shows a unified timeline followed by the existing posted-ledger section/export. Existing loaded-ledger export is still explicitly accounting-only, not a full unified financial statement. Timeline pages are loaded on demand with deduplication and error/retry states. Amounts obey dashboard balance privacy. Workflow text avoids implying settlement.

Header notifications load from the server, with persistent per-user read IDs/count, single-notice open/read and Mark all read. Clicking opens Activity. Notification previews contain no amounts or bank/wallet details. Inbox refreshes every 60 seconds while visible and supports explicit retry after errors; it is not a live push delivery guarantee. Failures show unavailable state instead of falsely displaying 'All caught up'. The preview is limited to 30; full history remains in the paginated timeline. Email preference/delivery tools remain separate and unchanged.

## Limits and remaining work

No outbound email/push delivery, per-type in-app preference settings, full statements, date/type filtering, unified export or record detail routes. No new completion evidence or payment verification. The view and read-all operation have not been load-tested at large scale; production indexes/query plans and retention policies need operational review. Hosted multi-connection and end-to-end testing remain required.

Validation: local PGlite/API tests exercise ownership, internal-data omission, exact accounting amounts, request/approval distinctions, cancellation, persistent/idempotent marks, read-all/future-event behavior and stable pagination. HTTP-mocked browser tests cover timeline/inbox, read state across reload, errors/retry and light/dark 320–1440px. They do not validate provider services or production migrations.
