# Account verification and recovery

## Deploy prerequisites

1. Back up the intended Neon database.
2. Update this branch locally and run `npm ci && npm run db:migrate` with the correct server-only `DATABASE_URL` in `.env`. Migration **003_account_tokens.sql** is new. The earlier eight-table check does not cover it.
3. Configure production `APP_ORIGIN`, `RESEND_API_KEY`, and `EMAIL_FROM` (verified sender) in Vercel. Do not paste secrets in chat or expose them through VITE variables.
4. Redeploy only after applying migration 003. Password changes now also invalidate outstanding reset tokens.
5. Exercise the flows using an account/email you control. Local automated tests mock the provider; no live emails were sent during implementation.

## User flows

- Sign-in → Forgot your password → enter email. The response is identical for existing and absent accounts and does not promise delivery.
- Email link → enter/confirm a 12–128 character password → POST consumes token and changes password atomically, revoking existing sessions. It does not mark the email verified or automatically sign in.
- Settings → Send email verification link → open link → explicitly confirm verification. Merely fetching the URL does not consume the link (important for mail scanners).
- Tokens are 32 cryptographically random bytes, single use, expire in 30 minutes, and are stored only as SHA-256 hashes. A new link replaces the previous one for that purpose.
- Raw tokens exist only in memory, the provider message, and the user's link. URL fragments keep tokens out of server request URLs. The link page removes the fragment token from browser history. Do not add third-party analytics/scripts to this page.
- Link messages are direct sends, not outbox jobs: this avoids persisting plaintext bearer tokens. Failed provider sends invalidate that token; users must request a new one. Provider acceptance is not inbox delivery.
- Per-IP and per-email quotas apply in addition to general account throttles. No fake codes or client-only verification are used for server accounts.

## Limitations / operational review

The generic response avoids explicit account enumeration, but direct-send duration may still differ for existing addresses. Review this timing side channel and add edge bot protection before broad public registration. Provider failure logs intentionally omit email, URL and token. Direct links do not yet have automatic delivery retries, bounce tracking, or a durable encrypted link queue. Resend webhooks are not implemented. Verification does not enable live financial features and is not currently a prerequisite for the simulated workspace.

Expired token cleanup can be scheduled by an operator:

```sql
DELETE FROM account_action_tokens WHERE expires_at < now();
```

Security checklist: expired/replayed/wrong-purpose links fail; second concurrent consumer fails; password reset revokes sessions; ordinary password change invalidates a pending reset; deleting an account cascades tokens; no URL/token appears in provider-independent logs.
