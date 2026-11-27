# Email notifications

## What's implemented

Six forest/paper editorial templates, each with HTML and a plain-text alternative:

| Template | Trigger | Preference |
| --- | --- | --- |
| Welcome | Server account registration | Transactional, always queued |
| New sign-in | Successful password login | Off by default; opt-in |
| Password changed | Successful password change/session revocation | Security, always queued |
| Support received | Support request saved | On by default; can opt out; one acknowledgment per 15-minute UTC-aligned window |
| Demo workspace saved | Explicit cloud save | Off by default; opt-in, one per UTC-aligned hour |
| Requested preview | Settings → Email me a preview | Explicit request, one per 15-minute UTC-aligned window |

Emails go only to the authenticated account's stored email. The preview endpoint does not accept a recipient, subject or HTML body. Demo/guest actions never enqueue emails. No deposit/trade receipts, daily digest, marketing, verification or recovery messages are implemented here. Those require their own trustworthy event sources and workflows.

Welcome, password-change and support events are enqueued in the same database transaction as the underlying write. Login and demo-save notifications use best-effort enqueue after a successful action; an enqueue failure must not undo that action. Email-provider failure does not roll back account/password/support changes.

Account email ownership is still unverified in this release. Before opening registration broadly, implement verification and stronger abuse controls; email notifications do not solve account verification or recovery. Email addresses are not considered verified just because a provider accepted a notification.

## Visual treatment and compatibility

- Welcome and requested-preview messages contain a **pre-rendered 3D-style envelope** GIF. It plays once for about **2.56 seconds**, then stops on a complete illustration. The asset is about 301 KiB, self-hosted under `/assets/email/`.
- Security/support/save messages are intentionally static. There is no distracting motion around security guidance or confirmation details.
- Classic Outlook gets a PNG through an MSO conditional. Clients supporting `prefers-reduced-motion` get the same static art. The GIF's first frame is also complete. Client-specific reduced-motion behavior is not guaranteed.
- No JavaScript, WebGL, interactive 3D, videos or external fonts are embedded in emails. Tables, inline styles, text headings, alt text, HTTPS links and optional responsive/dark-mode CSS provide broad baseline compatibility.
- Actual email-client rendering has **not** been certified in Gmail, Outlook, Apple Mail, or an inbox-testing service. The automated rendering checks run in Chromium. Test real inboxes before rollout.

`/#emails` opens Email studio with all six fictional specimens, desktop/mobile widths and plain-text links. It sends nothing. In guest mode, the link is also available under Settings → Email notifications. Server accounts additionally get preferences, self-preview sending, and owner-scoped recent email activity.

To regenerate specimens: `npm run emails:preview` (also runs automatically during build). To regenerate the original art: install Pillow in a development environment and run `python scripts/render-email-art.py`. Pillow is not needed in production.

## Configure delivery

1. Create your email-provider account with **Resend**, verify your sending domain, and configure its required DNS authentication records (SPF/DKIM; adopt DMARC appropriately).
2. Put these variables in your server environment—not `VITE_` variables:

   - `RESEND_API_KEY`: sending API key.
   - `EMAIL_FROM`: verified identity, e.g. `Invemon <notifications@your-domain.example>`.
   - `APP_ORIGIN`: canonical public HTTPS origin. Images must be publicly accessible under this origin without Vercel preview protection. Do not configure a private preview hostname for live emails.
   - `EMAIL_REPLY_TO`: optional monitored support mailbox.
   - `CRON_SECRET`: at least 32 random characters for the retry worker.

3. Run `npm run db:migrate` with your Neon connection configured. It now applies both numbered migrations, including `db/002_email_notifications.sql`.
4. Redeploy. Settings shows **Provider configured** only when the required provider variables exist. This is not proof of DNS verification, inbox placement or provider health.
5. From a test server account, request a preview and check your actual inbox, spam folder, provider logs and the app status. Test both light/dark and images-disabled clients.

Without the provider variables, no send is attempted; valid events remain queued until they expire. Fictional templates remain viewable. No external accounts, DNS records, environment variables or production databases were configured in this coding session, and no real emails were sent. Automated provider tests use mocked HTTP.

## Queue and retries

`email_outbox` is a durable database outbox. Each event has a unique key. Workers claim up to three ready rows atomically with `FOR UPDATE SKIP LOCKED`, a two-minute lease and bounded concurrent sends. Resend requests use a stable per-event idempotency key and an eight-second timeout. Repeating a send after an uncertain response uses the same key.

- Initial attempts are awaited within the server action, not fire-and-forget work that a serverless runtime may terminate.
- Retryable failures back off by 2, 4, 8 and 16 minutes; at most five attempts are made.
- Non-retryable provider 4xx responses stop retries. 408/409/425/429 may retry.
- Pending/abandoned processing entries expire after 23 hours, before the normal provider idempotency window lapses. This avoids sending stale security messages or blindly replaying old mail. It is not an absolute exactly-once-delivery guarantee.
- Optional preferences are checked again at send time, so queued messages can be skipped after an opt-out.
- Provider error bodies, passwords, session tokens, full support messages and portfolio balances are not stored in notification payloads/history.

### Schedule the worker

**No automatic recurring job is enabled by this change.** Configure your own trusted scheduler to call:

```text
GET https://YOUR-CANONICAL-ORIGIN/api/email-dispatch
Authorization: Bearer <your CRON_SECRET>
```

Use a cadence of roughly 5 minutes on a service/hosting plan that supports it. A Vercel cron can provide the bearer header when `CRON_SECRET` is configured; add a plan-compatible schedule to your own `vercel.json` if choosing that option. A once-daily schedule is not suitable for timely security retries and may allow messages to expire. Each invocation processes at most three records; monitor queue depth and adjust worker architecture for higher volume. Do not expose this secret in client code, URLs or logs.

Until scheduled, pending events may be attempted during later account actions for that user, but there is no guaranteed automatic retry. Disabling provider variables pauses sending; existing items may expire during the pause.

## Delivery status and limits

- `pending`: queued or awaiting a retry.
- `processing`: claimed by a worker.
- `accepted`: Resend accepted the request. **Not confirmation of inbox delivery.**
- `failed`: terminal attempt failure.
- `expired`: too old to send safely.
- `skipped`: optional notification disabled before delivery.

There is no provider webhook ingestion for delivered/bounced/complained states yet. Add signed, replay-resistant webhook processing and suppression before a broad production rollout. Set appropriate retention/cleanup for outbox records, provider data and logs. Account deletion cascades app-side preferences/outbox data, but cannot recall an email already sent or delete provider-held copies automatically.

Notification settings use separate email preferences from the dashboard's in-app reminder toggle. These are transactional account messages, not a newsletter. If marketing/digests are added, implement explicit consent, legal footer content, appropriate unsubscribe mechanisms and suppression rather than reusing this service without changes.

## Validation

- `npm run test:emails`: template safety, configuration-disabled behavior, event deduplication, owner scoping, recipient enforcement, opt-outs, retry/permanent failure paths, provider idempotency, expiry, concurrent claims, worker authorization and cascading deletion. PostgreSQL engine: PGlite; Resend HTTP: mocked.
- `scripts/verify-emails.mjs`: six rendered specimens, loaded art, static reduced-motion fallback, 320/390px layouts, dark studio, preferences and self-preview UI contracts. Browser/API HTTP is mocked for authenticated UI; no emails sent.
- Existing math/account API and browser regressions remain separate checks.
