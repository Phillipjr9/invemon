-- Versioned policy evidence; no backfilled acceptance for existing accounts.
CREATE TABLE IF NOT EXISTS legal_policy_bundles (
 version text PRIMARY KEY,
 digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),
 documents jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(version,digest)
);
CREATE TABLE IF NOT EXISTS account_legal_acceptances (
 user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
 policy_version text NOT NULL,
 policy_digest text NOT NULL,
 terms_accepted boolean NOT NULL CHECK(terms_accepted),
 privacy_acknowledged boolean NOT NULL CHECK(privacy_acknowledged),
 risk_acknowledged boolean NOT NULL CHECK(risk_acknowledged),
 adult_confirmed boolean NOT NULL CHECK(adult_confirmed),
 source text NOT NULL CHECK(source='signup'),
 accepted_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(policy_version,policy_digest) REFERENCES legal_policy_bundles(version,digest)
);
CREATE OR REPLACE FUNCTION legal_evidence_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Legal evidence is immutable'; END; $$;
DROP TRIGGER IF EXISTS legal_bundle_immutable ON legal_policy_bundles;
CREATE TRIGGER legal_bundle_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON legal_policy_bundles FOR EACH STATEMENT EXECUTE FUNCTION legal_evidence_immutable();
-- Acceptance metadata survives all profile changes; deletion follows account deletion policy.
DROP TRIGGER IF EXISTS legal_acceptance_immutable ON account_legal_acceptances;
CREATE TRIGGER legal_acceptance_immutable BEFORE UPDATE OR TRUNCATE ON account_legal_acceptances FOR EACH STATEMENT EXECUTE FUNCTION legal_evidence_immutable();
REVOKE ALL ON legal_policy_bundles,account_legal_acceptances FROM PUBLIC;
