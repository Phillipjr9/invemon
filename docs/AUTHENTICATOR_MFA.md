# Authenticator MFA deployment

1. Back up Neon and verify a restore to an isolated database, including a read of test rows. This repository cannot certify your provider restore policy.
2. Run `npm run db:migrate` against the intended database **before deploying**. Migration 005 is additive and required by all session queries.
3. Generate a dedicated 32-byte random key (64 hex characters) using Node crypto. Store `MFA_ENCRYPTION_KEY` as a sensitive server-only Vercel variable for each intended environment; never use a VITE_ prefix. Keep a secure recoverable copy separately from the database. Do not print it in logs or chat. Do not overwrite an existing key. Losing/changing it locks enrolled users out, including recovery-code sign-in.
4. Deploy and check protected `/api/health`. `missingMfaColumns` must be empty. `mfaConfigured` must be true before offering enrollment. Readiness fails when enrolled users exist but the key is absent. A syntactically valid but incorrect key cannot be detected by readiness alone: test a real second-factor login after deployment.
5. Use a verified test account: Settings → Account & security → Authenticator & recovery codes. Scan the locally generated QR with an authenticator, confirm password and current six-digit code, and save the ten recovery codes outside the browser. Enrollment expires in ten minutes. Enrollment revokes old sessions.
6. Sign out. Verify password alone cannot log in, a valid code succeeds once, replay fails, and a recovery code works once. Password reset retains MFA. Wait for the next 30-second code between security operations.
7. Recovery-code replacement and disable require password plus a fresh authenticator code; recovery codes only work for sign-in. Both revoke other sessions. There is no insecure support/email-only bypass. Losing both the app and all recovery codes can lock an account out. Do not enroll without saving codes.

Secrets are AES-256-GCM encrypted with the user ID as authenticated data; recovery codes are 128-bit random values stored only as SHA-256 hashes. Atomic SQL rejects reused time steps and double-consumption of recovery codes. Rate limits cover password login, factor attempts per account, and management. These are protections, not a substitute for security review or infrastructure-level bot/DDoS controls.

Staff support access now requires UUID allowlist + verified email + enabled authenticator + MFA-verified session. Existing staff must enroll and reauthenticate. No staff email/profile field can grant access.

Tests use PGlite and mocked HTTP. They do not certify authenticator apps, live Neon, email, Vercel configuration, or disaster recovery.
