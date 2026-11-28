# Production domain and mailboxes

Canonical origin: `https://www.invemon.org` (the root domain redirects to www in Vercel).

- support@invemon.org: account help and reply-to for application mail.
- noreply@invemon.org: automated transactional sender; do not present as a monitored support inbox.
- admin@invemon.org: administrative inquiries only; mailbox possession grants no application role.
- payment@invemon.org: payment inquiries; never request passwords, private keys or extra unlock fees.

Production deployment configuration:
```
APP_ORIGIN=https://www.invemon.org
EMAIL_FROM=Invemon <noreply@invemon.org>
EMAIL_REPLY_TO=support@invemon.org
```
Preserve RESEND_API_KEY and all payment/authentication secrets. Verify invemon.org with Resend and publish its exact required DNS records before sending. Microsoft/GoDaddy mailbox setup is independent of Resend authorization. Keep existing MX and Microsoft DKIM records; avoid duplicate SPF policies. Real inbox delivery must be tested separately.

Changing APP_ORIGIN changes same-origin authorization, account links and newly created NOWPayments callback/return URLs. Redirect old website aliases to the canonical host, but preserve existing invoice callback endpoints and token lifetimes. Do not blanket redirect legacy POST callbacks without provider verification. Sessions are host-only: users must log in again on www.invemon.org. Verify login/MFA, support, email verification/reset, and new checkout URLs after rollout. Do not create a real payment merely to test redirection.

These source changes do not update Vercel settings or prove delivery. Apply the production settings through authorized deployment configuration and redeploy; use isolated origins/databases for previews.
