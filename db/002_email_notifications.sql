-- Durable transactional notifications. No marketing messages or financial receipts.
CREATE TABLE IF NOT EXISTS email_preferences (
 user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
 sign_in boolean NOT NULL DEFAULT false,
 support_received boolean NOT NULL DEFAULT true,
 workspace_saved boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS email_outbox (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 event_key text NOT NULL UNIQUE,
 type text NOT NULL CHECK (type IN ('welcome','sign_in','password_changed','support_received','workspace_saved','preview')),
 payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','accepted','failed','expired','skipped')),
 attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 provider_id text,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 accepted_at timestamptz
);
CREATE INDEX IF NOT EXISTS email_outbox_ready_idx ON email_outbox(status,next_attempt_at);
CREATE INDEX IF NOT EXISTS email_outbox_owner_idx ON email_outbox(user_id,created_at DESC);
-- "accepted" means the provider accepted the message, not that it reached an inbox.
-- No password, session token, full support message, or financial amount is stored here.
