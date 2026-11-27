-- Sandbox records only. These tables never credit an investment balance.
CREATE TABLE IF NOT EXISTS funding_requests (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES app_users(id),
 environment text NOT NULL DEFAULT 'sandbox' CHECK(environment='sandbox'),
 amount_usd numeric(18,2) NOT NULL CHECK(amount_usd>0),
 provider_id text UNIQUE, invoice_url text, status text NOT NULL DEFAULT 'creating',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS funding_requests_owner ON funding_requests(user_id,created_at);
CREATE TABLE IF NOT EXISTS funding_events (
 event_hash text PRIMARY KEY, request_id uuid NOT NULL REFERENCES funding_requests(id),
 provider_payment_id text NOT NULL, provider_status text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bank_instruction_versions (
 revision bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 previous_revision bigint NOT NULL UNIQUE,
 instructions jsonb NOT NULL, updated_by uuid NOT NULL REFERENCES app_users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
