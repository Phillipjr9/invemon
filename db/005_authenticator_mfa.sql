-- Encrypted authenticator secrets and hashed recovery codes. No plaintext secrets.
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS mfa_secret text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS mfa_pending_secret text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS mfa_pending_expires timestamptz;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS mfa_last_step bigint NOT NULL DEFAULT -1;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS mfa_recovery_hashes jsonb NOT NULL DEFAULT '[]';
ALTER TABLE app_sessions ADD COLUMN IF NOT EXISTS mfa_verified boolean NOT NULL DEFAULT false;
