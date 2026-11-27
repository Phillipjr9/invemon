-- Run once against Neon with `npm run db:migrate`. No live-money balances.
CREATE TABLE IF NOT EXISTS app_users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text NOT NULL,
 profile jsonb NOT NULL DEFAULT '{}', email_verified_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON app_sessions(user_id);
CREATE TABLE IF NOT EXISTS demo_workspaces (
 user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
 revision integer NOT NULL DEFAULT 1, snapshot jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_rate_limits (
 key text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS support_requests (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 subject text NOT NULL, message text NOT NULL, status text NOT NULL DEFAULT 'open',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS security_events (
 id uuid PRIMARY KEY, user_id uuid REFERENCES app_users(id) ON DELETE CASCADE,
 action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
-- These tables intentionally store an editable SIMULATION snapshot, not a
-- financial ledger. Live brokerage/bank/crypto operations must use a separate
-- provider-authoritative, reconciled ledger and are not enabled by this migration.
