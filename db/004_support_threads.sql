-- Customer-visible replies and staff-only notes. No client-controlled roles.
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS support_messages (
 id uuid PRIMARY KEY,
 request_id uuid NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
 actor_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
 actor_role text NOT NULL CHECK (actor_role IN ('customer','staff')),
 visibility text NOT NULL CHECK (visibility IN ('public','internal')),
 message text NOT NULL CHECK (length(message) BETWEEN 1 AND 4000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_requests_owner_idx ON support_requests(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS support_messages_request_idx ON support_messages(request_id,created_at DESC);
-- Bounded expired-auth cleanup uses these predicates: no deletion is scheduled.
CREATE INDEX IF NOT EXISTS app_sessions_expiry_idx ON app_sessions(expires_at);
CREATE INDEX IF NOT EXISTS app_rate_limits_expiry_idx ON app_rate_limits(expires_at);
