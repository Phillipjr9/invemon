-- One active, hashed, short-lived link per account and purpose. No plaintext tokens.
CREATE TABLE IF NOT EXISTS account_action_tokens (
 user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 purpose text NOT NULL CHECK (purpose IN ('reset','verify')),
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id,purpose)
);
CREATE INDEX IF NOT EXISTS account_action_tokens_expiry_idx ON account_action_tokens(expires_at);
